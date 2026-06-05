from __future__ import annotations

import json
import re
from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse

from backend.app.config import AppSettings
from backend.app.services.files import ensure_work_root
from backend.app.services.reference_analyzer import analyze_reference, detect_file_type, recommend_templates_by_colors
from backend.app.services.templates import parse_templates


router = APIRouter()

SAFE_REFERENCE_NAME = re.compile(r"[^A-Za-z0-9._-]+")
SAFE_REF_ID = re.compile(r"^ref_[A-Za-z0-9_-]+$")
REFERENCE_SUFFIXES = {".pptx", ".pdf", ".png", ".jpg", ".jpeg"}


@router.post("/api/reference/analyze")
async def analyze_reference_upload(file: UploadFile, request: Request) -> dict[str, object]:
    settings: AppSettings = request.app.state.settings
    original_name = _sanitize_reference_name(file.filename or "")
    reference_dir = ensure_work_root(settings.work_root) / "references" / f"ref_{uuid4().hex[:12]}"
    reference_dir.mkdir(parents=True, exist_ok=True)
    target = reference_dir / original_name

    size = 0
    with target.open("wb") as output:
        while True:
            chunk = await file.read(1024 * 1024)
            if not chunk:
                break
            size += len(chunk)
            if size > settings.max_upload_bytes:
                target.unlink(missing_ok=True)
                raise HTTPException(status_code=413, detail="upload_too_large")
            output.write(chunk)

    if detect_file_type(target) == "unknown":
        target.unlink(missing_ok=True)
        raise HTTPException(status_code=400, detail="unsupported_reference_type")

    analysis = analyze_reference(target)
    templates = parse_templates(settings.templates_index)
    recommended = recommend_templates_by_colors(analysis.dominant_colors, templates)
    payload = _analysis_payload(reference_dir.name, original_name, analysis, recommended)
    (reference_dir / "analysis.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return payload


@router.get("/api/reference/{ref_id}/screenshot.png")
def reference_screenshot(ref_id: str, request: Request) -> FileResponse:
    if not SAFE_REF_ID.fullmatch(ref_id):
        raise HTTPException(status_code=400, detail="invalid_ref_id")
    settings: AppSettings = request.app.state.settings
    screenshot = ensure_work_root(settings.work_root) / "references" / ref_id / "screenshot.png"
    if not screenshot.exists() or not screenshot.is_file():
        raise HTTPException(status_code=404, detail="screenshot_not_found")
    return FileResponse(screenshot)


def _analysis_payload(ref_id: str, file_name: str, analysis, recommended_templates: list[str]) -> dict[str, object]:
    preview = analysis.preview_screenshot
    screenshot_url = None
    if preview is not None and preview.exists():
        screenshot = preview.with_name("screenshot.png")
        if preview != screenshot:
            preview.replace(screenshot)
        screenshot_url = f"/api/reference/{ref_id}/screenshot.png"

    return {
        "schema": "ppt-maker-reference-analysis/v1",
        "ref_id": ref_id,
        "file_name": file_name,
        "file_type": analysis.file_type,
        "page_count": analysis.page_count,
        "text_chars": len(analysis.extracted_text),
        "extracted_text": analysis.extracted_text,
        "dominant_colors": analysis.dominant_colors,
        "color_style_hint": analysis.color_style_hint,
        "recommended_templates": recommended_templates,
        "screenshot_url": screenshot_url,
        "extraction_errors": analysis.extraction_errors,
    }


def _sanitize_reference_name(filename: str) -> str:
    name = Path(filename).name.strip()
    name = SAFE_REFERENCE_NAME.sub("_", name)
    if not name or name in {".", ".."}:
        raise HTTPException(status_code=400, detail="invalid_upload_filename")
    if Path(name).suffix.lower() not in REFERENCE_SUFFIXES:
        raise HTTPException(status_code=400, detail="unsupported_reference_type")
    return name
