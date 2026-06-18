# Agent05 Web Publishing Change Archive - 2026-06-17

## Scope

This archive is only for the shared web publishing workflow in:

`/Users/tristanzh/agent/web`

It intentionally excludes PPT-maker business logic, backend generation logic, frontend React workflow changes, and generated PPT artifacts.

## Web Files To Carry Forward

Relevant Agent05 web publishing files:

- `/Users/tristanzh/agent/web/server.mjs`
- `/Users/tristanzh/agent/web/app/agent05.css`
- `/Users/tristanzh/agent/web/tests/agent05-service.test.mjs`
- `/Users/tristanzh/agent/web/tests/agent05-browser-layout.test.mjs`

Do not infer scope from the full `/Users/tristanzh/agent/web` working tree. That tree currently contains many unrelated Agent02, Agent03, Agent07, platform, ops, and theme changes.

## Publishing Behavior Changes

### Agent05 Shell Layout

Agent05 route shell is now bounded to the visible publishing viewport:

- `.agent05-page .ka-shell` uses `height: 100vh`.
- `.agent05-reference-cockpit` uses a three-row grid: compact header, flexible iframe region, compact footer.
- Outer Agent05 shell uses `overflow: hidden`; scrolling responsibility stays inside embedded Agent05/PPT-maker panels.
- Standard laptop viewport test target is `1280 x 874`.

Reason: avoid wasting vertical space, avoid document-level scrolling, and keep the embedded PPT Maker workbench usable inside the shared publishing shell.

### Footer Copy

The old footer disclaimer is removed:

`内置模板仅供个人学习，企业商用请替换自定义模板`

Agent05 footer now displays model/runtime capability status:

- `模型配置`
- `DeepSeek 中文生成`
- `codex-base 英文报告`
- `bge-m3 本地语义检索`
- `QuickLook 预览`
- `Gorden PPTX 构建`

This is a route-level Agent05 publishing surface change, not a global platform footer pattern.

### Agent05 Status Probe

`/api/agent05/status` now accepts both PPT Maker health identities:

- legacy: `{ ok: true, service: "ppt-maker" }`
- current: `{ schema: "ppt-maker-web-health/v1", status: "ok" }`

When healthy, the status payload reports:

- `backend.available: true`
- `backend.identity: "ppt-maker"`
- `backend.healthPath: "/api/health"`

When unreachable, it reports unavailable status without treating the publishing shell itself as failed.

### Agent05 Notes

`agent05Status(...).notes` is now an empty array.

The removed template disclaimer must not reappear through status notes or shell footer copy.

### Visual Preview Backend-Unavailable HTML

Agent05 visual-preview iframe proxy requests now return an HTML unavailable state when the PPT Maker backend is unreachable.

Affected request shape:

- route begins with `/agent05/api/...`
- path includes `/visual-preview/`
- target is `.html` or request `Accept` includes `text/html`

Response behavior:

- HTTP `502`
- `content-type: text/html; charset=utf-8`
- visible text includes `PPT Maker 后端未启动`
- visible text includes `预览暂时不可用`
- does not expose raw upstream JSON, `ECONNREFUSED`, or `"upstream"` details inside the iframe.

## Tests Updated

Relevant web tests:

```bash
cd /Users/tristanzh/agent/web
node --test tests/agent05-service.test.mjs tests/agent05-browser-layout.test.mjs
```

Latest result:

```text
10 passed
```

The tests assert:

- Agent05 route shell renders inside the shared platform.
- Agent05 shell includes the model configuration footer.
- Agent05 shell does not include the old template disclaimer.
- current PPT Maker health schema is accepted.
- unreachable backend is represented as unavailable.
- HTML visual-preview iframe requests receive a user-facing unavailable page.
- standard laptop viewport is bounded without document-level scroll.
- iframe remains tall enough for PPT Maker workbench use.

## Smoke Verification From PPT-maker

With `/Users/tristanzh/agent/web` listening on `127.0.0.1:3000` and PPT Maker backend listening on `127.0.0.1:8000`:

```bash
cd /Users/tristanzh/agent/PPT-maker
./scripts/agent05_release_smoke.sh
```

Latest result:

```text
Agent05 release smoke passed.
```

## Explicit Non-Scope

Do not include these in the web workflow handoff as Agent05 publishing changes:

- `/Users/tristanzh/agent/PPT-maker/backend/**`
- `/Users/tristanzh/agent/PPT-maker/frontend/**`
- `/Users/tristanzh/agent/PPT-maker/docs/sdd/**`
- generated PPT files under `work/ppt-maker/**`
- unrelated `/Users/tristanzh/agent/web` changes for Agent02, Agent03, Agent04, Agent07, platform home, ops, or shared theme governance.

## Handoff Note For Web Workflow

The web workflow should inherit only the Agent05 route-level publishing deltas above. If broader web visual-system work later edits the same files, it should preserve:

- no return of the template disclaimer;
- Agent05 model configuration footer;
- bounded route shell and compact iframe layout;
- current PPT Maker health schema support;
- HTML fallback for visual-preview iframe proxy failures.
