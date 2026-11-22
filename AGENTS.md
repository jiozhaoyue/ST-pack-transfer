<!-- RULES-POINTER v1 -->
本仓工程规则唯一真源位于 `.trellis/spec/guides/`：`.trellis/spec/guides/rule-catalog.md`（30 条判据）、`.trellis/spec/guides/rule-details.md`（细则）、`.trellis/spec/guides/iron-rules.md`（会话注入铁律）、`.trellis/spec/guides/rule-triggers.md`（触发索引）。动手前先读，收尾前跑 `npm run verify:rules`（用法见 `.trellis/spec/guides/rule-catalog.md`）。
本文件只放指针、不复述真源条文；冲突以真源为准。

<!-- IRON-RULE:REPORT-ALL-WRITES v1 (2026-11-11 用户铁律，禁止删除) -->
# 铁律 0：任何配置写入与工具调用，必须全程出声（不可静默）

1. **禁止静默工具调用**：只要使用工具，同一条回复必须包含可读文本——说明“正在做什么、看到什么、下一步”，不得只发工具调用。
2. **写任何 AGENTS.md / GEMINI.md / harness 配置前**：必须先文字报备**绝对路径**、要改的内容、原因。
3. **写完必须立刻文字汇报**：实际写入结果、关键 diff 摘要，并**读回校验**（grep 到标记）。
4. 适用范围：pi / Codex / Gemini / Cursor / Copilot / OpenCode / DeepSeek 等全部 harness 指令文件；
   不含 Claude 类（CLAUDE.md / ~/.claude/**）。
5. 违反本条视为任务未完成；宁可不改，也不静默改。
<!-- /IRON-RULE:REPORT-ALL-WRITES -->

<!-- TRELLIS:START -->
# mini-trellis

This project uses mini-trellis as a memory layer. Working knowledge lives under `.trellis/`:

- `.trellis/spec/` — durable contracts (short markdown; read `index.md` first)
- `.trellis/research/` — topic inbox (`<topic>.md`; `README.md` is not a topic)
- `.trellis/workspace/` — per-developer journals

Record a session with `/mini-trellis:remember` (Claude/OpenCode), `/mini-trellis-remember` (Pi), or `$mini-trellis-remember` (Codex). When earlier decisions or relevant project rules are needed, use `mini-trellis mem recall "<topic or path>"`; expand evidence with `mini-trellis mem read "<ref>"`. No search is required for unrelated work. Promote lasting boundaries into spec with `mini-trellis-update-spec`.

Record only confirmed decisions, reusable research findings, or the session/compact handoff. Skip ordinary turns and unconfirmed guesses. New installs write notes without an automatic git commit; use `mini-trellis doctor` to check host wiring and `mini-trellis refresh --dry-run` before refreshing assets.

Keep confirmed rules short and faithful. Unconfirmed scope, exceptions, and implementation choices stay open or are labeled as inference, not added to the contract.

For a confirmed update, follow this short order: read the existing topic; edit that file; read it back and check the new rule, limits, and negations; run `python3 ./.trellis/scripts/add_session.py --title "..." --summary "..." --topic <actual-topic-path>`; read the journal and check its topic link. Journal-only success is not topic success; report partial writes accurately. New notes follow the requested or discussion language; updates preserve the document language.

When recall excerpts already answer the question with source and qualifiers, cite them and stop. Expand only missing context; do not repeat a lookup or fall back to dialogue-only `search` merely to reconfirm sufficient evidence.

mini-trellis does not create or drive tasks.

Managed by mini-trellis. Edits outside this block are preserved.
<!-- TRELLIS:END -->

<!-- TAVERN-RULES:START v3.1.0 -->
<!-- 本块由 tavern-harness/scripts/modules/rules_sync.py 自动生成，请勿手动编辑 -->
<!-- 真源: tavern-harness · registry/rules.json · 类别 dev · v3.1.0 -->
<!-- 同步时间: 2026-11-22T06:18:00Z -->
<!-- 内容哈希: sha256:30ef2ce887bdcd6214dcd57a658649d58d2d5c5058bf46d41e9e77a137eb648e（仅覆盖规则正文，不含头部与项目覆盖） -->
# 统一开发规则（v3.1.0 · 酒馆开发）

> 本块由 tavern-harness 生成，请勿手改正文。
> 规范全文在 `.trellis/spec/`；项目特例写文末「项目覆盖」。

## 通用红线

- **G-01** 需要用户决策时用问答工具，一次聚合多个问题；重大设计多轮问答。
- **G-02** 任何工具调用前先输出可见短汇报；禁止无文本直接调工具。
- **G-03** 多项改动先落计划文件；验收标准不得 TBD；执行中实时勾选。
- **G-04** 用文件实时记录进度与交接；丢弃 AI IDE 上下文后可续跑。
- **G-05** 独立任务并行发起；命令非阻塞；禁止空等与轮询。
- **G-06** 子代理任务自包含；模型与并发由用户裁定；阻塞宿主不开子代理。
- **G-07** 删除、覆盖、装依赖、大重构、对外写操作前必须显式授权。
- **G-08** 删除一律走回收站或归档；禁止用命令直接删除。
- **G-09** 变更用 diff 与块级编辑；禁整文件覆盖与 shell 重定向写源码。
- **G-10** Git 只用显式 pathspec；提交前校验暂存区；完成即推 origin。
- **G-11** 交付物零凭据、零隐私、零真实数据、零本机绝对路径。
- **G-12** 先检索复用；UI 复用设计系统；DB 复用 schema 与迁移；不自造。
- **G-13** 运行时零 CDN 与网络引用；无法本地化须说明并隔离。
- **G-14** 脚本禁硬编码业务数据；路径、端口、URL、阈值一律读配置。
- **G-15** 一仓一份脚本目录；模块登记；中控统一派发；禁一次性脚本。
- **G-16** UI 文案短；禁长句、合并连词、分隔符、括号说明、说明性副标题。
- **G-17** UI 布局紧凑；禁大间隔、大空白、横竖颠倒；改动必须截图检查。
- **G-18** UI 区域用阴影或色差区分；禁线条分割、边框滥用、卡片套卡片、中控台风格。
- **G-19** 异步等待必须有界；Worker 终止后置空；高频 DOM 更新用 rAF 合帧。
- **G-20** 耗时操作有进度与结果；失败不静默、不整体中断。
- **G-21** 发版前测试全绿、零回归；未验证项不得写成已验证。
- **G-22** 改前读 spec；复杂功能先写设计再写代码。
- **G-23** 文档、注释、回复用中文；代码标识符与专有名词除外。
- **G-24** 工作流改动覆盖 skills、MCP、agent、配置文件与 TDD，并留验证证据。
- **G-25** 单一真源；禁散落规则与副本；规范入 spec，注入只留短摘要。
- **G-26** 任何完成声明必须有可复现证据；未验证项如实标注。
- **G-27** 多事项物理分行；禁连词、分隔符、括号合并；单项断言独立成行。
- **G-28** 对话正文不贴完整文件内容；落地文件，只给可点击路径。
- **G-29** opencode/workbuddy 会话必须用子代理多并行推进；禁止主代理单干。
- **G-30** 子代理必须使用免费模型；调用前实时查询注册表并确认 cost 输入输出均为 0；禁止误用付费模型。
- **G-31** 输出与工具调用禁止简写；禁止把用户简写直接当作具体模型、工具、仓库或路径名。
- **G-32** 禁用 checkout --/restore/reset --hard/clean -fd 回滚未提交改动；回滚前先 stash 或备份并报备路径。（来源 ST-pack-transfer/iron-rules#40）
- **G-33** dev server 等长驻服务用系统命令起独立进程（Start-Process/nohup/setsid），禁用 agent 内置后台 shell。（来源 ST-pack-transfer/iron-rules#38）
- **G-34** 读数/体积/进度同源实时可复核；读不到显示「未提供」，禁假 0/假缓存/假成功。（来源 ST-pack-transfer/iron-rules#5）
- **G-35** 禁重复造轮子：通用算法/格式/API 封装优先用三方库或仓内去重，自写仅限业务逻辑。（来源 ST-pack-transfer/quality-guidelines 三方库规范）
- **G-36** 主代理只兜底：全局调配、仲裁、进度勘察、多模态复核；子代理不可用时才亲自实现。（来源 ST-pack-transfer/subagent-collaboration#G-8）
- **G-37** 派发角色按内置→仓内专用→主代理亲自三级顺序选，不跳级；亲自做须记降级原因。（来源 ST-pack-transfer/subagent-collaboration#G-10）
- **G-38** 仓内专用角色统一入库（.zcode/agents/*.md）、纳入 git、随时可调用；禁散落临时目录。（来源 ST-pack-transfer/subagent-collaboration#G-11）
- **G-39** 每个子代理独占产出文件；同一文件同一时刻只有一个写者；只读角色只给读工具。（来源 ST-pack-transfer/subagent-collaboration#G-12）
- **G-40** 一轮并发派发多角色子代理成蜂群，主代理同轮推进自身工作；禁串行接力、禁 wait/轮询空等。（来源 ST-pack-transfer/subagent-collaboration#G-9）

## 酒馆开发红线

- **D-01** 宿主差异只进单一 host-bridge；业务层禁宿主名判断。
- **D-02** 注入样式双前缀；禁全局选择器；配色继承宿主变量。
- **D-03** 纯前端主路径闭环；后端只作可选增强，适配器加特性检测加静默降级。
- **D-04** 跨宿主插件禁用宿主补丁桥；只用可移植子集并标注可用性。
- **D-05** API 事实以官方文档为准；禁翻宿主源码找内部 API。
- **D-06** UI 落点只认官方文档；设置页只放设置；复杂 UI 用官方 Popup 与 RENDERED。
- **D-07** 安装后即可用；第三方库本地 vendor；不得要求用户构建。
- **D-08** 插件可独立运行；无后端、离线、卸载后仍可用。
- **D-09** 发版前跑项目测试与产物校验；E2E 只对 Dev 实例。
- **D-10** 开源基线：零隐私、零凭据、真实数据隔离；提交用隐私邮箱。
- **D-11** 扩展目录按宿主约定；Luker 用户扩展平铺，禁嵌套 third-party。
- **D-12** 前端性能有预算；交互反馈、首屏、拉取时间在 Dev 复测并留数字。
- **D-13** 动手前先盘点宿主原生能力（拉取/上传/下载/扩展管理/存储/通知），原生已实现的不在插件内重造，并发时宿主优先。（来源 ST-pack-transfer/iron-rules#28）
- **D-14** 同一作者/仓库只允许一个安装 URL；禁本地链接，一律 remote link；私有仓提示需登录。（来源 ST-pack-transfer/iron-rules#32）
- **D-15** 主人说「基石」= ST-Delegation-of-authority 仓（Authority 后端，D:/Repo/Tavern-repo/Myfork/ST-Delegation-of-authority）；禁止猜成 tavern-harness/Harness-repo；向基石贡献走其上游 issue+PR。（来源 ST-pack-transfer 2026-11-22 主人明令）
- **D-16** 全宿主恢复事实：ST 无整包恢复端点、纯前端插件无法恢复、原生增量仅 Luker+PT 支持、插件层四宿主全无增量恢复；所有未实现能力必须全盘写入文档，禁止只留在代码里。（来源 ST-pack-transfer 2026-11-22 审计主人明令）

## 规范入口

- `.trellis/spec/tavern-dev/index.md`

## 技能策略

- 允许 pack：dev, upstream
- 禁止 pack：card, infra

## 项目覆盖
（本仓自有内容，同步器保留；无则留空。）

- 规范入口覆盖：基石「规范入口」指向的 spec 根在本仓未随基石同步落地；本仓实际分层规范索引为
  `.trellis/spec/frontend/index.md` / `.trellis/spec/backend/index.md`，规则判据为 `.trellis/spec/guides/rule-catalog.md`。

<!-- TAVERN-RULES:END -->

## 项目细则补充（2026-11-05 追加，用户明令）

1. **文档先行 / 禁止直接读源码理解功能**（MUST）：先查 `docs/DEVELOPER-GUIDE.md`、`.trellis/spec/`、
   `mini-trellis mem recall`；文档不足先补文档。只有进入编辑阶段才允许读目标源码片段，读完回流文档。
2. **计划先落盘**（MUST）：多项改动先写当前计划文件（`docs/PLAN-*.md` 或任务 PRD），执行中实时更新。
3. **规则注入源唯一**（MUST）：`.trellis/spec/guides/iron-rules.md`；hook 只读该文件，禁止硬编码。
   会话启动强制注入；之后每 5 条用户消息注入一次；`search-gate.py` 在未检索前拦截实现类写操作。
4. **宿主设置只读**（MUST）：从宿主拉取只打开原生拉取位置并弹窗提示用户自己点「从宿主拉取」；
   禁止自动点注入按钮，禁止更改宿主任何勾选/设置记忆。默认不勾选仅在拉取后的插件侧生效。
5. **只认上游宿主**（MUST）：Luker 只认原上游；任何 fork 仅开发版，不得当产品事实。
6. **数据正确性优先**（MUST）：读数、体积、勾选必须同源、实时、可复核；读不到就显示「未提供」。
7. **布局铁律**（MUST）：控件与自身文字不拆行；图表自适应网格（宽屏最多 4 列），不得压成单条；
   图表 DOM 边贴边、可拖拽、不留空白。
8. **文档与 README 同步**（MUST，2026-11-11 用户明令）：每次功能更新 / 行为变更，必须在
   **同一次提交内**同步更新 `docs/DEVELOPER-GUIDE.md` 与 `README.md`；只改代码不改文档视为未完成。
9. **本地服务唯一端口**（MUST，2026-11-17 用户明令）：`dev` / `preview` / 本地静态服务统一 `3040`；
   只改 `vite.config.js` 的 `LOCAL_PORT` 或启动前设置环境变量 `PORT`，禁止另开第二端口。
10. **教程结构被动镜像真实**（MUST，2026-11-17 用户明令）：教程占位包树必须由
    `src/core/demo-tree.js` 的扁平清单交给真实 `buildChartTree()` 生成，禁止手写分组树；
    仍然不得读取真实包、不得塞真实实例包。结构变化由真实分组规则被动带动，不靠人工同步。
11. **zcode 会话全程铁律生效**（MUST，用户明令）：在 zcode 环境工作时，`iron-rules.md` 第 45 条
    （zcode 会话全程铁律）**在每一次会话、全部时段**生效——不限于 agy，不限于任何单一宿主或单一项目。完整条文见
    `.trellis/spec/guides/iron-rules.md` 第 45 条；zcode 全局副本见 `~/.zcode/AGENTS.md` 第 12 节。
    要点：绝对禁止猜测（按名字精确探测）、单命令 10 秒硬死线、全程出声、
    子代理单轮全并发且模型只能是 `new-provider/opencodego/hy4-flash-free$enabled`、
    禁止看板中转、规则变更三层同步（全局 / 本仓 iron-rules / 本文件）。

# 项目概览 (ST-pack-transfer)

SillyTavern / Luker / TauriTavern / PureTavern 数据包互转工具，三形态运行：
1. **独立 Web**（Vite 页面，`index.html` + `#app`）
2. **ST/Luker 扩展插件**（注入宿主扩展设置抽屉，`src/ui/host-bridge.js`）
3. **Node/Vitest**（同构核心，主线程降级，无 Worker）

## 目录与架构边界

- `src/core/` — 转换核心（纯逻辑，禁止 DOM 依赖）：`transform.js`（convert 入口，target ∈ {st,l,tt,pt}，见 `TARGETS`）、`detect.js`、`plan-preview.js`、`delta.js`、`splitter.js`、`worker-client.js`（Web Worker 封装，Node 自动主线程降级）
- `src/ui/` — UI 模块（可 DOM）：`workbench-template.js`（HTML 模板唯一来源，`getWorkbenchHtml()` 无参数）、`workbench-view.js`（视图渲染：图表 / 选择树 / 配额 / 设置视图）、`host-bridge.js`（宿主嗅探/CSRF/备份拉取/恢复/扩展安装器，**含 `hostLayoutCode()`：宿主平台 luker→l 映射，宿主导出 target 必须经它归一**）、`export-queue.js`（产物待导出区）、`lan-transfer-panel.js`、`settings-panel.js`、`chat-store-bridge.js` / `chat-store-inject.js`（聊天库唯一接缝）、`qr.js`、`escape.js`；根 `index.js` 是根控制器
- `src/storage/db.js` — IndexedDB 封装（DB_VERSION 2，files store 带 `origin` 字段：upload/host-export/converted/delta/split-part）
- `src/vendor/` — zip.js / fzstd 本地副本，勿升级改动
- `test/` — Vitest（**已纳入版本控制**，见 `.gitignore` 注记「测试目录按用户最新要求不再忽略」；`npm test` 当前 1727 passed / 15 skipped，173 files，2026-11-21 质量会战终版实测）
- `docs/superpowers/specs/` 与 `docs/superpowers/plans/` — 设计规格与实施计划；`docs/research/` — Luker 机制研究报告
- `.trellis/` — Trellis 任务系统（见上方 TRELLIS 块）

## 常用命令

```bash
npm test          # Vitest 全量（当前 1727 passed / 15 skipped，173 files，2026-11-21 质量会战终版实测；test/ 已纳入版本控制）
npx vitest run test/xxx.test.js   # 单文件
npm run build     # vite build --base=./
npm run dev       # vite 开发服务器（独立模式手测）
npm run check:css-scope       # CSS 作用域守卫（PostCSS AST）
npm run check:dom-injection   # DOM 注入守卫（innerHTML 未转义插值）
npm run check:template-source # 单一模板源守卫（index.html 只许骨架）
```

## 关键规则（踩过的坑，务必遵守）

1. **CSS 作用域铁律**：`style.css` 所有规则必须挂在 `#app.app-container`（独立态与模态态统一根）或自有覆盖层 id（`#st-converter-modal-overlay` / `#wb-detail-overlay` / `#st-pt-tutorial-overlay`）之下；第四个根 `#st-pt-tutorial-overlay` 为教程浮层法定根，与 `scripts/css-scope.js` 白名单逐字对齐，新增覆盖层根必须同时改 `.trellis/spec/guides/iron-rules.md` 第 7 条与该白名单。`.st-converter-drawer-app` 已随抽屉注入删除（2026-10-15），出现即陈旧。裸选择器（`.menu_button`/`.inline-drawer`/`.text_pole`/`.checkbox_label` 等酒馆全站类）会污染宿主全站 UI——2026-09 已发生并修复过，严禁回归。禁止在容器上硬编码覆盖 `--SmartTheme*` 宿主主题变量（金色系教训）；配色一律继承宿主变量 + `var(..., 回退值)`。
2. **平台代码 vs 布局代码**：宿主检测返回 `st|luker|standalone`；转换器只接受 `st|l|tt|pt`。凡把宿主平台传给 convert/文件名模板处必须经 `hostLayoutCode()` 归一（`luker→l`）。
3. **宿主端点差异**：`/api/users/backup` ST 不支持 selection（全量导出+插件内过滤），Luker 支持（透传勾选）；恢复端点 `/api/users/restore`。相关端点调用传**宿主平台代码**（st/luker），非布局代码。
4. **宿主 CSS 类复用**：模板使用酒馆原生类（`menu_button`/`text_pole`/`checkbox_label`/`inline-drawer`/`flex-container`），样式定义在 style.css 内作用域化版本。
5. **产物统一出口**：所有转换/宿主拉取产物进待导出区（`export-queue.js`），不自动下载；临时条目下载/存工作区时才入库。
6. **浏览器 API 特性检测**：`showSaveFilePicker`（选位置导出）、drag-out `DownloadURL`（仅 Chromium）、`navigator.storage.estimate`（配额条）——必须检测并回退。

## 文档与实例隔离

- 改 `src/core/` 前读 `.trellis/spec/` 对应层规范；UI 改动前读 `.trellis/spec/frontend/component-guidelines.md` 与 `directory-structure.md`（分区式结构 + 单一模板源 + 三态一致性断言）。
- **严禁向本地酒馆实例目录（`Instance/Real/Luker/...` 等）复制/写入任何文件**；实例插件更新只能走 Git。

# Custom Agent Guidelines

- **问答交互规范 (Interactive Ask Question Mandate)**:
  - 遇到需要用户决策、澄清需求、确认配置方案、选择技术路线或任何需要用户输入时，**必须使用交互式问答工具 (`ask_question`)**，严禁输出纯文本让用户手动打字回复。
  - 每次提问必须**聚合多个问题**（涵盖方案选项、细节偏好与技术策略），一次性呈现给用户，避免单条零散交互。
  - 禁止在正文中以提问/等待确认结束回合；需要用户输入时必须调用问答工具。

- **代码编辑与文件修改规范 (Strict Diff & Prohibit Command Writing Mandate)**:
  - **强制使用 diff 工具**: 修改任何现有文件时，**必须且只能**调用 `replace_file_content` 进行精准的局部块级替换（diff）。严禁大面积重写或无意义整文件覆盖。
  - **严禁通过命令写文件**: **绝对禁止**使用终端命令行（包括 `run_command`、PowerShell、bash、`node -e`、`python -c`、`echo`、`cat <<EOF`、重定向符 `>` / `>>`、文件系统 API 脚本等）直接修改、创建或写入项目源码、配置与数据文件。
  - **透明可审查**: 所有代码变动必须具备明确的 diff 记录，以便用户随时审查与回滚。

- **禁止直接写入本地酒馆实例目录 (Strict Prohibit Modifying Local Instances Mandate)**:
  - **严格隔离代码库与运行实例**: 一切开发、修复与单测必须且只能在代码库（`ST-zip-converter`）工作区内进行。
  - **绝对禁止手动复制/写入本地实例**: 严禁向酒馆本地实例目录（如 `Instance/Real/Luker/...`）直接复制、同步或写入代码文件。
  - **必须且只能通过 Git 交付与拉取**: 实例插件的安装与更新必须完全交由 Git（`git clone` / `git pull`）或酒馆原生扩展安装器进行，保持实例目录完全受控于 Git 版本管理。

- **完成即推送 (Push on Completion Mandate)**:
  - 每个工作阶段（任务/提交批次）完成并通过测试后，必须 `git push` 到 origin，不得只提交不推送。

- **计划先行铁律 (Plan-Before-Code Mandate)**:
  - Trellis 任务在 `task.py start` 前必须具备回填完成的 `prd.md`（Requirements / Acceptance Criteria 不得为 TBD）；复杂任务还需 `design.md` + `implement.md`。
  - 严禁实施跑在计划前面：代码提交时若对应任务 PRD 仍为空占位，必须先回填 PRD 再继续。
  - `implement.md` 复选框随执行**实时勾选**，不允许任务结束后凭记忆批量补勾。
  - 教训来源：09-12 任务代码完成三片后 PRD 仍为 TBD，导致人机意图漂移（2026-09-21 回填）。

- **Authority 适配器模式约定 (Optional-Backend Adapter Convention)**:
  - 项目定位为**纯前端为主、Authority 为可选增强层**（2026-09-21 用户确认），不转向前后端混合架构。
  - 一切服务端能力（Authority SDK / 未来其他后端）一律走「适配器 + 特性检测 + 静默降级」：可用时增强，不可用时纯前端路径（IndexedDB/OPFS/内存 Blob）保持全功能。
  - 后端调用必须 fire-and-forget 或显式降级，严禁让纯前端主路径阻塞/失败于后端不可用。
  - README 定位与代码适配器必须保持一致；新增后端能力时同步更新 README「核心特性」。

- **宿主 UI 注入规范 (Host UI Injection Convention)**:
  - 注入宿主原生 UI（按钮/入口）必须**幂等**且**自愈**：用共享 `watchHostDom` MutationObserver（200ms 去抖）统一注入点，替代各自 `setInterval` 轮询；宿主重渲染导致节点丢失时自动重注入。
  - 多锚点注入用 `dataset.stZipInjected` 标记 + 兄弟位检查防重复。
  - 注入元素**复用宿主原生类**（`menu_button` 等），零新增 CSS；任何新增样式仍受双前缀铁律约束。
  - 注入范围语义边界：只注入「整包 ZIP 级」入口（备份/导出/管理面板行/备份管理器），单体导出（单聊天/单角色卡/单世界书）不注入。
  - 参考实现：`src/ui/host-bridge.js` 的 `mountNativeBackupButton` / `mountLukerBackupManagerButton`。

- **子代理来源唯一性 + 并行不阻塞 (Subagent Source Exclusivity & Non-Blocking Parallelism Mandate)**:
  - **只准使用当前 agent 平台自带的子代理能力**。VS Code Copilot 场景即内置的 `runSubagent` 工具；**通用表述：只调用"本 agent 自身的子代理功能"**。
  - **禁止调用任何"其他 agent"**——包括但不限于：`trellis channel spawn` 派生的 claude/codex worker、`pebrel agent delegate` / pebrel 分屏里的其他 agent、手工拉起的外部 CLI agent（`claude` / `codex` / `gemini` 等）、其他 IDE 或终端里的 agent 会话。
  - **主代理不得被任何子代理阻塞**：需要多个子代理时，必须**在工具调用层一次性并发派发**（同一轮内并行发起多个子代理调用），主代理在同一轮内**并行推进自己那份工作**（自己的检索/读取/落盘），不得串行排队、不得空等、不得轮询等待子代理。
  - **子代理任务必须自包含**：检索范围、具体问题、期望输出、允许写入的落盘路径必须写全；子代理**不继承**主对话上下文。
  - **写权限边界**：子代理只读，或只写各自负责的产出文件；**禁止子代理与主代理写同一文件**（避免互相覆盖）。
  - 落地规范见 `.trellis/spec/guides/subagent-collaboration.md`。
  - 教训来源：2026-09-23 用户两次收紧——先禁 `trellis channel spawn` 外部 worker（已派发 3 个须终止），再明确「只能用自身子代理 + 并行不阻塞」。
