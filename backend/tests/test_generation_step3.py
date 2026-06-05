from __future__ import annotations

import asyncio
import hashlib
import json
import sys
from pathlib import Path

from fastapi import WebSocketDisconnect
from fastapi.testclient import TestClient
import pytest

from backend.tests.conftest import GORDEN_ROOT, PPT_MAKER_ROOT


class SuccessfulFakeRunner:
    def __init__(self) -> None:
        self.requests: list[object] = []

    async def run(self, request, context, progress):
        self.requests.append(request)
        assert context.work_dir.name.endswith(context.task_id)
        await progress("generating_outline", "正在生成大纲...")
        await progress("building_pptx", "正在构建 PPTX...")
        output = context.work_dir / "output.pptx"
        output.write_bytes(b"generated")
        preview = {
            "schema": "ppt-maker-machine-extracted/v1",
            "slide_count": request.page_count,
            "slides": [{"slide_number": 1, "title": request.prompt, "bullets": [request.style]}],
        }
        (context.work_dir / "machine_extracted.json").write_text(json.dumps(preview, ensure_ascii=False), encoding="utf-8")
        await progress("quality_check", "质检完成")
        return {
            "file_name": output.name,
            "file_id": f"{context.work_dir.name}/{output.name}",
            "preview": preview,
            "task_dir": context.work_dir.name,
        }


class CancellingFakeRunner:
    async def run(self, request, context, progress):
        await progress("generating_outline", "正在生成大纲...")
        while not context.cancel_event.is_set():
            await asyncio.sleep(0.01)
        raise asyncio.CancelledError()


def make_client(tmp_path: Path, runner, *, selection_timeout: float = 0.05) -> TestClient:
    from backend.app.config import AppSettings
    from backend.app.main import create_app

    settings = AppSettings(
        project_root=tmp_path,
        ppt_maker_root=PPT_MAKER_ROOT,
        gorden_root=GORDEN_ROOT,
        template_selection_timeout_seconds=selection_timeout,
    )
    return TestClient(create_app(settings, generation_runner=runner))


def test_websocket_generate_completes_with_selected_template(tmp_path: Path):
    runner = SuccessfulFakeRunner()
    client = make_client(tmp_path, runner)

    with client.websocket_connect("/ws/generate") as websocket:
        websocket.send_json({"type": "generate", "payload": {"prompt": "季度总结", "page_count": 6, "style": "商务深蓝"}})
        candidates = websocket.receive_json()
        assert candidates["type"] == "template_candidates"
        assert candidates["stage"] == "selecting_template"
        assert len(candidates["candidates"]) == 19

        websocket.send_json({"type": "select_template", "template_slug": candidates["candidates"][0]["slug"]})
        messages = [websocket.receive_json(), websocket.receive_json(), websocket.receive_json(), websocket.receive_json()]

    assert [message["type"] for message in messages] == ["progress", "progress", "progress", "complete"]
    assert messages[-1]["result"]["file_name"] == "output.pptx"
    assert messages[-1]["result"]["preview"]["slide_count"] == 6
    assert runner.requests[0].template_slug == candidates["candidates"][0]["slug"]
    assert client.get("/api/generate/status").json()["in_progress"] is False
    assert client.get("/api/files").json()["files"][0]["file_name"] == "output.pptx"


def test_websocket_auto_selects_best_template_after_timeout(tmp_path: Path):
    runner = SuccessfulFakeRunner()
    client = make_client(tmp_path, runner, selection_timeout=0.01)

    with client.websocket_connect("/ws/generate") as websocket:
        websocket.send_json({"type": "generate", "payload": {"prompt": "季度总结", "page_count": 4, "style": "商务深蓝"}})
        candidates = websocket.receive_json()
        progress = websocket.receive_json()
        assert progress["stage"] == "generating_outline"
        complete = None
        while complete is None:
            message = websocket.receive_json()
            if message["type"] == "complete":
                complete = message

    assert runner.requests[0].template_slug == candidates["candidates"][0]["slug"]
    assert complete["result"]["preview"]["slide_count"] == 4


def test_websocket_cancel_stops_running_task(tmp_path: Path):
    client = make_client(tmp_path, CancellingFakeRunner())

    with client.websocket_connect("/ws/generate") as websocket:
        websocket.send_json({"type": "generate", "payload": {"prompt": "取消测试", "page_count": 3, "style": "商务"}})
        assert websocket.receive_json()["type"] == "template_candidates"
        assert websocket.receive_json()["stage"] == "generating_outline"
        assert client.get("/api/generate/status").json()["in_progress"] is True
        websocket.send_json({"type": "cancel"})
        payload = websocket.receive_json()

    assert payload == {"type": "cancelled", "message": "任务已终止"}
    assert client.get("/api/generate/status").json()["in_progress"] is False


def test_websocket_rejects_generate_when_task_active(tmp_path: Path):
    client = make_client(tmp_path, SuccessfulFakeRunner())
    manager = client.app.state.task_manager
    assert manager.start(task_id="existing", work_dir=tmp_path / "work" / "ppt-maker" / "existing")

    with client.websocket_connect("/ws/generate") as websocket:
        websocket.send_json({"type": "generate", "payload": {"prompt": "并发测试", "page_count": 3, "style": "商务"}})
        payload = websocket.receive_json()

    assert payload == {"type": "error", "message": "task_in_progress"}
    manager.finish("existing")


def test_websocket_rejects_unknown_selected_template_slug(tmp_path: Path):
    runner = SuccessfulFakeRunner()
    client = make_client(tmp_path, runner)

    with client.websocket_connect("/ws/generate") as websocket:
        websocket.send_json({"type": "generate", "payload": {"prompt": "模板校验", "page_count": 3, "style": "商务"}})
        assert websocket.receive_json()["type"] == "template_candidates"
        websocket.send_json({"type": "select_template", "template_slug": "stale-template-slug"})
        payload = websocket.receive_json()

    assert payload["type"] == "error"
    assert "invalid template_slug: stale-template-slug" in payload["message"]
    assert "minimal-business-summary" in payload["message"]
    assert runner.requests == []


def test_reference_recommendations_order_template_candidates(tmp_path: Path):
    runner = SuccessfulFakeRunner()
    client = make_client(tmp_path, runner)

    with client.websocket_connect("/ws/generate") as websocket:
        websocket.send_json(
            {
                "type": "generate",
                "payload": {
                    "mode": "prompt_to_ppt",
                    "prompt": "参考文件配色生成汇报",
                    "page_count": 5,
                    "style": "",
                    "reference_analysis": {
                        "file_type": "pdf",
                        "dominant_colors": ["#1F3A93"],
                        "recommended_templates": ["architecture-deck", "report-savior", "stale-template"],
                    },
                },
            }
        )
        candidates = None
        while candidates is None:
            message = websocket.receive_json()
            if message["type"] == "template_candidates":
                candidates = message
        websocket.send_json({"type": "cancel"})
        cancelled = websocket.receive_json()

    assert candidates is not None
    assert candidates["type"] == "template_candidates"
    assert [candidate["slug"] for candidate in candidates["candidates"][:2]] == ["architecture-deck", "report-savior"]
    assert "stale-template" not in [candidate["slug"] for candidate in candidates["candidates"]]
    assert cancelled["type"] == "cancelled"


def test_mode_b_skips_template_selection(tmp_path: Path):
    runner = SuccessfulFakeRunner()
    client = make_client(tmp_path, runner)
    source = tmp_path / "work" / "ppt-maker" / "uploads" / "session-a1b2c3d4e5f6" / "季度复盘初稿.pptx"
    source.parent.mkdir(parents=True)
    source.write_bytes(b"source-pptx")

    with client.websocket_connect("/ws/generate") as websocket:
        websocket.send_json(
            {
                "type": "generate",
                "payload": {
                    "mode": "template_preserving_edit",
                    "source_pptx_path": "uploads/session-a1b2c3d4e5f6/季度复盘初稿.pptx",
                    "prompt": "把封面标题改成 2026 上半年总结",
                    "page_count": None,
                    "style": None,
                },
            }
        )
        messages = []
        while True:
            message = websocket.receive_json()
            messages.append(message)
            if message["type"] in {"complete", "error", "cancelled"}:
                break

    assert "template_candidates" not in [message["type"] for message in messages]
    assert runner.requests[0].mode == "template_preserving_edit"
    assert runner.requests[0].source_pptx_path == "uploads/session-a1b2c3d4e5f6/季度复盘初稿.pptx"


def test_mode_b_validate_edits_skips_page_count_check():
    from backend.app.services.validate_edits import validate_edits

    result = validate_edits(
        {
            "selected_slides": list(range(1, 20)),
            "edits": [{"slide": 1, "slot_id": "cover_title_cn", "new_text": "上半年经营复盘"}],
        },
        page_count=None,
    )

    assert result == {"valid": True, "warnings": []}


def test_control_channel_disconnect_does_not_cancel_running_task(tmp_path: Path):
    from backend.app.routers.generation import _receive_control_events

    class DisconnectingWebSocket:
        async def receive_json(self):
            raise WebSocketDisconnect()

    client = make_client(tmp_path, SuccessfulFakeRunner())

    async def execute() -> bool:
        cancel_event = asyncio.Event()
        await _receive_control_events(
            DisconnectingWebSocket(),
            asyncio.Queue(),
            cancel_event,
            client.app.state.task_manager,
        )
        return cancel_event.is_set()

    assert asyncio.run(execute()) is False


def write_script(path: Path, body: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body, encoding="utf-8")


def test_subprocess_runner_executes_generation_chain(tmp_path: Path):
    from backend.app.config import AppSettings
    from backend.app.services.generation import GenerationContext, GenerationRequest, SubprocessGenerationRunner

    ppt_root = tmp_path / "ppt-maker"
    gorden_root = tmp_path / "gorden"
    template_dir = gorden_root / "templates" / "minimal-business-summary"
    template_dir.mkdir(parents=True)
    (template_dir / "template.pptx").write_bytes(b"template")
    (template_dir / "detail.json").write_text('{"name":"Minimal Business"}', encoding="utf-8")
    (template_dir / "intro.md").write_text("Minimal business template intro", encoding="utf-8")
    calls = tmp_path / "calls.jsonl"

    write_script(
        ppt_root / "scripts" / "validate_ppt_request.py",
        "import json\nprint(json.dumps({'schema':'ppt-maker-validation/v1','status':'ok'}))\n",
    )
    write_script(
        ppt_root / "scripts" / "pptx_analyzer.py",
        "import json, pathlib, sys\npathlib.Path(sys.argv[sys.argv.index('--output') + 1]).write_text(json.dumps({'slide_count': 1, 'slides': []}), encoding='utf-8')\n",
    )
    write_script(
        gorden_root / "scripts" / "build_pptx.py",
        f"import json, pathlib, sys\npathlib.Path({str(calls)!r}).open('a').write(json.dumps({{'cmd':'build','argv':sys.argv[1:]}})+'\\n')\npathlib.Path(sys.argv[3]).write_bytes(b'pptx')\n",
    )
    write_script(
        tmp_path / "opencode",
        f"import json, pathlib, sys\npathlib.Path({str(calls)!r}).open('a').write(json.dumps({{'cmd':'opencode','argv':sys.argv[1:]}})+'\\n')\npathlib.Path('edits.json').write_text(json.dumps({{'selected_slides':[1], 'edits': []}}), encoding='utf-8')\n",
    )

    settings = AppSettings(
        project_root=tmp_path,
        ppt_maker_root=ppt_root,
        gorden_root=gorden_root,
        opencode_bin=tmp_path / "opencode",
        task_timeout_seconds=2,
    )
    runner = SubprocessGenerationRunner(settings)
    work_dir = tmp_path / "work" / "ppt-maker" / "20260603-211700_abcd"
    work_dir.mkdir(parents=True)
    events: list[tuple[str, str]] = []

    async def progress(stage: str, message: str) -> None:
        events.append((stage, message))

    async def execute():
        context = GenerationContext(task_id="abcd", work_dir=work_dir, cancel_event=asyncio.Event())
        return await runner.run(
            GenerationRequest(prompt="季度总结", page_count=5, style="商务深蓝", template_slug="minimal-business-summary"),
            context,
            progress,
        )

    result = asyncio.run(execute())

    calls_payload = [json.loads(line) for line in calls.read_text(encoding="utf-8").splitlines()]
    assert [item["cmd"] for item in calls_payload] == ["opencode", "build"]
    assert calls_payload[0]["argv"][0:3] == ["run", "--dir", str(work_dir)]
    assert (work_dir / "orchestration_prompt.md").exists()
    assert (work_dir / "template_context" / "detail.json").read_text(encoding="utf-8") == '{"name":"Minimal Business"}'
    assert (work_dir / "template_context" / "intro.md").read_text(encoding="utf-8") == "Minimal business template intro"
    orchestration_prompt = (work_dir / "orchestration_prompt.md").read_text(encoding="utf-8")
    assert '"output_edits_json": "./edits.json"' in orchestration_prompt
    assert str(work_dir / "edits.json") not in orchestration_prompt
    opencode_args = json.dumps(calls_payload[0]["argv"], ensure_ascii=False)
    assert "template_context/detail.json" in orchestration_prompt
    assert "template_context/intro.md" in orchestration_prompt
    assert str(template_dir) not in opencode_args
    assert result["file_name"] == "output.pptx"
    assert result["preview"]["slide_count"] == 1
    assert [event[0] for event in events] == ["generating_outline", "building_pptx", "quality_check"]


def test_mode_a_payload_includes_reference_analysis_in_prompt(tmp_path: Path):
    from backend.app.config import AppSettings
    from backend.app.services.generation import GenerationContext, GenerationRequest, SubprocessGenerationRunner

    ppt_root = tmp_path / "ppt-maker"
    gorden_root = tmp_path / "gorden"
    template_dir = gorden_root / "templates" / "minimal-business-summary"
    template_dir.mkdir(parents=True)
    (template_dir / "template.pptx").write_bytes(b"template")
    (template_dir / "detail.json").write_text('{"name":"Minimal Business"}', encoding="utf-8")
    (template_dir / "intro.md").write_text("Minimal business template intro", encoding="utf-8")

    write_script(
        ppt_root / "scripts" / "validate_ppt_request.py",
        "import json\nprint(json.dumps({'schema':'ppt-maker-validation/v1','status':'ok'}))\n",
    )
    write_script(
        ppt_root / "scripts" / "pptx_analyzer.py",
        "import json, pathlib, sys\npathlib.Path(sys.argv[sys.argv.index('--output') + 1]).write_text(json.dumps({'slide_count': 1, 'slides': []}), encoding='utf-8')\n",
    )
    write_script(
        gorden_root / "scripts" / "build_pptx.py",
        "import pathlib, sys\npathlib.Path(sys.argv[3]).write_bytes(b'pptx')\n",
    )
    write_script(
        tmp_path / "opencode",
        "import json, pathlib\npathlib.Path('edits.json').write_text(json.dumps({'selected_slides':[1], 'edits': []}), encoding='utf-8')\n",
    )

    settings = AppSettings(
        project_root=tmp_path,
        ppt_maker_root=ppt_root,
        gorden_root=gorden_root,
        opencode_bin=tmp_path / "opencode",
        task_timeout_seconds=2,
    )
    work_dir = tmp_path / "work" / "ppt-maker" / "20260604-reference_prompt"
    work_dir.mkdir(parents=True)

    async def progress(stage: str, message: str) -> None:
        pass

    async def execute():
        await SubprocessGenerationRunner(settings).run(
            GenerationRequest(
                mode="prompt_to_ppt",
                prompt="生成一份季度经营总结",
                page_count=5,
                style="商务",
                template_slug="minimal-business-summary",
                reference_analysis={
                    "file_type": "pdf",
                    "page_count": 12,
                    "extracted_text": "Reference report text with revenue and margin details." * 20,
                    "dominant_colors": ["#1F3A93", "#FFFFFF", "#E74C3C"],
                    "color_style_hint": "深蓝+白色主调，红色点缀",
                    "recommended_templates": ["architecture-deck", "report-savior"],
                },
            ),
            GenerationContext(task_id="reference", work_dir=work_dir, cancel_event=asyncio.Event()),
            progress,
        )

    asyncio.run(execute())

    prompt = (work_dir / "orchestration_prompt.md").read_text(encoding="utf-8")
    assert "## 参考文件分析" in prompt
    assert "文件类型：pdf（12 页）" in prompt
    assert "Reference report text with revenue" in prompt
    assert "#1F3A93, #FFFFFF, #E74C3C" in prompt
    assert "深蓝+白色主调，红色点缀" in prompt
    assert "architecture-deck, report-savior" in prompt


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def make_mode_b_runner_settings(tmp_path: Path, edits_json: dict[str, object]) -> tuple[object, Path, Path]:
    from backend.app.config import AppSettings

    ppt_root = tmp_path / "ppt-maker"
    gorden_root = tmp_path / "gorden"
    calls = tmp_path / "calls.jsonl"
    build_marker = tmp_path / "build-called"
    analyzer_payload = {
        "schema": "ppt-maker-machine-extracted/v1",
        "slide_count": 2,
        "slides": [
            {
                "slide_number": 1,
                "role": "cover",
                "texts": [
                    {
                        "shape_id": 12,
                        "paragraph": 0,
                        "run": 0,
                        "text": "季度复盘初稿",
                    }
                ],
            }
        ],
        "texts": [
            {
                "slide": 1,
                "shape_id": 12,
                "paragraph": 0,
                "run": 0,
                "text": "季度复盘初稿",
            }
        ],
    }

    write_script(
        ppt_root / "scripts" / "validate_ppt_request.py",
        "import json\nprint(json.dumps({'schema':'ppt-maker-validation/v1','status':'ok'}))\n",
    )
    write_script(
        ppt_root / "scripts" / "pptx_analyzer.py",
        "import json, pathlib, sys\n"
        f"payload = {json.dumps(analyzer_payload, ensure_ascii=False)!r}\n"
        "pathlib.Path(sys.argv[sys.argv.index('--output') + 1]).write_text(payload, encoding='utf-8')\n",
    )
    write_script(
        gorden_root / "scripts" / "build_pptx.py",
        "import json, pathlib, sys\n"
        f"pathlib.Path({str(calls)!r}).open('a').write(json.dumps({{'cmd':'build','argv':sys.argv[1:]}})+'\\n')\n"
        f"pathlib.Path({str(build_marker)!r}).write_text('called', encoding='utf-8')\n"
        "pathlib.Path(sys.argv[3]).write_bytes(b'pptx')\n",
    )
    write_script(
        tmp_path / "opencode",
        "import json, pathlib\n"
        f"pathlib.Path('edits.json').write_text({json.dumps(json.dumps(edits_json, ensure_ascii=False))}, encoding='utf-8')\n",
    )

    settings = AppSettings(
        project_root=tmp_path,
        ppt_maker_root=ppt_root,
        gorden_root=gorden_root,
        opencode_bin=tmp_path / "opencode",
        task_timeout_seconds=2,
    )
    return settings, calls, build_marker


async def run_mode_b_runner(tmp_path: Path, edits_json: dict[str, object]) -> tuple[dict[str, object], Path, Path, Path, Path]:
    from backend.app.services.generation import GenerationContext, GenerationRequest, SubprocessGenerationRunner

    settings, calls, build_marker = make_mode_b_runner_settings(tmp_path, edits_json)
    source = settings.work_root / "uploads" / "session-a1b2c3d4e5f6" / "季度复盘初稿.pptx"
    source.parent.mkdir(parents=True)
    source.write_bytes(b"original-source-pptx")
    work_dir = settings.work_root / "20260604-120000_modeb"
    work_dir.mkdir(parents=True)
    events: list[tuple[str, str]] = []

    async def progress(stage: str, message: str) -> None:
        events.append((stage, message))

    context = GenerationContext(task_id="modeb", work_dir=work_dir, cancel_event=asyncio.Event())
    result = await SubprocessGenerationRunner(settings).run(
        GenerationRequest(
            mode="template_preserving_edit",
            source_pptx_path="uploads/session-a1b2c3d4e5f6/季度复盘初稿.pptx",
            prompt="把封面标题改成 2026 上半年总结",
            page_count=None,
            style=None,
            template_slug=None,
        ),
        context,
        progress,
    )
    return result, source, work_dir, calls, build_marker


def test_mode_b_runner_calls_build_with_source_pptx(tmp_path: Path):
    edits_json = {
        "selected_slides": [1],
        "edits": [
            {
                "slide": 1,
                "address": {"shape_id": 12, "paragraph": 0, "run": 0},
                "new_text": "2026 上半年总结",
            }
        ],
    }

    result, _source, work_dir, calls, _build_marker = asyncio.run(run_mode_b_runner(tmp_path, edits_json))

    calls_payload = [json.loads(line) for line in calls.read_text(encoding="utf-8").splitlines()]
    build_call = next(item for item in calls_payload if item["cmd"] == "build")
    assert build_call["argv"][0] == str(work_dir / "source.pptx")
    assert build_call["argv"][1] == str(work_dir / "edits.json")
    assert build_call["argv"][2] == str(work_dir / "output.pptx")
    assert result["file_name"] == "output.pptx"


def test_mode_b_orchestration_prompt_includes_shape_address_table(tmp_path: Path):
    edits_json = {
        "selected_slides": [1],
        "edits": [
            {
                "slide": 1,
                "address": {"shape_id": 12, "paragraph": 0, "run": 0},
                "new_text": "2026 上半年总结",
            }
        ],
    }

    _result, _source, work_dir, _calls, _build_marker = asyncio.run(run_mode_b_runner(tmp_path, edits_json))

    prompt = (work_dir / "orchestration_prompt.md").read_text(encoding="utf-8")
    assert '"shape_id": 12' in prompt
    assert '"paragraph": 0' in prompt
    assert '"run": 0' in prompt
    assert "季度复盘初稿" in prompt


def test_mode_b_preserves_original_file(tmp_path: Path):
    edits_json = {
        "selected_slides": [1],
        "edits": [
            {
                "slide": 1,
                "address": {"shape_id": 12, "paragraph": 0, "run": 0},
                "new_text": "2026 上半年总结",
            }
        ],
    }
    settings, _calls, _build_marker = make_mode_b_runner_settings(tmp_path, edits_json)
    source = settings.work_root / "uploads" / "session-a1b2c3d4e5f6" / "季度复盘初稿.pptx"
    source.parent.mkdir(parents=True)
    source.write_bytes(b"original-source-pptx")
    before = sha256(source)
    work_dir = settings.work_root / "20260604-120000_modeb"
    work_dir.mkdir(parents=True)

    async def progress(stage: str, message: str) -> None:
        pass

    async def execute() -> None:
        from backend.app.services.generation import GenerationContext, GenerationRequest, SubprocessGenerationRunner

        await SubprocessGenerationRunner(settings).run(
            GenerationRequest(
                mode="template_preserving_edit",
                source_pptx_path="uploads/session-a1b2c3d4e5f6/季度复盘初稿.pptx",
                prompt="把封面标题改成 2026 上半年总结",
                page_count=None,
                style=None,
                template_slug=None,
            ),
            GenerationContext(task_id="modeb", work_dir=work_dir, cancel_event=asyncio.Event()),
            progress,
        )

    asyncio.run(execute())

    assert sha256(source) == before


def test_mode_b_edits_rejected_with_slot_id_before_build(tmp_path: Path):
    from backend.app.services.generation import GenerationError

    edits_json = {
        "selected_slides": [1],
        "edits": [{"slide": 1, "slot_id": "cover_title_cn", "new_text": "2026 上半年总结"}],
    }
    settings, _calls, build_marker = make_mode_b_runner_settings(tmp_path, edits_json)
    source = settings.work_root / "uploads" / "session-a1b2c3d4e5f6" / "季度复盘初稿.pptx"
    source.parent.mkdir(parents=True)
    source.write_bytes(b"original-source-pptx")
    work_dir = settings.work_root / "20260604-120000_modeb"
    work_dir.mkdir(parents=True)

    async def progress(stage: str, message: str) -> None:
        pass

    async def execute() -> None:
        from backend.app.services.generation import GenerationContext, GenerationRequest, SubprocessGenerationRunner

        await SubprocessGenerationRunner(settings).run(
            GenerationRequest(
                mode="template_preserving_edit",
                source_pptx_path="uploads/session-a1b2c3d4e5f6/季度复盘初稿.pptx",
                prompt="把封面标题改成 2026 上半年总结",
                page_count=None,
                style=None,
                template_slug=None,
            ),
            GenerationContext(task_id="modeb", work_dir=work_dir, cancel_event=asyncio.Event()),
            progress,
        )

    with pytest.raises(GenerationError) as exc_info:
        asyncio.run(execute())

    assert "slot_id" in str(exc_info.value)
    assert not build_marker.exists()
