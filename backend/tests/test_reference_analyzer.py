from __future__ import annotations

import re
from pathlib import Path

from PIL import Image


def write_minimal_pdf(path: Path, text: str = "Quarterly Report 2026") -> None:
    stream = f"BT /F1 24 Tf 72 720 Td ({text}) Tj ET".encode("ascii")
    objects = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
        b"<< /Length " + str(len(stream)).encode("ascii") + b" >>\nstream\n" + stream + b"\nendstream",
    ]
    chunks = [b"%PDF-1.4\n"]
    offsets = [0]
    for index, obj in enumerate(objects, start=1):
        offsets.append(sum(len(chunk) for chunk in chunks))
        chunks.append(f"{index} 0 obj\n".encode("ascii") + obj + b"\nendobj\n")
    xref_offset = sum(len(chunk) for chunk in chunks)
    chunks.append(f"xref\n0 {len(objects) + 1}\n".encode("ascii"))
    chunks.append(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        chunks.append(f"{offset:010d} 00000 n \n".encode("ascii"))
    chunks.append(
        f"trailer << /Size {len(objects) + 1} /Root 1 0 R >>\nstartxref\n{xref_offset}\n%%EOF\n".encode("ascii")
    )
    path.write_bytes(b"".join(chunks))


def write_palette_image(path: Path) -> None:
    image = Image.new("RGB", (90, 30), "#1F3A93")
    for x in range(30, 60):
        for y in range(30):
            image.putpixel((x, y), (255, 255, 255))
    for x in range(60, 90):
        for y in range(30):
            image.putpixel((x, y), (231, 76, 60))
    image.save(path)


def test_detect_pptx(tmp_path: Path):
    from backend.app.services.reference_analyzer import detect_file_type

    path = tmp_path / "source.pptx"
    path.write_bytes(b"PK\x03\x04pptx")

    assert detect_file_type(path) == "pptx"


def test_detect_pdf(tmp_path: Path):
    from backend.app.services.reference_analyzer import detect_file_type

    path = tmp_path / "report.pdf"
    path.write_bytes(b"%PDF-1.4\n")

    assert detect_file_type(path) == "pdf"


def test_detect_png(tmp_path: Path):
    from backend.app.services.reference_analyzer import detect_file_type

    path = tmp_path / "palette.png"
    write_palette_image(path)

    assert detect_file_type(path) == "image"


def test_detect_txt_unknown(tmp_path: Path):
    from backend.app.services.reference_analyzer import detect_file_type

    path = tmp_path / "notes.txt"
    path.write_text("not supported", encoding="utf-8")

    assert detect_file_type(path) == "unknown"


def test_extract_colors_from_image_with_known_palette(tmp_path: Path):
    from backend.app.services.reference_analyzer import extract_colors_from_image

    path = tmp_path / "palette.png"
    write_palette_image(path)

    colors = extract_colors_from_image(path, top_n=5)

    assert 3 <= len(colors) <= 5
    assert all(re.fullmatch(r"#[0-9A-F]{6}", color) for color in colors)


def test_recommend_templates_by_extracted_colors_returns_at_most_three_slugs():
    from backend.app.services.reference_analyzer import recommend_templates_by_colors

    templates = [
        {"slug": "blue", "primary_color": "深蓝 #1F3A93"},
        {"slug": "red", "primary_color": "党政红 #A91F1F"},
        {"slug": "green", "primary_color": "墨绿 #4F6E4F"},
        {"slug": "plain", "primary_color": ""},
    ]

    recommendations = recommend_templates_by_colors(["#1F3A90"], templates)

    assert recommendations[0] == "blue"
    assert len(recommendations) <= 3


def test_analyze_pdf_returns_text_colors_and_page_count(tmp_path: Path):
    from backend.app.services.reference_analyzer import analyze_reference

    path = tmp_path / "report.pdf"
    write_minimal_pdf(path)

    analysis = analyze_reference(path)

    assert analysis.file_type == "pdf"
    assert "Quarterly Report 2026" in analysis.extracted_text
    assert analysis.page_count == 1
    assert isinstance(analysis.dominant_colors, list)


def test_analyze_corrupted_pdf_returns_extraction_errors(tmp_path: Path):
    from backend.app.services.reference_analyzer import analyze_reference

    path = tmp_path / "broken.pdf"
    path.write_bytes(b"%PDF-1.4\nbroken")

    analysis = analyze_reference(path)

    assert analysis.file_type == "pdf"
    assert analysis.extraction_errors


def test_reference_analysis_for_pptx_is_empty(tmp_path: Path):
    from backend.app.services.reference_analyzer import analyze_reference

    path = tmp_path / "source.pptx"
    path.write_bytes(b"PK\x03\x04pptx")

    analysis = analyze_reference(path)

    assert analysis.file_type == "pptx"
    assert analysis.extracted_text == ""
    assert analysis.dominant_colors == []
    assert analysis.page_count is None
    assert analysis.preview_screenshot is None


def test_reference_analyze_api_accepts_pdf(client, tmp_path: Path):
    path = tmp_path / "report.pdf"
    write_minimal_pdf(path, text="Reference Report 2026")

    with path.open("rb") as file:
        response = client.post("/api/reference/analyze", files={"file": ("report.pdf", file, "application/pdf")})

    assert response.status_code == 200
    payload = response.json()
    assert payload["schema"] == "ppt-maker-reference-analysis/v1"
    assert payload["ref_id"].startswith("ref_")
    assert payload["file_type"] == "pdf"
    assert payload["page_count"] == 1
    assert payload["text_chars"] > 0
    assert "Reference Report 2026" in payload["extracted_text"]
    assert isinstance(payload["dominant_colors"], list)
