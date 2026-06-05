# PPT Maker Web Edits Quality Gate SDD

## Scope

This slice adds a deterministic `edits.json` quality gate to the subprocess generation chain. It validates the file produced by opencode before the generated PPTX is accepted by the backend. It does not modify opencode, opencode permissions, or any files under `/Users/tristanzh/agent/.ai_skills/gorden-ppt-skill/`.

The quality gate lives in `backend/app/services/validate_edits.py` and is called by `SubprocessGenerationRunner` after `build_pptx.py` succeeds and before preview extraction is returned to the WebSocket client.

## Rule 1: Page Count Bound

`selected_slides` must be a non-empty list of positive integers.

Let:

- `requested = page_count`
- `selected = len(selected_slides)`
- `soft_limit = requested + 1`

Outcomes:

- `selected <= requested`: valid, no warning.
- `selected == requested + 1`: valid with warning `"selected_slides length {selected} exceeds requested page_count {requested} by 1"`.
- `selected > requested + 1`: invalid with error `"selected_slides length {selected} exceeds requested page_count {requested}"`.

The `+1` tolerance exists for cover or closing pages. It is not allowed to grow beyond one page.

## Rule 2: Placeholder Text Rejection

Every `edits[].new_text` must be real generated content. It must not contain any of these placeholder patterns, matched case-insensitively for Latin text:

- `Question 1`
- `Question 2`
- `Question 3`
- `Vivamus`
- `Lorem ipsum`
- `dolor sit amet`
- `Key Words Here`
- `项目名称`
- `请输入标题`
- `请输入内容`
- `请在此输入`
- `点击此处`
- `Your Title Here`
- `Add Your Text`
- `项目概述`
- `此处添加`
- `请替换`

Each match returns an error including the slide, slot id, and matched placeholder:

```json
{
  "valid": false,
  "errors": [
    "slide 1 slot cover_title_cn new_text matches placeholder pattern: 项目名称"
  ]
}
```

## Rule 3: Edits Schema

The gate validates only the minimum schema required by `build_pptx.py`:

- Root payload must be an object.
- `selected_slides` must exist, must be a non-empty array, and every item must be a positive integer.
- `edits` must exist and must be an array.
- Every edit must be an object containing:
  - `slide`: integer
  - `slot_id`: string
  - `new_text`: string
- The same `(slide, slot_id)` pair must not appear more than once.

Schema violations are collected and returned together. Examples:

```json
{
  "valid": false,
  "errors": [
    "selected_slides empty",
    "edits[0] missing required field: slot_id"
  ]
}
```

## validate_edits.py Contract

Function:

```python
def validate_edits(edits_json: dict, page_count: int) -> dict:
    """
    Returns:
        {"valid": True, "warnings": [...]}
        {"valid": False, "errors": [...], "warnings": [...]}
    """
```

Input:

- `edits_json`: parsed `edits.json` dict from opencode.
- `page_count`: user-requested page count from `GenerationRequest`.

Output:

- `valid`: boolean.
- `errors`: present when validation fails.
- `warnings`: always present; empty when no tolerance boundary is used.

The function is pure: it does not read or write files and does not call subprocesses.

## Runner Integration

`SubprocessGenerationRunner.run()` reads `edits.json` after `build_pptx.py` completes. It calls `validate_edits(edits_content, request.page_count)`. If validation fails, it raises `GenerationError(json.dumps(check, ensure_ascii=False))` so the WebSocket error payload carries machine-readable diagnostics.

The quality gate runs before `pptx_analyzer.py` and before optional rendering, preventing invalid output from being surfaced as a completed generation.

The opencode subprocess is invoked with `opencode run --dir <work_dir> <prompt>`. This is required because opencode may otherwise detect the parent project directory and write `edits.json` outside the task work directory. The runner reads only `<work_dir>/edits.json`.

The prompt uses task-local paths only. `output_edits_json` is `./edits.json`; absolute project paths are not embedded in opencode input because they can trigger non-interactive external-directory permission prompts.

## Orchestration Prompt Strengthening

`_write_orchestration_prompt()` appends hard constraints to the opencode prompt:

```text
## 硬性约束 (违反以下任一规则将导致产出被拒绝)

1. selected_slides 长度不得超过 {page_count + 1}。如果你选了过多页面，优先去掉内容最弱的页。
2. 不得输出以下占位文案：Question 1, Question 2, Vivamus, Lorem ipsum, 项目名称, 请输入标题, 请输入内容, Your Title Here, 项目概述
3. 每个幻灯片的每一个可编辑 text slot 都必须用真实内容填充，不得保留模板原文字。
4. edits 数组的每个元素必须包含 slide (整数), slot_id (字符串), new_text (字符串)。
```

Prompt strengthening reduces invalid outputs but is not trusted as enforcement. `validate_edits.py` is the source of truth.

The prompt also states that the final JSON must be written to task-local `./edits.json` and must not be written outside the current task work directory.
