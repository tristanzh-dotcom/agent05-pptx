from __future__ import annotations

import colorsys
import re
import shutil
import subprocess
import tempfile
from dataclasses import dataclass
from pathlib import Path

from PIL import Image


HEX_COLOR = re.compile(r"#[0-9A-Fa-f]{6}")
PDF_TEXT_PAGE_LIMIT = 10
PDF_PAGE_WARNING_LIMIT = 50


@dataclass
class ReferenceAnalysis:
    file_type: str
    extracted_text: str
    dominant_colors: list[str]
    color_style_hint: str
    page_count: int | None
    preview_screenshot: Path | None
    extraction_errors: list[str]


def detect_file_type(file_path: Path) -> str:
    suffix = file_path.suffix.lower()
    try:
        header = file_path.read_bytes()[:16]
    except OSError:
        return "unknown"

    if suffix == ".pptx" and header.startswith(b"PK\x03\x04"):
        return "pptx"
    if suffix == ".pdf" and header.startswith(b"%PDF"):
        return "pdf"
    if suffix == ".png" and header.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image"
    if suffix in {".jpg", ".jpeg"} and header.startswith(b"\xff\xd8\xff"):
        return "image"
    return "unknown"


def analyze_reference(file_path: Path) -> ReferenceAnalysis:
    file_type = detect_file_type(file_path)
    if file_type == "pptx":
        return ReferenceAnalysis(
            file_type="pptx",
            extracted_text="",
            dominant_colors=[],
            color_style_hint="",
            page_count=None,
            preview_screenshot=None,
            extraction_errors=[],
        )
    if file_type == "pdf":
        return _analyze_pdf(file_path)
    if file_type == "image":
        return _analyze_image(file_path)
    return ReferenceAnalysis(
        file_type="unknown",
        extracted_text="",
        dominant_colors=[],
        color_style_hint="",
        page_count=None,
        preview_screenshot=None,
        extraction_errors=["unsupported_reference_type"],
    )


def extract_colors_from_image(image_path: Path, top_n: int = 5) -> list[str]:
    colors: list[str] = []
    try:
        from colorthief import ColorThief

        palette = ColorThief(str(image_path)).get_palette(color_count=top_n)
        colors.extend(_rgb_to_hex(color) for color in palette)
    except ImportError:
        return []
    except Exception:
        colors = []

    if len(colors) < min(top_n, 3):
        colors.extend(_extract_colors_with_pillow(image_path, top_n))

    unique: list[str] = []
    for color in colors:
        if color not in unique:
            unique.append(color)
        if len(unique) >= top_n:
            break
    return unique


def recommend_templates_by_colors(colors: list[str], all_templates: list[dict]) -> list[str]:
    source_colors = [_parse_hex_color(color) for color in colors]
    source_colors = [color for color in source_colors if color is not None]
    if not source_colors:
        return []

    scored: list[tuple[float, int, str]] = []
    for index, template in enumerate(all_templates):
        slug = template.get("slug")
        if not isinstance(slug, str) or not slug:
            continue
        template_colors = [_parse_hex_color(match) for match in HEX_COLOR.findall(str(template.get("primary_color") or ""))]
        template_colors = [color for color in template_colors if color is not None]
        if not template_colors:
            scored.append((10_000.0, index, slug))
            continue
        score = min(_color_distance(source, target) for source in source_colors for target in template_colors)
        scored.append((score, index, slug))

    return [slug for _score, _index, slug in sorted(scored)[:3]]


def _analyze_pdf(file_path: Path) -> ReferenceAnalysis:
    errors: list[str] = []
    extracted_text = ""
    page_count: int | None = None

    try:
        import pdfplumber
    except ImportError:
        errors.append("pdfplumber_not_installed")
    else:
        try:
            with pdfplumber.open(file_path) as pdf:
                page_count = len(pdf.pages)
                if page_count > PDF_PAGE_WARNING_LIMIT:
                    errors.append("pdf_page_limit_exceeded")
                texts = []
                for page in pdf.pages[:PDF_TEXT_PAGE_LIMIT]:
                    text = page.extract_text() or ""
                    if text:
                        texts.append(text)
                extracted_text = "\n\n".join(texts)
        except Exception as exc:
            errors.append(f"pdf_extract_failed:{type(exc).__name__}")

    screenshot = _create_pdf_screenshot(file_path, errors)
    colors = extract_colors_from_image(screenshot) if screenshot else []
    if screenshot and not colors:
        errors.append("color_extraction_failed")
    return ReferenceAnalysis(
        file_type="pdf",
        extracted_text=extracted_text,
        dominant_colors=colors,
        color_style_hint=_color_style_hint(colors),
        page_count=page_count,
        preview_screenshot=screenshot,
        extraction_errors=errors,
    )


def _analyze_image(file_path: Path) -> ReferenceAnalysis:
    errors: list[str] = []
    screenshot = _create_image_thumbnail(file_path, errors)
    colors = extract_colors_from_image(file_path)
    if not colors:
        errors.append("color_extraction_failed")
    errors.append("ocr_unavailable")
    return ReferenceAnalysis(
        file_type="image",
        extracted_text="",
        dominant_colors=colors,
        color_style_hint=_color_style_hint(colors),
        page_count=None,
        preview_screenshot=screenshot,
        extraction_errors=errors,
    )


def _create_pdf_screenshot(file_path: Path, errors: list[str]) -> Path | None:
    if not shutil.which("qlmanage"):
        errors.append("screenshot_unavailable")
        return None
    try:
        with tempfile.TemporaryDirectory(prefix="ppt-maker-reference-thumb-") as tmp:
            tmp_path = Path(tmp)
            subprocess.run(
                ["qlmanage", "-t", "-s", "800", "-o", str(tmp_path), str(file_path)],
                check=True,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=20,
            )
            generated = sorted(tmp_path.glob("*.png"))
            if not generated:
                errors.append("screenshot_unavailable")
                return None
            target = file_path.with_suffix(".screenshot.png")
            shutil.copyfile(generated[0], target)
            return target
    except (OSError, subprocess.SubprocessError, shutil.Error):
        errors.append("screenshot_unavailable")
        return None


def _create_image_thumbnail(file_path: Path, errors: list[str]) -> Path | None:
    target = file_path.with_suffix(".screenshot.png")
    try:
        with Image.open(file_path) as image:
            image.thumbnail((800, 800))
            image.convert("RGB").save(target, format="PNG")
        return target
    except Exception:
        errors.append("screenshot_unavailable")
        return None


def _extract_colors_with_pillow(image_path: Path, top_n: int) -> list[str]:
    try:
        with Image.open(image_path) as image:
            rgb = image.convert("RGB")
            palette = rgb.quantize(colors=top_n, method=Image.Quantize.MEDIANCUT)
            rows = palette.getcolors(maxcolors=rgb.width * rgb.height)
            if not rows:
                return []
            raw_palette = palette.getpalette() or []
            colors = []
            for _count, index in sorted(rows, reverse=True):
                offset = index * 3
                colors.append(_rgb_to_hex(tuple(raw_palette[offset : offset + 3])))
            return colors
    except Exception:
        return []


def _color_style_hint(colors: list[str]) -> str:
    labels = [_color_label(color) for color in colors[:3]]
    labels = [label for label in labels if label]
    return "+".join(labels) + "主调" if labels else ""


def _color_label(color: str) -> str:
    parsed = _parse_hex_color(color)
    if parsed is None:
        return ""
    red, green, blue = parsed
    hue, lightness, _saturation = colorsys.rgb_to_hls(red / 255, green / 255, blue / 255)
    if lightness > 0.9:
        return "白色"
    if lightness < 0.15:
        return "黑色"
    degrees = hue * 360
    if degrees < 20 or degrees >= 340:
        return "红色"
    if degrees < 45:
        return "橙色"
    if degrees < 75:
        return "黄色"
    if degrees < 165:
        return "绿色"
    if degrees < 250:
        return "蓝色"
    if degrees < 290:
        return "紫色"
    return "红色"


def _color_distance(source: tuple[int, int, int], target: tuple[int, int, int]) -> float:
    source_hue, source_lightness, _source_saturation = colorsys.rgb_to_hls(
        source[0] / 255, source[1] / 255, source[2] / 255
    )
    target_hue, target_lightness, _target_saturation = colorsys.rgb_to_hls(
        target[0] / 255, target[1] / 255, target[2] / 255
    )
    hue_delta = abs(source_hue - target_hue)
    hue_delta = min(hue_delta, 1 - hue_delta)
    lightness_delta = abs(source_lightness - target_lightness)
    return hue_delta * 3 + lightness_delta


def _parse_hex_color(value: str) -> tuple[int, int, int] | None:
    match = HEX_COLOR.search(value)
    if not match:
        return None
    hex_value = match.group(0).lstrip("#")
    return tuple(int(hex_value[index : index + 2], 16) for index in (0, 2, 4))


def _rgb_to_hex(color: tuple[int, int, int] | list[int]) -> str:
    red, green, blue = color[:3]
    return f"#{int(red):02X}{int(green):02X}{int(blue):02X}"
