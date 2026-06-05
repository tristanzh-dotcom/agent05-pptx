# PPT Maker Web Visual Preview and Template Cycling SDD

## Problem

Two frontend behaviors are misleading:

- The template "换一批" button is static. The backend sends only the first three template candidates, so the user cannot browse the rest of the template catalog.
- The main preview panel is labeled as a preview, but it renders `machine_extracted.json` as text cards after the PPTX has already been built. This is useful for debugging, not for judging the finished deck.

## Design Decisions

### Template Candidate Flow

- The backend sends the full template catalog in the `template_candidates` WebSocket event.
- The frontend displays three candidates at a time.
- The "换一批" button cycles locally through the full candidate list.
- The button is hidden when the candidate count is less than or equal to three.
- Cycling wraps back to the first group without dropping or duplicating templates.

### Template Slug Validation

- The backend validates the selected `template_slug` against the current on-disk template catalog before generation starts.
- An unknown slug is rejected with `GenerationError`.
- The error includes the invalid slug and the current valid slug list.
- The backend must not silently fall back to the first template when the frontend sends a stale or invalid slug.

### Finished PPT Preview

- The main preview panel becomes "PPT 成品预览".
- The primary preview source is a cached QuickLook visual preview package stored under:

```text
work_dir/
  visual_preview/
    Preview.html
    Attachment*.pdf
    index.html
```

- `index.html` is a sanitized wrapper that references the generated QuickLook `Preview.html`.
- The frontend renders the visual preview URL in a 16:9 iframe container.
- The download button stays visible when visual preview succeeds or fails.
- `machine_extracted.json` remains available as a collapsed debug section named "文本提取结果".

### Visual Preview Endpoint

`GET /api/files/{file_id}/visual-preview`

Success:

```json
{
  "schema": "ppt-maker-visual-preview/v1",
  "file_id": "task/output.pptx",
  "preview_url": "/api/files/task/output.pptx/visual-preview/index.html",
  "mode": "quicklook_html"
}
```

Failure:

```json
{
  "schema": "ppt-maker-visual-preview/v1",
  "file_id": "task/output.pptx",
  "error": "visual_preview_failed",
  "message": "预览生成失败，但 PPTX 可下载"
}
```

`GET /api/files/{file_id}/visual-preview/{asset_path:path}`

- Serves files from `work_dir/visual_preview/`.
- Rejects path traversal.
- `index.html` and QuickLook assets are served only after the preview package has been generated.

### Renderer

- Use macOS `qlmanage -p -o <temp_dir> <pptx>` to generate the visual preview package.
- Copy the `.qlpreview` output into `work_dir/visual_preview/`.
- Enforce package size limit: 10 MB.
- Validate that generated `Preview.html` contains at least one `<img>` tag.
- If QuickLook fails, times out, exceeds size, or creates an empty preview, return the failure payload and keep the PPTX download available.

### Cleanup

- Deleting a PPTX also removes:
  - `machine_extracted.json`
  - `visual_preview/`

## Frontend Behavior

- On generation complete, call the visual preview endpoint for `result.file_id`.
- On history preview click, call both text preview and visual preview endpoints.
- On restored generation completion, preview the latest file visually when possible.
- If visual preview fails, show a compact failure state with the download button.
- Text extraction appears in a collapsed debug section and is never the primary completed-state view.

## Tests

### Backend

- Unknown selected template slug is rejected and lists valid slugs.
- Template candidates include the full catalog, not just the first three.
- Visual preview endpoint returns a cached `preview_url` when QuickLook output is valid.
- Visual preview endpoint returns a failure payload when generated HTML has no `<img>`.
- Deleting a PPTX removes `visual_preview/`.

### Frontend

- "换一批" cycles through template groups and wraps back to the first group.
- "换一批" is hidden when there are three or fewer templates.
- Completed generation renders "PPT 成品预览" iframe and download link.
- Visual preview failure keeps the download link visible and does not show the old outline as the primary panel.
- Text extraction is collapsed by default under "文本提取结果".
