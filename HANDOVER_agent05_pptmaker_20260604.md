### ☀️ 次日启动胶囊 (Boot Prompt)
请在明天开启新对话时，直接复制以下指令发给系统：

```text
请静默读取并完全理解当前目录下的 `HANDOVER_agent05_pptmaker_20260604.md`。
1. 请将本对话的逻辑分支锁定为：【Agent05 PPT Maker 发布】，并在你回复的第一句话使用 Markdown 的 H1 标题 (`# Agent05 PPT Maker 发布 工作流重启`) 输出，以便系统自动重命名此对话。
2. 在执行任何操作前，请简要复述当前的【核心卡点】与【下一步行动】。等待我的确认后，再开始执行。
```

## 第一性原理与项目上下文

本轮目标是把 `ppt-maker` 这个 opencode agent 编排 skill 做成本地 B/S Web 应用，并作为已有 Web 平台右侧内容区发布到 Agent05。

核心原则：

- `ppt-maker` 不是 Python 库，后端必须通过 subprocess 调用校验、分析、构建、渲染脚本，并通过 opencode CLI 做 AI 编排。
- 前端必须使用 React + Vite + Tailwind，并通过平台 CSS 变量继承主题，不能硬编码视觉 token。
- 发布入口必须是平台统一端口 `http://127.0.0.1:3000/agent05`，而不是单独 Vite 端口。
- 平台左侧导航属于 shared shell，只能新增 Agent05 发布入口，不能重写 sidebar 范式。

## 今日完成事项

PPT-maker 项目内完成：

- `backend/app/`：实现 FastAPI 基础框架、Files API、Templates API、Health API、Generation status/cancel、WebSocket `/ws/generate`。
- `backend/app/services/generation.py`：实现生成任务 runner、模板候选、模板选择超时 fallback、subprocess 链、cancel/timeout 终止链。
- `backend/app/services/tasks.py`：实现单任务并发锁与状态快照。
- `frontend/src/`：实现 Prompt 输入区、模板横幅、进度 stepper、预览区、历史文件列表、WebSocket hook、Axios API 层。
- `frontend/vite.config.ts`：配置 base `/agent05/`，dev 端口 3000，代理 `/agent05/api` 和 `/agent05/ws`。
- `frontend/src/api.ts`、`frontend/src/usePptGeneration.ts`：统一使用 `/agent05` 前缀，并补 `socket.onerror`。
- `requirements.txt`：新增 Python 依赖清单，固定 `uvicorn[standard]`，解决真实 WebSocket 运行时缺少 `websockets/wsproto` 的问题。
- `docs/sdd/`：保留 Step 1-4 SDD 文档。

Web 平台项目 `/Users/tristanzh/agent/web` 内完成：

- `docs/agents/agent05-publishing-config.md`：新增 Agent05 发布配置，满足 No Agent Publishing Without Config。
- `config/agents/agent05.contract.json`：新增 Agent05 machine-readable boundary contract。
- `server.mjs`：新增 `/agent05` 平台壳、`/agent05/index.html` 静态 React 前端服务、`/agent05/api/*` HTTP 代理、`/agent05/ws/*` WebSocket upgrade 代理、`/api/agent05/status`。
- `app/agent05.css`：新增 Agent05 scoped CSS，仅使用平台变量，不触碰 `.ka-sidebar`。
- `tests/agent05-service.test.mjs`：新增 Agent05 路由、静态前端、HTTP 代理、WebSocket upgrade 代理测试。
- 更新平台契约测试，使 Agent05 纳入 active/published agent 列表。

运行态：

- 平台服务运行在 `127.0.0.1:3000`，PID `48233`。
- PPT-maker FastAPI 后端运行在 `127.0.0.1:8000`，PID `52622`。
- 访问入口：`http://127.0.0.1:3000/agent05`。

已验证：

- `/Users/tristanzh/agent/web`: `npm test` -> 114 passed。
- `/Users/tristanzh/agent/PPT-maker`: `python3 -m pytest -q` -> 18 passed。
- `/Users/tristanzh/agent/PPT-maker/frontend`: `npm run build` -> passed。
- `/Users/tristanzh/agent/PPT-maker/frontend`: `npm test -- --run` -> 8 passed。
- Puppeteer 实测 `http://127.0.0.1:3000/agent05`：sidebar active 为 `PPT生成`，iframe 加载 `/agent05/index.html`，Prompt textarea 和 `Generate PPT` 可见，主题变量映射正常。
- WebSocket 实测：
  - `ws://127.0.0.1:8000/ws/generate` open。
  - `ws://127.0.0.1:3000/agent05/ws/generate` open。

## 已作出的关键决策

- 放弃把 Vite 直接跑在 `3000`：端口 3000 已由平台 `/Users/tristanzh/agent/web/server.mjs` 占用，正确做法是平台壳发布 `/agent05`。
- 采用平台壳 + iframe 嵌入 React dist：保留平台 sidebar 与发布中心范式，同时让 PPT-maker 前端保持独立构建。
- `/agent05/api/*` 走平台代理到 FastAPI `/api/*`：前端保持同源路径，避免跨域复杂度。
- `/agent05/ws/*` 走平台原生 TCP upgrade 代理到 FastAPI `/ws/*`：满足同源 WebSocket 协议。
- FastAPI 仍监听 `8000`：平台统一入口在 `3000`，后端作为内部本地服务。
- 新增 `requirements.txt`：没有 WebSocket runtime 支持时，Uvicorn 会把 upgrade 当普通 HTTP 返回 404；必须固化 `uvicorn[standard]`。
- Agent05 CSS 只写 `.agent05-*` 范围：遵守 shared sidebar 不修改、主题 token 继承规则。

## 未解决的风险/报错

- `render_dependencies_available` 当前为 `false`，Health API 显示 QA 仍是 `structural_only`，视觉渲染预览依赖还未补齐。
- “换一批”模板按钮仍是低优先级 gap：后端还没有实现 `select_more` WebSocket 事件，前端按钮尚未接真实 handler。
- Step 3 审计提到 `opencode_bin` 仍有本机路径/环境覆盖风险，后续应配置化。
- opencode 编排 prompt 还不够结构化，`edits.json` schema 约束可继续强化。
- 尚未做真实 2-5 分钟完整 PPT 生成端到端人工验收；当前测试覆盖协议、subprocess fake/integration、前端 UI、平台发布与 WebSocket open。
- `/Users/tristanzh/agent/web` 工作区本来已有大量非 Agent05 变更和历史 handover 文件，不属于本轮新增内容；不要误回滚。

## 下一步行动

建议明天第一步：

1. 打开 `http://127.0.0.1:3000/agent05`，用一个短 prompt 做真实生成冒烟测试。
2. 同时观察后端日志：
   ```bash
   lsof -nP -iTCP:3000 -sTCP:LISTEN
   lsof -nP -iTCP:8000 -sTCP:LISTEN
   ```
3. 如需重启后端：
   ```bash
   cd /Users/tristanzh/agent/PPT-maker
   python3 -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
   ```
4. 如需回归验证：
   ```bash
   cd /Users/tristanzh/agent/PPT-maker
   python3 -m pytest -q
   cd frontend && npm test -- --run && npm run build
   cd /Users/tristanzh/agent/web
   npm test
   ```
5. 若真实生成通过，优先补 Step 3/4 剩余 gap：
   - WebSocket `select_more` 协议与前端“换一批”按钮。
   - opencode 路径与 prompt schema 配置化。
   - 渲染依赖与视觉预览链路。
