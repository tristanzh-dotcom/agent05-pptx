# Agent05 Release QA - 2026-06-16

## Scope

This QA pass completes the Agent05 PPT Maker local release workflow at:

- Web publishing entry: `http://127.0.0.1:3000/agent05`
- Agent05 backend: `http://127.0.0.1:8000`
- Backend port migration to `8005` remains reserved for the separate agent00 port-governance workflow.

## Implemented Contracts

- Agent05 checks `/api/agent05/status` before loading generation status or file history.
- Backend-unavailable state shows `PPT Maker 后端未启动` and avoids raw `ECONNREFUSED` JSON in the user UI.
- Latest generated PPTX restores into preview/download by default.
- Running generation restores as progress state and does not require clicking Generate again.
- Preview frame uses standard PPT 16:9 geometry.
- Preview frame keeps 16:9 geometry in both desktop and narrow embedded layouts.
- QuickLook preview iframe is clipped by the 16:9 frame and uses `scrolling="no"`.
- History is no longer a permanent bottom strip. Desktop opens it as a bounded drawer; narrow layout keeps it in the history tab without duplicating drawer layers.
- The `/agent05` publishing shell hides implementation/provider metadata such as `模型配置`, `DeepSeek 中文生成`, and `QuickLook 预览`.
- Reference upload supports multi-file display with filename, semantic type, size, pages/text/colors when available.
- Reference upload failures surface backend `detail` values such as `unsupported_reference_type`.
- Generation orchestration prompt preserves explicit user constraints such as "第 4/5 页只放备用标题".
- `scripts/agent05_release_smoke.sh` checks web shell, embedded frontend, backend health, generate status, and files API.

## Verification

Commands run on 2026-06-16:

```bash
python3 -m pytest backend/tests -q
# 56 passed

cd frontend && npm test -- --run
# 49 passed

cd frontend && npm run build
# passed

cd /Users/tristanzh/agent/web
node --test tests/agent05-service.test.mjs tests/agent05-browser-layout.test.mjs
# 10 passed

cd /Users/tristanzh/agent/PPT-maker
./scripts/agent05_release_smoke.sh
# Agent05 release smoke passed.
```

Runtime API check:

- Uploaded a real PNG through `http://127.0.0.1:3000/agent05/api/reference/analyze`.
- Response schema: `ppt-maker-reference-analysis/v1`.
- Returned `file_type=image`, dominant colors, recommended templates, screenshot URL, and `ocr_unavailable`.

Browser acceptance on the live `http://127.0.0.1:3000/agent05` route:

- 1440x900: outer `scrollWidth === clientWidth`, no document-level horizontal overflow.
- 1440x900: inner preview stage measured `924.4 x 520`, ratio `1.778`.
- 820x900: outer `scrollWidth === clientWidth`, inner `scrollWidth === clientWidth`, no horizontal overflow.
- 820x900: inner preview stage measured `584 x 328.5`, ratio `1.778`.
- 820x900: top-level tabs measured `38px` high, not stretched into the main content row.
- `hasModelCopy === false` for `模型配置` / `QuickLook 预览`.
- Permanent history strip absent: `hasPermanentHistoryStrip === false`.
- Latest loaded asset at final verification: `/agent05/assets/index-CVkEan9n.js`.

## Runtime State

At the end of this QA pass:

- Web publishing service was restarted and is listening on `127.0.0.1:3000`.
- PPT Maker backend was started in a detached screen session:

```bash
screen -dmS agent05-backend /usr/bin/python3 -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

Useful commands:

```bash
screen -ls
screen -S agent05-backend -X quit
lsof -nP -iTCP:8000 -sTCP:LISTEN
./scripts/agent05_release_smoke.sh
```

## Remaining Risks

- QuickLook remains the primary visual preview path because `soffice` and `pdftoppm` are not guaranteed available.
- Old history records without browser localStorage metadata still fallback to `生成记录`.
- Port ownership is intentionally not migrated in this workflow; agent00 should own any `8005` migration.
- Existing generated PPT content quality still depends on upstream LLM/template behavior; this QA pass validates workflow, restoration, preview, upload, and release reliability.

## 2026-06-17 Six-Round Completion Pass

Implemented after the 2026-06-16 handoff:

- Narrow-layout stage actions now synchronize the visible tab:
  - `历史记录` opens the `历史` tab.
  - `新建 PPT` opens the `生成` tab.
  - `查看结果` opens the `预览` tab.
- Desktop full-history drawer now has an explicit `关闭` button and no longer labels the complete drawer action as `更多历史`.
- QuickLook wrapper is version-stamped with `ppt-maker-visual-preview-wrapper`.
- Direct requests to stale `visual_preview/index.html` rebuild the wrapper when a valid `Preview.html` exists.
- Non-current QuickLook slides are marked `aria-hidden="true"` so accessible content follows the single-slide visual model.
- Visual preview health gate rejects missing same-directory visual resources such as broken `<img src="missing.png">`.
- Cached unhealthy visual previews are invalidated and regenerated once.
- Text extraction now opens to a bounded summary and keeps full extracted fragments behind `查看完整文本`.
- Deterministic post-generation constraint verification detects page-level backup-only constraints such as `第 4/5 页只放备用` and flags non-compliant generated slides.

Fresh verification on 2026-06-17:

```bash
cd /Users/tristanzh/agent/PPT-maker/frontend
npm test -- --run src/App.test.tsx
# 55 passed

npm run build
# passed

cd /Users/tristanzh/agent/PPT-maker
python3 -m pytest backend/tests -q
# 59 passed

cd /Users/tristanzh/agent/web
node --test tests/agent05-service.test.mjs tests/agent05-browser-layout.test.mjs
# 10 passed

cd /Users/tristanzh/agent/PPT-maker
./scripts/agent05_release_smoke.sh
# Agent05 release smoke passed.
```

Browser acceptance on 2026-06-17:

- `/agent05` at 1280x720: document `scrollWidth === clientWidth`, document `scrollHeight === clientHeight`, iframe measured about `924 x 580`, and shell metadata copy remained absent.
- Desktop drawer: `关闭` button present, `更多历史` absent inside the full drawer, and the result workspace remained mounted.
- Narrow 820x900: `历史记录 -> 历史`, `新建 PPT -> 生成`, `查看结果 -> 预览` all selected the expected tab.
- Embedded app 1440x900: preview stage measured about `1176.9 x 662.0`, ratio `1.778`, no document overflow.
- Embedded app 820x900: preview stage measured about `754 x 424.1`, ratio `1.778`, no document overflow.

## 2026-06-17 UAT E2E Correction Pass

User testing exposed two issues that unit tests did not catch:

- `Generate PPT` was below the prompt textarea and could be clipped after reference upload.
- `模板选择` appeared below the prompt textarea and could be clipped during `selecting_template`, leaving only the status text visible.

Fixes:

- Moved page count and `Generate PPT` / `Cancel` above reference upload and prompt.
- Moved runtime surfaces (`模板选择`, progress, backend/error notices, quality gate) above the prompt.
- Added SDD rule that runtime decision surfaces must stay visible before the prompt.

Fresh verification:

```bash
cd /Users/tristanzh/agent/PPT-maker/frontend
npm test -- --run src/App.test.tsx
# 56 passed

npm run build
# passed

cd /Users/tristanzh/agent/PPT-maker
./scripts/agent05_release_smoke.sh
# Agent05 release smoke passed.
```

In-app browser E2E evidence:

- Opened `http://127.0.0.1:3000/agent05`.
- Clicked `新建 PPT`, entered a 5-page JLR org prompt, clicked `Generate PPT`.
- Reached `selecting_template`; `模板选择` rendered above `Prompt`, with selectable cards visible.
- Clicked `选择 简约商务总结汇报`.
- Generation completed to `20260617-110143_9e64ce62/output.pptx`.
- Browser showed `Result`, `下载 .pptx`, QuickLook preview, and `文本提取结果`.

Reference-enhanced backend E2E evidence:

- Uploaded `/var/folders/by/ryk2x0p133n0q7syh20tp2l40000gn/T/codex-clipboard-87dbfc5c-66aa-4e44-93ea-fe2e1d9b162b.png` to `POST /api/reference/analyze`.
- Received `ppt-maker-reference-analysis/v1`, `file_type=image`, dominant colors `#FAFBFB`, `#334553`, `#A4B1B8`, with `ocr_unavailable`.
- Sent WebSocket `generate` with that `reference_analysis`.
- Received `template_candidates`, selected `report-massive-models`.
- Generation completed to `20260617-110932_d382572e/output.pptx`, `slide_count=5`.
- Reloaded `/agent05`; browser restored the latest result with `下载 .pptx`, QuickLook preview, and `文本提取结果`.

Automation limitation:

- The in-app browser runtime exposes the hidden file input but does not expose `setInputFiles`, so the actual OS file picker/upload click cannot be automated through that surface. Project-level Playwright E2E is now installed to cover this exact upload path.

## 2026-06-17 Playwright Upload E2E Pass

Added project E2E automation:

```bash
cd /Users/tristanzh/agent/PPT-maker/frontend
npm run e2e:agent05-upload
```

This script uses Playwright `setInputFiles` against `http://127.0.0.1:3000/agent05/index.html` and verifies:

- real local PNG upload through the hidden file input
- inline image reference analysis row and color swatches
- visible `Generate PPT` action before Prompt
- visible `模板选择` above Prompt
- template selection
- generated Result screen
- `.pptx` download link
- preview iframe titled `PPT 成品预览`

Final passing run:

```json
{
  "status": "passed",
  "baseUrl": "http://127.0.0.1:3000/agent05/index.html",
  "referenceFile": "/var/folders/by/ryk2x0p133n0q7syh20tp2l40000gn/T/codex-clipboard-87dbfc5c-66aa-4e44-93ea-fe2e1d9b162b.png",
  "downloadHref": "/agent05/api/files/20260617-133308_4fa04555/output.pptx/download",
  "templateY": 332,
  "promptY": 675
}
```

Generated output:

- `/Users/tristanzh/agent/PPT-maker/work/ppt-maker/20260617-133308_4fa04555/output.pptx`

Final passing run after model-output recovery fixes:

```json
{
  "status": "passed",
  "baseUrl": "http://127.0.0.1:3000/agent05/index.html",
  "referenceFile": "/var/folders/by/ryk2x0p133n0q7syh20tp2l40000gn/T/codex-clipboard-87dbfc5c-66aa-4e44-93ea-fe2e1d9b162b.png",
  "downloadHref": "/agent05/api/files/20260617-140146_9cea130d/output.pptx/download",
  "templateY": 332,
  "promptY": 675
}
```

Final generated output:

- `/Users/tristanzh/agent/PPT-maker/work/ppt-maker/20260617-140146_9cea130d/output.pptx`

Backend robustness fixes discovered by the E2E:

- Mode A now normalizes model output when `slide` uses output indexes but `slot_id` uses original Gorden slide prefixes.
- Mode A now derives missing `selected_slides` from `slot_id` prefixes when possible.
- Mode A now wraps top-level edits arrays into the required object shape when `slot_id` prefixes provide enough information.
- Mode A now runs `validate_edits` before `build_pptx.py`, so invalid model output fails fast and build is not called.
- Mode A now repairs deterministic strict-build `OVERFLOW` diagnostics once by shortening the exact overflowing text and retrying build.
- The frontend now polls backend status while a WebSocket run is active; if the backend has ended and a new file appears, it restores the Result screen instead of staying stuck in `GENERATING`.

Fresh verification:

```bash
cd /Users/tristanzh/agent/PPT-maker
python3 -m pytest backend/tests -q
# 63 passed

cd /Users/tristanzh/agent/PPT-maker/frontend
npm test -- --run src/App.test.tsx
# 57 passed

npm run build
# passed

npm audit --omit=dev --audit-level=high
# found 0 vulnerabilities

cd /Users/tristanzh/agent/PPT-maker
./scripts/agent05_release_smoke.sh
# Agent05 release smoke passed.
```
