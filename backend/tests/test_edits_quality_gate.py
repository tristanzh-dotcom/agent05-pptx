from __future__ import annotations

import asyncio
import json
from pathlib import Path

import pytest


def valid_payload(*, selected_slides: list[int] | None = None, edits: list[dict[str, object]] | None = None) -> dict:
    return {
        "selected_slides": selected_slides if selected_slides is not None else [1, 2, 3],
        "edits": edits
        if edits is not None
        else [
            {"slide": 1, "slot_id": "cover_title_cn", "new_text": "季度销售复盘"},
            {"slide": 2, "slot_id": "summary_body", "new_text": "销售额同比增长，渠道结构持续优化。"},
        ],
    }


def validate(payload: dict, page_count: int | None) -> dict:
    from backend.app.services.validate_edits import validate_edits

    return validate_edits(payload, page_count)


def test_selected_slides_under_page_count_passes():
    result = validate(valid_payload(selected_slides=[1, 2, 3]), page_count=5)

    assert result == {"valid": True, "warnings": []}


def test_selected_slides_one_over_page_count_passes_with_warning():
    result = validate(valid_payload(selected_slides=[1, 2, 3, 4, 5, 6]), page_count=5)

    assert result["valid"] is True
    assert result["warnings"] == ["selected_slides length 6 exceeds requested page_count 5 by 1"]


def test_selected_slides_more_than_one_over_page_count_is_rejected():
    result = validate(valid_payload(selected_slides=[1, 2, 3, 4, 5, 6, 7]), page_count=5)

    assert result["valid"] is False
    assert "selected_slides length 7 exceeds requested page_count 5" in result["errors"]


def test_page_count_none_skips_validation():
    result = validate(valid_payload(selected_slides=[1, 2, 3, 4, 5, 6, 7, 8, 9]), page_count=None)

    assert result == {"valid": True, "warnings": []}


def test_project_name_placeholder_is_rejected():
    result = validate(
        valid_payload(edits=[{"slide": 1, "slot_id": "cover_title_cn", "new_text": "项目名称"}]),
        page_count=5,
    )

    assert result["valid"] is False
    assert "slide 1 slot cover_title_cn new_text matches placeholder pattern: 项目名称" in result["errors"]


def test_question_placeholder_is_rejected():
    result = validate(
        valid_payload(edits=[{"slide": 2, "slot_id": "question_title", "new_text": "Question 1"}]),
        page_count=5,
    )

    assert result["valid"] is False
    assert "slide 2 slot question_title new_text matches placeholder pattern: Question 1" in result["errors"]


def test_valid_chinese_text_passes():
    result = validate(
        valid_payload(
            edits=[
                {"slide": 1, "slot_id": "cover_title_cn", "new_text": "华东区季度销售复盘"},
                {"slide": 2, "slot_id": "metric_1", "new_text": "新签客户数提升，重点行业贡献扩大。"},
                {"slide": 3, "slot_id": "next_action", "new_text": "聚焦高潜客户跟进，完善渠道激励。"},
            ]
        ),
        page_count=5,
    )

    assert result == {"valid": True, "warnings": []}


def test_missing_slot_id_is_rejected():
    result = validate(valid_payload(edits=[{"slide": 1, "new_text": "缺少 slot_id"}]), page_count=5)

    assert result["valid"] is False
    assert "edits[0] missing required field: slot_id" in result["errors"]


def test_empty_selected_slides_is_rejected():
    result = validate(valid_payload(selected_slides=[]), page_count=5)

    assert result["valid"] is False
    assert "selected_slides empty" in result["errors"]


def test_selected_slides_must_be_positive_integers():
    result = validate(valid_payload(selected_slides=[1, 0, -2, "3"]), page_count=5)

    assert result["valid"] is False
    assert "selected_slides[1] must be a positive integer" in result["errors"]
    assert "selected_slides[2] must be a positive integer" in result["errors"]
    assert "selected_slides[3] must be a positive integer" in result["errors"]


def test_duplicate_slide_slot_id_is_rejected():
    result = validate(
        valid_payload(
            edits=[
                {"slide": 1, "slot_id": "summary_body", "new_text": "第一版销售复盘内容"},
                {"slide": 1, "slot_id": "summary_body", "new_text": "第二版销售复盘内容"},
            ]
        ),
        page_count=5,
    )

    assert result["valid"] is False
    assert "duplicate edit for slide 1 slot summary_body" in result["errors"]


def write_script(path: Path, body: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body, encoding="utf-8")


def test_subprocess_runner_rejects_invalid_edits_after_build_succeeds(tmp_path: Path):
    from backend.app.config import AppSettings
    from backend.app.services.generation import GenerationContext, GenerationError, GenerationRequest, SubprocessGenerationRunner

    ppt_root = tmp_path / "ppt-maker"
    gorden_root = tmp_path / "gorden"
    template_dir = gorden_root / "templates" / "minimal-business-summary"
    template_dir.mkdir(parents=True)
    (template_dir / "template.pptx").write_bytes(b"template")
    (template_dir / "detail.json").write_text('{"name":"Minimal Business"}', encoding="utf-8")
    (template_dir / "intro.md").write_text("Minimal business template intro", encoding="utf-8")
    analyzer_marker = tmp_path / "analyzer-called"

    write_script(
        ppt_root / "scripts" / "validate_ppt_request.py",
        "import json\nprint(json.dumps({'schema':'ppt-maker-validation/v1','status':'ok'}))\n",
    )
    write_script(
        ppt_root / "scripts" / "pptx_analyzer.py",
        f"import pathlib\npathlib.Path({str(analyzer_marker)!r}).write_text('called', encoding='utf-8')\n",
    )
    write_script(
        gorden_root / "scripts" / "build_pptx.py",
        "import pathlib, sys\npathlib.Path(sys.argv[3]).write_bytes(b'pptx')\n",
    )
    write_script(
        tmp_path / "opencode",
        "import json, pathlib\n"
        "pathlib.Path('edits.json').write_text(json.dumps({"
        "'selected_slides':[1,2,3],"
        "'edits':[{'slide':1,'slot_id':'cover_title_cn','new_text':'项目名称'}]"
        "}), encoding='utf-8')\n",
    )

    settings = AppSettings(
        project_root=tmp_path,
        ppt_maker_root=ppt_root,
        gorden_root=gorden_root,
        opencode_bin=tmp_path / "opencode",
        task_timeout_seconds=2,
    )
    runner = SubprocessGenerationRunner(settings)
    work_dir = tmp_path / "work" / "ppt-maker" / "20260604-110000_abcd"
    work_dir.mkdir(parents=True)

    async def progress(stage: str, message: str) -> None:
        pass

    async def execute() -> None:
        context = GenerationContext(task_id="abcd", work_dir=work_dir, cancel_event=asyncio.Event())
        await runner.run(
            GenerationRequest(prompt="季度总结", page_count=2, style="商务", template_slug="minimal-business-summary"),
            context,
            progress,
        )

    with pytest.raises(GenerationError) as exc_info:
        asyncio.run(execute())

    assert "new_text matches placeholder pattern: 项目名称" in str(exc_info.value)
    assert not analyzer_marker.exists()
