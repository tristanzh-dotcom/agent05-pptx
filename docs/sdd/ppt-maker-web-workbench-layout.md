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
- Render only one template disclaimer.
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
   - page count selector or `页数保留源文件`
   - `Generate PPT` / `Cancel`
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
effective platform content width < 960px
```

This value is an implementation starting point, not a product invariant. It may be tuned after browser verification, but tests should lock the initial behavior so future changes are deliberate.

```text
生成 | 预览 | 历史
```

Rules:

- Default tab is `生成`.
- After generation completes, switch to `预览`.
- History remains one tap away and does not live below a long vertical stack.
- Existing generation state restoration still works after remount.

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
- Mode B still shows `页数保留源文件`.
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
