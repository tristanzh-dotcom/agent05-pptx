# PPT Maker Web Reference Analyzer SDD

## Goal

Add a Reference File Analyzer preprocessing layer for Mode A.

Users may upload a PDF or image as a reference. The app extracts text and colors from that file, displays a compact analysis card, and injects the analysis into the existing `prompt_to_ppt` pipeline to improve prompt quality and template/style selection.

This does not introduce a new generation mode.

## Non-Goals

- Do not change Mode B `template_preserving_edit` behavior for uploaded `.pptx` files.
- Do not modify `gorden-ppt-skill`.
- Do not modify `pptx_analyzer.py`.
- Do not require OCR to be available for generation to proceed.
- Do not block Mode A generation if reference extraction partially fails.
- Do not use PDF or image files as `source_pptx_path`.

## File-Type Routing

The upload panel accepts:

```text
.pptx,.pdf,.png,.jpg,.jpeg
```

Routing is determined by detected file type:

- `.pptx` → existing Mode B source PPTX flow.
- `.pdf` → Reference Analyzer flow, generation remains Mode A.
- `.png/.jpg/.jpeg` → Reference Analyzer flow, generation remains Mode A.
- unknown → reject as unsupported upload.

The frontend may use extension checks for immediate UI routing, but the backend is authoritative and uses suffix plus magic bytes.

## Backend Contract

### New Module

Create:

```text
backend/app/services/reference_analyzer.py
```

Public API:

```python
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
    """Return 'pptx' | 'pdf' | 'image' | 'unknown'."""


def analyze_reference(file_path: Path) -> ReferenceAnalysis:
    """Dispatch by detected type and return a best-effort analysis."""


def extract_colors_from_image(image_path: Path, top_n: int = 5) -> list[str]:
    """Return dominant colors as uppercase hex strings."""


def recommend_templates_by_colors(colors: list[str], all_templates: list[dict]) -> list[str]:
    """Return at most 3 template slugs matched by hue and lightness distance."""
```

### Type Detection

`detect_file_type()` uses both suffix and magic bytes.

Accepted signatures:

- pptx: suffix `.pptx` and ZIP magic `PK\x03\x04`.
- pdf: suffix `.pdf` and `%PDF` magic.
- png: suffix `.png` and PNG magic.
- jpeg: suffix `.jpg`/`.jpeg` and JPEG SOI magic.

Suffix or magic mismatch returns `unknown`.

### PDF Analysis

PDF analysis:

- Extract text with `pdfplumber` from at most the first 10 pages.
- Set `page_count` to the full PDF page count when available.
- If page count exceeds 50, keep `page_count` but only extract first 10 pages.
- Render a first-page preview screenshot with macOS `qlmanage -t -s 800` when available.
- Extract colors from that screenshot.
- If screenshot generation is unavailable, text extraction still proceeds and `dominant_colors` may be empty.

Dependency behavior:

- Missing `pdfplumber` adds `pdfplumber_not_installed` to `extraction_errors`.
- Encrypted or corrupted PDFs return `file_type="pdf"` with errors and no exception escaping the analyzer.

### Image Analysis

Image analysis:

- Extract dominant colors from the image.
- Create a thumbnail screenshot with Pillow `thumbnail()`.
- Attempt OCR only when a local OCR method is available.
- If OCR is unavailable, set `extracted_text=""` and add `ocr_unavailable` to `extraction_errors`.

OCR is non-blocking. Color extraction is still useful without text.

### PPTX Analysis

PPTX analysis is intentionally empty:

```python
ReferenceAnalysis(
    file_type="pptx",
    extracted_text="",
    dominant_colors=[],
    color_style_hint="",
    page_count=None,
    preview_screenshot=None,
    extraction_errors=[],
)
```

The `.pptx` path remains owned by Mode B and is not injected into Mode A prompt enhancement.

### Color Extraction

`extract_colors_from_image()`:

- Uses `colorthief` when installed.
- Returns up to `top_n` uppercase hex colors, e.g. `#1F3A93`.
- If `colorthief` is missing or extraction fails, returns `[]` and analyzer records `colorthief_not_installed` or `color_extraction_failed`.

`color_style_hint` is derived from the colors with simple hue/lightness labels, for example:

```text
深蓝+白色主调，红色点缀
```

The hint is heuristic and must not be treated as a hard styling command.

### Template Recommendation

`recommend_templates_by_colors(colors, all_templates)`:

- Reads template colors from template metadata returned by `parse_templates`.
- Uses `primary_color` when present.
- Extracts hex values from `primary_color`, because current template metadata may contain human text such as `深蓝白 #485275`.
- If `primary_color` is missing for a template, that template remains eligible but is ranked behind color-matched templates.
- Scores by hue distance and lightness distance.
- Returns at most 3 slugs.
- Returns `[]` if no extracted colors are available.

## API Contract

Add router:

```text
backend/app/routers/references.py
```

Register it at both root and `/agent05`, matching existing routers.

### POST /api/reference/analyze

Request:

- multipart upload field: `file`
- max size: `settings.max_upload_bytes`
- accepted: `.pptx`, `.pdf`, `.png`, `.jpg`, `.jpeg`

Storage:

```text
work/ppt-maker/references/ref_<uuid>/
├── original.<ext>
├── screenshot.png        # optional
└── analysis.json
```

Response:

```json
{
  "schema": "ppt-maker-reference-analysis/v1",
  "ref_id": "ref_abcd1234",
  "file_name": "季度报告.pdf",
  "file_type": "pdf",
  "page_count": 12,
  "text_chars": 3200,
  "extracted_text": "前端可不直接展示全文，但后端 payload 可复用",
  "dominant_colors": ["#1F3A93", "#FFFFFF", "#E74C3C"],
  "color_style_hint": "深蓝+白色主调，红色点缀",
  "recommended_templates": ["minimal-business-summary", "architecture-deck"],
  "screenshot_url": "/api/reference/ref_abcd1234/screenshot.png",
  "extraction_errors": []
}
```

For `.pptx`, the response has `file_type="pptx"`, `text_chars=0`, empty colors, no screenshot URL, and empty extracted text.

The endpoint supports `.pptx` for a uniform API contract and backend tests. The production frontend may still route `.pptx` to the existing `/api/templates/upload` endpoint because Mode B needs `source_pptx_path`.

### GET /api/reference/{ref_id}/screenshot.png

Returns:

- `screenshot.png` from the reference directory.
- `404` if the reference or screenshot does not exist.
- Rejects path traversal by accepting only a single `ref_id` segment matching `ref_[A-Za-z0-9_-]+`.

## WebSocket Contract

Mode A generate payload may include:

```json
{
  "type": "generate",
  "payload": {
    "mode": "prompt_to_ppt",
    "prompt": "生成一份季度总结",
    "page_count": 10,
    "style": "",
    "reference_analysis": {
      "ref_id": "ref_abcd1234",
      "file_type": "pdf",
      "page_count": 12,
      "extracted_text": "...",
      "dominant_colors": ["#1F3A93", "#FFFFFF"],
      "color_style_hint": "深蓝+白色主调",
      "recommended_templates": ["minimal-business-summary"]
    }
  }
}
```

Mode B payload does not use `reference_analysis`.

The backend sends:

```json
{
  "type": "progress",
  "stage": "analyzing_reference",
  "message": "正在分析参考文件..."
}
```

This progress stage is emitted only when Mode A payload includes non-pptx reference analysis. In the first implementation, analysis is performed before generation by `POST /api/reference/analyze`; therefore this stage marks backend prompt-enhancement preparation, not file parsing.

The backend may also echo a compact analysis event:

```json
{
  "type": "reference_analysis",
  "file_type": "pdf",
  "page_count": 12,
  "dominant_colors": ["#1F3A93", "#FFFFFF"],
  "text_chars": 3200,
  "screenshot_url": "/api/reference/ref_abcd1234/screenshot.png"
}
```

Frontend must not require this event to render the analysis card; it already has the API response.

## GenerationRequest Contract

Extend:

```python
reference_analysis: dict | None = None
```

Rules:

- Only Mode A consumes `reference_analysis`.
- Mode B ignores it.
- The runner treats the value as untrusted structured input and only reads expected fields.
- The runner does not trust frontend-provided `recommended_templates`; it filters them against current template slugs or recomputes recommendations from `dominant_colors`.

## Mode A Prompt Enhancement

Before writing the Mode A orchestration prompt, build a reference prompt enhancement:

```text
## 参考文件分析

文件类型：PDF（12 页）
提取文本摘要：<first 500 chars>
主色调：#1F3A93, #FFFFFF, #E74C3C
风格建议：深蓝+白色主调，红色点缀
配色匹配 Gorden 模板：minimal-business-summary, architecture-deck, report-savior
```

Implementation rule:

- Do not mutate the frozen `GenerationRequest`.
- `_write_orchestration_prompt()` computes an `effective_prompt` or payload field from `request.prompt` plus reference enhancement.
- The original user prompt remains available separately in prompt JSON.

Template recommendation behavior:

- Existing template selection remains the same event type.
- If trusted reference recommendations exist, `_template_candidates()` orders those slugs first and then appends the remaining templates in existing order.
- If no recommendations exist, existing order remains unchanged.

## Frontend Contract

### Upload Panel

The existing source upload panel accepts:

```tsx
accept=".pptx,.pdf,.png,.jpg,.jpeg"
```

State is split logically:

- `sourceFile`: only for `.pptx` and Mode B.
- `referenceFile`: only for PDF/image and Mode A prompt enhancement.

This prevents PDF/image uploads from accidentally switching to Mode B.

### File Labels

Uploaded file badge:

- `.pptx` → `源文件`
- `.pdf` → `PDF 参考`
- image → `图片参考`

Labels use existing CSS token classes. No hardcoded palette is introduced for label colors. Color swatches are the only allowed inline `backgroundColor`, because their values are user/reference data.

### Reference Analysis Card

Shown only for PDF/image analysis.

Content:

- file name
- `page_count` for PDF when available
- 3-5 color swatches
- extracted text character count
- screenshot thumbnail when `screenshot_url` exists
- non-fatal extraction errors as compact muted text

PPTX upload does not show this card.

### Mode Routing

- `.pptx` uploaded → Mode B payload with `source_pptx_path`.
- PDF/image uploaded → Mode A payload with `reference_analysis`.
- Removing the uploaded file clears both `sourceFile` and `referenceFile`.

### Progress Stepper

Mode A without reference remains 4 steps:

```text
选择模板 → 生成大纲 → 构建 PPTX → 质检完成
```

Mode A with PDF/image reference becomes 5 steps:

```text
分析参考文件 → 选择模板 → 生成大纲 → 构建 PPTX → 质检完成
```

Mode B remains 3 steps:

```text
分析源文件 → 编辑内容 → 质检完成
```

## Error Handling

- Unsupported upload type: API returns `400 unsupported_reference_type`.
- Missing `pdfplumber`: return analysis with `pdfplumber_not_installed`; generation may continue.
- Missing `colorthief`: return analysis with `colorthief_not_installed`; generation may continue.
- PDF encrypted/corrupted: return analysis with extraction errors; reject only if the file cannot be identified as PDF.
- OCR unavailable: return `ocr_unavailable`; generation may continue with colors only.
- Screenshot unavailable: `screenshot_url=null`; analysis card renders without thumbnail.
- Empty extracted text and empty colors: card still renders with errors; prompt enhancement only includes available fields.

## Dependency Scope

Install into the project Python environment, not global shell state:

```bash
python3 -m pip install pdfplumber colorthief
```

Also record the runtime dependencies in `requirements.txt` so the project can be recreated:

```text
pdfplumber
colorthief
```

`pytesseract` is optional and not required for acceptance. OCR may be implemented as best effort only.

## Tests

### Backend

Create:

```text
backend/tests/test_reference_analyzer.py
```

Required tests:

- `test_detect_pptx`
- `test_detect_pdf`
- `test_detect_png`
- `test_detect_txt_unknown`
- `test_extract_colors_from_image_with_known_palette`
- `test_recommend_templates_by_extracted_colors_returns_at_most_three_slugs`
- `test_analyze_pdf_returns_text_colors_and_page_count`
- `test_analyze_corrupted_pdf_returns_extraction_errors`
- `test_reference_analysis_for_pptx_is_empty`

Additional integration tests:

- `test_reference_analyze_api_accepts_pdf`
- `test_mode_a_payload_includes_reference_analysis_in_prompt`
- `test_reference_recommendations_order_template_candidates`

### Frontend

Extend `frontend/src/App.test.tsx`:

- `upload pdf shows PDF analysis card`
- `upload image shows image analysis card`
- `upload pptx does not show analysis card`
- `color palette renders inline color blocks`
- `reference upload keeps mode a generate payload`

## Acceptance Criteria

- Upload PDF → analysis card shows palette and text count.
- Generate after PDF upload → Mode A payload includes `reference_analysis`.
- Template candidates prioritize color recommendations when present.
- Upload image → analysis card shows palette and thumbnail when available.
- Upload PPTX → existing Mode B behavior remains unchanged and no analysis card appears.
- Dependency absence degrades with `extraction_errors` and does not block generation.
- Backend tests increase from 40 to at least 49.
- Frontend tests increase from 23 to at least 27.
- `npm run build` passes.
