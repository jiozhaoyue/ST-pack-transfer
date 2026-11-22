---
title: 开发者指南
layout: default
translation: pending
---

# 开发者指南

本页面向想阅读源码、构建或参与改进的开发者。普通用户请从 [安装与部署](install.md) 开始。

## 一、运行形态

同一份核心逻辑支持五种入口：

| 形态 | 入口 | 适合场景 | 主要限制 |
| --- | --- | --- | --- |
| SillyTavern 扩展 | 仓库根目录装进扩展管理器 | 在酒馆内直接拉取、恢复、管理扩展 | 依赖 ST 的 `/api/users/*` 与扩展端点 |
| Luker 扩展 | 仓库根目录装进扩展管理器 | 同上，并额外支持 Luker 账户窗口与存储页 | 账户窗口 / 存储页需要 Luker 2.9+ |
| TauriTavern 扩展 | 仓库根目录装进扩展管理器 | 在 TauriTavern 内转换与迁移 | 宿主能力按公开端点探测 |
| PureTavern 扩展 | 仓库根目录装进扩展管理器 | 在 PureTavern 内转换与迁移 | 宿主能力按公开端点探测 |
| 独立 Web / 单文件 HTML | 根目录 `index.html`（HTTP）或下载的单文件 HTML（`file://`） | 纯本地转换、分析、分卷、清单化 | 无法直接读写酒馆后端；云功能受 CORS 限制 |

### 单文件 HTML 的确切下载位置

- **从 GitHub Release 下载**：`https://github.com/jiozhaoyue/ST-pack-transfer/releases/latest/download/ST-pack-transfer-offline.html`
- **在线 HTML（无需下载）**：`https://jiozhaoyue.github.io/ST-pack-transfer/`
- 说明：offline HTML 不再提交进版本控制，每次打 tag 时由 `release.yml` 构建并附到 Release。

根目录的 `index.html` 是开发骨架，**不能单独下载后双击运行**；它需要 Vite 开发服务器或构建后的静态服务器。单文件 HTML 才是双击即用的形态。

转换、分析、分卷、清单化与局域网互传（WebRTC 点对点直连）均可离线使用。运行时联网分两类：默认自动联网项（问题报告面板的上游坐标反查与 Issue 模板拉取，失败静默降级）与用户主动触发项（检查更新、自动更新规则、云端提交日志、Issue 提交、教程示例同步、S3 / WebDAV 云端仓库、OAuth 授权）。逐项端点、触发条件与降级行为见 [联网功能完整清单](../test-results/network-functions-list.md)。

## 二、宿主与浏览器兼容性

### 宿主版本

| 宿主 | 已实测版本 | 最低要求 | 说明 |
| --- | --- | --- | --- |
| SillyTavern | 1.19.0 | 1.19.0 级别端点 | 更早版本未验证；缺少端点时会明确降级并提示 |
| Luker | 2.7.0 / 2.9.0 级别 | 2.7.0 级别基础功能；2.9+ 账户窗口 | 2.9+ 才提供自绘账户窗口、图形化存储页与备份选择 |
| TauriTavern | 当前公开桌面构建 | 按宿主公开版本 | 扩展注入与迁移端点按能力探测，不锁定内部版本 |
| PureTavern | 当前公开版本 | 按宿主公开版本 | 部分迁移端点在宿主侧可能返回 501，插件会如实提示 |
| 独立 Web | 不适用 | 现代浏览器 | 无宿主后端，宿主相关功能明确禁用 |

“已实测”表示在当前开发环境的真实宿主中完成过注入、转换、拉取或恢复验证；“最低要求”表示低于该版本不承诺对应端点存在。插件不会猜测宿主版本，而是按能力探测并降级。

### 浏览器 / WebView

| 内核 | 建议版本 | 已验证 | 降级行为 |
| --- | --- | --- | --- |
| Chromium（Chrome / Edge / 其他 Chromium 浏览器） | 120+ | Chromium 151 实测 | 支持文件选择保存与拖拽下载；旧内核回退为普通下载 |
| Firefox | 120+ | 未单独实测 | 不支持 `showSaveFilePicker` / 拖拽下载时回退为浏览器下载 |
| Safari / iOS WebView | 17+ | 未单独实测 | `color-mix` 不支持时使用普通 rgba 边框；文件保存回退为下载 |
| Tauri WebView | 随宿主 | 按宿主实测 | Windows 使用 WebView2，macOS 使用 WKWebView；以宿主实际能力为准 |

移动端按 390×844 视口做布局验收；桌面端按 1440×900 做布局验收。手机浏览器与酒馆内置 WebView 都走同一套响应式规则。

## 三、目录结构

| 路径 | 职责 |
| --- | --- |
| `index.html` | 独立 Web 的空骨架，只提供 `#app` 容器 |
| `index.js` | 根控制器：宿主嗅探、动作绑定、启动；预览正文支持原文／渲染切换，切换只重绘正文 |
| `src/app/` | 应用层执行器：把 core 的业务能力接线成可运行流程（五个 runner，见下表） |
| `src/core/` | 纯逻辑核心：转换、检测、计划、分卷、差量、体积模型、引擎桥、脱敏分发与上传门禁 (`sanitize-share.js`)、双通道上游解析 (`upstream-resolver.js`)、五层体检 (`inspect.js`)、教程占位树 (`demo-tree.js`，扁平清单经真实 `buildChartTree()` 生成) |
| `src/ui/` | 有 DOM 的界面层：模板、视图、宿主桥、待导出区、设置、体检视图、问题报告、传输面板；`vue/` 为渐进式迁移组件（`InspectModal.vue` 体检弹窗、`store.js` 响应式状态出口） |
| `src/storage/` | IndexedDB 封装 |
| `src/data/` | 目标平台、UI 令牌、演示数据等可读配置 |
| `src/vendor/` | 本地依赖副本，勿升级改动 |
| `docs/` | 公开文档站（纯 Markdown） |
| `download/` | 可下载的单文件 HTML 产物 |
| `test/` | 单元测试 |
| `tooling/` | 构建、文档同步、静态守卫 |
| `scripts/` | 本地实例探针与调试脚本（不随公开仓库分发） |

### src/app 应用层执行器（五个 runner）

`src/app/` 是把 core 的纯逻辑接线成可运行流程的一层：控制器（`index.js`）只注入依赖，不重复实现状态机语义。共五个执行器，各自职责与关键导出如下。

| 模块 | 职责 | 关键导出（file:line） |
| --- | --- | --- |
| `src/app/conversion-runner.js` | 转换任务运行器（续传 / 暂停 / 中止）。后经恢复接线，是暂停与真增量续传的**唯一接线点**。设计约束：断点必须挂 `onProgress`（`onEntryDone` 只在主线程降级分支触发，浏览器里永不触发）；暂停走 `TaskManager.pause()` → abort → Worker 协作式收尾 → `onPaused` → `persistPartial`；续传跳过门是「半成品里真有这条字节」，台账只做 crc 冗余校验。 | `createConversionRunner()` (`:89`)、暂停标记 `PAUSED_MARKER_KEY='st-pack-transfer:pausedTask'` (`:22`)、`readPausedMarker` / `writePausedMarker` / `clearPausedMarker` (`:30` / `:42` / `:48`)、`buildResumeEntries()` (`:61`) |
| `src/app/task-runtime.js` | 任务运行时（批次 / 断点 / 半成品 / 调试探针），从旧控制器抽出——属业务逻辑而非界面。`TASK_KINDS` 为 fetch / convert / convert-batch / restore，`TASK_PREFIX` 为对应 id 前缀；`taskKindOf()` 必须按前缀长度降序匹配，否则 `convert-batch-` 会被 `convert-` 抢先吃掉而静默降级成单包语义。断点节流窗口 64 条 / 2000ms 与 core 的 `task-manager.js` 同源，不另立数字。 | `TASK_KINDS` (`:13`)、`TASK_PREFIX` (`:21`)、`taskKindOf()` (`:40`)、`partialNameFor()` (`:61`)、`hasRoomForPartial()` (`:74`)、`persistPartial()` (`:108`)、`createCheckpointThrottle()` (`:185`)、`attachConversionProgress()` (`:277`)、`runBatchItems()` (`:304`)、`mountDebugProbe()` (`:379`) |
| `src/app/transfer-runner.js` | 传输执行器（S3 / WebDAV 共用）。固定分片默认 8 MB，分片对象名 `<name>.partNNN`，清单最后写；断点续传目标端 HEAD 命中即跳过；同内容再传全分片命中 ⇒ 零字节上传；下载优先按清单拉分片，缺清单回退单对象 Range；可中止（`signal`），不吞异常。仅接受注入的 target / crypto / Blob。 | `sha256Hex()` (`:38`，无 `crypto.subtle` 返回空串而非假装已验证)、`createTransferRunner()` (`:85`) |
| `src/app/backup-set-runner.js` | 内容寻址备份集执行器（S3 / WebDAV 共用），与 transfer-runner 分工：后者管单对象分片，本模块管备份集语义（条目指纹 / 对象去重 / 快照清单 / 保留策略 / 恢复装配）。不变量：对象 key = 明文 sha256，跨快照共享只增不改；快照清单完整，恢复不依赖快照顺序；加密只影响字节不影响 key。 | `uploadBackupSet()` (`:73`)、`restoreBackupSet()` (`:278`)、`removeSnapshotFromSet()` (`:367`)、`readBackupSet()` (`:399`)、`readSetRegistry()` (`:404`)、`updateSetRegistry()` (`:422`) |
| `src/app/pull-entry.js` | 宿主拉取入口编排（纯顺序编排，不碰 DOM / 网络，便于单测锁死顺序）。顺序契约为「流量警告 → 原生界面操作指引 → 打开原生界面」：Luker 2.9 账户窗口是顶层 `dialog.dw-layer`，先开窗会把后续 `Popup.show.text` 压在后面；账户窗口已开时再调 `openAccountWindow` 只导航不重建。把提示放到开窗前，两个症状一起消失。 | `beginHostPull()` (`:30`)、`beginNativePull()` (`:78`) |

### 存储 schema（IndexedDB，`src/storage/db.js`）

数据库名 `st_zip_converter_db`，`DB_VERSION = 2`（`db.js:14-15`）。升级动机（`db.js:5-7`）：files store 增加 `origin` / `group` 字段，支持统一工作区单列表按来源分类；旧 v1 记录在 `onupgradeneeded` 中按 `role` 映射 origin，升级无损。

三个 object store（`db.js:17-21`、创建于 `db.js:104-112`）：

| Store | keyPath | 职责 |
| --- | --- | --- |
| `files` | `id` | 暂存数据包（上传源包 / 宿主导出 / 转换产物 / 增量补丁 / 分卷切片），支持 OPFS 索引记录（`blob` 可为 null，读取时按需从 OPFS 打开） |
| `workspace` | `key` | 会话工作区记忆，固定键 `active_session`，覆盖前把旧值备份为 `active_session_prev`（不丢数据，但格式照旧作废） |
| `preferences` | `key` | 用户全局偏好，固定键 `user_preferences` |

来源枚举 `ORIGINS`（`db.js:34-47`）：`upload` / `host-export` / `lan` / `converted` / `delta` / `split-part` / `export-copy` / `source-backup` / `report` / `target-backup` / `cloud-restore` / `vault`。其中 `vault` 仅供读取旧记录（旧 vault-store 模块已删除，不再产生新条目）。

关键不变量：

- origin 越界门禁（`db.js:232-242`）：`saveFile` 只接受 `VALID_ORIGINS`（由 `ORIGINS` 全部取值构成的 Set，`db.js:50`），非法值回落 `migrateRoleToOrigin({ role, metadata })` 并告警一次，避免任意字符串污染单列表来源分类。
- v1 → v2 迁移映射（`migrateRoleToOrigin()`，`db.js:56-68`）：带分卷标记（`isSplitPart` / `partIndex` / `partTotal`）→ `split-part`；带增量标记（`isDelta` / `deltaBase`）→ `delta`；`role === 'output'` → `converted`；其余 → `upload`。升级游标补齐逻辑在 `db.js:114-129`，读取兜底归一化在 `normalizeRecord()`（`db.js:73-79`）。
- 会话版本签名（`db.js:400-417`）：`buildWorkspaceRecord()` 把 `schemaVersion = SESSION_SCHEMA_VERSION` 放在展开之后，调用方同名无法覆盖；`loadWorkspaceState()` 原样返回，不迁移、不补齐字段，兼容判定交给上层（U-1 禁止兼容旧数据）。
- 大包串行写（`db.js:201-208`、`:262-270`）：`>= 16MB` 且非 OPFS 索引的 blob 进单写队列，避免大包 put 与压缩 / 转换热路径争抢 IO。
- 有界升级等待（`db.js:146-164`）：版本升级被其他标签页旧连接阻塞时，10 秒限时拒绝，让上层走内存态降级而非无限挂起。
- 存储不可用（`isStorageSupported()` 为 false，如 Node 环境）时所有读写返回 null / 空值，走纯前端内存降级路径。

`src/ui/` 下与本轮改动相关的四个模块：

- `src/ui/issue-report.js`：环境采集与报告生成模块，在本地采集环境信息并脱敏后生成 Markdown；新增 GitHub Issue Forms YAML 模板的同步与解析（本地 yml 优先、本仓 raw 次之、内置最小模板兜底），按模板 body 动态组装正文；前置勾选满足判定与缺失清单；双通道动态解析本仓与上游坐标（不做硬编码），据此生成议题搜索页链接与文档仓库链接；报告预览支持原文与渲染两种模式，原文逐字转义、渲染走安全 Markdown 子集。日志级别聚合由纯函数 `filterEntriesByMinLevel()` 完成：logger 的 `getEntries()` 是精确等值过滤而非「≥」，因此级别聚合必须自行比较；比较依据 `ISSUE_LEVEL_ORDER`（DEBUG:10／INFO:20／SUCCESS:20／WARN:30／ERROR:40），`info` 档显式包含 SUCCESS，避免与 INFO 同优先级的成功类审计条目被静默丢弃。GitHub 新 Issue 出口改用 `buildGitHubNewIssueUrlSafe()`，URL 超过 `MAX_ISSUE_URL_LENGTH`（8000）时返回 `{ok:false, reason:'too-long', suggestion:'copy-markdown'}`，由调用方提示改用复制，不再静默产出不可用链接。
- `src/ui/settings-store.js`：设置持久化模块，在浏览器 localStorage 与宿主 `settings.json` 之间同步设置，按凭据各自存放位置剥离仅浏览器的敏感项；读取或写入失败时静默回落默认值，不阻塞主路径。
- `src/ui/vue/InspectModal.vue`：A~E 五层体检结果弹窗，按层展示结论并给出总体判定；接收 `isOpen` / `report` / `title`，在报告合格且带文件时允许存入工作区，向外发出 `close` 与 `save-to-workspace`。
- `src/ui/vue/store.js`：Vue 3 响应式状态中心，以 `reactive` 集中管理包、选中项、当前分区与弹窗等状态，用 `computed` 派生视图数据，并通过具名函数收敛状态变更（单向数据流）。
- `src/ui/vue/mount.js`：体检弹窗的渐进式挂载适配器，用 `createApp` + `h()` 渲染 Vue 组件；Vue 不可用或容器缺失时返回 `null` 静默降级，绝不影响主路径。
- `src/ui/settings-panel.js`：设置面板渲染与交互模块；问题报告表单含模板下拉与按模板生成的动态字段、平台与账号只读下拉（令牌始终取本机专用存储，不随账号切换）、日志实时统计与附带勾选、两项强制前置确认勾选、原文／渲染切换按钮组，以及本仓与上游双线跳转按钮（坐标缺失时置灰并提示未提供）；owner/repo 输入框已移除，仅保留隐藏兼容字段；仍经 `[data-issue-action]` 事件委托提供复制报告／导出 MD／新建 Issue 三个出口。问题报告的附带日志新增级别与条数两个下拉：`SETTINGS_DEFAULTS` 默认 `issueLogLevel:'warn'`、`issueLogCount:'100'`（安全最小化），白名单限定 level 为 all/debug/info/warn/error、count 为 50/100/200/500/all；两下拉带 `aria-describedby="issue-log-summary"`，统计行 `#issue-log-summary` 用 `role="status"` 播报、并有独立调试提示行 `#issue-log-debug-hint`。下拉的禁用态与统计文案由纯函数 `applyIssueLogControlsState(includeLogs, level, count)` 计算并返回 `{disabled, summaryText, debugHintText}`，避免散落的状态判断；无匹配日志时文案用 `issue.logEmptyAtLevel`（无括号的「暂无{level}日志」）。new-issue 出口按 `buildGitHubNewIssueUrlSafe()` 的三种 reason（too-long／no-coords／ok）分流处理。
- `syncPackagesFromState`（`src/ui/vue/store.js` + `index.js` 三处调用）：包列表从命令式状态单向同步进 Vue 响应式 store，全部 fire-and-forget 且吞异常，绝不阻塞主路径。
- `scripts/i18n-guard.js`：UI 中文硬编码守卫；扫描 `.js` 与 `.vue`，`stripVueNonText()` 剥离 `<style>` 与注释后再检测，避免 SFC 样式与注释误报。
- `scripts/control-consumer-guard.js`：控件消费点守卫；只覆盖 `src/ui/workbench-template.js` 静态模板，运行时字符串拼装控件（如设置面板按钮）不在其范围，文件头已注明该边界。
- `src/ui/inspect-view.js`：体检结果展示模块。**体检外部文件独立入口已移除**——体检只跟随包卡（点包卡看报告），不再从设置或工具栏单独选择本地文件；`mountInspectPanel` 的 `onPickFile` 形参与容器保留仅为兼容既有调用方。
- `src/core/logger.js`：日志采集与脱敏核心。新增 `scrubDetailKeys(value)` 做键名级脱敏，递归折叠命中敏感键名（token／secret／password／api_key／credential／cookie 等）的值，带循环引用保护与 8 层深度上限；`redact()` 在原有 12 条规则之外追加 4 条：查询参数扩展、单引号密码、Google API Key、HuggingFace 凭据。

本仓的开发者规范由四份文件构成：`rule-catalog.md` 为 30 条判据，`rule-details.md` 为 95 条细则，`iron-rules.md` 为 45 条注入铁律，`rule-triggers.md` 为触发索引。四者条数口径不同但各自生效，引用时需指明是哪一份。

核心层不得依赖 DOM；界面层不得反向持有宿主判断。平台差异集中在宿主桥接层。

## 四、构建与测试

```bash
npm install
npm test                 # 单元测试
npm run build            # 生产构建，输出 dist/
npm run preview          # 预览 dist/，固定使用本地唯一端口 3040
npm run dev              # 本地开发服务器，同样使用 3040
npm run build:offline    # 生成单文件 HTML
npm run qa:static        # 静态守卫串跑
```

**本地端口只有一个**：`vite.config.js` 的 `LOCAL_PORT`（默认 `3040`），`dev` / `preview` / 本地静态服务共用；也可用环境变量 `PORT` 覆盖。不要再为预览另开端口，也不要占用 `5173`（env-sync 桌面应用的 Tauri `devUrl`）。

`npm run build:offline` 会生成：

- `dist-offline/ST-pack-transfer-offline.html`（本地构建产物，不入库）
- `download/ST-pack-transfer-offline.html`（本地副本，同样不入库，仅 Release 分发）

单文件 HTML 必须保持 `file://` 可双击运行：脚本为 IIFE、Worker 强制主线程降级、字体与样式内联、零外部资源。

**离线构建的生效入口只有一个**：`tooling/build-offline.mjs`（`package.json:25` 的 `build:offline` 指向此处）。白屏修复、plugin-vue（`tooling/build-offline.mjs:31` 的 import、`:86` 的 `plugins:[vue()]`）与 `NODE_ENV` define（`:95`）均以该文件为准。`scripts/build-offline.mjs` 是历史陈旧副本（末次提交 19cdd5d），全仓无实际调用，仅 `worker-factory.js:5` 与 `worker-client.js:22` 的注释提及；改动它不进入产物，勿据此判断白屏修复是否生效。

### 视觉与响应式约定

- **唯一产品断点 = 860px，JS/CSS 同源**：CSS 侧真源是根 `style.css:2344` 的 `@media (max-width:860px)`，JS 侧真源是 `src/ui/workbench-view.js:788` 的 `const MOBILE_MAX_WIDTH = 860`，两者同一份数值。判定用容器实际宽度（`hostViewportWidth()` 优先取 `#app` 宽度，回退 `window.innerWidth`），因为插件模态可能比窗口窄；`<= 860px` 走手机布局，860 以下数据包区改为切页按钮而非侧栏。历史上 JS 用 640、CSS 用 860 导致 641–860px 出现「已堆叠但无切页按钮」坏态（实测），现已统一，严禁再分叉。
- **纠正误传：1216 / 834 不是产品断点**。这两个数字是测试仿真视口尺寸，不是产品响应式断点；产品只有一个 860px 断点。守卫视口另有 390 / 439 / 768 / 1200（见下方 CDP 守卫与「列表行响应式」节），同样只是测量用的仿真宽度，不得当成布局断点写进代码或文档。
- **禁止整块实色填充**：按钮/胶囊/徽章条/注入入口一律「浅染底（`*-soft`）+ 1px 品牌描边（`*-ring`）+ 品牌色文字」；
  实色只用于 ≤16px 圆点、勾选标记、进度条、图表色块。目标平台按钮同理，选中项再加左侧 2px 色条。
  例外（用户裁定）：包卡宿主角标（`.pkg-host-tag`）用品牌**实心**小圆角块 + 深色文字，
  尺寸收紧到角标级；`ui-solid-fill-guard` 守卫不覆盖该形态（不拦截亦不断言），以本条裁定为准。
- **页头控件等高**：触屏断点下 `.icon-btn` 32px，`.header-theme-select` 同步
  32px（line-height 30px），并允许 `flex-shrink` 收缩——窄屏折行时不把相邻按钮挤出屏。
- **对比度**：强调控件文字与底色实测 ≥ 4.5:1；不要白字压品牌实色底。
- **手机滚动**：唯一纵向滚动容器是 `.app-main`；只有自带内滚的视图（传输/扩展）才禁外滚，
  禁止把 `overflow-y:hidden` 写成全局手机规则。
- **触屏桌面布局**：`@media (pointer: coarse)` 下折叠箭头 ≥24px、紧凑文字按钮 ≥28px。
- 自动守卫：`npm test -- ui-solid-fill-guard`。
- 改动 UI 后跑 13 视口矩阵：`node tooling/ui-audit/matrix.cjs`（需本地开发服务），
  产物在 `test-results/audit/<stamp>/`，含截图、`probe.json`、`summary.md`。

### 更新记录弹窗与身份徽标（术语与契约）

- **术语统一**：「更新记录」「提交记录」「更新日志」指同一处弹窗（`openChangelog()`），
  与 Git 可视化泳道图（`#zone-side-git`）无关。代码、文档、注释、回复不得混用。
- **三列恒在**：`.changelog-row` 是 `74px / 58px / minmax(0,1fr)` 三列（日期 / 短 SHA / 说明）。
  `index.js` 渲染时**无论 `entry.sha` 是否存在都必须输出三个单元**；无 SHA 时放
  `<span class="changelog-sha is-empty">` 占位。少一列会让说明串进 58px 列、
  被 `overflow-wrap:anywhere` 逐字折成竖排，右侧空出一大块（实测行高可达 145px）。
- **身份徽标**：四个宿主都有登录态，**禁止匿名态文案**。用户名取 `readHostIdentity()` 的
  `handle`，为空再取 `name`；三处赋值（页头 / 启动刷新 / 扩展管理）必须一致。
  读不到时显示「正在读取」并定时重试，不得回退成宿主名或匿名态。
- **三段式物理滚动隔离**：`.confirm-dialog .view-body.is-scroll-isolated` 必须强制 `overflow: hidden !important`，工具栏必须为 `flex: 0 0 auto; overflow: hidden;`，滚动条**仅且必须**出现在列表容器 `.changelog-list` 内部，工具栏右侧绝对不得延伸贯穿出现滚动条滑块与箭头；底部的「不再自动显示」复选框必须死死固定在 actions 操作栏，严禁塞入可滚动正文。
- **局域网无身份单框对等互联**：面板彻底消灭上下堆叠与双列收发卡片，采用单一通用互联盒（`lan-peer-box`），长连接建立后常驻保持不重连（Ping/Pong 心跳与 RTT 测速），双向任务进入连续队列交替调度，互不抢占信道；保留传统单次模式作为降级方案。
- **对等状态唯一通道 `setLan`**：`view.setLan()` 是视图状态的唯一写入口，支持 `open` / `send` / `recv` / `peer` / `scanError` 五个分支，全部按 `Object.assign` 合并（不得整体替换，否则后续只带部分字段的 patch 会清掉其它字段）。`lan-transfer-panel` 的所有对等状态都经 `setPeer → setLan({ peer })`。**新增任何 `setLan({ xxx })` 调用方时，必须同时在 `setLan` 加分支并在 `test/ui-lan-state-contract.test.js` 补用例**，否则 patch 会被静默丢弃（此前曾因漏 `peer` 分支导致整个对等模式点按钮零反应）。
- **对等发送源契约**：`getSendTargets()` 是 `async`，返回 `File[]`（`index.js`）。`peerSend` 必须 `await` 后以 `File` 为准取 `.name` / `.size`，不得假设存在 `sizeBytes` / `blob` 包装字段。
- **对等通道等待必须有界**：`bufferedAmount` 排空循环必须同时检查 `readyState`、取消标志与超时（`HIGH_WATER_TIMEOUT_MS`），禁止纯 `sleep` 轮询；`waitIceComplete` 到点未收全时须在提示与日志中如实标注，不得让用户拿到缺候选的码却毫无提示。
- **待导出卡复用唯一卡范式**：待导出项走 `pkgCard(pkg, { pendingId, pendingActions })` 渲染，与真实数据包卡同一套 DOM 与素材；**禁止为待导出另造图标、伪宿主角标或自造徽标文案**（已在一次修复中删除 `pkg-check-spacer`、`data-host="file"`、手写 ZIP 角标与 `pending.badge`）。体积计算须兼容 `blob.size` 与演示态 `size/mb`。
- **Luker 包与分卷包全特征识别**：`detect.js` 扩展识别 Luker 各类 manifest、`_convert/split-manifest.json` 分卷清单、平铺目录特征（`chats/`、`worlds/`、`groups/`、`user/`、`backgrounds/`、`extensions/`）与文件名强特征启发，杜绝 Luker 分卷包误判为「未识别包」。
- **面板帮助入口契约**：每个切换视图面板头须有 `.help-btn[data-help="<key>"]` 节点（`src/ui/workbench-template.js`），`key` 对应 `workbench-view.js` 的 `HELP` 字典；点击由 `document.querySelectorAll('[data-help]')` 统一委托到 `openHelp(key)`。缺失模板节点会导致「帮助」与「教程」截图同 MD5（历史事故：transfer 视图漏节点）。帮助节点用 `<a role="button">` 承载以避开控件消费点守卫。
- **空态大屏居中**：空态时 `.chart-stack:has(> .chart-empty-guide)` 切 `display:flex` + `justify-content:center`，消除 1600×950 下半部留白；不得依赖 `align-content` 对 block 容器生效。
- **底部状态条对比度**：进度条次级文字（`.progress-hint` / `.app-version`）用 `var(--muted)`，禁止再叠 `opacity` 压低对比。
- 回归守卫：`node scripts/single-template-source.js`（模板源）、`node scripts/control-consumer-guard.js`（控件消费点）、`npm test -- header-badge.test.js changelog.test.js ui-viewport-guard.test.js`。

### 本地云与实例自动化

- 本机 S3 兼容服务器：`npm run cloud:serve:s3`（端口 0 自动分配，仅测试、无鉴权）。
- 本机 WebDAV 服务器：`npm run cloud:serve:webdav`（同上）。
- 客户端契约测试：`npm run test:local-cloud`（真实 HTTP + Range/multipart/PROPFIND）。
- 核心云全流程：`npm run e2e:cloud-core`（真实数据包 → 上传 → 下载 → sha256）。
- 四宿主实例 E2E 编排：`npm run e2e:instances`（`node scripts/run-e2e-instances.cjs`），
  覆盖 SillyTavern / Luker / TauriTavern / PureTavern 四端实例的端到端流程。
- 实例成对启动：`npm run e2e:instance-pair -- dev-st dev-luker`；
  **同一时刻最多两个实例**，退出时校验端口释放。
- Luker ↔ TT 保真回归：`npm run test:luker-tt`（固定夹具）、`npm run e2e:luker-tt`（含真实大包）；
  判定口径：关键项零丢失、计数不减少、同输入两次产物清单一致；预期丢弃与同名扩展去重单独记录。
- 说明与限制：本机测试服务器说明与仓内审计记录（不随站点发布）。

### 两个云端 Page 与部署

- “两个 page”只指 GitHub Pages 的**插件 Web 根页**与 **`/docs/` 文档站**，两者由同一
  `Deploy to GitHub Pages` 工作流部署；本地开发服务与酒馆实例页面不属于该词。
- 影响插件或 `docs/` 的改动必须重新部署：`gh workflow run "Deploy to GitHub Pages" --ref main`，
  或打 `v*` tag；部署后验证两个 URL 均 200。
- 细则：仓内规范「两个云端 Page 与部署」。

## 五、体积与分卷模型

体积预测集中在 `src/core/size-model.js`，输入选中条目与导出选项，输出：

- `predictedBytes`：已知条目的压缩后预测；
- `breakdown`：按类目拆分的未压缩 / 压缩字节；
- `range`：未知项导致的区间；
- `confidence`：`high` / `medium` / `low`；
- `unknowns`：读不到体积的条目，界面必须显示 `?` 或区间。

界面不得再散落压缩比常量；新增类目、分卷、扩展模式或引擎载体时，只扩展模型与测试。

#### 体积显示口径（唯一真源）

- **包卡体积**统一由 `src/core/chart-model.js` 的 `fmtMB` 生成：`index.js` 导入后写入 `p.size`，
  卡片直接渲染该字符串。`src/ui/workbench-view.js` 内的同名 `fmtMB` 只服务图表与统计，
  **改包卡显示必须改 `chart-model.js`**（曾有实测事故：只改前者真机仍是 `0 KB`）。
- 小于 1 KB 一律用字节单位：`0 → 0 B`、`462 字节 → 462 B`；`>= 1 KB` 才用 KB/MB/GB。
  禁止把非零字节取整成 `0 KB`——那会与真正 0 字节的空文件无法区分（铁律 5 禁假 0）。
- 回归守卫：`npx vitest run test/ui-fmt-size.test.js`（同时覆盖两份实现）。

### 分卷判定口径（同源化）

- `splitArchiveEntries` 按**实测产物字节**判卷：`zipIo.createWriter().getWritten()`
  返回已写目的地字节（与最终 `blob.size` 精确锁步，BlobWriter 计数包装见 `zip-io.js`），
  预算 = 实测已写 + 下一条目贡献估计（未压缩 × 观测膨胀系数，系数随写入自校正，
  窗口 `[0.05, 1.05]`）+ 中央目录预留。
- 判定先于读取：调用方传懒描述符 `{path, size, read}`，splitter 决策后才 `read()`，
  reader 由调用方保持打开、finally 关闭 ⇒ 分卷路径不再整包解压驻留内存。
- 回退：`getWritten()` 返回 -1 的形态（文件路径等）按旧未压缩估算判卷，
  manifest 里 `judgedBy` 字段如实标注 `written-bytes` / `uncompressed-estimate`。
- 单文件独占成卷按**实测字节**判定（不再按未压缩预判）；封卷后守卫若发现
  `blob.size` 超阈值且卷内 >1 条目 ⇒ 该卷 `isOversized: true` 如实标注。

### 品牌色联动与 UI 交互规范

- **品牌色统一管理与禁止屎黄色回退**：唯一真源收口在 `src/data/target-ui.js`（`brandTokensOf`）与 `src/data/ui-tokens.js`（`UI_TOKENS.brand`）；严禁各模块手写散落的颜色映射字典；彻底杜绝 `rgb(225, 138, 36)` 屎黄色回退，所有强调与高亮统一采用目标平台品牌色或标准转运色（`#8a5cf6`）。
- **教程演示模式全面品牌色化**：教程「查看文档」按钮采用中性次要按钮样式（去除黄色边框与高亮），引导卡片、高亮环与横幅全站统一采用品牌色，杜绝刺眼黄色。示例扩展列表严格仅限收录用户 `jiozhaoyue` 的公开 `ST-` 开头扩展，支持运行时动态从 GitHub 仓库同步最新变更，且条目支持直接在新标签页中打开仓库。
- **教程演示态零落盘与跳过即退出（数据丢失修复）**：
  - `persistCloudConfig` / `persistWebdavConfig` 在 `state.tutorialMode` 下必须返回 `false`，禁止返回 `true` 制造「已保存」假成功；`cloudSave()` 仅在实际落盘成功后才写内存配置；
  - 云端保存按钮在演示态给出 `cloud.demoNoSave`（「演示模式不保存配置」）状态与 toast，不静默；
  - 教程浮层「跳过」必须调用 `exitTutorialMode()` 还原 state 快照并真正退出演示态，不得只关浮层（`tutorialMode` 残留会让后续保存全部静默失效）；
  - `CLOUD_KEY` / `WEBDAV_KEY` 必须声明在 `const state` 之前：`state` 初始化即调用 `loadCloudConfig()`，常量后置会落进 TDZ 并被 `catch` 吞成 `null`，导致写入成功也永远读不回。
- **扩展管理包内六态状态机与假死根除**：
  - 严格区分 `NO_PACKAGE`（未选包）、`UNSCANNED`（选包未扫描，带一键扫描通道）、`SCANNING`（扫描中）、`READY`（已扫描有扩展）、`EMPTY`（已扫描无扩展）、`ERROR`（扫描失败重试）六态；
  - 彻底修复 `ensurePlan` 异步完成未回传与切页才刷新的缺陷：`actions.onActivePackage` 返回 Promise，扫描完成自动就地触发 `renderExtensionView()` 响应式刷新。
- **列表行响应式与 CDP 物理断言守卫（彻底消灭 3 行折裂）**：
  - 桌面端（`> 860px`）：严格单行（`nowrap`），超长文本省略，复制按钮单行尾随；
  - 移动端（`<= 860px`）：严格两行（第一行：复选框 + 仓库与复制按钮同行；第二行：版本与模式标签），绝对禁止出现第 3 行；
  - 守卫命令：`npm run check:ext-responsive`（`scripts/ui-verify-ext-responsive-cdp.cjs`），自动遍历 390px、439px、768px、1200px 测量垂直阶梯数，若出现 3 行换行则测试立即非零失败。
- **数据包侧栏单行合流与勾选语义纯化**：
  - 面板头左侧使用「[图标] 数据包 | Git」切页分段，删除重复的纯文字大标题；右侧紧跟「导入 N | 导出 N」，两层并一层消除空白死带；
  - 彻底删除 `勾选操作·外框显示` 占位横栏；全选、反选、清空等批量控件纯粹用于控制卡片复选框；
  - 彻底废除分页栏，所有卡片平铺滑动到底；重设列表时保留容器 `scrollTop`，点击卡片绝不强制回顶。
- **扫码硬件流即时释放**：扫码窗口关闭或中途取消时立即物理终止所有 MediaStream tracks 并解绑 video.srcObject，支持 AbortSignal、遮罩背景点击与 ESC 按键退出，严格保证仅在扫码时启动摄像头。
- **文案与出口规范**：绝对禁止裸字段拼接（如 `zones.allPrefix`）；云端仓库顶部统一采用纯文字指引，移除直接跳转设置按钮。
- **弹窗与报告界面自适应重构规范（用户明令）**：
  - 打包扩展弹窗：彻底废除 120px 窄网格，采用自适应 `.pack-modal-card` 卡片流（`minmax(250px, 1fr)`）；头部展示单行省略扩展名与状态胶囊标签，底部独占一行放置完整/清单分段切换按钮，杜绝文字与按钮穿模碰撞；弹窗限制最大高度并强制 `overflow-x: hidden`，彻底消除横向滚动条；
  - 按钮文案严守短名规范（G-16）：绝对禁止长名按钮，操作文案精简为「拉取清单」（4 字以内），辅助说明收敛至 tooltip；
  - 上传/恢复宿主报告：顶部必须提供 KPI 色差胶囊栏（`restore-summary-bar`，直观汇总成功、跳过、失败数），消除生硬黑边框，逐包项采用轻微阴影与色差分层。

## 六、质量门槛

提交前至少通过：

```bash
npm test
npm run build
npm run qa:static
npm run docs:verify
```

文档站的中文页、英文页、教程截图与基线哈希必须同步；源页改动但译文或截图未更新会被 CI 拒绝。

- **临时验证守卫**：为触发守卫反例而临时加的测试行，只写在新建临时文件里，或用 `Edit` 精确撤销那一处，或先复制到 `tmp/` 备份再动；禁止用 `git checkout -- <file>` / `git restore` / `git reset --hard` / `git clean` 回收，否则会抹掉会话开始时已有的未提交改动（铁律 40）。

## 七、参与与安全

- 贡献方式与测试矩阵见 [CONTRIBUTING.md](https://github.com/jiozhaoyue/ST-pack-transfer/blob/main/CONTRIBUTING.md)。
- 安全问题请按 [SECURITY.md](https://github.com/jiozhaoyue/ST-pack-transfer/blob/main/SECURITY.md) 的私密渠道报告，不要公开提交可利用细节。
- 许可证：AGPL-3.0-or-later，详见 [LICENSE](https://github.com/jiozhaoyue/ST-pack-transfer/blob/main/LICENSE)。

## 八、数据流与模块地图

本章面向要读源码的开发者，按「一次转换实际怎么流」串起各层，并给出 core 模块全景与几个高频查询主题（目标路由、宿主能力、守卫工具链、规范真源、发布流程）。所有断言行号以本仓当前源码为准。

### 端到端数据流（上传 → detect → plan → convert → export → IndexedDB）

一次典型的单包转换经过六段，各段边界与关键调用如下：

| 阶段 | 入口（file:line） | 做什么 |
| --- | --- | --- |
| ① 上传 / 入库 | `index.js` 多处 `saveFile(...)`（如 `:545` / `:697` / `:1108` / `:1165` / `:1516` / `:1871` / `:2234` / `:2806`），落到 `src/storage/db.js:250` | 原始包写入 IndexedDB `files` store，带 `origin`（ORIGINS 枚举）与 `role`；超大 blob 走串行写队列。存储不可用时返回 null，走内存降级 |
| ② 检测 detect | `detectFromReader()`（`src/core/detect.js:19`），布局枚举 `LAYOUTS`（`detect.js:3-9`） | 按 `detect.js:12-18` 的判定顺序识别源布局：`st` / `l` / `tt` / `pt-native` / `unknown`；`pt-native` 经 `pt-archive.js` 的 `createPtNativeHubReader()` 转成 hub（ST 摊平） |
| ③ 计划 plan | `ensurePlan()`（`index.js:603`）→ 预检计划模块的 `generatePlan()`（动作枚举 `ACTIONS`）→ 引擎计划 `planEngineConversion()`（`src/core/engine-bridge.js:119`） | 零拷贝预读 zip 中央目录，逐条预测归宿（`COPY` / `ROUTE` / `MIGRATE` / `SYNTHESIZE` / `DROP` / `FILTER`）；core 只给语义 token，颜色交给 UI 层解析 |
| ④ 转换 convert | `conversionRunner.convert(...)`（`index.js:1788`、合并模式 `:2149`）→ core `convert()`（`src/core/transform.js:325`） | 源布局规范化为 hub，再按目标逐条适配写出；逐条目读入 Buffer（峰值约等于最大单文件），不整包驻留；合成项追加在尾部并按名字排序。丢弃 / 复制 / 合成计入 `report.js` |
| ⑤ 分卷（可选） | `splitArchiveEntries()`（`src/core/splitter.js:107`） | 传懒描述符 `{path, size, read}`，splitter 决策后才 `read()`（调用见 `index.js:1860`、`:2236`），reader 存活期覆盖整个 split，在飞数据 ≤ 1 条目 |
| ⑥ 待导出区 → 入库 | `ExportQueue.enqueue()`（`src/ui/export-queue.js:185`）、`stash()`（`:241`）、`ensureStored()`（`:272`） | 所有产物先进待导出区，**不自动下载**；下载 / 存入工作区时才 `saveFile` 持久化（role=`output`），可用时 fire-and-forget 镜像到可选 Authority 后端（失败只告警） |

三形态共用同一条 core 数据流：独立 Web 与酒馆扩展由根 `index.js` 驱动；Node / Vitest 下 `src/core/worker-client.js` 在无 `Worker` 时自动降级为主线程执行。宿主差异只进 `src/ui/host-bridge.js`，业务层不判断宿主名。

### core 模块地图（实测 79 项：78 个 `.js` + `engine-adapters/` 目录）

按职责分七组；模块职责均来自各文件头部注释，`ls src/core/` 可核对清单。

| 分组 | 模块（文件名省略 `.js` 后缀） | 职责要点 |
| --- | --- | --- |
| 转换与路由 | `transform` `detect` `plan-preview` `splitter` `delta` `merge-packages` `naming` `extension-manifest` `extension-pack-mode` `export-modes` `git-policy` `pt-archive` | 源布局识别、hub 规范化、逐条路由与合成、分卷、差量、合并、命名、扩展清单契约、Git 目录策略（keep/minimal/strip）、PT 原生归档回 hub |
| 存储引擎 / zip / 体积 | `engine-bridge` `engine-model` `engine-registry` `engine-sanitize` `sqlite-init` `size-model` `zip-io` `zip-append` `zip-augment` `null-writer` `engine-adapters/` | 引擎互转（注入式 IO）、canonical 行模型、引擎探测与注册表、恢复前裸 SQL 净化、sql.js 惰性加载、体积模型、zip 读写适配与追加、三种引擎适配（`fs` / `jsonl-dump` / `sqlite`） |
| 上游 / Git / 仓库 / 元信息 | `upstream-resolver` `repo-files` `ext-install-web` `ext-pack` `ext-prune` `builtin-assets` `plugin-kind` `path-safety` `git-accounts` `git-graph` `git-local` `git-oauth` `git-site` `git-url` `git-viz` `docs-site` `app-version` `changelog` | 双通道上游溯源（失败如实 `unavailable`）、仓库文件抓取、扩展装包决策与清理、宿主固定资产指纹、Git 账号 / OAuth / 站点 API / URL 归一 / 泳道可视化、远程路径安全、版本与更新日志 |
| 迁移 / 存储审查 | `migration-evidence` `migration-plan` `migration-session` `migration-target` `migration-verification` `selection-defaults` `storage-inspector-model` `target-inventory` `zone-model` `restore-batch` `chunked-restore` `restore-compat` | 统一迁移计划与写作门、会话强不兼容判别、目标预检与备份证据、核对证据、默认选择、审查面板纯逻辑、目标清单对齐、分区状态机、批量恢复编排、Luker 原生分片恢复、回传结构兼容门控 |
| 云与传输 | `s3-client` `s3-crypto` `webdav-client` `transfer-plan` `transfer-target` `transfer-prune` `net-proxy` `lan-transfer` `backup-set` `private-container` | S3（SigV4）/ WebDAV 客户端（注入 fetch）、分片与断点台账、统一传输目标、快照保留修剪、可选 CORS 代理、局域网互传纯逻辑、内容寻址备份集、私有配置容器 |
| 任务与日志 | `task-manager` `task-queue-controls` `worker-client` `worker-factory` `converter-worker` `logger` `report` `stage-timings` `pack-inject` | 长任务状态机、队列行控件判定、Worker 有界等待与唯一构造点、协作式暂停、结构化日志与脱敏、转换报告账本、异步阶段计时、聊天补包决策 |
| 检视 / 图表 / 能力 / 脱敏 | `inspect` `sanitize-share` `credential-patterns` `asset-list` `demo-tree` `chart-model` `host-capabilities` | 五层体检与类目判定、脱敏分发与上传门禁、凭据检测正则唯一真源（PEM）、资产列表契约、教程占位树（不读真实包）、包卡体积 `fmtMB` 真源、宿主能力显式声明表 |

### 转换目标路由（TARGETS 四目标与 `targetEntryPath`）

四目标由 `src/core/transform.js` 的 `TARGETS` 冻结对象定义（`transform.js:47-52`）：`ST: 'st'`、`L: 'l'`、`TT: 'tt'`、`PT: 'pt'`。注意平台检测返回 `st|luker|standalone`，而转换器只接受 `st|l|tt|pt`；宿主平台传给 convert / 文件名模板前必须经 `hostLayoutCode()` 归一（`luker → l`）。

`targetEntryPath(hubPath, target, extScope)`（`transform.js:1054-1113`）是「hub 路径 → 目标落点」的唯一映射函数，按四级优先级判定：

| 优先级 | 条件（file:line） | 落点规则 |
| --- | --- | --- |
| 1. 私有配置解包 | hubPath 以 `_compat/` 开头（`transform.js:1055-1069`） | `_compat/luker/…` + L 目标 → 解包回原路径；`_compat/tt/…` + TT 目标 → `data/default-user/…`；`_compat/st/…` + ST 目标 → 解包回原路径 |
| 2. Luker 私有文件 | 非 L 目标且 `stats.json` / `macros.json`（`:1071-1080`） | 转 `_compat/luker/<file>`；TT / PT 目标再套一层 → `data/default-user/_compat/luker/<file>` |
| 3. TT 私有文件 | 非 TT 目标且 `tauritavern-settings.json`（`:1082-1091`） | 转 `_compat/tt/<file>`；PT 目标再套一层 → `data/default-user/_compat/tt/<file>` |
| 4. 标准平台布局 | 其余路径（`:1093-1112`） | `extensions/` 开头：PT → `data/extensions/third-party/…`，TT 按 `extScope`（global → third-party，local → `data/default-user/extensions/`），ST / L 平铺为 `extensions/<n>`；TT / PT 其它路径统一加 `data/default-user/` 前缀；ST / L 原样 |

转换主循环里几处按目标的特判（同样有 file:line 依据，改动前先读）：

- manifest 元数据：非 L 目标不保留源 manifest，由转换器按目标重新合成（`transform.js:641-647`）。
- 引擎旁路数据 `_engine_dump.bin` / `_engine_meta.json`：仅 L 目标有意义，其余目标丢弃并警告跨存储迁移请用 L 的 cross-mode restore（`:658-671`）。
- TT 私有 / 缓存与派生缓存 `thumbnails/` / `vectors/`：按 `keepAll` / `includeCache` 决定保留或丢弃（`:673-721`）。
- 宿主自带插件 `builtin-ext`：一律剥离并在报告点名，跨宿主搬运只会写出目标不消费的垃圾路径（`:728-735`）。
- `image-metadata.json`：L 目标丢弃（L 备份类目不含它），ST / TT / PT 保留（ST 背景分组索引用它）（`:737-743`）。

扩展作用域预扫 `extensionScopeOf()`（`transform.js:1128`）识别五种源形态并映射四种宿主，判据来自实机取证。

### 宿主能力矩阵（HOST_CAPABILITIES）

`src/core/host-capabilities.js:12-21` 用一张显式声明表替代「按平台名推导」，通用化且禁止在 `host-bridge.js` 里散落 `platform === 'luker'`。三态语义（`host-capabilities.js:1-10`）：`true` = 已确认具备；`false` = 已确认不具备（不发起探测、不产生 404 噪音）；未列出 = 未取证 → 探测一次（fail-open），失败再如实降级。

| 能力 | st | luker | tt | pt | 说明（file:line） |
| --- | --- | --- | --- | --- | --- |
| `assetList` | ✅ | ✅ | 未列出（探测） | ❌ | `/api/extensions/discover` + 静态 manifest（`host-capabilities.js:13-14`） |
| `accountWindow` | ❌ | ✅ | ❌ | ❌ | 2.9+ 自绘账户窗口（`:15-16`） |
| `storagePage` | ❌ | ✅ | ❌ | ❌ | 账户窗口内图形化存储页（`:17-18`） |
| `serverTransfer` | ❌ | ❌ | ❌ | ❌ | 服务端直传，本插件禁止后台插件故全 false（`:19-20`） |

查询函数 `capabilityState(kind, platform)`（`host-capabilities.js:28-34`）返回 `{supported, known}`：`standalone` 一律 `{supported:false, known:true}`；声明表未列出的平台 → `known:false`（探测）；已声明 → `supported = (declared === true)`。新增宿主或能力时只改这张表。

**恢复相关能力与本矩阵的关系（务必区分，勿混为一谈）**：

- 本矩阵**只覆盖** `assetList` / `accountWindow` / `storagePage` / `serverTransfer` 四项（`host-capabilities.js:12-21`），**不含** backup / restore / selection 能力位。恢复能力**不进这张表**，而由 `host-bridge` 运行时探测三态 `unknown` / `available` / `unsupported`（`src/ui/host-bridge.js:101-108`，结果记入 `restoreCapability`）。
- **selection 透传是独立声明表** `BACKUP_SELECTION_SUPPORT`（`src/ui/host-bridge.js:300-305`）：`st=false` / `luker=true` / `tt=false` / `pt=false`，唯一求值点 `hostSelectionCapability()`（`:316-323`）。此表**只作用于导出 / 拉取阶段的 `/api/users/backup`**，不作用于恢复；恢复链路的 `selection` 恒为 `FULL_SELECTION`（`:2245` / `:2139`），与用户勾选无关。
- **恢复端点候选表** `RESTORE_ENDPOINT_CANDIDATES`（`src/ui/host-bridge.js:93-96`）只列 `luker` / `st` 两键：`luker=['/api/users/restore-backup','/api/users/restore']`，`st=['/api/users/restore','/api/users/restore-backup']`；`tt` / `pt` 无条目，回退 ST 候选（`:179`）。ST 1.19 两端点实测均 404→无整包恢复能力；Luker `/restore` 404、`/restore-backup` 存在（`:88-91`）。
- 两种写入策略 `merge` / `overwrite` 与 selection 彼此无关（`src/ui/host-bridge.js:2308-2372` 一段内按 `mode` 判定），`incremental` 只是 `mode` 派生（`:2331`）；真正增量合并函数 `incrementalMergeArchives()` 未接线、无调用方（`:3048`）。
- 恢复机制的完整说明（详解 / 宿主支持矩阵 / 增量兜底原理 / 取证边界）见 `docs/restore.md`。

### 回传宿主兼容门控

回传（restore）前按「包布局能否直接落到宿主用户目录」做兼容拦截，结构不符必须先转换，不做部分回传。判据只看目录结构族，不判断宿主是否提供整包恢复端点。

- **判据模块**：`src/core/restore-compat.js`。`canRestoreLayout(hostPlatform, layout)`（`:55`）返回 `{ok, reasonKey}`：`ok=true` 时 `reasonKey` 为空串，`ok=false` 时恒为统一 key `NEED_CONVERT_REASON='restore.incompatible.needConvert'`（`:25`）。目录结构族（`:30-45`）：flat = `st` / `l` / `luker`（zip 根摊平），prefixed = `tt` / `pt`（`data/default-user/` 前缀）；同族可回传，跨族、空串与 `unknown` 一律拒绝。`describeLayout()`（`:70`）把 `l` 归一为 `luker`，仅供文案。
- **端点门禁与本判据分工**：宿主整包恢复端点由 `hostRestoreCapability()`（`src/ui/host-bridge.js:344-352`）判定——当前仅 `luker` 支持，ST / TT / PT 无端点。结构兼容（`ok=true`）只表示能直接落目录，不代表宿主有恢复端点；两道门禁并存，控制器先过端点门禁再过结构门禁。
- **控制器层门禁**（`index.js` 的 `restoreSelected()`，`:1211-1259`）：① 能力门禁——`hostRestoreCapability(host.platform)` 不支持即 toast 拒绝（`:1214-1218`）；② 结构门禁——逐包取 `declaredLayout || metadata.layout` 调 `canRestoreLayout()`，任一不兼容即整批 toast 拒绝、不静默跳过单个（`:1222-1232`），空 / `unknown` 布局用 `restore.incompatible.unknownLayout` key；③ 单选门禁——多个分组即 toast 拒绝（`:1252-1253`）。
- **视图层门禁**（`src/ui/workbench-view.js` 的 `restoreSelection()`，`:6787-6796`）：`doUploadHost()`（`:6797`）改走它。选中一个分卷 part 时自动带上同 `splitId` 的全部分卷，否则只保留一个，从选中侧保证单选语义。
- **单选与分卷组例外**：同 `splitId` 的 part 视为一组、整组算一个包。分组键 `splitGroupKeyOf()`（`index.js:1206-1208`）按 `isSplitPart && splitId` 归组。分卷元数据缺 `splitId` 时异步读包内 `_convert/split-manifest.json` 兜底（`readSplitManifest()`，`index.js:576`），读取失败退化为单包处理、不假成功（`:1233-1250`）。
- **分卷元数据字段**：`isSplitPart` / `splitId` / `partIndex` / `partTotal`。两处 split 循环把字段随产物带出（`index.js:1805-1810`、`:2177-2181`）；`deliverCreated()` 仅在 `isSplitPart && splitId` 同时成立时写入 metadata，取不到不写（`:1845-1852`）。分卷清单由 `splitter.js:193` 写 `target`（st|l|tt|pt），`detect.js:98-112` 据此识别布局，无 `target` 旧包走回退，不假装识别成功。
- **文案**：三条 i18n key 双语齐备——`restore.incompatible.needConvert` / `unknownLayout` / `multiSelect`（`src/i18n/locales/zh-CN.js:1753-1755`、`en-US.js:1746-1748`）。

### 守卫工具链全表（`package.json` 的 check / verify / docs / qa 脚本）

`package.json:21-67` 共 45 个脚本，其中 20+ 个守卫 / 校验 / 文档脚本用途如下。用途取自各脚本头部注释与 `tooling/qa-static.mjs` 的 `GUARDS` 清单（`qa-static.mjs:12-23`）。

**静态守卫（`npm run qa:static` 串跑的 10 条，`qa-static.mjs:12-23`）**：

| 命令 | 脚本 | 用途（真源） |
| --- | --- | --- |
| `check:css-scope` | `scripts/css-scope.js` | 用 PostCSS AST 检查 `style.css` 所有规则挂在 `#app.app-container` 或自有覆盖层 id 下，禁裸宿主全站类选择器（脚本头 `css-scope.js:6-9`） |
| `check:dom-injection` | `scripts/dom-injection-guard.js` | 阻止用户可控数据未经转义进入 `innerHTML` / `outerHTML` / `insertAdjacentHTML`，对 `src/ui/**` 与根 `index.js` 生效（脚本头 `dom-injection-guard.js:1-8`） |
| `check:template-source` | `scripts/single-template-source.js` | 单一模板源守卫：独立态 `index.html` 只许骨架，正文来自 `src/ui/workbench-template.js`，防两副本分歧（脚本头 `single-template-source.js:1-10`） |
| `check:dom-scope` | `scripts/dom-scope.js` | 宿主 DOM 写入作用域：插件对宿主自有元素的写入必须显式声明并说明理由，与 CSS 守卫互补（脚本头 `dom-scope.js:1-8`） |
| `check:control-consumer` | `scripts/control-consumer-guard.js` | 控件消费点守卫：防「有查找 / 有事件 / 有摘要但值从不被读取」的死控件；只覆盖静态模板，运行时拼装控件不在范围（脚本头 `:1-9`） |
| `check:no-bundler-only` | `tooling/no-bundler-only.js` | 宿主直装守卫：禁止打包器才成立的写法（如 JSON 静态导入），插件是 git clone 直装不经打包（脚本头 `:1-9`） |
| `check:i18n` | `scripts/i18n-guard.js` | UI 文案必须来自 `src/i18n/locales/**`，跳过注释，禁字符串字面量出现中文；宿主适配层 / core 不在范围（脚本头 `:1-6`） |
| `check:copy` | `scripts/copy-audit.js` | 面板文案静态体检：括号说明 / 分号长句 / 合并连词只允许出现在 `?` 浮层与教程；告警按 `locale:key` 合并（同一文案的 semicolon + hint-long 并列为一行），计数与真实文案条数同源（脚本头 `:1-14`） |
| `check:ui-tokens` | `tooling/check-ui-tokens.mjs` | UI 尺寸 / 品牌色 / 图表色 / 状态色必须来自 `src/data/ui-tokens.js`，style.css 里再出现字面量即失败（脚本头 `:1-8`） |
| `check:download-html` | `tooling/check-download-html.mjs` | 本地单文件 HTML 产物守卫：产物存在则执行全部单文件性校验，不存在则跳过不失败（CI 由 release.yml 构建，脚本头 `:1-9`） |

**规则与视觉守卫（部分纳入 CI / verify:all）**：

| 命令 | 脚本 | 用途（真源） |
| --- | --- | --- |
| `verify:rules` | `tooling/rules/run.mjs` | 规则校验总入口：全跑 / `--list` / `--only=id` / `--json` / `--fast`（MUST 失败 exit 1，SHOULD 失败 exit 0，脚本头 `:1-13`） |
| `check:frontend-first` | `tooling/rules/run.mjs --only=frontend-first` | 只跑 `frontend-first` 单条规则 |
| `check:tavern-block` | `tooling/rules/run.mjs --only=tavern-block-integrity` | 只跑 `tavern-block-integrity`（注入块完整性）单条规则 |
| `check:rule-paths` | `tooling/rules/run.mjs --only=rule-paths-resolve` | 只跑 `rule-paths-resolve`（规范路径可解析）单条规则 |
| `verify:all` | 组合命令 | `verify:rules` + `npm test` + `check:checkbox-centering`（`package.json:59`） |
| `check:checkbox-centering` | `tooling/verify-checkbox-centering.cjs` | 真实 Chromium 计算样式：对勾最终渲染中心落在 padding box 中心（容差 1.2px）+ 手机抽屉布局模型一致（脚本头 `:1-8`） |
| `check:no-overflow` | `tooling/verify-no-overflow.cjs` | 视觉溢出守卫：元素不得超出父容器边框（曾漏掉二维码 svg 150px 顶出 116px 容器，脚本头 `:1-10`） |
| `check:layout-geometry` / `check:layout-geometry:self` | `tooling/verify-layout-geometry.cjs`（`--self-check`） | 几何回归守卫：真能检测出布局缺陷（1434 测试全绿却漏三处真实缺陷后的产物，脚本头 `:1-10`） |
| `check:login-state` | `tooling/login-state-guard.mjs` | 身份徽标守卫：顶部徽标必须显示当前用户名，禁「未登录 / 游客」态；不管 Git / 云盘 / S3 等服务侧认证（脚本头 `:1-9`） |
| `check:docs-privacy` | `tooling/docs-privacy-guard.js` | docs 隐私守卫：公开站禁绝对日期 / 内部流程标记 / 本机绝对路径 / 环回地址 / 端口 / 邮箱 / 真实凭据形态，文件名内容都查（脚本头 `:1-9`） |
| `check:ext-responsive` | `scripts/ui-verify-ext-responsive-cdp.cjs` | CDP 实测扩展管理列表行：桌面严格单行、移动至多两行，出现 ≥3 行即非零退出（脚本头 `:1-6`；用法见第四章） |

**文档脚本**：

| 命令 | 脚本 | 用途（真源） |
| --- | --- | --- |
| `docs:verify` | `tooling/docs-sync.mjs --verify` | 文档站同步基线校验：中文源页 → 英文译文 → 教程截图 → 基线哈希，缺译文 / 源变译文没变 / 截图没重拍即失败（脚本头 `:1-10`） |
| `docs:update` | `tooling/docs-sync.mjs --update` | 人工确认后刷新 `docs-sync.manifest.json`；CI 只跑 verify，绝不自动 update（脚本头 `:5-7`） |
| `docs:shots` | `tooling/capture-docs-shots.cjs` | 文档站截图，只从教程演示模式采集、绝不加载真实包；用法 `npm run build && npm run docs:shots [-- --port 3040] [-- --only desktop|mobile]`（脚本头 `:1-9`） |
| `qa:static` | `tooling/qa-static.mjs` | 一键静态守卫串跑（上述 10 条），任一非零即中止，按 `docs/TESTING-PROCESS.md` §1 顺序（脚本头 `:1-9`） |

其余脚本（`build` / `build:offline` / `preview` / `dev` / `test` / `e2e:*` / `test:*` / `cloud:serve:*` / `shots:*` / `gen-fixtures`）见第四章与 `package.json:21-67`。

### 规范真源索引（五套规范与阅读顺序）

规则唯一真源在仓库的规则目录（`spec/` 树），注入文件只放摘要。动手前先读、收尾前跑 `npm run verify:rules`（见 `AGENTS.md` 规则指针与分层入口索引 `tavern-dev/index.md:9-11`）。

**规则真源四件套（一次读完，位于 `spec/guides/`）**：

| 文件 | 条数（实测口径） | 作用 |
| --- | --- | --- |
| `rule-catalog.md` | 30 条判据 | 唯一判据真源（`tavern-dev/index.md:13`） |
| `rule-details.md` | 95 条细则 | 逐条挂规则 ID + 原文证据；新增只能追加、作废标 `[已废弃]`（`rule-details.md:1-8`） |
| `iron-rules.md` | 45 条会话注入铁律 | hook 只读此文件，禁止硬编码（项目细则第 3 条） |
| `rule-triggers.md` | 触发词索引 | 提到什么 → 读哪份规范（`tavern-dev/index.md:16`） |

> 条数口径说明：分层入口索引写的是「94 条细则 / 40 条铁律」，而本仓当前 `rule-details.md` 实测 95 条、`iron-rules.md` 最大编号 45，与第三章「四份文件」口径一致；引用时以**实际文件**为准。

**五套分层索引（按改动所处层读对应索引，不必通读全仓，见 `tavern-dev/index.md:20-26`）**：

| 索引 | 覆盖范围 | 何时读 |
| --- | --- | --- |
| `tavern-dev/index.md` | 聚合本仓全部分层规范入口；基石规则块「规范入口」指向它 | 总入口，先读它确定该看哪一层 |
| `guides/index.md` | 跨层指南：协作、测试、窗口、端口纪律、四宿主包格式、实例端到端测试等 | 跨层 / 多宿主 / 实例测试任务 |
| `frontend/index.md` | UI 层：组件、模板、样式、状态、宿主注入、工作台契约 | 改 `src/ui/**`、根 `index.js`、`style.css` |
| `backend/index.md` | 核心层：转换、检测、存储、宿主注入桥 | 改 `src/core/**`、`src/storage/**`、`host-bridge.js` |
| `docs/`（含 `documentation-standard.md` / `sync-baseline.md`） | 文档站写作规范与同步基线 | 写 `docs/` 文档、准备发版 |

**推荐阅读顺序**（`tavern-dev/index.md:30-35`）：① 先读规则真源四件套建立判据面 → ② 按改动层读对应分层索引 → ③ 跨层 / 多宿主 / 实例测试额外读跨层指南索引 → ④ 引用规范路径前先核实文件存在，声称完成前跑 `npm run verify:rules`。单一事实只在一处权威表述；同一路径的指针以分层入口索引为准，条文以规则真源为准。

### 发布手册（tag 构建与文档同步流程）

三条 CI 工作流在 `.github/workflows/`：

| 工作流 | 触发（file:line） | 职责 |
| --- | --- | --- |
| `release.yml`（`Release`） | push `v*` tag 或手动（`release.yml:10-14`） | **不跑 `npm test`**：全量测试已常驻 `checks.yml` 每次 push / PR，tag 指向的提交必然已经过全量绿灯（`release.yml:39-40` 注释明示），发版只构建 + 发布——`npm run build:offline`（`:42-43`）→ 校验产物存在且 >1024 字节（`:46-53`）→ 创建 / 覆盖 GitHub Release 并上传 offline HTML asset（`:56-71`，Release 已存在用 `gh release upload --clobber` 保证幂等）。offline HTML **只走 Release asset，不入库**（3.83 MB / 次提交会让 git 历史线性膨胀，`:5-9`） |
| `deploy.yml`（`Deploy to GitHub Pages`） | push `v*` tag 或手动（`deploy.yml:6-10`） | 只管两个云端 Page：插件 Web 根页 `/` 与文档站 `/docs/`（同站共存，`deploy.yml:62-74`），发布前跑 `check:docs-privacy` + `docs:verify`，并清历史 deployment 只留本次两条 active（`:27-39`、`:96-122`） |
| `checks.yml`（`host-direct checks`） | push / PR（`checks.yml:6-8`） | **全量测试常驻每次 push / PR**（`npm test`，`checks.yml:31-32`，用户明令）+ 拦「只能在打包器里成立」的写法：跑 `check:no-bundler-only`、docs 布局 / 隐私 / 同步 / UI tokens / download HTML 守卫与 sanity build（`checks.yml:34-76`） |

**发版步骤（真源：上述 workflows + 第四章「两个云端 Page 与部署」）**：

1. 发版门槛全绿：`npm test`、`npm run build`、`npm run qa:static`、`npm run docs:verify`（第六章）。
2. 文档中文源页 → 英文译文 → 教程截图 → 基线哈希必须同步：`docs:update` 人工刷新基线后，`docs:verify` 才能过；截图用 `npm run docs:shots`（仅教程演示模式、禁真实包）。
3. 打 `v*` tag 并推送：`git tag vX.Y.Z && git push origin vX.Y.Z`。`release.yml` 构建并发布 offline HTML asset，`deploy.yml` 部署两个 Page。
4. 部署后验证两个 URL 均 200（第四章）；Release asset 从 `https://github.com/jiozhaoyue/ST-pack-transfer/releases/latest/download/ST-pack-transfer-offline.html` 下载。
5. 手动补部署：`gh workflow run "Deploy to GitHub Pages" --ref main`（第四章）。tag 与 Release 必须同时发（用户裁定，`deploy.yml:5`）。
