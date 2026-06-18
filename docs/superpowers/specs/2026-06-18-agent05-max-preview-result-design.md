# Agent05 Max Preview Result Design

## Goal

Redesign the Agent05 completed-result state so the generated PPT is the dominant inspection surface. The result page must maximize the visible 16:9 slide canvas before allocating space to secondary diagnostics.

## First-Principles Decision

The completed PPT is the user-visible deliverable. In result state, every pixel not required for navigation or download should be available to the PPT preview. Text extraction, constraint checks, and enhancement metadata are diagnostics; they must not shrink the slide by default.

## Layout

- Result state renders a `PPT 成品最大预览` region.
- The result workspace uses three rows:
  - compact action rail: title/status, `新建 PPT`, `历史记录`, and `下载 .pptx`;
  - main preview canvas: `minmax(0, 1fr)` and centered 16:9 stage;
  - collapsed diagnostics rail: only visible when there is meaningful text, constraint output, enhancement metadata, or an empty-text status.
- The previous card-style `PPT 成品预览` panel must not wrap the result preview with extra card padding, border, or shadow.
- The preview stage remains standard 16:9 and uses the existing `.ppt-preview-stage-frame` sizing rule so it chooses the largest size that fits available width and height.
- The QuickLook iframe keeps `scrolling="no"`.

## Diagnostics

- Diagnostics are collapsed by default.
- The collapsed rail uses compact buttons/status chips.
- Opening diagnostics reveals bounded content below the preview without changing page-level scroll.
- Text extraction remains hidden when there are no meaningful text fragments; empty extraction shows only a compact status.
- Constraint verification remains visible as a diagnostic entry when deterministic constraints are detected.

## Scope

In scope:
- `frontend/src/App.tsx`
- `frontend/src/App.test.tsx`
- `docs/sdd/ppt-maker-web-workbench-layout.md`
- browser verification against `/agent05`

Out of scope:
- shared `/Users/tristanzh/agent/web` shell changes;
- backend generation or QuickLook wrapper changes;
- fixing generated PPT content overlap inside the slide.

## Acceptance Criteria

- A completed deck restores into a result workspace whose accessible label is `PPT 成品最大预览`.
- The result workspace uses a compact action rail and does not render the previous card chrome.
- The preview frame remains 16:9, iframe-based, and scrollbar-free.
- Diagnostics are collapsed by default and do not occupy the main preview row.
- Existing result actions still work: download, new PPT, history, text extraction, constraint verification.
- Frontend tests, backend tests, build, release smoke, and browser measurement pass.
