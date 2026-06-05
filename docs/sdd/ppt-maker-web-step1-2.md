# PPT Maker Web Step 1-2 SDD

## Scope

This slice creates the project layout and a FastAPI backend skeleton for the local B/S interface around the installed `ppt-maker` skill. It deliberately stops before AI orchestration and real PPT generation. The generation pipeline will be connected in step 3.

## Directory Tree

```text
/Users/tristanzh/agent/PPT-maker/
├── backend/
│   ├── app/
│   │   ├── __init__.py
│   │   ├── config.py
│   │   ├── main.py
│   │   ├── models.py
│   │   ├── routers/
│   │   │   ├── __init__.py
│   │   │   ├── files.py
│   │   │   ├── generation.py
│   │   │   ├── health.py
│   │   │   └── templates.py
│   │   └── services/
│   │       ├── __init__.py
│   │       ├── files.py
│   │       ├── tasks.py
│   │       └── templates.py
│   └── tests/
│       ├── conftest.py
│       └── test_api_skeleton.py
├── docs/
│   └── sdd/
│       └── ppt-maker-web-step1-2.md
└── work/
    └── ppt-maker/
```

## Interface Contract

`GET /api/health`
: Returns environment status from `ppt-maker/scripts/validate_ppt_request.py`, plus `python_pptx_available`, `render_dependencies_available`, and `qa_mode`.

`GET /api/templates`
: Parses `gorden-ppt-skill/templates/INDEX.md` and returns the 19 built-in templates with `slug`, `name`, `page_count`, `primary_color`, `description`, and `preview_url`.

`POST /api/templates/upload`
: Accepts one `.pptx` file as multipart form data. Rejects non-PPTX files and files over `max_upload_bytes` (50 MB by default). Stores uploads under `work/ppt-maker/uploads/`.

`GET /api/files`
: Scans `work/ppt-maker/*/` for `.pptx` outputs. Returns newest first with `file_id`, `file_name`, `generated_at`, `page_count`, `task_dir`, and `has_preview`.

`GET /api/files/{file_id:path}/download`
: Streams a `.pptx` inside `work/ppt-maker/`. `file_id` is a relative path like `20260603-211700_abcd/output.pptx`.

`GET /api/files/{file_id:path}/preview`
: Returns the sibling `machine_extracted.json` for the selected PPTX.

`DELETE /api/files/{file_id:path}`
: Deletes a generated `.pptx` and its sibling `machine_extracted.json` inside `work/ppt-maker/`.

`GET /api/generate/status`
: Returns the current singleton task state. Initial state is `{"in_progress": false}`.

`POST /api/generate/cancel`
: Cancels the current singleton task when present. In this slice no subprocess is started yet, so no-task returns `{"cancelled": false, "message": "no_task_in_progress"}`.

`WebSocket /ws/generate`
: Accepts `generate`, `select_template`, and `cancel` events. In this slice it validates protocol shape and returns a clear `generation_pipeline_not_implemented` error for `generate`.

## Safety Rules

All file access is resolved beneath `{project_root}/work/ppt-maker/`. Relative paths containing `..`, absolute paths, non-PPTX downloads, or preview lookups outside the work root are rejected. Uploads are capped at 50 MB by default and use sanitized basenames.

## TDD Targets

The test suite covers health, template index parsing, uploads, file listing, preview/download path isolation, status/cancel behavior, and WebSocket protocol skeleton behavior before production code is written.
