# PPT Maker Web Workbench Layout SDD

## Problem

The current Agent05 PPT Maker page uses a vertical stack:

```text
Header
Prompt card
PPT preview card
History
Footer
```

This is misaligned with the product's first principles. PPT Maker has two primary user tasks:

1. Express generation intent.
2. Inspect, download, and reuse the generated deck.

The vertical layout lets the prompt card consume the first screen and pushes the preview, history, and result details into the scroll area. This makes the output-inspection task feel secondary even though it is one of the two core tasks.

The page also shows development-only routing information in the header and repeats the template disclaimer in two places, wasting space that should be assigned to generation controls and deck inspection.

## Goals

- Make prompt input and PPT preview visible together on desktop.
- Keep history reachable without scrolling past the preview.
- Compress the prompt area into an operational control console.
- Remove development-only header fields from the release UI.
- Do not render the template commercial-use disclaimer in the release UI.
- Preserve the existing Mode A, Mode B, reference-enhanced Mode A, template selection, progress, visual preview, quality gate, and history behaviors.
- Define layout sizing from the platform content container, not the browser viewport alone.

## Non-Goals

- Do not change backend APIs.
- Do not change WebSocket protocol.
- Do not change generation, template recommendation, visual preview, or quality gate logic.
- Do not modify Gorden templates or the Gorden skill.
- Do not add a new PPT rendering engine.
- Do not redesign the outer platform shell or its left navigation.

## Layout Decision

### Desktop Workbench

On desktop, Agent05 becomes an inner two-column workbench inside the existing platform content area:

```text
PPT Maker header
---------------------------------------------------------
Generation console | PPT result workspace
                   |
                   |  PPT preview header + download
                   |  16:9 visual preview
                   |  Result tabs: Preview / Summary / Text / Quality
---------------------------------------------------------
Compact history strip
Model capability strip
```

The outer platform may already have a left navigation. This SDD does not change it. The PPT Maker two-column layout is an inner split inside the platform's main content region.

### Left Column: Generation Console

Default width:

```text
360px - 420px
```

Content order:

1. Compact mode row:
   - `Prompt`
   - mode badge: `从模板生成`, `从模板生成（参考增强）`, or `保留模板编辑内容`
2. Upload tool row:
   - compact upload icon/button
   - multi-file queue when files are selected
   - each selected file shows visible file name and semantic file type, such as `PDF参考`, `图片参考`, or `PPTX源文件`
3. Prompt textarea:
   - dominant control in the left console
   - height receives the remaining vertical space after compact controls
   - min height large enough for multi-sentence deck briefs on desktop
   - resizable behavior is optional, but the default state must not collapse into a small field
4. Action row:
   - `Generate PPT` / `Cancel`
   - no page-count selector; Mode A page count is resolved by backend from Prompt or automatic inference, and Mode B preserves the source deck count internally
5. Runtime area:
   - template candidates while selecting
   - progress steps while running
   - quality gate error entry point when present

The console is the only place for generation controls. It must not contain nested cards inside cards.

The upload tool is context input, not the primary authoring area. It must remain compact even when several files are selected. If the selected file list grows beyond the available inline space, it should scroll or wrap inside a bounded queue rather than reducing the prompt textarea below its minimum useful height.

### Right Column: PPT Result Workspace

The preview workspace receives all remaining width.

Content order:

1. Preview header:
   - `PPT 成品预览`
   - download button when `resultFileId` exists
   - compact status or reference-enhancement summary
2. Visual preview:
   - 16:9 iframe when `visualPreview.preview_url` exists
   - compact failure state when visual preview fails
   - empty state before generation
   - the visible preview stage remains a bounded 16:9 PPT canvas inside the available result area
3. Result tabs:
   - `摘要`
   - `文本提取`
   - `质量门`

The visual preview is the dominant surface. Text extraction stays secondary and is not shown as the primary completed-state content.
The result workspace must hide outer overflow; scrolling belongs inside secondary details only, not on the page or the preview column.

## Header Contract

The release header must not display:

- backend URL
- frontend mount path
- project routing debug text

Release header content:

```text
PPT生成
输入生成意图，检查并下载 PPTX 成品
```

The release header is owned by the platform shell. The embedded PPT Maker frontend must not render a second local title/status toolbar. Backend health, backend URLs, frontend mount paths, and debug status belong in service diagnostics, not the final-user first screen.

## Height Contract

The workbench height must be calculated from the platform content area, not from raw `100dvh`.

Required interface:

```text
availableWorkbenchHeight = platformContentHeight - pptMakerHeaderHeight - localVerticalPadding
```

Implementation may express this with CSS variables supplied by the app shell or measured container constraints, but it must not assume that `100dvh` equals usable PPT Maker height.

The inner columns share the same available height:

```text
.generation-console
.result-workspace
```

Each column owns its internal overflow contract. The generation column may scroll secondary content if needed, but the result workspace must preserve a bounded 16:9 preview stage and must not create page-level scrolling. The whole page should not require scrolling to access the primary prompt, preview, or latest history entry on desktop.

The release workbench shell must be bounded to the visible viewport height. It must not use a `min-height` plus vertical padding combination that increases total document height beyond the viewport on compact laptop screens.

The generation console prompt row should use a flexible minimum:

```text
prompt row: minmax(12rem, 1fr)
```

This keeps Prompt larger than the compact upload row while still allowing the full workbench, history strip, and model capability strip to fit inside a 720px-tall browser viewport.

## Width and Breakpoint Contract

The design must account for the outer platform sidebar.

### Wide Desktop

For effective platform content width `>= 1400px`:

```text
generation console: 380px - 420px
result workspace: minmax(0, 1fr)
```

### Standard Desktop

For effective platform content width `< 1400px`:

```text
generation console: 300px - 340px
result workspace: minmax(0, 1fr)
```

The console must become denser before the preview is sacrificed. Compress upload hints, button labels, and history rows before reducing the preview below a usable 16:9 area.

### Narrow Layout

When the effective platform content width cannot support both columns with a usable preview, switch to tabs. The initial breakpoint is:

```text
effective platform content width < 860px
```

This value is based on the Agent05 iframe after the platform sidebar is present. A 1280px-wide laptop viewport leaves roughly 900px of Agent05 iframe width; that is still enough for a compact generation console plus a usable PPT preview. The breakpoint must therefore be lower than the old 960px threshold, otherwise standard laptop users see only the Generate tab and lose the primary output-inspection task.

```text
生成 | 预览 | 历史
```

Rules:

- Default tab is `生成`.
- After generation completes, switch to `预览`.
- History remains one tap away and does not live below a long vertical stack.
- Existing generation state restoration still works after remount.

## 2026-06-16 Layout Reset Contract

Browser inspection showed three layout failures that invalidate the earlier implementation assumptions:

1. The outer Agent05 shell forced `minmax(720px, 1fr)` for the iframe region and allowed page-level overflow. On a 1280x874 laptop viewport, the document height exceeded the viewport even though the workbench is fixed-position in practice.
2. The embedded app used `window.innerWidth < 960` as the tab breakpoint. Inside the platform shell, a standard 1280px viewport produced only about 917px of iframe width, so the release page hid preview/history behind tabs.
3. The history tab and "more history" control could show the latest-three list and the full list simultaneously, creating duplicate history surfaces and vertical blowout.

The corrected release contract is:

- Agent05 outer shell is a bounded route-specific viewport. It may allocate internal scroll to the iframe app, but the platform document itself must not need vertical scrolling to access header, workbench, or model configuration on desktop.
- At iframe width `>= 860px`, render the two-column desktop workbench. The prompt console may shrink before the preview disappears.
- At iframe width `< 860px`, render tabs. The history tab starts as a compact recent list; selecting "more history" replaces the compact list with a bounded full list instead of duplicating both.
- When generated files already exist and no generation is running, the workbench should load the latest file into the preview workspace by default. A completed test state should return users to "inspect/download the latest deck", not an empty prompt-only state.

## Runtime Reliability Contract

Agent05 currently keeps the PPT Maker backend on `127.0.0.1:8000` because the existing FastAPI app, proxy routes, and generated file URLs are already wired to that service. The agent00 port-governance target is to migrate Agent05 to `8005`, but that migration must be handled as a separate SDD/TDD change because it touches launch scripts, proxy config, browser URLs, and handoff docs together.

Until that migration is executed, the release UI must treat `8000` as the active Agent05 backend port and must fail gracefully when it is down:

- `/api/agent05/status` is the preflight source of truth for backend availability.
- The embedded React workbench must check `/api/agent05/status` before loading generation status or file history.
- If `backend.available === false`, the workbench must show a user-facing “PPT Maker 后端未启动” state and must not call generation/file APIs.
- HTML iframe requests proxied through `/agent05/api/...`, especially QuickLook visual preview URLs, must return an HTML unavailable state when the backend is unreachable. They must not display raw JSON such as `{"error":"connect ECONNREFUSED"}` inside the browser UI.

## Preview Quality Contract

The output preview is an inspection surface, not a document browser. It must therefore behave like a scaled PPT slide:

- The visible preview frame must use standard PowerPoint 16:9 geometry.
- The outer workbench must not require horizontal scrolling to inspect a generated slide.
- The QuickLook iframe must be clipped by the 16:9 frame and set `scrolling="no"` so the generated slide does not show browser scrollbars inside the slide viewport.
- If HTML rendering fails, the UI must keep the `.pptx` download action visible and display a “preview unavailable, PPTX downloadable” state.
- QuickLook HTML must pass a visual health gate before Agent05 reports preview success.
- The first automated health gate must reject missing same-directory image/object/embed resources referenced by `Preview.html`, because those produce visible broken placeholders in the preview.
- The health gate must treat `img src="*.pdf"` as browser-unrenderable until the backend converts that PDF asset to a browser-safe raster image and rewrites `Preview.html` to point at the converted asset.
- The health gate must reject structurally blank QuickLook HTML that has neither slide nodes nor image-backed content.
- If an existing cached `visual_preview` fails the health gate, Agent05 must invalidate and regenerate it once instead of serving the stale broken preview as success.
- If regenerated output still fails the health gate, Agent05 must return the existing preview failure payload while keeping `.pptx` download available in the frontend.
- Cropping and fit regressions that require real rendered pixels remain covered by release browser QA until a deterministic renderer-level pixel gate is introduced.

## 2026-06-16 Phase Focus Contract

The previous desktop split still mixed three different task stages at the same visual priority:

1. Before generation: prompt and style/reference input.
2. During/after generation: generated PPT inspection and extracted text.
3. Later reuse: generated-history browsing.

The corrected workbench must be stage-focused. It should not show the full input console, result preview, and history list as three equal first-screen surfaces.

The stage model is:

```text
compose -> generating -> result -> history drawer -> result or compose
```

Rules:

- `compose` is the primary state when there is no loaded result. It shows the prompt/reference/page controls as the main surface and only exposes history through a compact action.
- `generating` keeps the input/progress as the main surface. It may show template candidates and progress, but it must not show stale result preview or history as competing content.
- `result` is the primary state when a completed deck is loaded or restored. It shows the PPT preview and download as the main surface. Input controls move behind a clear `新建 PPT` / `修改输入` action instead of staying open beside the result.
- `history` is an overlay/drawer state. It is entered from a compact history action and exits by selecting a file or closing the drawer. History must not be a permanent bottom strip in the main workbench.
- The stage itself must be announced through region labels so tests and assistive technology can distinguish `PPT 生成输入`, `PPT 生成进度`, `PPT 检查结果`, and `历史记录`.

## 2026-06-17 Narrow Stage State Contract

The workbench has one product stage, even though desktop and narrow layouts present that stage differently. `workspaceFocus` and the narrow top-level tab must not become independent sources of truth.

Rules:

- In narrow layout, clicking the top `历史记录` action must show the `历史` tab as the visible surface.
- In narrow layout, clicking `新建 PPT` must move the visible surface to the `生成` tab.
- In narrow layout, clicking `查看结果` must move the visible surface to the `预览` tab.
- Selecting a history record must load that deck, close history, and show the `预览` tab in narrow layout.
- When generation starts, narrow layout must show the `生成` tab so progress is visible.
- When generation completes, narrow layout must show the `预览` tab.
- Desktop remains overlay-based: `历史记录` opens a drawer, and `新建 PPT` / `查看结果` switch between compose and result focus without changing an invisible tab state.

History drawer controls:

- Desktop full-history drawer must expose an explicit `关闭` button in the drawer header.
- The compact history expansion control may be labeled `更多历史` only when it expands from a compact summary into a fuller list.
- When a panel is already showing complete history, the control must not still read `更多历史`; it must either be omitted or use a closing label.

## Single Slide Preview Contract

QuickLook's `Preview.html` is a multi-page HTML document containing multiple `div.slide` nodes. It also contains CSS declarations such as `top:28`, `left:-20`, `width:960`, and `height:540` without `px` units. Modern browser layout treats those unitless values as invalid in normal CSS contexts, which can collapse absolute layout into ordinary text flow and visually mix slide contents.

The Agent05 visual preview wrapper must therefore:

- Normalize unitless QuickLook positional and size declarations to `px` before displaying slides.
- Treat `.slide` as the page unit, not the entire `Preview.html` document.
- Display exactly one slide at a time inside the 16:9 preview stage.
- Mark every non-current slide `aria-hidden="true"` and the current slide `aria-hidden="false"` so the accessible DOM follows the single-slide visual model.
- Provide compact previous/next/page-count controls when multiple slides exist.
- Keep the displayed slide clipped to a 16:9 viewport. The preview frame must never scale the full multi-slide document as one giant page.
- Keep the QuickLook iframe's layout viewport at the measured slide width/height before applying transform scaling. The wrapper must not use internal stage padding or flex shrink behavior that narrows the iframe viewport first, because that clips the right side of the slide while leaving outer whitespace.
- Keep the `.pptx` download link visible even when preview rendering falls back.
- Stamp the generated wrapper with a `ppt-maker-visual-preview-wrapper` version marker.
- Rebuild stale or missing wrapper `index.html` files when either the `/visual-preview` API or the direct `/visual-preview/index.html` asset route is requested and a valid `Preview.html` already exists. Old history links must inherit wrapper fixes without requiring a new PPT generation.

## Reference Upload Contract

Reference upload is a compact input surface, while the prompt box remains the primary creative control.

- The upload control accepts multiple `.pptx`, `.pdf`, `.png`, `.jpg`, and `.jpeg` files.
- Selected files must show filename, semantic type, size, and available metadata such as pages, text character count, extracted palette, and extraction warnings.
- Backend API coverage must include PDF and image references and reject unsupported files with typed error details.
- Frontend upload failures must surface backend `detail` values, for example `unsupported_reference_type`, instead of only showing a generic failure message.

## History Contract

History must be reachable on the first screen.

Desktop behavior:

- Show the latest 3 generated records in a horizontal compact strip below the main two-column workbench.
- Each row shows mode chip, prompt prefix or fallback title, page count when available, and preview/download affordance.
- A "more history" control expands a drawer or full list.
- The history strip must not live inside the generation console on desktop.

Mobile/narrow behavior:

- History is its own tab.
- Latest generated record may also be summarized in the preview tab.

Backend file-list API remains unchanged. The existing frontend local history metadata map remains the source for prompt labels created in the browser.

## Footer Contract

The primary bottom bar should show the Agent05 model and capability configuration:

- `DeepSeek 中文生成`
- `codex-base 英文报告`
- `bge-m3 本地语义检索`
- `QuickLook 预览`
- `Gorden PPTX 构建`

The template disclaimer must not occupy the primary bottom bar. It may appear once as low-emphasis help text in settings, a tooltip, or a secondary note if required by the release wrapper.

## State Placement

| State | Desktop Placement | Narrow Placement |
|---|---|---|
| Empty prompt | console textarea | `生成` tab |
| Upload/reference analysis | console upload row | `生成` tab |
| Template selection | console runtime area | `生成` tab |
| Running progress | console runtime area | `生成` tab |
| Complete preview | result workspace | auto-switch to `预览` tab |
| Visual preview failure | result workspace with download still visible | `预览` tab |
| Quality gate error | console runtime area plus result tab | `生成` tab |
| Visual preview unavailable | preview failure state plus `质量门` tab note `渲染预览不可用` | `预览` tab |
| History | bottom compact strip, full drawer/list | `历史` tab |

## 2026-06-17 Text Extraction Disclosure Contract

Text extraction is a diagnostic aid, not the primary completed result. The primary completed result remains the visual PPT preview and download action.

Rules:

- The text extraction panel is collapsed by default.
- The text extraction entry point appears only when at least one slide has a meaningful extracted text fragment.
- If the machine extraction payload has slides but no meaningful text fragments, show a compact non-actionable status such as `未提取到可读文本` instead of an expandable empty panel.
- Opening text extraction must first show a bounded summary: slide count, slide number, title or first meaningful text, role when available, and extracted-fragment count.
- Full per-slide extracted text must stay behind a second explicit action such as `查看完整文本`.
- Long OCR/text fragments must not appear in the first expanded text panel state.
- The full text view may use its own scroll area, but it must not change the 16:9 preview frame size or create page-level overflow.

## 2026-06-17 Result Density Contract

The completed-result stage is an inspection surface. It must allocate available height to the 16:9 PPT canvas before secondary diagnostics.

Rules:

- The completed-result panel uses compact padding and gaps.
- The preview frame remains the dominant row and should receive all height not needed by the header and meaningful diagnostics.
- Empty diagnostics do not reserve a row.
- The download action remains visible in the header without forcing the preview canvas smaller than necessary.

## 2026-06-18 Max Preview Result Contract

The completed result page must be canvas-first. The generated PPT is the deliverable, so the result state must allocate the largest possible visible area to the 16:9 slide preview before showing secondary inspection details.

Rules:

- The result stage exposes `PPT 成品最大预览` as the primary region.
- The result preview must not be wrapped by a decorative card with extra padding, border, or panel shadow.
- Result actions belong in the compact top action rail: `新建 PPT`, `历史记录`, and `下载 .pptx`.
- The main preview row uses `minmax(0, 1fr)` and centers the 16:9 stage at the largest size that fits both available width and height.
- Text extraction, constraint verification, and reference-enhancement metadata are diagnostics. They render in a compact bottom rail and stay collapsed until the user opens the relevant item.
- Empty text extraction shows only a compact status and must not create a large empty panel.
- The QuickLook iframe still uses `scrolling="no"` and remains clipped by the 16:9 frame.

## 2026-06-17 Deterministic Constraint Verification Contract

Agent05 must not rely on an LLM statement to decide whether generated content obeyed user hard constraints. When the frontend has both the submitted prompt and machine-extracted slide text, it may run deterministic checks and show the result beside the completed preview.

Initial scope:

- Detect explicit page-level backup-only constraints such as `第 4/5 页只放备用`, `第4、5页只放"备用"`, or equivalent punctuation variants.
- For each constrained slide, pass only when the extracted title/bullets/text fragments are non-empty and every meaningful fragment equals `备用`.
- Fail when the constrained slide is missing or contains any non-`备用` text.
- Show a compact `约束核验` panel only when at least one deterministic constraint was detected.
- Mark undetected or ambiguous constraints as outside the deterministic checker rather than guessing.

Non-goals for this iteration:

- Do not ask an LLM to grade generated PPT quality.
- Do not implement broad semantic matching for arbitrary instructions.
- Do not block PPT download when constraints fail; the panel should make the issue visible and actionable.

## 2026-06-17 Compose Primary Action Visibility Contract

The compose state must always expose the primary generation action in the visible first-screen control area. Users must not have to scroll, resize, or collapse reference inputs to find the start button after entering a prompt and uploading reference files.

Rules:

- `Generate PPT` / `Cancel` and the page-count control must sit above the prompt textarea in the generation console.
- The prompt textarea may consume remaining height, but it must not push the primary action below a clipped `overflow-hidden` boundary.
- Reference upload metadata may grow inside its bounded queue, but it must not hide the primary action.
- The header action group may wrap on narrow widths, but the start button must remain before the prompt in DOM and visual order.
- Runtime decision surfaces such as template candidates, progress, quality errors, and backend-unavailable notices must sit above the prompt textarea. The prompt may be edited while waiting, but it must not hide the next required user action.
- During `selecting_template`, the visible workbench must show `模板选择` and selectable template cards without requiring scroll.

## Accessibility and Interaction

- Column split must not trap keyboard focus.
- Tab order should move from header to generation console, then result workspace.
- `Generate PPT` and `Cancel` keep clear accessible names.
- The preview iframe keeps a descriptive title.
- Narrow-layout tabs use semantic tab roles or equivalent accessible controls.
- Internal scroll areas must be reachable by keyboard and should not hide focused controls.

## Acceptance Criteria

Desktop:

- On a 1440px-wide effective content area, Prompt, Generate, PPT preview, and latest history strip are all visible without page scroll.
- On a compact 1280x720 browser viewport, the workbench, history strip, and model configuration bar fit within the viewport height without document scroll.
- The desktop generation console gives the prompt textarea more vertical space than the upload area.
- When multiple files are selected, the UI shows each file name and type without hiding the prompt textarea.
- The desktop history strip is outside the generation console.
- Opening `更多历史` on desktop uses an overlay/floating full-history list and must not resize the main preview row.

### Publishing Shell Contract

- The `/agent05` web publishing shell owns navigation, a compact product header, the embedded PPT Maker iframe, and the bottom model/capability configuration bar.
- The bottom bar must render `模型配置` and the configured Agent05 model/capability items.
- The bottom bar must not render the template commercial-use disclaimer.
- The shell must not expose backend URLs, frontend mount paths, or routing debug text.
- Shell changes must stay scoped to Agent05 and must not change other agent routes or shared framework layout.
- The desktop history strip owns a high stacking context; its full-history overlay must render above the recent-history strip and adjacent preview/generation layers.
- The completed visual preview renders inside a standard 16:9 PPT stage and must not introduce vertical page scroll.
- On a 1366px-class viewport with an outer platform sidebar, the PPT Maker console compresses before the preview becomes unusable.
- Below an effective content width of 960px, the layout switches to `生成 / 预览 / 历史` tabs.
- Header no longer shows backend URL or frontend mount path.
- The primary bottom bar shows model/capability configuration rather than the template disclaimer.
- Completed generation keeps the download button and visual preview visible in the first screen.

Narrow layout:

- `生成`, `预览`, and `历史` are reachable through top-level tabs.
- Generation completion switches to the `预览` tab.
- History no longer requires scrolling past prompt and preview content.

Regression:

- Mode A, reference-enhanced Mode A, and Mode B payload construction remain unchanged.
- Template candidate selection still works.
- Visual preview loading still works on generation complete and history preview.
- Quality gate errors remain readable and actionable.
- Persisted form and history metadata behavior remain unchanged.

## Test Plan

### Frontend Unit Tests

- Renders desktop workbench with generation console and result workspace regions.
- Does not render backend URL or frontend mount path in release header.
- Renders exactly one template disclaimer.
- Shows latest history records in a first-screen history summary.
- Mode B does not show a page-count selector; source deck count remains an internal edit-flow constraint.
- Reference-enhanced completion still renders the compact enhancement summary.
- Visual preview success renders the iframe and download link.
- Visual preview failure keeps the download link visible.
- Visual preview failure exposes `渲染预览不可用` in the quality/result detail area.

### Responsive Tests

- At wide desktop width, two-column layout is active.
- Below 960px effective content width, `生成 / 预览 / 历史` tabs are active.
- After a mocked generation completes in narrow layout, active tab becomes `预览`.

### Manual Browser Verification

- Open `http://127.0.0.1:3000/agent05/`.
- Verify no vertical page scroll is needed to see prompt, preview, and latest history on desktop.
- Run Mode A generation and confirm the preview remains the dominant completed-state surface.
- Upload `.pptx` and confirm Mode B controls fit in the console.
- Upload PDF/image reference and confirm reference metadata fits in the upload row.
- Confirm the footer disclaimer appears once.

## Open Implementation Notes

- Prefer CSS grid for the desktop workbench:

```text
grid-template-columns: minmax(300px, 380px) minmax(0, 1fr)
```

- Use `minmax(0, 1fr)` for the result workspace to prevent overflow-driven layout expansion.
- Avoid cards nested inside cards. Use sections and internal dividers.
- If the platform shell does not expose a content-height CSS variable, introduce an Agent05-local measurement or wrapper constraint before relying on viewport units.
