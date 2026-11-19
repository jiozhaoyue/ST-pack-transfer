# CLAUDE.md

<!-- RULES-POINTER v1 -->
本仓工程规则唯一真源位于 `.trellis/spec/guides/`：`.trellis/spec/guides/rule-catalog.md`（30 条判据）、`.trellis/spec/guides/rule-details.md`（细则）、`.trellis/spec/guides/iron-rules.md`（会话注入铁律）、`.trellis/spec/guides/rule-triggers.md`（触发索引）。动手前先读，收尾前跑 `npm run verify:rules`（用法见 `.trellis/spec/guides/rule-catalog.md`）。
本文件只放指针、不复述真源条文；冲突以真源为准。

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目定位

四酒馆（SillyTavern / Luker / TauriTavern / PureTavern）数据包互转工作站。**纯前端为主、Authority 服务端为可选增强层**——核心功能在纯浏览器环境完整闭环，Authority 可用时自动增强（产物持久化/断点托管），不可用时静默降级，绝不阻塞主路径。

## 常用命令

```bash
npm test                          # Vitest 全量（当前 934 passed / 2 skipped / 95 文件）
npx vitest run test/xxx.test.js   # 单文件
npx vitest run -t "用例名"         # 单条用例
npm run dev                       # 开发热重载（仅开发；**UI 验收不用它**），本地端口 3040
npm run build && npm run preview  # UI 验收：本地静态服务器托管 dist（同一端口 3040）
npm run build                     # vite build --base=./（产出 GitHub Pages 静态站点）
npm run e2e                       # 实例侧 E2E（需要 Dev 实例在跑；只许连 Dev，见 e2e/lib/guard.cjs）
npm run e2e:web                   # 独立 Web / 云子路径形态 E2E（**不需要实例**；自己起静态服务器）
npm run e2e:web -- --rebuild      # 同上，强制重建 dist（mtime 判据看不见"删了源码文件"）
npm run check:css-scope           # CSS 双前缀铁律守卫（PostCSS AST）
npm run check:dom-injection       # DOM 注入守卫（innerHTML 未转义插值）
npm run check:template-source     # 单一模板源守卫（index.html 只许骨架）
npm run check:dom-scope           # 宿主 DOM 写入作用域守卫（锚点白名单）
npm run check:control-consumer    # 控件消费点守卫（拦"死控件"）
npm run gen-fixtures              # 重新生成测试固件 fixtures/
```

无独立 lint/typecheck 命令——类型契约靠 JSDoc + 运行时目标守卫，质量门槛就是 `npm test` 全绿。

**UI 验收只走** `npm run build && npm run preview`（本地静态服务器 3040，与 dev 共用唯一端口）；禁止 `file://` 或 `npm run dev` 作为验收入口（2026-11-09 用户裁定）。按用户禁令，不得跑全量/大内存测试，只跑目标小测试。

**改端口**：只改 `vite.config.js` 的 `LOCAL_PORT`（默认 `3040`），或启动时设置环境变量 `PORT`；dev / preview / 本地静态服务共用这一处，不另开第二端口。

## 高层架构（跨文件才能看懂的部分）

### 三形态入口，同构核心

同一份 `src/core/` 代码跑在三种环境，入口分别是：

1. **独立 Web**：`index.html` 仅为空骨架（`#app.app-container`），`bootstrap()` 检测到 `#app` 为空时注入 `getWorkbenchHtml()`（**已无参数**）——与插件态共用同一模板函数。
2. **酒馆扩展插件**：`index.js` 检测宿主后向扩展列表注入行按钮，点击经 `openConverterModal()` 打开 `#st-converter-modal-overlay` 全屏模态（与独立态同一份模板）；并按宿主向原生备份 UI 注入入口按钮。抽屉注入（`mountSettingsDrawer`）已于 2026-10-15 删除。
3. **Node/Vitest**：`worker-client.js` 检测无 `Worker` 时自动主线程降级，转换逻辑零改动可测。

### 分层边界（硬性）

- `src/core/` — 纯逻辑，**禁止 DOM 依赖**。`transform.js`（911 行，convert 主入口）、`plan-preview.js`、`delta.js`、`splitter.js`、`zip-io.js`（vendor zip.js 封装）、`pt-archive.js`（PT 原生归档 → hub 重建，`D-23`）、`pack-inject.js`（聊天库注入判定，纯决策）、`zip-augment.js`（源包增强，纯 IO）、`asset-list.js`（官方资产列表）、`transfer-plan.js`（分片台账）、`webdav-client.js`、`transfer-target.js`、`host-capabilities.js`。
- `src/app/` — 应用层（只被根 `index.js` 使用）。`task-runtime.js`（半成品持久化 / 断点节流 / 批量续传判定）、`conversion-runner.js`（转换接线：`TaskManager` + 暂停 / 继续 / 中止 / 真增量续传）、`transfer-runner.js`（分片上传/下载/断点）、`pull-entry.js`（从宿主拉取的顺序编排）。
- `src/ui/` — 可 DOM。`workbench-template.js` 是 HTML 模板唯一来源，`host-bridge.js`（1202 行）负责宿主嗅探/CSRF/拉取/恢复/注入；`chat-store-bridge.js` 是**与外部聊天库打交道的唯一落点**（特性检测 + 有界等待 + 静默降级），`chat-store-inject.js` 负责三个方向的编排（打包并入 / 从库导出 / 还原后入库）。
- `src/storage/` — `db.js`（IndexedDB，DB_VERSION 2，files store 带 `origin` 字段区分 upload/host-export/converted/delta/split-part）、`authority-store.js`（可选后端适配器）。
- `public/` — Vite 的 publicDir（构建时摊平到 `dist/` 根）。当前只有 `file-protocol-notice.js`：`file://` 双击时给一句说明（模块脚本在 `file://` 下必被 CORS 拒，不提示就只剩白屏）。
- `index.js` — 根控制器，串起 detectHost → 视图装配 → `conversionRunner`（暂停 / 续传）→ 产物落地。
- `src/vendor/` — zip.js / fzstd / fontawesome 本地副本，**勿升级改动**，只用其已有 API。

### 关键机制（需读多文件才懂）

**平台代码双轨制**：宿主检测返回 `st|luker|standalone`（平台码），转换器只认 `st|l|tt|pt`（布局码）。凡把宿主平台传给 `convert()` / 文件名模板，必须经 `host-bridge.js` 的 `hostLayoutCode()` 归一（`luker→l`）。`/api/users/backup` 等端点调用则用平台码（ST 不支持 selection、Luker 支持）。

**Worker 并发管线**：`worker-client.js` 把 plan/convert 任务投给 `converter-worker.js`；pause/abort 先 `worker.terminate()` 再重建（见 `034b7ab` 修复——terminate 后必须重置 `workerInstance`）。Node 环境整个 Worker 路径降级为主线程同步执行。

**TaskManager 断点续传**：`task-manager.js` 是纯状态机（running/paused/aborted/done/failed），副作用经 adapter 注入（OPFS checkpoint 或 Authority KV）。`transform.js` 的 `options.signal`/`resumeCrcMap`/`onEntryDone` 三参数与其对接——crc 命中即跳过并计 `resumedCount`。

**Authority 适配器降级链**：`authority-store.js` 探测 `window.STAuthority.AuthoritySDK`，不可用时所有接口返回 `null/false`，调用方无需分支。`createCheckpointAdapter()` 实现与 TaskManager 持久化 adapter 相同的 `{save,load,remove}` 接缝。blob 按 4MB 分块落盘 + KV 存清单。

**宿主 UI 注入**：`host-bridge.js` 用共享 `watchHostDom` MutationObserver（200ms 去抖）统一四个注入点（扩展抽屉/菜单/账号弹层/管理面板行/Luker 备份管理器），幂等 + `dataset.stZipInjected` 防重，宿主重渲染自动自愈。注入元素复用宿主原生类（`menu_button` 等），零新增 CSS。

### 产物统一出口

所有转换/宿主拉取产物进待导出区（`export-queue.js`），**不自动下载**；临时条目在下载/存工作区时才入 IndexedDB。ExportQueue 渲染走 rAF 合帧防批量转换时整表高频重建。

## 踩过的坑（违反即返工）

1. **CSS 作用域铁律**：`style.css` 所有规则必须挂在 `#app.app-container`（独立态与模态态统一根）或自有覆盖层 id（`#st-converter-modal-overlay` / `#wb-detail-overlay`）之下；`.st-converter-drawer-app` 已随抽屉注入删除（2026-10-15），出现即为陈旧描述。裸选择器（`.menu_button`/`.inline-drawer` 等酒馆全站类）会污染宿主全站 UI——2026-09 实测发生并修复，严禁回归。配色一律继承宿主 `--SmartTheme*` 变量 + `var(..., 回退值)`，禁止硬编码金色系。
2. **严禁写本地酒馆实例目录**；实例更新只走 Git（`git clone`/`git pull`/原生扩展安装器）。
3. **计划先行**：Trellis 任务 PRD 未回填不得提交代码；`implement.md` 复选框随执行实时勾选。
4. **完成即推送**：测试绿后 `git push` 到 origin，不得只提交不推送。
5. **子代理只准用自身能力 + 并行不阻塞**：只调用本 agent 平台自带的子代理功能（Copilot 即 `runSubagent`）；**禁止调用其他 agent**（`trellis channel spawn` 的 claude/codex worker、pebrel delegate、外部 CLI agent 等）。多个子代理必须**一次性并发派发**，主代理同一轮内并行推进自身工作，不串行、不空等、不轮询。
6. **✅ 暂停 → 续传后产物缺条目（2026-09-28 **已修**）**：`transform.js` 的 `onProgress` 在**投递给 writer 之前**上报 ⇒ 断点清单记的是「已读到」而非「已写入」；暂停走 `worker.terminate()` 丢掉半成品；续传按 crc **跳过**而目标 zip 是**新建空包** ⇒ 被跳过的条目**旧产物没有（已丢）、新产物也没有（被跳过）**，用户拿到**残缺包**却看到"转换成功"（实测 1500 条聊天 → 1437 条）。
   **既有测试为何没抓到**：单测 `test/convert-resume.test.js` 锁的是**机理**（`not.toContain`）、实例矩阵只断言「日志出现跳过 N 项」——没有一条问过**产物完不完整**。
   **现修法（真增量续传）**：跳过门改为「**半成品里真有它的字节**」（`transform.js` 的 `appendedNames`）；暂停改**协作式收尾**（worker `close()` 成合法 zip → 主线程落 OPFS → `setPauseCheckpoint`）；续传用 zip.js `appendZip` **原样搬运**（字节级、零重压缩）再继续写。降级链（无 OPFS/配额/收尾失败/不同源）一律回到「完整重做」且**必须留日志**。
   取证与全部读数：`.trellis/spec/frontend/state-management.md` §8、`.trellis/spec/guides/standalone-web-and-cloud-e2e.md` §4.6、E2E `npm run e2e:web -- --only pause-resume`（判据：**跳过 N > 0 且 源 == 产物**，缺一不算真增量）。
7. **`#file-input` 只在「尚无源包」时采纳新文件**：同一页面里再喂一个包**不会**换源包（只入库）。E2E 里"量第二个包"必须**另开上下文**，否则量到的是第一个包（2026-09-28 实测把 66 MB 用例量成了 12 MB 包的耗时，读数"308 MB/s"一眼假）。
8. **改 `base` 要改构建脚本，不是 vite.config**：`npm run build` 是 `vite build --base=./`，**CLI 标志覆盖**配置里的 `base` —— 只改 `vite.config.js` 对产物毫无影响（实测过一次"无效实验"）。
9. **运行器的 `dist` 新鲜度判据只看 mtime**：**看不见「删了源码文件」** ⇒ 凡涉及删/换文件的实验必须 `npm run e2e:web -- --rebuild`。
10. **`[hidden]` 压不过同特异度的 `display`（2026-10-14 实测事故）**：`style.css` 给 `.wb-gate` 写了 `display:flex`，与插件内全局兜底 `#app.app-container [hidden]` **特异度相同**，源码顺序决定胜负 ⇒ 空壳框永远可见；而 `showGate()` 全仓无调用点 ⇒ 从不触发、永远显示、内容为空。**默认隐藏的容器若被写了 `display`，必须另写一条特异度更高的 `[hidden]` 覆盖规则**。同类：空容器占位（`#category-summary-badge` 空时是个空胶囊，用 `:empty{display:none}` 治）。
11. **两个 UI 守卫按「文件源码正则」提取控件与文案** ⇒ **注释里不得出现控件标签字面量**（会被当成无 id 控件误报）；要断言**渲染结果**必须调用 `getWorkbenchHtml()`，读文件源码会把注释一并算进来（本轮「文案纪律」断言全误报过一次）。守卫只强制「声明存在」，**不验证声明为真**——死控件能通过。
12. **宿主原生入口禁止同构假设，调研必须先读宿主 `docs/**`（2026-11-04 事故）**：
    - **TT 没有** `#account_button` / `.userBackupButton`；原生导出在扩展列表的「Data Migration」→ `#data_migration_export_button`。
    - **PT 有**一方扩展「PureTavern 数据管理」→ `#pure-tavern-data-management-entry` → `dialog#pure-tavern-data-management-dialog` → `#ptdm-export`；且 PT **没有** `/api/users/backup`，它走 `POST /api/backups/archive/export`（`{moduleIds, includeSecrets}`）。
    - 曾凭「TT 是 ST 派生」+ 一次 grep 就断言 TT/PT「无原生入口」，被用户当面否决。
    - 调研顺序：宿主 `docs/**`（含子目录）→ 一方扩展的 `manifest.json` / `settings.html` → 运行实例 DOM 取证；**禁止**用 grep 源码代替调研。
    - 注意 TauriTavern 实例仓里的 docs/API/Migration.md（宿主侧文件，不在本仓）是**「从 SillyTavern 扩展适配到 TauriTavern」指南**，不是数据迁移文档。
    - 事实表见 `.trellis/spec/frontend/host-capabilities.md` 末节。

## Trellis 任务流

本项目用 Trellis 管理任务。当前任务 `python ./.trellis/scripts/task.py current`；分层规范 `.trellis/spec/backend/`（core）与 `.trellis/spec/frontend/`（ui）。更全的项目规则与统一开发规则见 [AGENTS.md](./AGENTS.md)。

<!-- TAVERN-RULES:START v3.0.0 -->
<!-- 本块由 tavern-harness/scripts/modules/rules_sync.py 自动生成，请勿手动编辑 -->
<!-- 真源: tavern-harness · registry/rules.json · 类别 dev · v3.0.0 -->
<!-- 同步时间: 2026-11-17T14:25:26Z -->
<!-- 内容哈希: sha256:b963f91a3fc815cebebbf99b051693b1fe649938ec89d8698b5594baa1c9d1c4（仅覆盖规则正文，不含头部与项目覆盖） -->
# 统一开发规则（v3.0.0 · 酒馆开发）

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

## 规范入口

- `.trellis/spec/guides/rule-catalog.md`（规则判据）与 `.trellis/spec/frontend/index.md` / `.trellis/spec/backend/index.md`（分层规范索引）

## 技能策略

- 允许 pack：dev, upstream
- 禁止 pack：card, infra

## 项目覆盖
（本仓自有内容，同步器保留；无则留空。）

<!-- TAVERN-RULES:END -->

## 项目细则补充（2026-11-05 追加，用户明令）

1. **文档先行 / 禁止直接读源码理解功能**（MUST）：任何功能理解先查
   `docs/DEVELOPER-GUIDE.md`、`.trellis/spec/`、`mini-trellis mem recall`。文档不足时**先补文档**，
   使「只读文档即可知道怎么改」；只有进入编辑阶段才允许读目标源码片段，读完把知识回流到文档。
2. **计划先落盘**（MUST）：多项改动先写当前计划文件（`docs/PLAN-<日期>-<主题>.md`，目标 / 判据 / 改点 / 依赖 / 分工），
   执行中实时更新状态与证据，禁止凭记忆批量补记。
3. **规则注入门禁**（MUST）：`.claude/hooks/session-start.py` 每次会话启动注入 `## 铁律`；
   `user-prompt-submit.py` **每 5 条用户消息注入一次**；`search-gate.py` 作为 `PreToolUse`
   门禁，未完成 Web/GitHub 检索前拦截实现类写操作（`.trellis/`、`docs/`、`tasks/` 与只读放行，
   `TRELLIS_SEARCH_GATE=0` 紧急禁用）。规则只改 `iron-rules.md`，hook 只读文件。
4. **数据正确性优先**（MUST）：配额 / 体积 / 勾选读数必须同源、实时、可复核；读不到就如实显示
   「未提供」，禁止假 0、假缓存、假成功。
5. **布局铁律**（MUST）：控件与自身文字不得拆行；图表用自适应网格（宽屏最多 4 列），不得压成单条并排；
   每个图表 DOM 边相互贴着、可拖拽改高宽、不留空白；默认隐藏容器必须补高特异度 `[hidden]` 规则。
6. **只认上游宿主**（MUST）：Luker 只认原上游；任何 fork 仅开发版，不得把 fork 特有行为当产品事实。
7. **宿主设置只读**（MUST）：从宿主拉取只打开原生拉取位置并弹窗提示用户自己点「从宿主拉取」；
   禁止自动点注入按钮，禁止更改宿主任何勾选/设置记忆；默认不勾选仅在拉取后的插件侧生效。
8. **文档与 README 同步**（MUST，2026-11-11 用户明令）：每次功能更新 / 行为变更，必须在
   **同一次提交内**同步更新 `docs/DEVELOPER-GUIDE.md` 与 `README.md`；只改代码不改文档视为未完成。
   判据：`git diff` 中改动的 `src/` 文件必须在两份文档里有对应条目或读法更新。
9. **实例实测走 Playwright 无头后台**（MUST，2026-11-12 用户明令）：Dev 实例（尤其 Dev Luker）
   的界面实测一律用 Playwright 无头浏览器、后台运行；复用 `e2e/` 的库 API（全局解析，不新装包），
   不得弹出前台窗口、不占用前台浏览器面板。
10. **响应式美学**（MUST，2026-11-12 用户明令）：任何响应式不得出现不美观的响应；美观优先，
   不为塞下而硬做、不得显示不全。只允许「换行 / 堆叠 / 容器滚动 → 整块隐藏次要信息 →
   纯图标（带 aria-label/title）」；禁止压扁控件、缩小字号硬塞、`line-clamp` 裁掉功能性文案。
   判据：`.trellis/spec/frontend/responsive-and-aesthetics.md`。
