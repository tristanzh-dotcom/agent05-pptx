# Agent05 Release Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish Agent05 PPT Maker as a stable local Web workbench where users can generate, inspect, download, and reuse PPTX outputs without understanding backend ports or internal model plumbing.

**Architecture:** Keep `/Users/tristanzh/agent/web` as the shared visible publishing shell and `/Users/tristanzh/agent/PPT-maker` as the business implementation root. The Agent05 route owns only Agent05-specific UI, proxy, and layout contracts; generation, reference analysis, quality gates, and preview remain in the PPT Maker backend/frontend.

**Tech Stack:** FastAPI backend on Agent05 port, React/Vite frontend embedded through `/agent05/index.html`, Node web publishing service on `127.0.0.1:3000`, Vitest, Pytest, Node test runner, Puppeteer/browser layout checks.

---

## Remaining Steps

### Task 1: Runtime Port Reliability

**Files:**
- Modify: `/Users/tristanzh/agent/PPT-maker/docs/sdd/ppt-maker-web-workbench-layout.md`
- Modify or create after SDD: backend/web runtime health scripts or launch docs
- Test: `/Users/tristanzh/agent/web/tests/agent05-service.test.mjs`

- [x] Define the final Agent05 backend port contract: Agent05 backend remains on `8000` for the current release path; migration to `8005` is reserved for agent00 port-governance SDD/TDD.
- [x] Add a health preflight test proving `/api/agent05/status` tells the user whether the backend is missing before the embedded iframe shows raw proxy JSON.
- [x] Add a user-facing empty/error state in Agent05 for `backend.available === false`.
- [x] Verify: stop backend, reload `/agent05`, confirm no raw `ECONNREFUSED` JSON appears in the workbench.

### Task 2: Completion-State UX

**Files:**
- Modify: `/Users/tristanzh/agent/PPT-maker/frontend/src/usePptGeneration.ts`
- Modify: `/Users/tristanzh/agent/PPT-maker/frontend/src/App.tsx`
- Test: `/Users/tristanzh/agent/PPT-maker/frontend/src/App.test.tsx`

- [x] Write tests for initial latest-file restoration, running-state restoration, failed-preview fallback, and no-history empty state.
- [x] Ensure completed tasks default to preview/download, not an empty generation form.
- [x] Ensure running tasks show a clear progress state and do not imply the user must click Generate again.
- [x] Verify: `npm test -- --run src/App.test.tsx` and browser reload with existing outputs.

### Task 3: Preview Quality and Aspect Ratio

**Files:**
- Modify: `/Users/tristanzh/agent/PPT-maker/frontend/src/App.tsx`
- Modify if needed: backend visual preview service
- Test: frontend preview tests and one browser layout test

- [x] Lock the preview canvas to standard PPT 16:9.
- [x] Prevent nested page scrollbars inside the preview frame unless the QuickLook HTML itself needs internal navigation.
- [x] Add a clear “preview unavailable, PPTX downloadable” state.
- [x] Verify with browser screenshot/geometry on laptop-size and narrow-size viewports.

### Task 4: History Model Cleanup

**Files:**
- Modify: `/Users/tristanzh/agent/PPT-maker/frontend/src/App.tsx`
- Potentially modify: backend files API if frontend localStorage proves insufficient
- Test: `/Users/tristanzh/agent/PPT-maker/frontend/src/App.test.tsx`

- [x] Decide whether history prompt metadata remains browser localStorage or moves to backend task metadata.
- [x] If localStorage remains, mark old records as fallback `生成记录` but keep new records prompt-aware.
- [x] Make “更多历史” a bounded drawer/list, never a second page stacked under recent history.
- [x] Verify delete, preview, download, and prompt labels after reload.

### Task 5: Reference Upload Robustness

**Files:**
- Modify: `/Users/tristanzh/agent/PPT-maker/backend/app/routers/references.py`
- Modify: `/Users/tristanzh/agent/PPT-maker/backend/app/services/reference_analyzer.py`
- Modify: `/Users/tristanzh/agent/PPT-maker/frontend/src/App.tsx`
- Test: backend reference tests and frontend upload tests

- [x] Add backend tests for `.png`, `.jpg`, `.pdf`, and multi-file upload behavior.
- [x] Ensure selected files show filename, semantic type, size, pages/text/color metadata where available.
- [x] Replace generic “文件上传或分析失败” with typed failure reasons.
- [x] Verify with an actual PNG upload through browser or API.

### Task 6: Generation Content Contract

**Files:**
- Modify: `/Users/tristanzh/agent/PPT-maker/backend/app/services/generation.py`
- Test: `/Users/tristanzh/agent/PPT-maker/backend/tests/test_generation_step3.py`

- [x] Preserve user constraints such as “第 4/5 页只放备用标题”.
- [x] Add tests for page-specific empty/backup slide instructions.
- [x] Add tests preventing LLM-expanded content from overriding explicit user structure.
- [x] Verify generated PPTX slide text matches requested page count and page-specific intent.

### Task 7: Release Smoke Test Script

**Files:**
- Create: `/Users/tristanzh/agent/PPT-maker/scripts/agent05_release_smoke.sh`
- Test: run script locally

- [x] Check 3000 publishing service.
- [x] Check Agent05 backend health.
- [x] Check `/agent05/index.html` loads.
- [x] Check generate status and file list endpoints.
- [x] Print actionable remediation when 8000/8005 is down.

### Task 8: Final Acceptance and Handoff

**Files:**
- Modify or create: `/Users/tristanzh/agent/PPT-maker/HANDOVER_agent05_pptmaker_release_20260605.md`
- Modify or create: release QA note under `/Users/tristanzh/agent/PPT-maker/docs/`

- [x] Run backend tests: `python3 -m pytest backend/tests -q`.
- [x] Run frontend tests: `npm test -- --run`.
- [x] Run frontend build: `npm run build`.
- [x] Run web Agent05 tests: `node --test tests/agent05-service.test.mjs tests/agent05-browser-layout.test.mjs`.
- [x] Perform browser acceptance: inspect restored generated PPT, verify real PNG upload through the proxied API, and open history. New LLM generation content quality remains the final TZ manual test.
- [x] Record unresolved risks: visual renderer dependencies, backend port ownership, old history metadata quality.

## Milestone Count

The remaining work should be treated as **8 implementation tasks** across **4 release milestones**:

1. Runtime reliability: Task 1 and Task 7.
2. Workbench UX completion: Task 2, Task 3, Task 4.
3. Generation correctness: Task 5 and Task 6.
4. Release acceptance: Task 8.

## Current Priority

Start with Task 1. The current screenshot shows raw proxy failure because the backend port is down, so runtime reliability blocks meaningful UX validation.
