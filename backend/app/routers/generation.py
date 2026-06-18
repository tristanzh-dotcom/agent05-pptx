from __future__ import annotations

import asyncio
import re
from datetime import datetime
from uuid import uuid4

from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect

from backend.app.config import AppSettings
from backend.app.services.generation import GenerationContext, GenerationError, GenerationRequest
from backend.app.services.reference_analyzer import recommend_templates_by_colors
from backend.app.services.tasks import TaskManager
from backend.app.services.templates import parse_templates


router = APIRouter()
EXPLICIT_PAGE_COUNT_RE = re.compile(
    r"(?<!\d)(?P<arabic>\d{1,2})\s*(?:页|頁|张|張)\s*(?:PPT|ppt|幻灯片|投影片|演示文稿)?"
)
CHINESE_PAGE_COUNT_RE = re.compile(
    r"(?P<chinese>[一二两三四五六七八九十]{1,3})\s*(?:页|頁|张|張)\s*(?:PPT|ppt|幻灯片|投影片|演示文稿)?"
)
CHINESE_NUMERALS = {
    "一": 1,
    "二": 2,
    "两": 2,
    "三": 3,
    "四": 4,
    "五": 5,
    "六": 6,
    "七": 7,
    "八": 8,
    "九": 9,
}


@router.get("/api/generate/status")
def generation_status(request: Request) -> dict[str, object]:
    manager: TaskManager = request.app.state.task_manager
    return manager.status().as_status_payload()


@router.post("/api/generate/cancel")
def cancel_generation(request: Request) -> dict[str, object]:
    manager: TaskManager = request.app.state.task_manager
    cancelled = manager.cancel()
    return {
        "schema": "ppt-maker-generation-cancel/v1",
        "cancelled": cancelled,
        "message": "task_cancelled" if cancelled else "no_task_in_progress",
    }


@router.websocket("/ws/generate")
async def generate_ws(websocket: WebSocket) -> None:
    await websocket.accept()
    try:
        event = await websocket.receive_json()
    except WebSocketDisconnect:
        return
    if event.get("type") == "cancel":
        await _send_json_if_connected(websocket, {"type": "cancelled", "message": "任务已终止"})
        return
    if event.get("type") != "generate":
        await _send_json_if_connected(websocket, {"type": "error", "message": "unknown_event_type"})
        return

    await _run_generation_session(websocket, event)


async def _run_generation_session(websocket: WebSocket, event: dict[str, object]) -> None:
    settings: AppSettings = websocket.app.state.settings
    manager: TaskManager = websocket.app.state.task_manager
    runner = websocket.app.state.generation_runner
    payload = event.get("payload") if isinstance(event.get("payload"), dict) else {}
    task_id = uuid4().hex[:8]
    work_dir = settings.work_root / f"{datetime.now().strftime('%Y%m%d-%H%M%S')}_{task_id}"
    cancel_event = asyncio.Event()
    if not manager.start(task_id=task_id, work_dir=work_dir, cancel_event=cancel_event):
        await _send_json_if_connected(websocket, {"type": "error", "message": "task_in_progress"})
        return
    work_dir.mkdir(parents=True, exist_ok=True)

    select_queue: asyncio.Queue[str] = asyncio.Queue()
    receiver = asyncio.create_task(_receive_control_events(websocket, select_queue, cancel_event, manager))
    try:
        mode = str(payload.get("mode") or "prompt_to_ppt")
        if mode == "template_preserving_edit":
            request = _mode_b_request(payload)
        elif mode == "prompt_to_ppt":
            reference_analysis = payload.get("reference_analysis") if isinstance(payload.get("reference_analysis"), dict) else None
            candidates = _template_candidates(settings, _trusted_reference_recommendations(reference_analysis, settings))
            manager.update(task_id=task_id, stage="selecting_template", message="已匹配模板候选，等待用户选择...")
            if reference_analysis and reference_analysis.get("file_type") != "pptx":
                await _send_json_if_connected(
                    websocket,
                    {
                        "type": "progress",
                        "stage": "analyzing_reference",
                        "message": "正在分析参考文件...",
                    },
                )
                await _send_json_if_connected(
                    websocket,
                    {
                        "type": "reference_analysis",
                        "file_type": reference_analysis.get("file_type"),
                        "page_count": reference_analysis.get("page_count"),
                        "dominant_colors": reference_analysis.get("dominant_colors") or [],
                        "text_chars": len(str(reference_analysis.get("extracted_text") or "")),
                        "screenshot_url": reference_analysis.get("screenshot_url"),
                    },
                )
            await _send_json_if_connected(
                websocket,
                {
                    "type": "template_candidates",
                    "stage": "selecting_template",
                    "message": "已匹配模板候选，等待用户选择...",
                    "candidates": candidates,
                    "auto_select_seconds": settings.template_selection_timeout_seconds,
                }
            )
            template_slug = await _select_template(select_queue, cancel_event, candidates, settings.template_selection_timeout_seconds)
            if cancel_event.is_set():
                await _send_json_if_connected(websocket, {"type": "cancelled", "message": "任务已终止"})
                return
            valid_slugs = {str(candidate["slug"]) for candidate in candidates}
            if template_slug not in valid_slugs:
                valid_slug_list = ", ".join(sorted(valid_slugs))
                raise GenerationError(f"invalid template_slug: {template_slug}; valid slugs: {valid_slug_list}")
            request = _mode_a_request(payload, template_slug)
        else:
            raise GenerationError(f"unknown generation mode: {mode}")
        context = GenerationContext(task_id=task_id, work_dir=work_dir, cancel_event=cancel_event)

        async def progress(stage: str, message: str) -> None:
            manager.update(task_id=task_id, stage=stage, message=message)
            await _send_json_if_connected(websocket, {"type": "progress", "stage": stage, "message": message})

        result = await runner.run(request, context, progress)
        await _send_json_if_connected(websocket, {"type": "complete", "result": result})
    except asyncio.CancelledError:
        await _send_json_if_connected(websocket, {"type": "cancelled", "message": "任务已终止"})
    except GenerationError as exc:
        await _send_json_if_connected(websocket, {"type": "error", "message": str(exc)})
    except WebSocketDisconnect:
        pass
    finally:
        receiver.cancel()
        manager.finish(task_id)


async def _receive_control_events(
    websocket: WebSocket,
    select_queue: asyncio.Queue[str],
    cancel_event: asyncio.Event,
    manager: TaskManager,
) -> None:
    try:
        while True:
            event = await websocket.receive_json()
            event_type = event.get("type")
            if event_type == "select_template":
                slug = event.get("template_slug")
                if isinstance(slug, str) and slug:
                    await select_queue.put(slug)
            elif event_type == "cancel":
                cancel_event.set()
                manager.cancel()
                return
    except WebSocketDisconnect:
        return


async def _send_json_if_connected(websocket: WebSocket, payload: dict[str, object]) -> bool:
    try:
        await websocket.send_json(payload)
    except (RuntimeError, WebSocketDisconnect):
        return False
    return True


async def _select_template(
    select_queue: asyncio.Queue[str],
    cancel_event: asyncio.Event,
    candidates: list[dict[str, object]],
    timeout: float,
) -> str:
    default = str(candidates[0]["slug"])
    cancel_wait = asyncio.create_task(cancel_event.wait())
    select_wait = asyncio.create_task(select_queue.get())
    done, pending = await asyncio.wait({cancel_wait, select_wait}, timeout=timeout, return_when=asyncio.FIRST_COMPLETED)
    for task in pending:
        task.cancel()
    if select_wait in done:
        return select_wait.result()
    return default


def _template_candidates(settings: AppSettings, recommended_slugs: list[str] | None = None) -> list[dict[str, object]]:
    templates = parse_templates(settings.templates_index)
    ordered_templates = _order_templates(templates, recommended_slugs or [])
    return [
        {
            "slug": item["slug"],
            "name": item["name"],
            "style_description": item["description"],
            "page_count": item["page_count"],
            "preview_url": item["preview_url"],
        }
        for item in ordered_templates
    ]


def _order_templates(templates: list[dict[str, object]], recommended_slugs: list[str]) -> list[dict[str, object]]:
    if not recommended_slugs:
        return templates
    by_slug = {str(item.get("slug")): item for item in templates}
    ordered: list[dict[str, object]] = []
    used: set[str] = set()
    for slug in recommended_slugs:
        item = by_slug.get(slug)
        if item is not None and slug not in used:
            ordered.append(item)
            used.add(slug)
    ordered.extend(item for item in templates if str(item.get("slug")) not in used)
    return ordered


def _trusted_reference_recommendations(reference_analysis: dict[str, object] | None, settings: AppSettings) -> list[str]:
    if not isinstance(reference_analysis, dict) or reference_analysis.get("file_type") == "pptx":
        return []
    templates = parse_templates(settings.templates_index)
    valid_slugs = {str(item.get("slug")) for item in templates}
    recommended = [
        str(slug)
        for slug in reference_analysis.get("recommended_templates") or []
        if isinstance(slug, str) and slug in valid_slugs
    ][:3]
    if recommended:
        return recommended
    colors = [str(color) for color in reference_analysis.get("dominant_colors") or [] if isinstance(color, str)]
    return recommend_templates_by_colors(colors, templates)


def _mode_a_request(payload: dict[str, object], template_slug: str) -> GenerationRequest:
    reference_analysis = payload.get("reference_analysis") if isinstance(payload.get("reference_analysis"), dict) else None
    prompt = str(payload.get("prompt") or "")
    return GenerationRequest(
        mode="prompt_to_ppt",
        prompt=prompt,
        page_count=resolve_mode_a_page_count(prompt, payload.get("page_count"), reference_analysis),
        style=str(payload.get("style") or ""),
        purpose=str(payload.get("purpose")) if payload.get("purpose") else None,
        custom_template_path=str(payload.get("custom_template_path")) if payload.get("custom_template_path") else None,
        template_slug=template_slug,
        reference_analysis=reference_analysis,
    )


def _mode_b_request(payload: dict[str, object]) -> GenerationRequest:
    return GenerationRequest(
        mode="template_preserving_edit",
        source_pptx_path=str(payload.get("source_pptx_path") or ""),
        prompt=str(payload.get("prompt") or ""),
        page_count=None,
        style=None,
        purpose=None,
        custom_template_path=None,
        template_slug=None,
    )


def resolve_mode_a_page_count(prompt: str, payload_page_count: object, reference_analysis: dict[str, object] | None = None) -> int:
    explicit = infer_explicit_page_count(prompt)
    if explicit is not None:
        return explicit
    payload_count = _coerce_page_count(payload_page_count)
    if payload_count is not None:
        return payload_count
    return infer_auto_page_count(prompt, reference_analysis)


def infer_explicit_page_count(prompt: str) -> int | None:
    normalized = prompt.strip()
    if not normalized:
        return None
    arabic_match = EXPLICIT_PAGE_COUNT_RE.search(normalized)
    if arabic_match:
        return _bounded_page_count(int(arabic_match.group("arabic")))
    chinese_match = CHINESE_PAGE_COUNT_RE.search(normalized)
    if chinese_match:
        parsed = _parse_chinese_count(chinese_match.group("chinese"))
        return _bounded_page_count(parsed) if parsed is not None else None
    return None


def infer_auto_page_count(prompt: str, reference_analysis: dict[str, object] | None = None) -> int:
    cleaned = prompt.strip()
    text_chars = 0
    if isinstance(reference_analysis, dict):
        text_chars = _safe_int(reference_analysis.get("text_chars")) or len(str(reference_analysis.get("extracted_text") or ""))

    separators = sum(cleaned.count(token) for token in ("、", "，", ",", "；", ";", "\n"))
    topic_count = max(1, separators + 1) if cleaned else 1
    combined_size = len(cleaned) + text_chars // 120

    if topic_count >= 12 or combined_size >= 900:
        return 15
    if topic_count >= 8 or combined_size >= 520:
        return 12
    if topic_count >= 5 or combined_size >= 260:
        return 8
    return 5


def _coerce_page_count(value: object) -> int | None:
    parsed = _safe_int(value)
    return _bounded_page_count(parsed) if parsed is not None and parsed > 0 else None


def _safe_int(value: object) -> int | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return value
    if isinstance(value, str) and value.strip().isdigit():
        return int(value.strip())
    return None


def _bounded_page_count(value: int) -> int:
    return max(1, min(value, 60))


def _parse_chinese_count(value: str) -> int | None:
    if value == "十":
        return 10
    if value.startswith("十"):
        tail = value[1:]
        return 10 + CHINESE_NUMERALS.get(tail, 0) if not tail or tail in CHINESE_NUMERALS else None
    if "十" in value:
        head, tail = value.split("十", 1)
        if head not in CHINESE_NUMERALS:
            return None
        return CHINESE_NUMERALS[head] * 10 + (CHINESE_NUMERALS.get(tail, 0) if tail else 0)
    return CHINESE_NUMERALS.get(value)
