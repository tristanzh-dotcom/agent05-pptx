from __future__ import annotations

import json
import re
import shutil
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path, PurePosixPath
from uuid import uuid4

from fastapi import HTTPException, UploadFile


SAFE_BASENAME = re.compile(r"[^A-Za-z0-9._-]+")
VISUAL_PREVIEW_DIR = "visual_preview"
VISUAL_PREVIEW_MAX_BYTES = 10 * 1024 * 1024
VISUAL_PREVIEW_TIMEOUT_SECONDS = 30.0


def ensure_work_root(work_root: Path) -> Path:
    work_root.mkdir(parents=True, exist_ok=True)
    return work_root.resolve()


def sanitize_upload_name(filename: str) -> str:
    name = Path(filename).name.strip()
    name = SAFE_BASENAME.sub("_", name)
    if not name or name in {".", ".."}:
        raise HTTPException(status_code=400, detail="invalid_upload_filename")
    if Path(name).suffix.lower() != ".pptx":
        raise HTTPException(status_code=400, detail="only_pptx_uploads_allowed")
    return name


def relative_posix(path: Path, root: Path) -> str:
    return path.resolve().relative_to(root.resolve()).as_posix()


def resolve_work_file(work_root: Path, file_id: str, *, require_pptx: bool = True) -> Path:
    parts = PurePosixPath(file_id).parts
    if not file_id or file_id.startswith("/") or ".." in parts:
        raise HTTPException(status_code=400, detail="invalid_file_id")

    root = ensure_work_root(work_root)
    candidate = (root / Path(*parts)).resolve()
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="invalid_file_id") from exc

    if require_pptx and candidate.suffix.lower() != ".pptx":
        raise HTTPException(status_code=400, detail="invalid_file_id")
    if not candidate.exists() or not candidate.is_file():
        raise HTTPException(status_code=404, detail="file_not_found")
    return candidate


def read_preview_for_pptx(work_root: Path, file_id: str) -> dict[str, object]:
    pptx = resolve_work_file(work_root, file_id)
    preview = pptx.with_name("machine_extracted.json")
    if not preview.exists() or not preview.is_file():
        raise HTTPException(status_code=404, detail="preview_not_found")
    return json.loads(preview.read_text(encoding="utf-8"))


def visual_preview_url(file_id: str) -> str:
    return f"/api/files/{file_id}/visual-preview/index.html"


def visual_preview_failure(file_id: str) -> dict[str, object]:
    return {
        "schema": "ppt-maker-visual-preview/v1",
        "file_id": file_id,
        "error": "visual_preview_failed",
        "message": "预览生成失败，但 PPTX 可下载",
    }


def visual_preview_success(file_id: str) -> dict[str, object]:
    return {
        "schema": "ppt-maker-visual-preview/v1",
        "file_id": file_id,
        "preview_url": visual_preview_url(file_id),
        "mode": "quicklook_html",
    }


def directory_size(path: Path) -> int:
    return sum(item.stat().st_size for item in path.rglob("*") if item.is_file())


def has_visual_content(html_path: Path) -> bool:
    try:
        html = html_path.read_text(encoding="utf-8", errors="ignore").lower()
        return "<img" in html or 'class="slide"' in html or "class='slide'" in html
    except OSError:
        return False


def write_visual_preview_index(preview_dir: Path) -> None:
    (preview_dir / "index.html").write_text(
        """<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    html, body {
      margin: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #f4f6f8;
    }
    .preview-stage {
      position: fixed;
      inset: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: #f4f6f8;
    }
    .preview-frame {
      display: block;
      width: 960px;
      height: 540px;
      border: 0;
      background: white;
      transform-origin: center center;
      box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.08);
    }
  </style>
</head>
<body>
  <main class="preview-stage" aria-label="QuickLook PPT preview">
    <iframe class="preview-frame" title="QuickLook PPT preview" src="./Preview.html"></iframe>
  </main>
  <script>
    function fitQuickLookPreview() {
      const stage = document.querySelector('.preview-stage');
      const frame = document.querySelector('.preview-frame');
      if (!stage || !frame) return;

      let sourceWidth = 960;
      let sourceHeight = 540;
      try {
        const doc = frame.contentDocument;
        const body = doc && doc.body;
        const root = doc && doc.documentElement;
        if (body && root) {
          body.style.margin = body.style.margin || '0';
          body.style.overflow = 'hidden';
          root.style.overflow = 'hidden';
          const firstSlide = doc.querySelector('.slide');
          if (firstSlide) {
            const slideRect = firstSlide.getBoundingClientRect();
            sourceWidth = Math.max(firstSlide.scrollWidth, firstSlide.offsetWidth, slideRect.width, sourceWidth);
            sourceHeight = Math.max(firstSlide.scrollHeight, firstSlide.offsetHeight, slideRect.height, sourceHeight);
          } else {
            sourceWidth = Math.max(body.scrollWidth, root.scrollWidth, body.offsetWidth, root.offsetWidth, sourceWidth);
            sourceHeight = Math.max(body.scrollHeight, root.scrollHeight, body.offsetHeight, root.offsetHeight, sourceHeight);
          }
        }
      } catch {
        sourceWidth = 960;
        sourceHeight = 540;
      }

      const availableWidth = Math.max(1, stage.clientWidth);
      const availableHeight = Math.max(1, stage.clientHeight);
      const scale = Math.min(availableWidth / sourceWidth, availableHeight / sourceHeight, 1);
      frame.style.width = `${sourceWidth}px`;
      frame.style.height = `${sourceHeight}px`;
      frame.style.transform = `scale(${scale})`;
    }

    const frame = document.querySelector('.preview-frame');
    frame && frame.addEventListener('load', fitQuickLookPreview);
    window.addEventListener('resize', fitQuickLookPreview);
  </script>
</body>
</html>
""",
        encoding="utf-8",
    )


def generate_visual_preview_for_pptx(work_root: Path, file_id: str) -> dict[str, object]:
    pptx = resolve_work_file(work_root, file_id)
    preview_dir = pptx.with_name(VISUAL_PREVIEW_DIR)
    preview_html = preview_dir / "Preview.html"
    if preview_html.exists() and has_visual_content(preview_html) and directory_size(preview_dir) <= VISUAL_PREVIEW_MAX_BYTES:
        write_visual_preview_index(preview_dir)
        return visual_preview_success(file_id)

    if preview_dir.exists():
        shutil.rmtree(preview_dir)

    try:
        with tempfile.TemporaryDirectory(prefix="ppt-maker-qlpreview-") as tmp:
            tmp_path = Path(tmp)
            subprocess.run(
                ["qlmanage", "-p", "-o", str(tmp_path), str(pptx)],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=VISUAL_PREVIEW_TIMEOUT_SECONDS,
            )
            generated = next(tmp_path.glob("*.qlpreview"), None)
            if generated is None:
                return visual_preview_failure(file_id)
            shutil.copytree(generated, preview_dir)
    except (OSError, subprocess.SubprocessError, shutil.Error):
        if preview_dir.exists():
            shutil.rmtree(preview_dir)
        return visual_preview_failure(file_id)

    if directory_size(preview_dir) > VISUAL_PREVIEW_MAX_BYTES or not has_visual_content(preview_html):
        shutil.rmtree(preview_dir)
        return visual_preview_failure(file_id)

    write_visual_preview_index(preview_dir)
    return visual_preview_success(file_id)


def resolve_visual_preview_asset(work_root: Path, file_id: str, asset_path: str) -> Path:
    pptx = resolve_work_file(work_root, file_id)
    parts = PurePosixPath(asset_path).parts
    if not asset_path or asset_path.startswith("/") or ".." in parts:
        raise HTTPException(status_code=400, detail="invalid_preview_asset")
    preview_root = pptx.with_name(VISUAL_PREVIEW_DIR).resolve()
    candidate = (preview_root / Path(*parts)).resolve()
    try:
        candidate.relative_to(preview_root)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail="invalid_preview_asset") from exc
    if not candidate.exists() or not candidate.is_file():
        raise HTTPException(status_code=404, detail="preview_asset_not_found")
    return candidate


def delete_generated_file(work_root: Path, file_id: str) -> dict[str, object]:
    pptx = resolve_work_file(work_root, file_id)
    preview = pptx.with_name("machine_extracted.json")
    visual_preview = pptx.with_name(VISUAL_PREVIEW_DIR)
    pptx.unlink()
    if preview.exists() and preview.is_file():
        preview.unlink()
    if visual_preview.exists() and visual_preview.is_dir():
        shutil.rmtree(visual_preview)
    return {
        "schema": "ppt-maker-file-delete/v1",
        "deleted": True,
        "file_id": file_id,
    }


def parse_generated_at(task_dir: str) -> str | None:
    try:
        return datetime.strptime(task_dir[:15], "%Y%m%d-%H%M%S").isoformat()
    except ValueError:
        return None


def preview_slide_count(pptx: Path) -> int | None:
    preview = pptx.with_name("machine_extracted.json")
    if not preview.exists():
        return None
    try:
        payload = json.loads(preview.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None
    value = payload.get("slide_count")
    return value if isinstance(value, int) else None


def list_generated_files(work_root: Path) -> list[dict[str, object]]:
    root = ensure_work_root(work_root)
    rows: list[dict[str, object]] = []
    for task_dir in root.iterdir():
        if not task_dir.is_dir() or task_dir.name == "uploads":
            continue
        for pptx in task_dir.glob("*.pptx"):
            rows.append(
                {
                    "file_id": relative_posix(pptx, root),
                    "file_name": pptx.name,
                    "generated_at": parse_generated_at(task_dir.name),
                    "page_count": preview_slide_count(pptx),
                    "task_dir": task_dir.name,
                    "has_preview": pptx.with_name("machine_extracted.json").exists(),
                }
            )
    return sorted(rows, key=lambda item: item["file_id"], reverse=True)


async def save_template_upload(work_root: Path, upload: UploadFile, max_upload_bytes: int) -> dict[str, object]:
    filename = sanitize_upload_name(upload.filename or "")
    content = await upload.read(max_upload_bytes + 1)
    if len(content) > max_upload_bytes:
        raise HTTPException(
            status_code=413,
            detail=f"upload_exceeds_{max_upload_bytes}_bytes",
        )

    root = ensure_work_root(work_root)
    upload_dir = root / "uploads" / f"session-{uuid4().hex[:12]}"
    upload_dir.mkdir(parents=True, exist_ok=False)
    target = upload_dir / filename
    target.write_bytes(content)
    return {
        "schema": "ppt-maker-template-upload/v1",
        "file_name": filename,
        "size": len(content),
        "relative_path": relative_posix(target, root),
    }
