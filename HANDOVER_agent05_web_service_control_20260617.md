### ☀️ 次日启动胶囊 (Boot Prompt)
请在明天开启新对话时，直接复制以下指令发给系统：

```text
请静默读取并完全理解当前目录下的 `HANDOVER_agent05_web_service_control_20260617.md`。
1. 请将本对话的逻辑分支锁定为：【Agent05 后端服务控制接入 Web 发布】，并在你回复的第一句话使用 Markdown 的 H1 标题 (`# Agent05 后端服务控制接入 Web 发布 工作流重启`) 输出，以便系统自动重命名此对话。
2. 在执行任何操作前，请简要复述当前的【核心卡点】与【下一步行动】。等待我的确认后，再开始执行。
```

## 第一性原理与项目上下文

Agent05 的最终用户不应该看到“请启动后端服务”或命令行启动提示。用户打开 Agent05 页面时，PPT Maker 后端应由本机服务管理层自动运行或由 Agent00 控制面恢复。

当前问题是：Agent05 发布壳已经能检测 `127.0.0.1:8000` 后端不可用，但用户看到的是“PPT Maker 后端未启动”。这对开发者有用，对最终用户没有操作闭环。

第一性原理判断：

- Agent05 页面负责使用服务，不负责教用户启动服务。
- Agent00 是发布中心和平台控制面，适合承载本机服务恢复能力。
- 现有 Agent00 “重启 Web 服务”按钮只重启 `com.tz.agent-web-service`，不能恢复 Agent05 后端。
- 正确方向不是让一个按钮重启所有服务，而是把 Agent00 升级成服务控制面板，按服务独立显示状态和恢复动作。

## 今日完成事项

本次仅完成设计判断与交接归纳，未修改 `/Users/tristanzh/agent/web` 代码。

已确认的现有 Web 实现位置：

- `/Users/tristanzh/agent/web/server.mjs`
  - Agent00 首页渲染了 `data-platform-restart-web-service` 按钮。
  - `POST /api/restart-web-service` 调用 `webServiceRestarter.restart()`。
  - `createLaunchdWebServiceRestarter()` 当前写死 label：`com.tz.agent-web-service`。
  - Agent05 状态探测位于 `/api/agent05/status` 相关逻辑。
- `/Users/tristanzh/agent/web/app/platform-home.js`
  - 绑定 `data-platform-restart-web-service`。
  - 确认后调用 `fetch("/api/restart-web-service", { method: "POST" })`。
  - 已有结果摘要渲染逻辑，可复用为多服务控制结果。
- `/Users/tristanzh/agent/web/tests/platform-home-service.test.mjs`
  - 已覆盖 restart API、方法限制、Agent00-only 渲染边界。
- `/Users/tristanzh/agent/web/tests/platform-home-browser.test.mjs`
  - 已覆盖 Agent00 restart modal 文案、取消不调用 API、确认后可读结果。
- `/Users/tristanzh/agent/web/ops/com.tz.agent-web-service.plist`
  - 当前只有 Web 服务 launchd plist。
- `/Users/tristanzh/agent/web/ops/local/start-agent-web-service.sh`
  - 当前只启动 Web server。

建议新增 Web 发布工作流执行产物：

- `/Users/tristanzh/agent/web/ops/com.tz.ppt-maker-backend.plist`
- `/Users/tristanzh/agent/web/ops/local/start-ppt-maker-backend.sh`
- `/Users/tristanzh/agent/web/docs/superpowers/specs/2026-06-17-agent00-service-control-agent05-sdd.md`
- 对应 service/browser tests。

## 已作出的关键决策

1. 不建议让最终用户手动启动后端。

   开发命令：

   ```bash
   cd /Users/tristanzh/agent/PPT-maker
   python3 -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
   ```

   只能作为开发者诊断信息，不应出现在最终用户主提示里。

2. 不建议把 Agent05 后端启动塞进现有“重启 Web 服务”按钮。

   现有按钮语义明确：只重启 `com.tz.agent-web-service`。如果隐式连带重启 Agent05 后端，会扩大 blast radius，用户也无法知道到底哪个服务失败。

3. 建议把 Agent00 升级为“服务控制面板”。

   推荐服务列表：

   - `Web 发布服务`
     - service id: `web`
     - launchd label: `com.tz.agent-web-service`
     - existing endpoint compatibility: `POST /api/restart-web-service`
   - `Agent05 PPT Maker 后端`
     - service id: `agent05-ppt-maker`
     - launchd label: `com.tz.ppt-maker-backend`
     - health URL: `http://127.0.0.1:8000/api/health`
     - command wrapper: `/Users/tristanzh/agent/web/ops/local/start-ppt-maker-backend.sh`

4. Agent05 不可用提示应改为用户可执行闭环。

   最终用户文案建议：

   ```text
   PPT Maker 服务暂不可用。请在 Agent00 服务控制中恢复 Agent05 PPT Maker 后端；如仍不可用，请联系管理员。
   ```

   开发者命令可放入 Agent00 控制面结果详情或折叠诊断区，不放在 Agent05 主流程。

5. Web 发布工作流拥有控制面 UI/visual governance。

   PPT-maker 工作流只提出业务能力需求：Agent05 后端必须可由平台恢复。按钮布局、服务面板视觉、状态卡样式应由 `/Users/tristanzh/agent/web` 工作流接管。

## 未解决的风险/报错

1. 当前缺少 Agent05 后端 launchd plist。

   没有 `com.tz.ppt-maker-backend` 时，Agent00 无法通过 launchd 恢复 `127.0.0.1:8000`。

2. Python/环境路径需要 web 工作流确认。

   `start-ppt-maker-backend.sh` 应明确使用稳定 Python 路径和工作目录。需要确认是否用系统 `/usr/bin/python3`、workspace bundled Python、还是当前 shell `python3`。

3. 后端环境变量和模型密钥边界需保留。

   不得把 API key 写入 plist 或源码。脚本如需读取 key，应从 Keychain、环境变量或既有安全加载机制读取，并且日志不得打印 key。

4. 当前 Agent00 restart UI 是单服务 modal。

   扩展为多服务控制时要避免破坏现有 `重启 Web 服务` 测试和用户习惯。可以保留原按钮，同时新增“服务控制”区域，或把原按钮迁入服务列表。

5. `/Users/tristanzh/agent/web` 当前有大量其他 agent 脏改动。

   执行时必须严格隔离 Agent00/Agent05 服务控制相关文件，不要混入 Agent02、Agent03、Agent07 或主题治理修改。

## 下一步行动

建议 web 发布工作流按 SDD/TDD 顺序执行：

1. 读取上下文：

   ```bash
   cd /Users/tristanzh/agent/web
   sed -n '1440,1605p' server.mjs
   sed -n '2860,2930p' server.mjs
   sed -n '4888,4910p' server.mjs
   sed -n '1,70p' app/platform-home.js
   sed -n '500,560p' app/platform-home.js
   sed -n '1700,1820p' tests/platform-home-browser.test.mjs
   sed -n '340,460p' tests/platform-home-service.test.mjs
   ```

2. 写 SDD：

   新建：

   ```text
   /Users/tristanzh/agent/web/docs/superpowers/specs/2026-06-17-agent00-service-control-agent05-sdd.md
   ```

   必须明确：

   - Agent00 是服务控制面。
   - Agent05 页面不显示命令行启动提示。
   - Web service 和 Agent05 backend 是独立服务。
   - launchd label、health URL、restart API、UI 文案和失败回退。

3. 写 RED 测试：

   Service tests 建议：

   - `GET /api/platform/services` 返回 web 与 Agent05 backend 两个服务。
   - Agent05 backend health unavailable 时状态为 `unavailable`。
   - `POST /api/platform/services/agent05-ppt-maker/restart` 调用对应 restarter，不调用 web restarter。
   - unsupported method 返回 405。
   - 现有 `POST /api/restart-web-service` 兼容不破坏。

   Browser tests 建议：

   - Agent00 渲染服务控制入口。
   - Agent05 PPT Maker 后端不可用时显示可恢复状态。
   - 点击 Agent05 服务恢复按钮出现确认并调用正确 API。
   - 取消不调用 API。
   - Agent03/Agent05 等业务页面不出现 Agent00 服务控制按钮。

4. 实现：

   - 抽象 `createLaunchdWebServiceRestarter()` 为通用 launchd restarter。
   - 增加 Agent05 backend restarter：`com.tz.ppt-maker-backend`。
   - 增加 `/api/platform/services` 与 `/api/platform/services/:serviceId/restart`。
   - Agent00 UI 增加服务控制面板。
   - Agent05 backend unavailable HTML/提示改为指向 Agent00 服务控制。
   - 新增 plist 与启动脚本。

5. 验证：

   ```bash
   cd /Users/tristanzh/agent/web
   node --test tests/platform-home-service.test.mjs tests/platform-home-browser.test.mjs tests/agent05-service.test.mjs tests/agent05-browser-layout.test.mjs
   ```

   之后在 PPT-maker 侧验证：

   ```bash
   cd /Users/tristanzh/agent/PPT-maker
   ./scripts/agent05_release_smoke.sh
   ```

6. 手动验收路径：

   - 停止 `127.0.0.1:8000`。
   - 打开 `http://127.0.0.1:3000/agent05`。
   - 确认用户提示不出现命令行，只指向 Agent00 服务控制。
   - 打开 `http://127.0.0.1:3000/`。
   - 在 Agent00 服务控制中恢复 Agent05 PPT Maker 后端。
   - 刷新 Agent05，确认 backend available。
