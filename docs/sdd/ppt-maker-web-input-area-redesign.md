# PPT Maker Web Input Area Redesign SDD

## Goal

Redesign the `ppt-maker` Web input area so the first screen is focused on three user decisions only:

1. What content should the deck contain? (`prompt`)
2. Should a file influence generation or editing? (`.pptx` source vs PDF/image reference)
3. How many pages should Mode A generate? (`page_count`)

The redesign removes redundant prompt-like controls (`style`, `purpose`), folds reference analysis into the upload row, and keeps reference influence visible after generation.

## Non-Goals

- Do not change backend APIs.
- Do not change WebSocket protocol.
- Do not change Mode A/Mode B runners.
- Do not change quality gate behavior.
- Do not change template candidate behavior, including the current local "换一批" cycling.
- Do not add a separate visual preview implementation in this change.

## Current Problems

### Redundant Prompt Fields

`style` and `purpose` are currently presented as structured advanced fields, but they are natural-language prompt details. With `reference_analyzer`, uploaded PDF/image files can already derive style and color hints. Keeping manual style fields creates an ambiguous priority order:

- User prompt says one style.
- Advanced field says another style.
- Reference analyzer extracts a third style.

The redesigned input area treats prompt text as the single place for subjective instructions.

### Ambiguous Upload Label

The current label says "源文件（可选）", but uploaded file type determines the pipeline:

- `.pptx` means Mode B (`template_preserving_edit`): preserve layout and edit text.
- `.pdf`, `.png`, `.jpg`, `.jpeg` mean Mode A (`prompt_to_ppt`) with reference enhancement.

The new label must explain this routing before upload.

### Reference Analysis Visibility

The separate reference card increases vertical weight and becomes visually detached from the actual prompt. The new design renders the analysis inline inside the prompt card so users can see the reference context while writing the prompt.

### History Data Limitation

`GET /api/files` currently returns generated file metadata but not the original prompt or generation mode. Because this SDD explicitly keeps backend APIs unchanged, full historical prompt labels cannot be reconstructed for old server records.

The frontend will maintain a local metadata map keyed by `file_id` for files generated in the browser session or persisted browser storage. Existing historical records without local metadata fall back to a readable label instead of exposing `output.pptx` as the primary text.

## Layout Contract

### Prompt Card

The existing sticky top section becomes one unified prompt card:

```text
Prompt
  [upload affordance + route hint]
  [inline uploaded file row, when present]
  [textarea]
  [page count selector] [Generate PPT]
```

The design remains an operational tool layout: compact, low decoration, scan-friendly, no nested card-in-card composition.

### Empty Upload State

When no file is uploaded:

```text
📎 上传参考文件
.pptx -> 保留模板编辑内容 · .pdf .png -> 提取风格配色
```

The file input accepts:

```text
.pptx,.pdf,.png,.jpg,.jpeg
```

### Uploaded PPTX Row

For `.pptx`, the row shows:

```text
📄 季度复盘初稿.pptx  源文件  2.3 MB  [x]
```

The mode label becomes:

```text
保留模板编辑内容
```

Generation payload remains:

```json
{
  "mode": "template_preserving_edit",
  "source_pptx_path": "...",
  "page_count": null,
  "style": null
}
```

### Uploaded PDF/Image Row

For PDF/image references, the row shows:

```text
📄 季度报告.pdf  12页  3200字  [color swatches x3]  [x]
```

For images without OCR text:

```text
📄 参考图.png  图片参考  [color swatches x3]  [x]
```

The mode label becomes:

```text
从模板生成（参考增强）
```

Generation payload remains Mode A and includes the existing `reference_analysis` object.

### Prompt Placeholder

The textarea placeholder is:

```text
输入 Prompt，例如：为销售团队生成一份商务深蓝风的季度经营复盘，重点分析渠道增长和客户留存。
```

Do not include "已上传参考文件..." in the placeholder when no reference is uploaded. When a reference file is uploaded, the UI already shows the inline row; the prompt does not need a dynamic placeholder suffix.

### Page Count Selector

Remove `advancedOpen`, `style`, `purpose`, and the advanced panel.

Move `page_count` next to Generate as a compact selector:

```text
页面: [10 v]
```

Options:

```text
5, 8, 10, 12, 15, 20, 自定义
```

`自定义` reveals a small numeric input next to the selector. The numeric input keeps the existing constraints: min `1`, max `60`.

Mode B ignores `page_count`; the control may remain visible but disabled in Mode B, because the original slide count is preserved.

## Mode Label Contract

The mode badge has three display states. This is the full explanatory label shown in the input card:

| State | Condition | Label |
|---|---|---|
| Plain Mode A | no uploaded file | `从模板生成` |
| Reference Mode A | PDF/image uploaded | `从模板生成（参考增强）` |
| Mode B | PPTX uploaded | `保留模板编辑内容` |

This is display-only. It does not add a new backend mode.

History rows use shorter type chips for density:

| Input label | History chip |
|---|---|
| `从模板生成` | `模板生成` |
| `从模板生成（参考增强）` | `参考增强` |
| `保留模板编辑内容` | `保留编辑` |

## Preview Enhancement Summary

When generation completes with a PDF/image reference, the preview panel shows a compact summary under `PPT 成品预览`:

```text
Prompt 已增强：参考 季度报告.pdf · 配色 #1F3A93 · 推荐模板 architecture-deck
```

Fields:

- Reference file name: `reference_analysis.file_name`
- Color: first item in `reference_analysis.dominant_colors`
- Template: first item in `reference_analysis.recommended_templates`

If any value is missing, omit only that segment. Do not show the summary for `.pptx` Mode B.

Because the WebSocket complete event is unchanged, the frontend stores the last submitted `reference_analysis` snapshot and passes it to the preview panel after completion.

## History Display Contract

### Data Source

Backend file records remain unchanged. The frontend creates a local metadata map:

```typescript
type HistoryPresentationMeta = {
  promptPrefix: string
  modeLabel: '模板生成' | '保留编辑' | '参考增强'
}
```

Storage key:

```text
ppt-maker:generation-history-meta:v1
```

On successful `complete`, if `result.file_id` is present, save:

- `promptPrefix`: first 40 visible characters of the submitted prompt
- `modeLabel`:
  - `参考增强` when payload contains PDF/image `reference_analysis`
  - `保留编辑` when payload mode is `template_preserving_edit`
  - `模板生成` otherwise

### Rendering

For files with local metadata:

```text
[参考增强] 根据参考文件生成季度汇报...
2026-06-04T... · 10 页
```

For existing server records without local metadata:

```text
[模板生成] 生成记录
2026-06-04T... · 10 页
```

The primary label should not be `output.pptx`. `output.pptx` may still be used in aria labels or download filename contexts where the actual file identity matters.

## State Contract

Keep separate state for two different upload meanings:

```typescript
type SourceFileState = {
  name: string
  size: number
  relativePath: string
}

type ReferenceFileState = {
  file: File
  analysis: ReferenceAnalysisPayload | null
}
```

Implementation may keep the existing `ReferenceFileState` shape if it preserves:

- original file name
- original file size
- analysis payload

The invariant is:

```text
sourceFile !== null implies referenceFile === null
referenceFile !== null implies sourceFile === null
```

## Error Handling

Upload/analyze errors remain frontend display concerns:

```text
文件上传或分析失败
```

No new API error protocol is introduced.

If `reference_analysis` has `extraction_errors`, the inline row may show a small muted warning token only if space permits. It must not block generation.

## CSS And Accessibility

- Continue using Tailwind classes backed by existing CSS variables.
- Do not hardcode raw colors except inline swatch `backgroundColor`, which represents extracted user data.
- Upload row remove button uses an icon button with `aria-label`.
- The page-count selector has an accessible label.
- Text must wrap or truncate predictably on mobile; no overlapping controls.

## Test Plan

Update `frontend/src/App.test.tsx`.

### Required Tests

1. `upload pdf shows inline analysis row`
   - Upload PDF.
   - Expect file name, `12页`, `3200字`, and three swatches.
   - Expect no separate `参考分析` section.

2. `upload pdf sets mode label to reference enhanced mode`
   - Upload PDF.
   - Expect `从模板生成（参考增强）`.

3. `no upload shows default template generation mode label`
   - Render empty app.
   - Expect `从模板生成`.
   - Expect `从模板生成（参考增强）` is absent.

4. `upload pptx keeps existing source behavior`
   - Upload PPTX.
   - Expect `保留模板编辑内容`.
   - Generate payload remains Mode B with `source_pptx_path`.

5. `no upload shows prompt placeholder without enhancement text`
   - Render empty app.
   - Expect placeholder contains the business deep-blue example.
   - Expect placeholder does not contain `已上传参考文件`.

6. `page_count renders as dropdown with fixed options`
   - Expect selector options `5/8/10/12/15/20/自定义`.

7. `preview shows enhancement summary after generation with reference`
   - Upload PDF.
   - Generate.
   - Emit complete event.
   - Expect `Prompt 已增强`.
   - Expect file name, first color, and first recommended template.

8. `history item shows prompt prefix instead of output filename`
   - Generate with prompt.
   - Emit complete event with `file_id`.
   - Refresh/open history.
   - Expect prompt prefix and type tag.
   - Expect primary visible label is not `output.pptx`.

### Regression Tests To Preserve

- Existing `.pptx` upload tests.
- Mode B template banner hidden test.
- Quality gate error rendering tests.
- State restore tests.
- Template cycling tests.

## Acceptance Criteria

1. No upload: single prompt card with upload route hint, textarea, page-count dropdown, Generate button.
2. PDF upload: inline row shows file name, page count, text count, swatches; mode badge is `从模板生成（参考增强）`.
3. PPTX upload: Mode B behavior remains unchanged.
4. Advanced panel is removed; `style` and `purpose` no longer render as separate inputs.
5. Completed preview shows a reference enhancement summary when a PDF/image reference was used.
6. History primary label uses prompt metadata when available and a readable fallback otherwise, not `output.pptx`.
7. `npm test -- --run` passes.
8. `npm run build` passes.

## Open Design Decision

History prompt labels cannot be fully accurate for older server records without changing backend API or reading task-local prompt artifacts from the backend. This SDD chooses the frontend-only local metadata approach because the requested non-goal says "后端 API 不变".
