from __future__ import annotations

import json
import re
import shutil
import subprocess
import tempfile
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path, PurePosixPath
from urllib.parse import unquote, urlsplit
from uuid import uuid4

from fastapi import HTTPException, UploadFile


SAFE_BASENAME = re.compile(r"[^A-Za-z0-9._-]+")
VISUAL_PREVIEW_DIR = "visual_preview"
VISUAL_PREVIEW_MAX_BYTES = 10 * 1024 * 1024
VISUAL_PREVIEW_TIMEOUT_SECONDS = 30.0
VISUAL_PREVIEW_WRAPPER_VERSION = "2026-06-18.1"


class VisualResourceParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.resources: list[tuple[str, str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr_map = {name.lower(): value for name, value in attrs if value}
        tag_name = tag.lower()
        if tag_name in {"img", "embed"} and attr_map.get("src"):
            self.resources.append((tag_name, "src", attr_map["src"] or ""))
        if tag_name == "object" and attr_map.get("data"):
            self.resources.append((tag_name, "data", attr_map["data"] or ""))


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


def visual_preview_index_is_current(index_path: Path) -> bool:
    try:
        html = index_path.read_text(encoding="utf-8", errors="ignore")
    except OSError:
        return False
    return 'name="ppt-maker-visual-preview-wrapper"' in html and f'content="{VISUAL_PREVIEW_WRAPPER_VERSION}"' in html


def is_external_or_inline_resource(src: str) -> bool:
    parsed = urlsplit(src.strip())
    if parsed.scheme in {"http", "https", "data", "blob", "about", "mailto"}:
        return True
    return src.strip().startswith("#")


def referenced_visual_resources(html_path: Path) -> list[str]:
    parser = VisualResourceParser()
    parser.feed(html_path.read_text(encoding="utf-8", errors="ignore"))
    return [resource for _tag, _attr, resource in parser.resources]


def referenced_visual_resource_refs(html_path: Path) -> list[tuple[str, str, str]]:
    parser = VisualResourceParser()
    parser.feed(html_path.read_text(encoding="utf-8", errors="ignore"))
    return parser.resources


def rewrite_preview_resource_reference(html: str, *, attr: str, old: str, new: str) -> str:
    html = html.replace(f'{attr}="{old}"', f'{attr}="{new}"')
    html = html.replace(f"{attr}='{old}'", f"{attr}='{new}'")
    return html


def convert_pdf_image_resources(preview_dir: Path) -> bool:
    preview_html = preview_dir / "Preview.html"
    if not preview_html.exists() or not preview_html.is_file():
        return False

    html = preview_html.read_text(encoding="utf-8", errors="ignore")
    changed = False
    preview_root = preview_dir.resolve()
    for tag, attr, resource in referenced_visual_resource_refs(preview_html):
        if tag != "img" or attr != "src":
            continue
        if is_external_or_inline_resource(resource):
            continue
        resource_path = unquote(urlsplit(resource).path)
        if not resource_path or resource_path.startswith("/") or Path(resource_path).suffix.lower() != ".pdf":
            continue
        source = (preview_root / resource_path).resolve()
        try:
            source.relative_to(preview_root)
        except ValueError:
            return False
        if not source.exists() or not source.is_file():
            return False
        target = source.with_suffix(".png")
        try:
            subprocess.run(
                ["sips", "-s", "format", "png", str(source), "--out", str(target)],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=VISUAL_PREVIEW_TIMEOUT_SECONDS,
            )
        except (OSError, subprocess.SubprocessError):
            return False
        new_resource = str(PurePosixPath(resource).with_suffix(".png"))
        html = rewrite_preview_resource_reference(html, attr=attr, old=resource, new=new_resource)
        changed = True

    if changed:
        preview_html.write_text(html, encoding="utf-8")
    return True


def visual_preview_health_issues(preview_dir: Path) -> list[str]:
    preview_html = preview_dir / "Preview.html"
    if not preview_html.exists() or not preview_html.is_file():
        return ["missing_preview_html"]
    if directory_size(preview_dir) > VISUAL_PREVIEW_MAX_BYTES:
        return ["preview_too_large"]
    if not has_visual_content(preview_html):
        return ["empty_preview_html"]

    issues: list[str] = []
    preview_root = preview_dir.resolve()
    for resource in referenced_visual_resources(preview_html):
        if not resource.strip() or is_external_or_inline_resource(resource):
            continue
        resource_path = unquote(urlsplit(resource).path)
        if not resource_path or resource_path.startswith("/"):
            issues.append(f"missing_preview_resource:{resource}")
            continue
        candidate = (preview_root / resource_path).resolve()
        try:
            candidate.relative_to(preview_root)
        except ValueError:
            issues.append(f"invalid_preview_resource:{resource}")
            continue
        if not candidate.exists() or not candidate.is_file():
            issues.append(f"missing_preview_resource:{resource}")
        if candidate.suffix.lower() == ".pdf":
            issues.append(f"browser_unrenderable_preview_resource:{resource}")
    return issues


def visual_preview_is_healthy(preview_dir: Path) -> bool:
    return not visual_preview_health_issues(preview_dir)


def ensure_visual_preview_index(preview_dir: Path) -> None:
    index_path = preview_dir / "index.html"
    if visual_preview_index_is_current(index_path):
        return
    convert_pdf_image_resources(preview_dir)
    if not visual_preview_is_healthy(preview_dir):
        return
    write_visual_preview_index(preview_dir)


def write_visual_preview_index(preview_dir: Path) -> None:
    (preview_dir / "index.html").write_text(
        """<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="ppt-maker-visual-preview-wrapper" content="__VISUAL_PREVIEW_WRAPPER_VERSION__">
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
      padding: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      background: #f4f6f8;
    }
    .preview-frame {
      display: block;
      flex: 0 0 auto;
      width: 960px;
      height: 540px;
      max-width: none;
      max-height: none;
      border: 0;
      background: white;
      transform-origin: center center;
      box-shadow: 0 0 0 1px rgba(15, 23, 42, 0.08);
    }
    .preview-controls {
      position: fixed;
      left: 50%;
      bottom: 14px;
      transform: translateX(-50%);
      display: inline-flex;
      align-items: center;
      gap: 10px;
      padding: 8px 10px;
      border: 1px solid rgba(148, 163, 184, 0.5);
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.92);
      color: #334155;
      font: 13px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      box-shadow: 0 10px 24px rgba(15, 23, 42, 0.12);
    }
    .preview-controls button {
      border: 1px solid rgba(148, 163, 184, 0.6);
      border-radius: 6px;
      background: #ffffff;
      color: #0f172a;
      padding: 5px 9px;
      font: inherit;
      cursor: pointer;
    }
    .preview-controls button:disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }
  </style>
</head>
<body>
  <main class="preview-stage" aria-label="QuickLook PPT preview">
    <iframe class="preview-frame" title="QuickLook PPT preview" src="./Preview.html"></iframe>
  </main>
  <nav class="preview-controls" aria-label="PPT 预览翻页">
    <button type="button" data-ql-prev>上一页</button>
    <span data-ql-page-status>1 / 1</span>
    <button type="button" data-ql-next>下一页</button>
  </nav>
  <script>
    const LENGTH_PROPS = [
      'top', 'left', 'right', 'bottom', 'width', 'height',
      'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
      'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
      'font-size', 'line-height'
    ];
    const lengthDeclarationPattern = new RegExp(`(^|[;\\\\s])(${LENGTH_PROPS.join('|')}):\\\\s*(-?\\\\d+(?:\\\\.\\\\d+)?)(?=;|$)`, 'gi');
    let currentSlideIndex = 0;

    function addPxToUnitlessLengths(styleText) {
      return String(styleText || '').replace(lengthDeclarationPattern, (_match, prefix, property, value) => `${prefix}${property}: ${value}px`);
    }

    function normalizeQuickLookUnits(doc) {
      doc.querySelectorAll('style').forEach((styleNode) => {
        styleNode.textContent = addPxToUnitlessLengths(styleNode.textContent);
      });
      doc.querySelectorAll('[style]').forEach((node) => {
        node.setAttribute('style', addPxToUnitlessLengths(node.getAttribute('style')));
      });
      const body = doc.body;
      const root = doc.documentElement;
      if (body) {
        body.style.margin = '0';
        body.style.overflow = 'hidden';
        body.style.background = '#ffffff';
      }
      if (root) {
        root.style.overflow = 'hidden';
      }
    }

    function slidesFor(doc) {
      return Array.from(doc.querySelectorAll('.slide'));
    }

    function showSlide(index) {
      const frame = document.querySelector('.preview-frame');
      const doc = frame && frame.contentDocument;
      if (!doc) return;
      const slides = slidesFor(doc);
      if (!slides.length) return;
      currentSlideIndex = Math.max(0, Math.min(index, slides.length - 1));
      slides.forEach((slide, slideIndex) => {
        slide.dataset.qlSlideIndex = String(slideIndex);
        slide.setAttribute('data-ql-slide-index', String(slideIndex));
        slide.setAttribute('aria-hidden', slideIndex === currentSlideIndex ? 'false' : 'true');
        slide.hidden = slideIndex !== currentSlideIndex;
        slide.style.display = slideIndex === currentSlideIndex ? 'block' : 'none';
        slide.style.margin = '0';
      });
      const status = document.querySelector('[data-ql-page-status]');
      const prev = document.querySelector('[data-ql-prev]');
      const next = document.querySelector('[data-ql-next]');
      if (status) status.textContent = `${currentSlideIndex + 1} / ${slides.length}`;
      if (prev) prev.disabled = currentSlideIndex === 0;
      if (next) next.disabled = currentSlideIndex === slides.length - 1;
      fitQuickLookPreview();
    }

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
          const slides = slidesFor(doc);
          const activeSlide = slides[currentSlideIndex] || slides[0];
          if (activeSlide) {
            const slideRect = activeSlide.getBoundingClientRect();
            sourceWidth = Math.max(activeSlide.scrollWidth, activeSlide.offsetWidth, slideRect.width, sourceWidth);
            sourceHeight = Math.max(activeSlide.scrollHeight, activeSlide.offsetHeight, slideRect.height, sourceHeight);
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
    frame && frame.addEventListener('load', () => {
      try {
        const doc = frame.contentDocument;
        if (doc) normalizeQuickLookUnits(doc);
      } catch {}
      showSlide(0);
    });
    document.querySelector('[data-ql-prev]')?.addEventListener('click', () => showSlide(currentSlideIndex - 1));
    document.querySelector('[data-ql-next]')?.addEventListener('click', () => showSlide(currentSlideIndex + 1));
    window.addEventListener('resize', fitQuickLookPreview);
  </script>
</body>
</html>
""".replace("__VISUAL_PREVIEW_WRAPPER_VERSION__", VISUAL_PREVIEW_WRAPPER_VERSION),
        encoding="utf-8",
    )


def generate_visual_preview_for_pptx(work_root: Path, file_id: str) -> dict[str, object]:
    pptx = resolve_work_file(work_root, file_id)
    preview_dir = pptx.with_name(VISUAL_PREVIEW_DIR)
    if preview_dir.exists():
        convert_pdf_image_resources(preview_dir)
    if preview_dir.exists() and visual_preview_is_healthy(preview_dir):
        ensure_visual_preview_index(preview_dir)
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
            convert_pdf_image_resources(preview_dir)
    except (OSError, subprocess.SubprocessError, shutil.Error):
        if preview_dir.exists():
            shutil.rmtree(preview_dir)
        return visual_preview_failure(file_id)

    if not visual_preview_is_healthy(preview_dir):
        shutil.rmtree(preview_dir)
        return visual_preview_failure(file_id)

    ensure_visual_preview_index(preview_dir)
    return visual_preview_success(file_id)


def resolve_visual_preview_asset(work_root: Path, file_id: str, asset_path: str) -> Path:
    pptx = resolve_work_file(work_root, file_id)
    parts = PurePosixPath(asset_path).parts
    if not asset_path or asset_path.startswith("/") or ".." in parts:
        raise HTTPException(status_code=400, detail="invalid_preview_asset")
    preview_root = pptx.with_name(VISUAL_PREVIEW_DIR).resolve()
    if PurePosixPath(asset_path).as_posix() == "index.html":
        if preview_root.exists() and not visual_preview_is_healthy(preview_root):
            raise HTTPException(status_code=404, detail="visual_preview_unhealthy")
        ensure_visual_preview_index(preview_root)
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
