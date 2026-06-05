# PPT Maker Web Step 3 SDD

## Scope

Step 3 wires the generation WebSocket to a cancellable singleton task manager and a subprocess-backed generation runner. The frontend protocol becomes usable for long tasks: `generate` starts one task, `select_template` resolves the template wait point, and `cancel` or `POST /api/generate/cancel` requests termination.

The runner calls real local tools by default, but tests inject deterministic fake runners and fake scripts. AI quality is not asserted in this slice; the contract is process orchestration, status propagation, cancellation, work-directory isolation, and error surfacing.

## Task Lifecycle

1. `generate` validates that no task is active.
2. Server creates `work/ppt-maker/YYYYMMDD-HHMMSS_<task_id>/`.
3. Server sends `selecting_template` with up to 3 template candidates.
4. Server waits for `select_template`; if no selection arrives within the configured timeout, it uses the best candidate.
5. Runner executes:
   - `validate_ppt_request.py --mode prompt_to_ppt`
   - `opencode run <orchestration prompt>` in the task directory, expected to write `edits.json`
   - `build_pptx.py <template.pptx> <edits.json> <output.pptx> --detail <detail.json> --strict`
   - `pptx_analyzer.py --mode extract <output.pptx> --output <machine_extracted.json>`
   - `render_slides.py <output.pptx> <rendered/>` only when render dependencies are available
6. Server sends `complete` with `file_name`, `file_id`, `preview`, and `task_dir`.

## Error and Cancellation Contract

All subprocess failures surface as WebSocket `error` messages with stdout/stderr included in the message. `build_pptx.py --strict` failures are not normalized because the frontend must display exact out-of-box and incompatibility diagnostics.

Cancellation sends SIGTERM to the active subprocess, waits 5 seconds, then sends SIGKILL if needed. The task manager resets after completion, error, timeout, or cancellation.

## Concurrency

Only one task is active per backend process. A second `generate` request receives:

```json
{"type": "error", "message": "task_in_progress"}
```

`GET /api/generate/status` returns the active stage and message while work is running.
