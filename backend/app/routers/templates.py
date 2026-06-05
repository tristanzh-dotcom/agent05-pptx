from __future__ import annotations

from fastapi import APIRouter, Request, UploadFile
from fastapi.responses import FileResponse

from backend.app.config import AppSettings
from backend.app.services.files import save_template_upload
from backend.app.services.templates import parse_templates


router = APIRouter()


@router.get("/api/templates")
def templates(request: Request) -> dict[str, object]:
    settings: AppSettings = request.app.state.settings
    return {
        "schema": "ppt-maker-templates/v1",
        "templates": parse_templates(settings.templates_index),
    }


@router.get("/api/templates/{slug}/preview.png")
def template_preview(slug: str, request: Request) -> FileResponse:
    settings: AppSettings = request.app.state.settings
    return FileResponse(settings.gorden_root / "templates" / slug / "preview.png")


@router.post("/api/templates/upload")
async def upload_template(file: UploadFile, request: Request) -> dict[str, object]:
    settings: AppSettings = request.app.state.settings
    return await save_template_upload(settings.work_root, file, settings.max_upload_bytes)
