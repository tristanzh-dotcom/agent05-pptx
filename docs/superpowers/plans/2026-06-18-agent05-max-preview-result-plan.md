# Agent05 Max Preview Result Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Agent05 completed-result page prioritize the largest possible visible PPT preview canvas.

**Architecture:** Replace the completed-result card with a canvas-first result component. Keep existing data flow and visual preview iframe; only change result layout, diagnostics placement, tests, and SDD.

**Tech Stack:** React, TypeScript, Tailwind CSS classes, Vitest + Testing Library, Playwright browser verification.

---

### Task 1: Result Layout Tests

**Files:**
- Modify: `frontend/src/App.test.tsx`

- [ ] **Step 1: Write failing tests**

Add tests that assert completed state uses `PPT 成品最大预览`, has a compact action rail, keeps diagnostics collapsed, and no longer depends on card padding for density.

- [ ] **Step 2: Run RED**

Run: `npm test -- --run src/App.test.tsx`

Expected: FAIL because the current result component is still labeled `PPT 成品预览` and renders the old dense card.

### Task 2: Canvas-First Result Component

**Files:**
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Implement minimal code**

Refactor `PreviewPanel` into a canvas-first result layout:
- action rail row;
- `minmax(0,1fr)` preview row;
- collapsed diagnostics rail;
- reuse existing download URL, iframe URL, constraint check, text extraction, and failure states.

- [ ] **Step 2: Run GREEN**

Run: `npm test -- --run src/App.test.tsx`

Expected: PASS.

### Task 3: SDD Contract

**Files:**
- Modify: `docs/sdd/ppt-maker-web-workbench-layout.md`

- [ ] **Step 1: Update design contract**

Add a result-canvas-first contract stating that result state allocates height to preview before diagnostics and keeps diagnostics collapsed by default.

### Task 4: Verification

**Files:**
- No source edits expected.

- [ ] **Step 1: Run full verification**

Run:

```bash
npm test -- --run src/App.test.tsx
npm run build
python3 -m pytest backend/tests -q
./scripts/agent05_release_smoke.sh
```

- [ ] **Step 2: Browser measure**

Open `http://127.0.0.1:3000/agent05`, wait for latest completed result, screenshot the page, and measure:
- workbench iframe size;
- max preview region size;
- preview stage size;
- QuickLook iframe width/height.

Expected: the preview stage should consume materially more of the result page than the previous card layout, and no right-side clipping should return.
