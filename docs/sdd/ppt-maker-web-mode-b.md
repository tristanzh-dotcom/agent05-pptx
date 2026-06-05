# PPT Maker Web Mode B SDD

## Goal

Add `template_preserving_edit` mode to the PPT Maker Web app.

Mode A remains unchanged:

- No source PPTX.
- User provides prompt and optional parameters.
- Backend selects a Gorden template.
- Output is a newly generated PPTX.

Mode B adds source-file editing:

- User uploads an existing `.pptx`.
- User provides an edit prompt.
- Backend preserves the uploaded PPTX layout and only edits text.
- Output is a new PPTX.
- The source PPTX is never modified.

## Non-Goals

- Do not implement `template_replacement`.
- Do not modify `gorden-ppt-skill`.
- Do not modify `pptx_analyzer.py`.
- Do not modify `build_pptx.py` invocation semantics.
- Do not remove Mode A behavior, tests, or quality gates.

## Frontend Contract

### Source File Upload

The Prompt area gets a source file upload panel above the textarea.

States:

- Empty: drag/click affordance for `.pptx`.
- Uploading: spinner and disabled upload action.
- Uploaded: file name, file size, remove button.
- Error: concise upload failure message.

Styling uses existing CSS variables or Tailwind token classes. No hardcoded colors are introduced.

Mode switch:

- `sourceFile == null` → Mode A label: `从模板生成`.
- `sourceFile != null` → Mode B label: `保留模板编辑内容`.

The existing upload endpoint is reused:

```http
POST /api/templates/upload
```

The returned `relative_path` is used as `source_pptx_path` in Mode B generation payload.

### Generate Payload

Mode A payload remains compatible with existing behavior:

```json
{
  "mode": "prompt_to_ppt",
  "prompt": "string",
  "page_count": 10,
  "style": "string",
  "purpose": "string?",
  "custom_template_path": "string?"
}
```

Mode B payload:

```json
{
  "mode": "template_preserving_edit",
  "source_pptx_path": "uploads/session-a1b2c3d4e5f6/source.pptx",
  "prompt": "把封面标题改成 2026 上半年总结",
  "page_count": null,
  "style": null
}
```

### Template Selection

- Mode A: keep existing template candidate banner and local cycling.
- Mode B: never render template candidate banner and never wait for template selection.

### Progress Steps

Mode A keeps the current steps:

```text
选择模板 → 生成大纲 → 构建 PPTX → 质检完成
```

Mode B uses:

```text
分析源文件 → 编辑内容 → 质检完成
```

Mode B stage mapping:

- `analyzing_source` → 分析源文件
- `editing_pptx` → 编辑内容
- `quality_check` → 质检完成

### Source Analysis Event

Backend may emit:

```json
{
  "type": "source_analysis",
  "slides": [
    {"slide_number": 1, "role": "cover", "texts": ["季度复盘初稿", "2025 Q4"]}
  ]
}
```

Frontend renders this as a compact source overview under the progress panel:

- one row per slide
- slide number
- inferred role
- first three text snippets

### Preview

Mode B completion uses the same completed preview panel as Mode A. In the current UI this means the QuickLook visual preview as primary view and the extracted text as a collapsed debug section.

## Backend Contract

### GenerationRequest

Add:

```python
mode: str = "prompt_to_ppt"
source_pptx_path: str | None = None
```

Mode values:

- `prompt_to_ppt`
- `template_preserving_edit`

Unknown modes raise `GenerationError`.

### WebSocket Dispatch

`_run_generation_session` dispatches by payload mode.

Mode A:

- Existing template selection flow.
- Existing `SubprocessGenerationRunner.run()`.

Mode B:

- Skip `_template_candidates`.
- Skip `_select_template`.
- Skip `template_candidates` event.
- Resolve `source_pptx_path` under `settings.work_root`.
- Reject missing, path-traversal, non-`.pptx`, or nonexistent sources.
- Execute Mode B runner directly.

## Mode B Runner

Mode B may be implemented as a new runner class or a branch inside `SubprocessGenerationRunner.run()`. The observable contract is:

1. Copy uploaded source PPTX to `work_dir/source.pptx`.
2. Preserve original uploaded file bytes exactly.
3. Run request validation for `template_preserving_edit`.
4. Run `pptx_analyzer.py --mode extract source.pptx` to create source structure.
5. Run or derive source analysis for the optional `source_analysis` WebSocket event.
6. Write an orchestration prompt that requires explicit-address edits.
7. Run `opencode run --dir <work_dir>` to create `./edits.json`.
8. Validate that every edit uses explicit `address` and no edit contains `slot_id`.
9. Run `build_pptx.py source.pptx edits.json output.pptx --strict`.
10. Run `validate_edits(edits_json, page_count=None)`.
11. Run `pptx_analyzer.py --mode extract output.pptx` for completed preview.
12. Return the same `complete` payload shape as Mode A.

### Source File Immutability

The source upload path is read-only input.

Tests verify:

- hash before generation
- hash after generation
- hashes match

## Mode B Edits Schema

Mode B `edits.json` must use explicit address targeting:

```json
{
  "selected_slides": [1, 2, 3],
  "edits": [
    {
      "slide": 1,
      "address": {"shape_id": 12, "paragraph": 0, "run": 0},
      "new_text": "2026 上半年总结"
    }
  ]
}
```

Rules:

- `slot_id` is invalid in Mode B output.
- `address.shape_id` is required.
- `address.paragraph` and `address.run` default expectation is integer offsets.
- `new_text` placeholder detection remains active.

## validate_edits Contract

Existing function changes from:

```python
validate_edits(edits_json: dict, page_count: int) -> dict
```

to:

```python
validate_edits(edits_json: dict, page_count: int | None) -> dict
```

Behavior:

- `page_count is int`: existing page count hard constraint and warning behavior remain.
- `page_count is None`: skip selected slide length vs requested page count check.
- All other schema checks remain active.
- Placeholder detection remains active.
- Duplicate target detection remains active.

Mode B explicit-address validation is enforced by the Mode B runner before `build_pptx.py` is called. This keeps the existing `validate_edits` public interface limited to the requested `page_count: int | None` change and avoids changing Mode A slot-id behavior.

## Orchestration Prompt Requirements

Mode B prompt must include:

- User edit instruction.
- Source analysis summary.
- A shape address table extracted from `machine_extracted.json`, covering every editable text shape with at least `slide`, `shape_id`, current text, paragraph index, and run index.
- Explicit instruction to generate `./edits.json`.
- Explicit-address-only schema.
- Explicit ban on `slot_id`.
- Explicit "only edit text" rule.
- Explicit "do not modify source PPTX" rule.
- Placeholder text ban.

Required hard constraint block:

```text
1. 必须使用 explicit address 格式。
2. 绝对不能使用 slot_id。
3. 只改文字，不改字体、字号、颜色、位置、形状大小。
4. 原始 PPTX 文件不可修改。
5. 只能使用下方 machine_extracted.json 地址表中真实存在的 shape_id/paragraph/run。
6. 请只在当前工作目录生成 ./edits.json。
```

## Error Handling

Mode B rejects:

- missing `source_pptx_path`
- path traversal
- nonexistent source
- non-`.pptx` source
- generated `edits.json` using `slot_id`
- generated `edits.json` missing explicit `address`
- source mutation

All rejections surface through existing WebSocket `error` event.

## Tests

### Backend

- `test_mode_b_skips_template_selection`
- `test_mode_b_runner_calls_build_with_source_pptx`
- `test_mode_b_validate_edits_skips_page_count_check`
- `test_mode_b_preserves_original_file`
- `test_page_count_none_skips_validation`

### Frontend

- `test_source_file_upload_switches_to_mode_b`
- `test_remove_source_file_switches_back_to_mode_a`
- `test_template_banner_hidden_in_mode_b`

## Acceptance Criteria

- Mode A behavior is unchanged.
- Mode B skips template selection.
- Mode B output PPTX is generated from the uploaded source PPTX.
- Source file hash does not change.
- Mode B `edits.json` uses `address` and does not contain `slot_id`.
- `page_count=None` skips page count validation.
- Placeholder detection still rejects bad Mode B edits.
- Backend tests pass and increase coverage count.
- Frontend tests pass and increase coverage count.
- `npm run build` passes.
