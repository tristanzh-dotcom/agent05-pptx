from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse

from backend.app.config import AppSettings
from backend.app.services.files import (
    delete_generated_file,
    generate_visual_preview_for_pptx,
    list_generated_files,
    read_preview_for_pptx,
    resolve_visual_preview_asset,
    resolve_work_file,
)


router = APIRouter()


@router.get("/api/files")
def files(request: Request) -> dict[str, object]:
    settings: AppSettings = request.app.state.settings
    return {
        "schema": "ppt-maker-files/v1",
        "files": list_generated_files(settings.work_root),
    }


@router.get("/api/files/{file_id:path}/download")
def download_file(file_id: str, request: Request) -> FileResponse:
    settings: AppSettings = request.app.state.settings
    path = resolve_work_file(settings.work_root, file_id)
    return FileResponse(
        path,
        media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
        filename=path.name,
    )


@router.get("/api/files/{file_id:path}/preview")
def preview_file(file_id: str, request: Request) -> dict[str, object]:
    settings: AppSettings = request.app.state.settings
    return read_preview_for_pptx(settings.work_root, file_id)


@router.get("/api/files/{task_dir}/{pptx_name}/visual-preview")
def visual_preview_file(task_dir: str, pptx_name: str, request: Request) -> dict[str, object]:
    settings: AppSettings = request.app.state.settings
    file_id = f"{task_dir}/{pptx_name}"
    return generate_visual_preview_for_pptx(settings.work_root, file_id)


@router.get("/api/files/{task_dir}/{pptx_name}/visual-preview/{asset_path:path}")
def visual_preview_asset(task_dir: str, pptx_name: str, asset_path: str, request: Request) -> FileResponse:
    settings: AppSettings = request.app.state.settings
    file_id = f"{task_dir}/{pptx_name}"
    return FileResponse(resolve_visual_preview_asset(settings.work_root, file_id, asset_path))


@router.delete("/api/files/{file_id:path}")
def delete_file(file_id: str, request: Request) -> dict[str, object]:
    settings: AppSettings = request.app.state.settings
    return delete_generated_file(settings.work_root, file_id)
