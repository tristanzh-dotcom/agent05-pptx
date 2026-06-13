### ☀️ 次日启动胶囊 (Boot Prompt)
请在明天开启新对话时，直接复制以下指令发给系统：

```text
请静默读取并完全理解当前目录下的 `HANDOVER_agent05_web_design_20260613.md`。
1. 请将本对话的逻辑分支锁定为：【Agent05 Web 设计归档】，并在你回复的第一句话使用 Markdown 的 H1 标题 (`# Agent05 Web 设计归档 工作流重启`) 输出，以便系统自动重命名此对话。
2. 在执行任何操作前，请简要复述当前的【核心卡点】与【下一步行动】。等待我的确认后，再开始执行。
```

## 第一性原理与项目上下文

当前归档服务于 `Agent05 PPT Maker 发布` 到 Web 工作流的交接。核心目的不是继续堆 UI，而是把 PPT 生成工作台压回一个可用的单屏生产工具：

- 左侧负责输入生成意图，Prompt 是主要生产资料，上传文件只是上下文输入。
- 右侧负责检查 PPTX 成品，预览必须按标准 PPT 16:9 比例显示。
- 历史记录用于复用和下载，不应挤压主任务空间。
- 平台抬头栏服务最终用户，不应暴露后端 URL、前端挂载路径或开发调试字段。

本轮 Web 修改跨两个位置：

- 业务前端根：`/Users/tristanzh/agent/PPT-maker`
- 共享发布壳：`/Users/tristanzh/agent/web`

按 `/Users/tristanzh/agent/AGENTS.md` 的最高 Web 发布边界规则，本轮属于 Agent05 为完成发布可用性而做的项目级 Web delta。Web 工作流后续接手时，应继承这些实际变更，但不要把 Agent05 的局部布局范式自动扩散到其他 Agent。

## 今日完成事项

### 1. Agent05 前端工作台重排

修改文件：

- `/Users/tristanzh/agent/PPT-maker/frontend/src/App.tsx`
- `/Users/tristanzh/agent/PPT-maker/frontend/src/App.test.tsx`
- `/Users/tristanzh/agent/PPT-maker/frontend/src/index.css`
- `/Users/tristanzh/agent/PPT-maker/docs/sdd/ppt-maker-web-workbench-layout.md`

主要设计修改：

- 删除 Agent05 内嵌前端自己的二级抬头栏，不再重复平台 Header 信息。
- 桌面布局改为三段：
  - 主区：左 `生成控制台`，右 `PPT 结果工作区`
  - 底部：`最近生成` compact strip
  - 最底部：`模型配置` strip
- `生成控制台` 变成高度受控 grid：
  - 文件上传 compact 化
  - Prompt row 使用 `minmax(12rem, 1fr)`
  - Generate / page count 保持在首屏
- 上传区支持多文件选择：
  - 输入 `multiple`
  - 已选文件队列显示文件名、类型、大小
  - 类型标签包括 `PPTX源文件`、`PDF参考`、`图片参考`
  - 队列最大高度受控，不能挤掉 Prompt
- `最近生成` 从左侧生成控制台移出，改为桌面底部横向 strip。
- `更多历史` 改为 desktop 浮层：
  - `absolute bottom-full`
  - parent strip uses `relative z-40 isolate`
  - overlay uses `z-50 max-h-80 overflow-auto`
  - 不再进入主文档流，不再挤压预览区。
  - 后续修复了浮层落在 `最近生成` layer 后方的问题；层级必须挂在整个 history strip 上，而不是只给浮层本身加 z-index。
- `PPT 结果工作区` 改为 `overflow-hidden`，禁止外层引发页面级滚动。
- 预览舞台改成真正的标准 PPT 16:9：
  - 新增 `.ppt-preview-stage-shell`
  - 新增 `.ppt-preview-stage-frame`
  - 使用 CSS container query 单位：`width: min(100%, calc(100cqh * 16 / 9))`
  - 保证容器宽高内最大化，但不拉伸变形。

新增/更新测试覆盖：

- 发布态工作台不显示后端 URL、前端挂载路径、开发调试字段。
- 最近历史作为桌面底部 strip，不在生成控制台内。
- `更多历史` 展开为浮层，不改变预览主行高度。
- `更多历史` 浮层在层级上高于最近生成 strip 和相邻预览/生成 layer。
- 工作台 bounded to viewport。
- 完成态预览存在 `data-testid="ppt-preview-stage"` 且保留 `aspect-video` 语义。
- 多文件上传后显示每个文件名和类型。
- 底部主栏显示模型配置，而不是模板免责声明。

### 2. QuickLook PPT 预览 HTML 自适应

修改文件：

- `/Users/tristanzh/agent/PPT-maker/backend/app/services/files.py`
- `/Users/tristanzh/agent/PPT-maker/backend/tests/test_api_skeleton.py`

主要设计修改：

- `write_visual_preview_index()` 生成的预览壳不再使用 `iframe height: 100vh`。
- 新增固定舞台：
  - `.preview-stage { position: fixed; inset: 0; overflow: hidden; }`
  - `.preview-frame { width: 960px; height: 540px; transform-origin: center center; }`
- 新增 `fitQuickLookPreview()`：
  - 优先读取 QuickLook `Preview.html` 中第一张 `.slide` 的尺寸。
  - 没有 `.slide` 时 fallback 到 body/root scroll 尺寸。
  - 按可用宽高计算 scale，居中缩放。
  - `html/body/root` 隐藏 overflow，避免内部网页滚动条。

测试补充：

- 断言生成的 `index.html` 包含 `fitQuickLookPreview`。
- 断言包含 `querySelector('.slide')`。
- 断言包含 `overflow: hidden`。
- 断言不再包含 `height: 100vh`。

### 3. 共享 Web 发布壳 Agent05 抬头栏压缩

修改文件：

- `/Users/tristanzh/agent/web/server.mjs`
- `/Users/tristanzh/agent/web/app/agent05.css`
- `/Users/tristanzh/agent/web/tests/agent05-service.test.mjs`
- `/Users/tristanzh/agent/web/tests/agent05-browser-layout.test.mjs`
- `/Users/tristanzh/agent/web/docs/agents/agent05-publishing-config.md`

Agent05 相关设计修改：

- `renderAgent05Page()` 的抬头栏从三列开发信息改为最终用户信息：
  - 标题：`PPT生成`
  - 描述：`输入生成意图，检查并下载 PPTX 成品`
- 删除抬头栏中的：
  - `项目名称 / 可视化编排`
  - `后端通道`
  - `http://127.0.0.1:8000`
  - `前端挂载`
  - `/agent05/index.html`
- `agent05.css` 中 Agent05 发布壳高度压缩：
  - `.agent05-reference-cockpit` 第一行从 `108px` 改为 `72px`
  - `.agent05-info-status-bar` 从三列 grid 改为 flex
  - header padding 缩小到 `12px 16px`
  - 移动/窄屏 header 最小高度改为 `64px`
- Web 侧测试补充：
  - Agent05 shell 不显示后端通道/前端挂载/本地 URL。
  - Agent05 shell header 高度必须 `<= 80px`。

注意：`/Users/tristanzh/agent/web/server.mjs` 当前还包含 Agent02/Agent06 的其他脏改动，这些不是本轮 Agent05 Web 设计归档的范围。Web 工作流接手时应按 hunk 识别 Agent05 相关修改，不要把 server.mjs 中 Agent02/Agent06 改动误当作 Agent05 设计变更。

### 4. 浏览器验证结果

验证 URL：

- 平台壳：`http://127.0.0.1:4176/agent05`
- Agent05 应用本体：`http://127.0.0.1:4176/agent05/index.html`

浏览器实测：

- 空态预览：
  - `htmlScrollHeight == htmlClientHeight == 760`
  - `bodyScrollHeight == bodyClientHeight == 760`
  - 预览舞台 `870 x 489`
  - 比例 `1.778`
- 完成态预览：
  - iframe src 指向 `/agent05/api/files/.../visual-preview/index.html`
  - 页面无新增滚动：`scrollHeight == clientHeight`
  - 预览舞台 `830 x 467`
  - 比例 `1.778`
- 完成态点击 `更多历史` 后：
  - `最近生成` strip class 包含 `relative z-40 isolate`
  - `完整历史` class 为 `absolute bottom-full left-0 right-0 z-50 mb-2 max-h-80 overflow-auto ...`
  - `PPT 成品预览` panel 仍保持约 `904 x 599`
  - 预览舞台仍为 `830 x 467`
  - 比例仍为 `1.778`
  - 页面 `scrollHeight == clientHeight`，没有页面级滚动条。

### 5. 已执行验证命令

PPT-maker 前端：

```bash
cd /Users/tristanzh/agent/PPT-maker/frontend
npm test -- --run src/App.test.tsx
# 41 passed

npm run build
# passed
```

PPT-maker 后端 QuickLook 相关测试：

```bash
cd /Users/tristanzh/agent/PPT-maker
python3 -m pytest backend/tests/test_api_skeleton.py -q
# 16 passed
```

此前全量前端验证也通过：

```bash
cd /Users/tristanzh/agent/PPT-maker/frontend
npm test -- --run
npm run build
```

## 已作出的关键决策

- Prompt 是主输入，上传文件是上下文输入，因此上传区必须 compact，Prompt 必须获得更大空间。
- 历史记录是辅助操作，不得参与主预览区高度竞争，因此 desktop `更多历史` 使用浮层，不再用 in-flow 展开。
- 预览区必须按 PPT 标准比例约束，不能让 QuickLook HTML、iframe 或内容滚动决定最终外观。
- 对最终用户无用的后端 URL、前端挂载路径，应从平台抬头栏删除；这些信息属于诊断面板或开发日志。
- Agent05 前端不再复制平台 Header，避免“平台壳 + 应用内壳”双重抬头浪费垂直空间。
- 选择 CSS container sizing 解决预览比例，而不是靠 JS 反复测量 React 容器；QuickLook 内部 HTML 自适应仍由后端生成的 `fitQuickLookPreview()` 负责。
- SDD 与 TDD 已把布局行为固化成契约，后续 Web 工作流可以继续调视觉，但不应破坏这些行为边界。

## 未解决的风险/报错

- `/Users/tristanzh/agent/web/server.mjs` 有非 Agent05 的脏改动，Web 工作流接手前必须先查看 hunk，不要整体提交或整体回滚。
- `/Users/tristanzh/agent/PPT-maker/work/ppt-maker/.../visual_preview/index.html` 有生成物被 QuickLook 验证改写的脏状态；这些是运行产物，不应作为设计源文件提交，除非 Web 工作流明确要保留样例输出。
- 当前浏览器验证使用临时发布壳端口 `4176`。真实共享服务 `3000` 如仍由旧进程占用，需要重启后才能看到最新 `frontend/dist` 与 `/Users/tristanzh/agent/web/server.mjs` 改动。
- `3000` 的持久 Web 服务此前未重启；如果 Web 工作流直接检查 `http://127.0.0.1:3000/agent05`，应先确认服务进程是否加载了最新代码。
- 当前修改尚未提交、未 staged。
- Web 视觉系统治理仍归 Web 工作流：本轮只保证 Agent05 可用性、布局约束和发布壳最小必要变更。

## 下一步行动

Web 工作流接手建议顺序：

1. 先读本归档：

```bash
cd /Users/tristanzh/agent/PPT-maker
sed -n '1,260p' HANDOVER_agent05_web_design_20260613.md
```

2. 查看 Agent05 业务前端变更：

```bash
git -C /Users/tristanzh/agent/PPT-maker diff -- \
  frontend/src/App.tsx \
  frontend/src/App.test.tsx \
  frontend/src/index.css \
  docs/sdd/ppt-maker-web-workbench-layout.md \
  backend/app/services/files.py \
  backend/tests/test_api_skeleton.py
```

3. 查看共享 Web 壳中 Agent05 相关 hunk，注意避开同文件内 Agent02/Agent06 脏改动：

```bash
git -C /Users/tristanzh/agent/web diff -- \
  app/agent05.css \
  docs/agents/agent05-publishing-config.md \
  tests/agent05-browser-layout.test.mjs \
  tests/agent05-service.test.mjs \
  server.mjs
```

4. 重启或确认 Web 服务使用最新 build：

```bash
cd /Users/tristanzh/agent/PPT-maker/frontend
npm run build

lsof -nP -iTCP:3000 -sTCP:LISTEN || true
lsof -nP -iTCP:8000 -sTCP:LISTEN || true
```

5. 用浏览器检查：

```text
http://127.0.0.1:3000/agent05
```

重点检查：

- 抬头栏只显示 `PPT生成` 和最终用户任务描述。
- 首屏没有后端 URL 和前端挂载路径。
- Prompt 高度大于上传区。
- 多文件上传后文件名和类型可见。
- `更多历史` 是浮层，不挤压右侧预览。
- 预览舞台保持 16:9。
- 页面不出现因为预览或历史造成的额外纵向滚动。

6. 回归命令：

```bash
cd /Users/tristanzh/agent/PPT-maker/frontend
npm test -- --run src/App.test.tsx
npm run build

cd /Users/tristanzh/agent/PPT-maker
python3 -m pytest backend/tests/test_api_skeleton.py -q
```

7. 如果 Web 工作流要提交，应只 stage 明确归属 Agent05 的文件和 hunk，避免误收其他项目或 Agent02/Agent06 脏改动。
