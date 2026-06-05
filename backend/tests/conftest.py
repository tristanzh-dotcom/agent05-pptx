from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


PROJECT_ROOT = Path(__file__).resolve().parents[2]
SKILLS_ROOT = PROJECT_ROOT.parent / ".ai_skills"
PPT_MAKER_ROOT = SKILLS_ROOT / "ppt-maker"
GORDEN_ROOT = SKILLS_ROOT / "gorden-ppt-skill"


@pytest.fixture()
def client(tmp_path: Path) -> TestClient:
    from backend.app.config import AppSettings
    from backend.app.main import create_app

    settings = AppSettings(
        project_root=tmp_path,
        ppt_maker_root=PPT_MAKER_ROOT,
        gorden_root=GORDEN_ROOT,
        max_upload_bytes=50 * 1024 * 1024,
    )
    app = create_app(settings)
    return TestClient(app)


@pytest.fixture()
def small_upload_client(tmp_path: Path) -> TestClient:
    from backend.app.config import AppSettings
    from backend.app.main import create_app

    settings = AppSettings(
        project_root=tmp_path,
        ppt_maker_root=PPT_MAKER_ROOT,
        gorden_root=GORDEN_ROOT,
        max_upload_bytes=8,
    )
    app = create_app(settings)
    return TestClient(app)


@pytest.fixture()
def sample_output(tmp_path: Path) -> dict[str, Path]:
    task_dir = tmp_path / "work" / "ppt-maker" / "20260603-211700_abcd"
    task_dir.mkdir(parents=True)
    pptx = task_dir / "output.pptx"
    pptx.write_bytes(b"pptx-bytes")
    preview = task_dir / "machine_extracted.json"
    preview.write_text(
        json.dumps(
            {
                "schema": "ppt-maker-machine-extracted/v1",
                "slide_count": 2,
                "slides": [
                    {"slide_number": 1, "title": "封面", "bullets": ["主题"]},
                    {"slide_number": 2, "title": "目录", "bullets": ["一", "二"]},
                ],
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )
    return {"task_dir": task_dir, "pptx": pptx, "preview": preview}
