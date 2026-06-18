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
   - normalize common Mode A model-addressing drift before build:
     - if `selected_slides` is missing but `slot_id` values use Gorden prefixes such as `s7_...`, derive `selected_slides` from those prefixes in first-seen order
     - if `edits.json` is a top-level edits array, wrap it as `{"edits": [...], "selected_slides": [...]}` using the same slot-prefix derivation
     - if `slide` is an output index while `slot_id` identifies an original template slide such as `s5_...`, rewrite `slide` to that original template slide number
   - run `validate_edits` before build; invalid `edits.json` must fail fast and must not call `build_pptx.py`
   - `build_pptx.py <template.pptx> <edits.json> <output.pptx> --detail <detail.json> --strict`
     - if strict build reports deterministic `OVERFLOW` diagnostics, shorten the exact overflowing `new_text` in `edits.json` and retry build once
   - `pptx_analyzer.py --mode extract <output.pptx> --output <machine_extracted.json>`
   - `render_slides.py <output.pptx> <rendered/>` only when render dependencies are available
6. Server sends `complete` with `file_name`, `file_id`, `preview`, and `task_dir`.

## Error and Cancellation Contract

All subprocess failures surface as WebSocket `error` messages with stdout/stderr included in the message. Invalid `edits.json` fails before build with the `validate_edits` payload so the UI can surface the actual model-output contract violation without wasting a build attempt. A single deterministic overflow repair pass is allowed because the failing slot, slide, capacity, and text are all emitted by `build_pptx.py --strict`; after that retry, any remaining failure surfaces as-is.

Cancellation sends SIGTERM to the active subprocess, waits 5 seconds, then sends SIGKILL if needed. The task manager resets after completion, error, timeout, or cancellation.

## Concurrency

Only one task is active per backend process. A second `generate` request receives:

```json
{"type": "error", "message": "task_in_progress"}
```

`GET /api/generate/status` returns the active stage and message while work is running.
