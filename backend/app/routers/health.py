from __future__ import annotations

import importlib.util
import json
import shutil
import subprocess
import sys

from fastapi import APIRouter, Request

from backend.app.config import AppSettings


router = APIRouter()


def python_pptx_available() -> bool:
    return importlib.util.find_spec("pptx") is not None


def render_dependencies_available() -> bool:
    return bool((shutil.which("soffice") or shutil.which("libreoffice")) and shutil.which("pdftoppm"))


def run_validation(settings: AppSettings) -> dict[str, object]:
    if not settings.validate_script.exists():
        return {
            "schema": "ppt-maker-validation/v1",
            "status": "blocked",
            "mode": "prompt_to_ppt",
            "issues": ["missing_validate_script"],
        }
    completed = subprocess.run(
        [
            sys.executable,
            str(settings.validate_script),
            "--mode",
            "prompt_to_ppt",
            "--gorden-root",
            str(settings.gorden_root),
        ],
        check=False,
        text=True,
        capture_output=True,
        timeout=15,
    )
    try:
        return json.loads(completed.stdout)
    except json.JSONDecodeError:
        return {
            "schema": "ppt-maker-validation/v1",
            "status": "blocked",
            "mode": "prompt_to_ppt",
            "issues": ["invalid_validate_output"],
            "stderr": completed.stderr,
        }


@router.get("/api/health")
def health(request: Request) -> dict[str, object]:
    settings: AppSettings = request.app.state.settings
    validation = run_validation(settings)
    render_available = render_dependencies_available()
    qa = validation.get("qa") if isinstance(validation.get("qa"), dict) else {}
    return {
        "schema": "ppt-maker-web-health/v1",
        "status": validation.get("status", "blocked"),
        "validation": validation,
        "python_pptx_available": python_pptx_available(),
        "render_dependencies_available": render_available,
        "qa_mode": qa.get("qa_mode", "rendered_visual" if render_available else "structural_only"),
    }
