from __future__ import annotations

import os
from pathlib import Path

from backend.tests.conftest import GORDEN_ROOT, PPT_MAKER_ROOT


def test_health_returns_environment_contract(client):
    response = client.get("/api/health")

    assert response.status_code == 200
    payload = response.json()
    assert payload["schema"] == "ppt-maker-web-health/v1"
    assert payload["validation"]["schema"] == "ppt-maker-validation/v1"
    assert payload["python_pptx_available"] is True
    assert isinstance(payload["render_dependencies_available"], bool)
    assert payload["qa_mode"] in {"rendered_visual", "structural_only"}


def test_templates_returns_gorden_index(client):
    response = client.get("/api/templates")

    assert response.status_code == 200
    payload = response.json()
    assert payload["schema"] == "ppt-maker-templates/v1"
    assert len(payload["templates"]) == 19
    first = payload["templates"][0]
    assert {"slug", "name", "page_count", "primary_color", "description", "preview_url"} <= set(first)
    assert any(item["slug"] == "minimal-business-summary" for item in payload["templates"])


def test_upload_accepts_pptx_inside_work_root(client):
    response = client.post(
        "/api/templates/upload",
        files={"file": ("custom-template.pptx", b"pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["schema"] == "ppt-maker-template-upload/v1"
    assert payload["file_name"] == "custom-template.pptx"
    assert payload["relative_path"].startswith("uploads/")
    assert payload["relative_path"].endswith("/custom-template.pptx")


def test_upload_rejects_non_pptx(client):
    response = client.post(
        "/api/templates/upload",
        files={"file": ("notes.txt", b"text", "text/plain")},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "only_pptx_uploads_allowed"


def test_upload_rejects_oversized_file(small_upload_client):
    response = small_upload_client.post(
        "/api/templates/upload",
        files={"file": ("custom-template.pptx", b"012345678", "application/vnd.openxmlformats-officedocument.presentationml.presentation")},
    )

    assert response.status_code == 413
    assert response.json()["detail"] == "upload_exceeds_8_bytes"


def test_files_list_preview_and_download(client, sample_output):
    files_response = client.get("/api/files")

    assert files_response.status_code == 200
    payload = files_response.json()
    assert payload["schema"] == "ppt-maker-files/v1"
    assert payload["files"][0]["file_id"] == "20260603-211700_abcd/output.pptx"
    assert payload["files"][0]["page_count"] == 2
    assert payload["files"][0]["has_preview"] is True

    preview_response = client.get("/api/files/20260603-211700_abcd/output.pptx/preview")
    assert preview_response.status_code == 200
    assert preview_response.json()["slide_count"] == 2

    download_response = client.get("/api/files/20260603-211700_abcd/output.pptx/download")
    assert download_response.status_code == 200
    assert download_response.content == b"pptx-bytes"


def write_fake_qlmanage(bin_dir: Path, preview_html: str) -> None:
    script = bin_dir / "qlmanage"
    script.write_text(
        "\n".join(
            [
                "#!/usr/bin/env python3",
                "import pathlib, sys",
                "out_dir = pathlib.Path(sys.argv[sys.argv.index('-o') + 1])",
                "pptx = pathlib.Path(sys.argv[-1])",
                "preview_dir = out_dir / f'{pptx.name}.qlpreview'",
                "preview_dir.mkdir(parents=True)",
                f"(preview_dir / 'Preview.html').write_text({preview_html!r}, encoding='utf-8')",
                "(preview_dir / 'Attachment1.pdf').write_bytes(b'%PDF-1.3')",
            ]
        ),
        encoding="utf-8",
    )
    script.chmod(0o755)


def test_visual_preview_generates_quicklook_preview_url(client, sample_output, tmp_path, monkeypatch):
    write_fake_qlmanage(tmp_path, '<html><body><img src="Attachment1.pdf"></body></html>')
    monkeypatch.setenv("PATH", f"{tmp_path}{os.pathsep}{os.environ.get('PATH', '')}")

    response = client.get("/api/files/20260603-211700_abcd/output.pptx/visual-preview")

    assert response.status_code == 200
    payload = response.json()
    assert payload == {
        "schema": "ppt-maker-visual-preview/v1",
        "file_id": "20260603-211700_abcd/output.pptx",
        "preview_url": "/api/files/20260603-211700_abcd/output.pptx/visual-preview/index.html",
        "mode": "quicklook_html",
    }
    assert (sample_output["task_dir"] / "visual_preview" / "index.html").exists()
    asset_response = client.get("/api/files/20260603-211700_abcd/output.pptx/visual-preview/index.html")
    assert asset_response.status_code == 200
    assert "Preview.html" in asset_response.text
    assert "fitQuickLookPreview" in asset_response.text
    assert "querySelector('.slide')" in asset_response.text
    assert "overflow: hidden" in asset_response.text
    assert "height: 100vh" not in asset_response.text


def test_visual_preview_accepts_quicklook_slide_html_without_img(client, sample_output, tmp_path, monkeypatch):
    write_fake_qlmanage(tmp_path, '<html><body><div class="slide">Rendered slide</div></body></html>')
    monkeypatch.setenv("PATH", f"{tmp_path}{os.pathsep}{os.environ.get('PATH', '')}")

    response = client.get("/api/files/20260603-211700_abcd/output.pptx/visual-preview")

    assert response.status_code == 200
    payload = response.json()
    assert payload["schema"] == "ppt-maker-visual-preview/v1"
    assert payload["preview_url"] == "/api/files/20260603-211700_abcd/output.pptx/visual-preview/index.html"
    assert payload["mode"] == "quicklook_html"


def test_visual_preview_rejects_empty_quicklook_html(client, sample_output, tmp_path, monkeypatch):
    write_fake_qlmanage(tmp_path, "<html><body>empty preview</body></html>")
    monkeypatch.setenv("PATH", f"{tmp_path}{os.pathsep}{os.environ.get('PATH', '')}")

    response = client.get("/api/files/20260603-211700_abcd/output.pptx/visual-preview")

    assert response.status_code == 200
    payload = response.json()
    assert payload["schema"] == "ppt-maker-visual-preview/v1"
    assert payload["file_id"] == "20260603-211700_abcd/output.pptx"
    assert payload["error"] == "visual_preview_failed"
    assert payload["message"] == "预览生成失败，但 PPTX 可下载"
    assert not (sample_output["task_dir"] / "visual_preview").exists()


def test_delete_file_removes_pptx_and_preview(client, sample_output):
    visual_preview = sample_output["task_dir"] / "visual_preview"
    visual_preview.mkdir()
    (visual_preview / "index.html").write_text("<html></html>", encoding="utf-8")

    response = client.delete("/api/files/20260603-211700_abcd/output.pptx")

    assert response.status_code == 200
    assert response.json() == {
        "schema": "ppt-maker-file-delete/v1",
        "deleted": True,
        "file_id": "20260603-211700_abcd/output.pptx",
    }
    assert not sample_output["pptx"].exists()
    assert not sample_output["preview"].exists()
    assert not visual_preview.exists()


def test_file_routes_reject_path_traversal(client):
    preview_response = client.get("/api/files/%2E%2E/secret.pptx/preview")
    download_response = client.get("/api/files/%2E%2E/secret.pptx/download")
    delete_response = client.delete("/api/files/%2E%2E/secret.pptx")

    assert preview_response.status_code == 400
    assert preview_response.json()["detail"] == "invalid_file_id"
    assert download_response.status_code == 400
    assert download_response.json()["detail"] == "invalid_file_id"
    assert delete_response.status_code == 400
    assert delete_response.json()["detail"] == "invalid_file_id"


def test_generation_status_and_cancel_without_task(client):
    status_response = client.get("/api/generate/status")
    cancel_response = client.post("/api/generate/cancel")

    assert status_response.status_code == 200
    assert status_response.json() == {"schema": "ppt-maker-generation-status/v1", "in_progress": False}
    assert cancel_response.status_code == 200
    assert cancel_response.json() == {
        "schema": "ppt-maker-generation-cancel/v1",
        "cancelled": False,
        "message": "no_task_in_progress",
    }


def test_agent05_prefixed_api_routes_work(client):
    status_response = client.get("/agent05/api/generate/status")
    files_response = client.get("/agent05/api/files")

    assert status_response.status_code == 200
    assert status_response.json()["schema"] == "ppt-maker-generation-status/v1"
    assert files_response.status_code == 200
    assert files_response.json()["schema"] == "ppt-maker-files/v1"


def test_agent05_static_mount_serves_frontend(tmp_path):
    from backend.app.config import AppSettings
    from backend.app.main import create_app
    from fastapi.testclient import TestClient

    dist = tmp_path / "frontend" / "dist"
    dist.mkdir(parents=True)
    (dist / "index.html").write_text("<html><body>agent05 app</body></html>", encoding="utf-8")

    app = create_app(AppSettings(project_root=tmp_path, ppt_maker_root=PPT_MAKER_ROOT, gorden_root=GORDEN_ROOT))
    response = TestClient(app).get("/agent05/")

    assert response.status_code == 200
    assert "agent05 app" in response.text


def test_websocket_unknown_event_protocol_skeleton(client):
    with client.websocket_connect("/ws/generate") as websocket:
        websocket.send_json({"type": "unexpected"})
        payload = websocket.receive_json()

    assert payload == {"type": "error", "message": "unknown_event_type"}


def test_websocket_cancel_protocol_skeleton(client):
    with client.websocket_connect("/ws/generate") as websocket:
        websocket.send_json({"type": "cancel"})
        payload = websocket.receive_json()

    assert payload == {"type": "cancelled", "message": "任务已终止"}
