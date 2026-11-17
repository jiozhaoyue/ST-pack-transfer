<!-- RULES-POINTER v1 -->
本仓工程规则唯一真源：`RULES.md`（30 条）+ `RULES-DETAILS.md`（82 条细则）。动手前先读；收尾前跑 `npm run verify:rules`。
本文件不得复制 RULES.md 条文；冲突一律以 RULES.md 为准。

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

<!-- TAVERN-RULES:START v2.0.0 -->
<!-- 本块由 tavern-harness/scripts/sync_tavern_rules.py 自动生成，请勿手动编辑 -->
<!-- 真源: tavern-harness · rules/ · 仓群 my-repo · v2.0.0 -->
<!-- 同步时间: 2026-11-17T20:37:52+08:00 -->
<!-- 内容哈希: sha256:656aef9279cd798a（仅覆盖规则正文，不含本头部与「项目覆盖」节） -->
<!-- 覆盖声明: 本仓如需覆盖某条规则，请在文末「项目覆盖」节声明并说明理由 -->

# 统一开发规则（v2.0.0）

> 由 `tavern-harness` 真源仓同步生成，请勿手动编辑。
> 适用仓群：**My-repo 仓群（酒馆扩展 / 工具插件）**。

# 统一开发规则 · 精简核心

> 本块由 `tavern-harness` 同步生成，请勿手改。**一行一条**，只保留可判定判据。
> 全文与案例不在此处：真源仓 `tavern-harness` 的 `rules/L0-global.md`、`rules/groups/*.md`、`rules/frontend-ui.md`、`rules/pitfalls.md`。
> 分级：**MUST** 违反即不通过；**SHOULD** 需说明理由。

## A. 边界与安全

- **L0-1 实例边界（MUST）**：宿主实例运行时数据可读写；被 git 跟踪的宿主源码严禁改动；指向工作区仓的 symlink/junction 严禁写穿。实例更新只走 git 或宿主原生安装器。
- **L0-6 高风险先问（MUST）**：删除/覆盖文件、装依赖、大重构、对外可见写操作（推送/PR/评论）必须先获用户授权。
- **L0-7 Git 纪律（MUST）**：`git add <显式路径>`，禁 `-A`/`-u`/`.`；提交前暂存区必须恰等于本次清单；完成即推 `origin`，禁推 `upstream`。
- **MR-14 零泄露（MUST）**：无本地绝对路径、无凭据、无真实聊天数据；凭据只存本机浏览器。

## B. 流程

- **L0-2 计划先行（MUST）**：多项改动先落计划文件，验收标准不得 `TBD`；执行中实时勾选。
- **L0-3 检索先行（MUST）**：实现前先查现成方案；WebSearch + GitHub API 两路都试过才算。
- **L0-4 变更可审（MUST）**：比较用 diff；改文件用块级 Edit，禁整文件覆盖；禁 shell 重定向写源码。
- **L0-5 决策用问答（MUST）**：需用户决策必须用交互问答工具并聚合多问；禁正文提问后结束回合。
- **L0-14 文档先行（SHOULD）**：改前先读 spec/开发文档；文档不足先补文档。
- **L0-17 交付落点（MUST）**：规范进 spec 目录；被 `.gitignore` 忽略的目录不算交付。

## C. 并发

- **L0-8 子代理（MUST）**：模型由用户指定；一次性并发派发、主代理并行推进、不空等不轮询；任务自包含；子代理与主代理不得写同一文件。

## D. 宿主适配

- **L0-9 桥接层隔离（MUST）**：宿主差异只进单一 host-bridge 模块，不散落业务层。
- **L0-10 CSS 作用域（MUST）**：禁 `*`/`body`/`:root`/裸宿主类；每条规则带本扩展前缀；配色只用宿主变量并给回退值。
- **L0-11 纯前端优先（MUST）**：主路径必须纯浏览器闭环；后端只作可选增强，走适配器 + 特性检测 + 静默降级。
- **L0-12 跨宿主禁 Host Bridge（MUST）**：跨宿主插件只用可移植子集，禁宿主补丁路径。
- **MR-2 事实源（MUST）**：用户资产存宿主服务端原生目录；浏览器存储只作可重建缓存。
- **MR-4 UI 落点（MUST）**：设置页只放设置；复杂交互用官方 Popup；消息旁内容挂官方 RENDERED 事件。不在官方文档的位置就是禁止的位置。
- **MR-5 API 事实（MUST）**：以官方文档为准，禁翻宿主源码找 API。

## E. 前端 UI（跨仓通用）

- **MR-15 滚动容器唯一（MUST）**：每视图只允许一个纵向滚动容器；`overflow-x` 一律 `hidden`，禁横向滚动条；`overflow: scroll` 禁用，只用 `auto`/`visible`；滚动条只准 `scrollbar-width: thin` 或 6px 自定义，禁系统粗条；手机全高用 `100dvh` 且保留 `100vh` 兜底。
- **MR-16 动态分格（MUST）**：图表区按数量自适应——1 个占满、2 个平分、3 个四宫格留空、宽屏最多 4 列；**禁止自由拖拽单卡宽高**，拖拽只允许调整既有分隔条比例；禁止压成单条并排。
- **MR-17 分隔条白名单（MUST）**：分隔条只允许在图表之间、图表与列表之间；类名必须登记；手机端禁拖拽手柄。
- **MR-18 美观优先（MUST）**：任何响应式都不得产生不美观结果；不为塞下而硬做，也不能显示不全。退让顺序：换行/堆叠 > 容器滚动 > 隐次要信息 > 纯图标（带 aria-label/title）。禁压扁控件、缩字号硬塞、裁功能性文案。
- **MR-19 无重复入口（MUST）**：同一动作只允许一个入口；同一页面出现两个同义按钮即为缺陷。
- **MR-20 全平台一致（MUST）**：web/手机/竖屏功能按钮必须全显示不压缩；读数在所有平台可见且同源；标签只用一种语言，禁「中文（English）」双写。
- **MR-21 全屏语义（MUST）**：全屏 = 占满插件 DOM 的另一个视图，不是浏览器全屏、不是就地内联展开。
- **MR-22 单一模板源（MUST）**：HTML 节点只有一个来源；同 UI 多副本必须在同一次提交内一并修改。

## F. 稳定性

- **MR-7 有界等待（MUST）**：任何 `await`（媒体事件、跨源 fetch、渲染 promise）必须能 settle，不得永久 pending。
- **MR-8 Worker 生命周期（MUST）**：`terminate()` 后必须把引用置 `null`。
- **MR-9 高频回调合帧（MUST）**：流式/高频进度驱动 DOM 必须 rAF 合帧。
- **MR-23 失败不静默（MUST）**：耗时操作必须有可见进度与明确结果，不得只剩空面板或暗遮罩；失败不得整体中断，必须保存进度、输出报告、让用户选择；不支持的能力如实说明，禁返假空清单。

## G. 工程与质量

- **L0-13 / MR-13 测试门（MUST）**：发版前测试全绿、零回归；端到端只对 Dev 实例；禁高内存/大规模测试。
- **MR-6 三形态同构（SHOULD）**：纯逻辑核心可跑独立 Web / 插件 / Node 测试三入口；核心层禁 DOM 依赖。
- **MR-11 依赖自包含（MUST）**：装完即用，不得要求用户跑构建；第三方库放 vendor 目录勿升级。
- **MR-12 宿主目录约定（MUST）**：Luker 用户扩展平铺，禁嵌套 `third-party`。
- **L0-15 中文（SHOULD）**：文档、注释、回复用中文；代码标识符与专有名词除外。
- **L0-16 端口段位（MUST）**：实例段独占；出厂默认端口禁用；本地服务统一端口；周边工具从约定段起号。
- **MR-24 禁硬编码（MUST）**：尺寸、超时、上限、URL、端口、平台名、颜色、文案一律走常量/配置/i18n。

## H. 性能

- **MR-25 性能预算（MUST）**：交互反馈 ≤ 100ms；本地部署从宿主拉取 ≤ 10s；任何操作不得慢于宿主原生；首屏与教程浮层必须即时。

## 展开与案例

- 全文细则：真源仓 `tavern-harness` 的 `rules/L0-global.md`、`rules/groups/*.md`、`rules/frontend-ui.md`。
- 事故案例：`rules/pitfalls.md`（P-1 ~ P-19），只在排查时读。
- 本仓特有约束写在本块末尾「项目覆盖」节，不得写进正文。

## 项目覆盖

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
- `test/` — Vitest（**已纳入版本控制**，见 `.gitignore` 注记「测试目录按用户最新要求不再忽略」；`npm test` 当前 956 passed / 2 skipped）
- `docs/superpowers/specs/` 与 `docs/superpowers/plans/` — 设计规格与实施计划；`docs/research/` — Luker 机制研究报告
- `.trellis/` — Trellis 任务系统（见上方 TRELLIS 块）

## 常用命令

```bash
npm test          # Vitest 全量（当前 956 passed / 2 skipped；test/ 本地专属，不入库）
npx vitest run test/xxx.test.js   # 单文件
npm run build     # vite build --base=./
npm run dev       # vite 开发服务器（独立模式手测）
npm run check:css-scope       # CSS 作用域守卫（PostCSS AST）
npm run check:dom-injection   # DOM 注入守卫（innerHTML 未转义插值）
npm run check:template-source # 单一模板源守卫（index.html 只许骨架）
```

## 关键规则（踩过的坑，务必遵守）

1. **CSS 作用域铁律**：`style.css` 所有规则必须挂在 `#app.app-container`（独立态与模态态统一根）或自有覆盖层 id（`#st-converter-modal-overlay` / `#wb-detail-overlay`）之下；`.st-converter-drawer-app` 已随抽屉注入删除（2026-10-15），出现即陈旧。裸选择器（`.menu_button`/`.inline-drawer`/`.text_pole`/`.checkbox_label` 等酒馆全站类）会污染宿主全站 UI——2026-09 已发生并修复过，严禁回归。禁止在容器上硬编码覆盖 `--SmartTheme*` 宿主主题变量（金色系教训）；配色一律继承宿主变量 + `var(..., 回退值)`。
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
