from __future__ import annotations

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from backend.app.config import AppSettings
from backend.app.routers import files, generation, health, references, templates
from backend.app.services.files import ensure_work_root
from backend.app.services.generation import SubprocessGenerationRunner
from backend.app.services.tasks import TaskManager


def create_app(settings: AppSettings | None = None, generation_runner: object | None = None) -> FastAPI:
    actual_settings = settings or AppSettings()
    ensure_work_root(actual_settings.work_root)

    app = FastAPI(title="PPT Maker Web", version="0.1.0")
    app.state.settings = actual_settings
    app.state.task_manager = TaskManager()
    app.state.generation_runner = generation_runner or SubprocessGenerationRunner(actual_settings)

    app.include_router(health.router)
    app.include_router(templates.router)
    app.include_router(references.router)
    app.include_router(files.router)
    app.include_router(generation.router)
    app.include_router(health.router, prefix="/agent05")
    app.include_router(templates.router, prefix="/agent05")
    app.include_router(references.router, prefix="/agent05")
    app.include_router(files.router, prefix="/agent05")
    app.include_router(generation.router, prefix="/agent05")
    app.mount(
        "/agent05",
        StaticFiles(directory=actual_settings.frontend_dist, html=True, check_dir=False),
        name="agent05-frontend",
    )
    return app


app = create_app()
