---
title: 恢复写回宿主
layout: default
alt_url: restore.en.html
alt_lang: en
---

# 恢复写回酒馆

将转换好的数据包写回当前酒馆。功能入口位于数据包「导出」区域的「上传 / 恢复」。

## 两种恢复模式（先澄清一个常见误解）

先说结论：**恢复写回并不存在「增量 / 全量」两种模式**。文档里说的「两种恢复模式」，实际是两种**写入策略**——「合并更新（merge）」与「完全覆盖（overwrite）」。两者都会向宿主写入**整包、全类目**，区别只在写入前是否重建目标目录，而不在写多少、写哪几类。

| 模式 | 请求参数 | 写入行为 | 适用场景 |
| --- | --- | --- | --- |
| **合并更新**（merge） | `mode=merge`，`incremental=true` | 更新同名文件，保留酒馆已有的其它文件 | 日常同步，或只更新部分角色卡与聊天 |
| **完全覆盖**（overwrite） | `mode=overwrite`，`incremental=false` | 重建对应目录后再写入（需二次确认） | 想完全替换当前酒馆内容，从零还原 |

> 这两行的 `mode` 与 `incremental` 其实是**同一个开关的两种表达**：`incremental` 只是 `mode === 'merge'` 的布尔派生（`src/ui/host-bridge.js:2268`），并不是「只恢复勾选的部分」的意思。

## 恢复机制详解

下面用可对照源码的说法，讲清一次恢复实际怎么走（行号取自本仓当前源码，便于追溯）。

### 1. 入口与平台分流

从界面点「上传 / 恢复」后，调用链是 `restore:enqueueRestore` → `enqueueRestore`（`index.js:1610`）→ `restoreSelected`（`index.js:1211`，带 `host.isPlugin` 守卫，独立 Web 在此被拦下）→ `restoreSelectedConfirmed`（`index.js:1261`）。

进入 `restoreSelectedConfirmed` 后按平台分流（`index.js:1303-1305`）：

- **Luker**：走 `restoreToLuker(sane.blob, {})`，它只是 `restoreToHost` 的别名（`src/ui/host-bridge.js:2962`）。
- **ST / TT / PT**：走 `restoreToHost(sane.blob, { mode: 'merge', platform })`。注意 `mode` 被**写死为 `merge`**——「完全覆盖 overwrite」从未由主链路触发。

### 2. 回传兼容门控（回传前的三道拦截）

`restoreSelected`（`index.js:1211-1258`）在真正写入前依次过三道门禁，任一不过就整批 toast 拒绝、**不静默跳过单个包**：

1. **宿主能力门禁**：`hostRestoreCapability(host.platform)`（`index.js:1214`、`src/ui/host-bridge.js:344-352`）判定的静态能力——当前仅 Luker 可整包恢复，ST / TT / PT 不可用（各带 `restore.unsupported.*` 原因 key）。这道门禁在**控制器层**也生效，插件态下即使视图按钮被绕过、直调 restore 也**不穿透**。
2. **布局兼容门禁**：对每个待恢复包取 `declaredLayout || metadata.layout`（`index.js:1223`），交给 `canRestoreLayout(host.platform, layout)`（`src/core/restore-compat.js:53`）判定。布局未知 / 空串走 `restore.incompatible.unknownLayout`（`index.js:1226-1228`），同族不符走 `restore.incompatible.needConvert`（`src/core/restore-compat.js:25`）。三处文案见 `src/i18n/locales/zh-CN.js:1753-1755`。
3. **单选门禁**：见下节「单选与分卷组」。

**目录结构族判据的事实依据**：`canRestoreLayout` 按「包内目录结构能否直接落到宿主用户目录」分两族（`src/core/restore-compat.js:18-43`）——

- **flat（摊平、无前缀）**：`st`、`l`（=luker）。事实依据为 `src/core/transform.js:1107` / `:1112` 的 `targetEntryPath()` 对 ST / Luker 目标直接 `return hubPath`，不写前缀；`src/core/detect.js:4-5` 的 LAYOUTS 也把 st/l 标为「zip 根摊平」。
- **prefixed（带 `data/default-user/` 前缀）**：`tt`、`pt`。事实依据为 `src/core/transform.js:1109-1110` 对 TT / PT 目标写 `data/default-user/${hubPath}`，`detect.js:6` 把 tt 标为「data/ 根」。

**同族放行、跨族或布局未知拒绝**：例如给 Luker（flat）恢复一个 TT（prefixed）包会被拦下并提示先转换；给 TT 恢复一个 ST 包同理。这是「没有增量恢复」（见下节）的必然结果——结构不匹配时唯一出路是整体转换，不存在「只回传一部分」的中间态。`describeLayout()`（`src/core/restore-compat.js:68-72`）只用于文案，把 `l` 归一为 `luker`，不参与判定。该判据由 `test/restore-compat.test.js` 的 38 项测试锁定（本轮实跑 `npx vitest run test/restore-compat.test.js` → 38 passed）。

### 3. 单选与分卷组

一次只能回传**一个包**——准确地说，一个「包或分卷组」。判定规则：

- **分卷组（同 `splitId`）整组算一份**：`splitGroupKeyOf()`（`index.js:1205-1209`）把 `isSplitPart && splitId` 的 part 归到同一个 `split:xxx` 键；`restoreSelected` 用 `Set` 统计分组键，只有 `groups.size === 1` 才放行，否则 toast `restore.incompatible.multiSelect`（`index.js:1252-1253`）。
- **视图层同步收敛**：`workbench-view.js:6786-6797` 的 `restoreSelection()` 在选中一个分卷 part 时，自动带上同 `splitId` 的全部 part；否则只保留选中的那一个。
- **旧分卷包兜底**：若选中包的 metadata 没有 `splitId`，`restoreSelected` 会异步读包内 `_convert/split-manifest.json`（`readSplitManifest()`，`index.js:575-591`）补齐 `isSplitPart/splitId/partIndex/partTotal`（`index.js:1239-1248`）。读取失败则退化为单包处理、**不假成功**，由分组判定拒绝多余项。
- **分卷清单的 target 字段**：新生成的 `split-manifest.json` 写 `target`（`st|l|tt|pt`），不写 `source`（`src/core/splitter.js:186-204`，splitter 无源布局入参，写 source 属臆造）；`detect.js:90-112` 以 `target` 优先、`source` 仅旧包回退，`pt` 或无法映射时不在此假装识别成功，落到文件名/目录特征回退。
- **落库元数据**：产物落库时（`index.js:1844-1852`）仅在调用侧确实带出 `splitId` 时写 `isSplitPart/splitId/partIndex/partTotal`，取不到不假装有。

### 4. 核心写入流程

`restoreToHost`（`src/ui/host-bridge.js:1983`，负责并发互斥与取消）调用内部实现 `restoreToHostInner`（`:2237`），再分两种上传方式：

- **分片优先（仅 Luker / ST）**：当平台是 `luker` 或 `st` 时（`:2250-2251`），先尝试 `tryLukerChunkedRestore`（`:2053`），把包按 **8 MiB** 切片上传（`src/core/chunked-restore.js:17`）；分片端点不存在（404/405）就回退整包。**TT / PT 不进入分片分支**。
- **整包上传**：构造 FormData（`:2264-2274`），字段为 `avatar`（整包 zip）、`handle`、`mode`、`incremental`（`mode==='merge'?'true':'false'`，`:2268`）和 `selection`（`:2274`）。

体积与重试策略：受 Cloudflare 100 MB 单次上限约束，遇到 413 会把分片**减半（最低 256 KiB）**，遇到 5xx / 429 **最多重试 3 次**（`src/core/chunked-restore.js:17-19`）。

### 5. 写入范围：为什么「勾选类目」不影响恢复

整包 FormData 里的 `selection` 恒为 `FULL_SELECTION`（`src/ui/host-bridge.js:2274`），分片 body 里的 `selection` 也是同一个值（`:2168`）。`FULL_SELECTION` 来自 `buildEndpointSelection()`（`src/ui/host-bridge.js:282`、`src/core/selection-defaults.js:86`），只含 10 个标准类目且**全部为 true**。

也就是说：**用户勾选从未透传到恢复请求**。取证注释明确写着「包内 `manifest.json` 的 selection 不被宿主解析（09-01 取证）」；而对照实验又表明宿主对 selection 差异不敏感——带/不带 selection 都是 `restoredCount: 1`（早期 Dev Luker 实验）。真正决定恢复内容的，是**包体里的条目本身**。

### 6. 端点解析与能力降级

`postRestoreWithFallback`（`src/ui/host-bridge.js:178`）按候选表解析端点：候选表 `RESTORE_ENDPOINT_CANDIDATES` **只有 luker / st 两个键**（`:93-96`）——

- `luker`：`/api/users/restore-backup`、`/api/users/restore`
- `st`：`/api/users/restore`、`/api/users/restore-backup`

**候选表里没有平台键时（TT / PT）会回退到 ST 候选**（`:179`）；只在 404 / 405 时换下一个端点；全部失败则把 `restoreCapability` 置为 `'unsupported'` 并抛出 `RESTORE_UNSUPPORTED`。

### 7. 没有可退缩的「增量恢复」路径

由于写入范围恒为全量、`incremental` 只是 `mode` 别名，**代码里并不存在「只恢复勾选部分」的增量恢复路径**。真正的增量合并函数 `incrementalMergeArchives()`（`src/ui/host-bridge.js:2985`）被明确标注「未接线：当前无任何调用方」——它本该接的是 J 区曾有过的「增量合并」复选框，而该复选框经取证确认**从不生效**且已移除。

因此结论很硬：**任何宿主只要整包恢复端点不可用，就完全无法恢复，没有增量路径可以退缩。** 新增的回传兼容门控（第 2 节）与单选/分卷约束（第 3 节）只是**拦截前置**：在写入前挡下不兼容、多选的请求，并不会因此生成「部分恢复 / 增量恢复」能力。被门控拦下的请求，唯一出路仍是先整体转换到当前宿主布局再重试。

## 宿主支持矩阵

### 改造前（现状，来自实测与静态追链）

| 宿主 | 整包恢复端点 | 分片恢复 | 合并更新 merge | 完全覆盖 overwrite | 说明 |
| --- | --- | --- | --- | --- | --- |
| **Luker** 2.7.0 | 可用（`/api/users/restore-backup` 存在，`/restore` 为 404，`:89-90`） | 支持（8 MiB 优先，端点缺失回退整包） | 支持（`mode` 可表达） | 支持（`mode` 可表达） | selection 恒全量，无「只恢复勾选」的增量 |
| **SillyTavern (st)** 1.19.0 | **不可用**（两候选端点实测均 404，`:90`） | 仅 ST 尝试，但端点不存在→回退整包 | 不可用 | 不可用 | 两候选全 404→置 `unsupported`，无增量可退 |
| **TauriTavern (tt)** | 不可用（候选表无 `tt` 键→回退 ST 候选，`:179`） | 不尝试（`tt` 不分片，`:2221`） | 不可用 | 不可用 | selection 能力 `tt:false`（`:303`） |
| **PureTavern (pt)** | 不可用（同 TT：无候选键、回退 ST 候选） | 不尝试 | 不可用 | 不可用 | selection 能力 `pt:false`（`:304`） |
| **独立 Web / 单文件 HTML** | 无宿主端点 | 无 | 不可用 | 不可用 | `restoreSelected` 直接 toast 拒绝（`index.js:1212`），视图层 `btn-upload` 禁用（`src/ui/workbench-view.js:3098`） |

**死按钮缺口的现状**：`src/ui/export-queue.js` 的 `restoreUnsupportedReason` / `restoreBlocked` 仍无调用方；但主 UI 的 `btn-upload` 已不再只按「非插件态」禁用——视图层在插件态也会用 `hostRestoreCapability()` 对 ST / TT / PT 禁用按钮并写入能力原因（`src/ui/workbench-view.js:3098-3109`）。更关键的是，**控制器层也补上了同一道能力门禁**（`index.js:1213-1218`）：即使按钮被绕过、直调 `restoreSelected`，也会先经 `hostRestoreCapability()` 拦截并 toast，不会穿透到写入。ST / TT / PT 用户现在从按钮到控制器两条路径都拿得到明确提示。

### 改造后（端点事实实测版）

> 下表以本轮端点实测为准（取证文件：`test-results/screenshots/restore-endpoints/` 下 `st-facts.json` / `luker-facts.json` / `tt-pt-facts.json`，Luker 恢复实测见 `test-results/screenshots/restore-luker-live/luker-restore-verdict.json`）。**不再把「全宿主支持」当作已达成的目标**：只有 Luker 实测可恢复，ST / TT / PT 无服务端整包恢复端点。

| 宿主 | 整包恢复端点（实测） | 分片恢复 | merge / overwrite | 恢复入口状态（F5 已落地） |
| --- | --- | --- | --- | --- |
| **Luker** 2.9.0-rc.3（Dev fork，D-05 不当产品事实） | **可用**：`POST /api/users/restore-backup` 实测 merge / overwrite 均 HTTP 200（restoredCount=10、failedCount=0、skippedCount=1，skip 为类目外缩略图） | 支持（uploads→finalize→chunks 链实测 200） | 支持（双模式 mode 字段实测不同） | 可用，入口不禁用 |
| **SillyTavern (st)** | **不可用**：两候选 GET 均 404 且无 405 证据（ST 路由 POST-only，状态码非存在性确证）；POST 受全局 CSRF 拦截，无登录态无法确证 | 仅 ST 尝试，端点未确证 | 不可用 | **disabled** + 原因：请改用宿主原生导入 |
| **TauriTavern (tt)** | **不可用**：Tauri 桌面工程无浏览器/HTTP 服务端，`/api/users/*` 全 404，恢复走 Rust 原生文件导入 | 不尝试 | 不可用 | **disabled** + 原因：请用原生数据迁移人工导入 |
| **PureTavern (pt)** | **不可用**：`/api/*` 为页面内补丁 fetch 的纯前端 legacy 路由，无服务端写入端点；remote-server 仅为 LLM 代理 | 不尝试 | 不可用 | **disabled** + 原因：请用数据管理面板人工导入 |
| **独立 Web / 单文件 HTML** | 无宿主端点 | 无 | 不可用 | 维持 `disabled` + 提示（`pluginOnlyHint`）|

**F5 死按钮防护（已落地）**：`src/ui/host-bridge.js` 的 `hostRestoreCapability(platform)` 为静态能力判据（luker 可用；st / tt / pt 不可用，各带 i18n 原因 key）；`src/ui/workbench-view.js` 的 `btn-upload` 在插件态对不支持宿主也 `disabled`，并把能力原因写进 `title` / `aria-label`。若已实际探测失败，`getRestoreUnsupportedReason()`（含已探测端点「端点 → 状态码」）优先展示。i18n 文案在 `src/i18n/locales/{zh-CN,en-US}.js` 的 `restore.unsupported.*`。

**F4 ST Authority 增强恢复通道（未实施：端点不存在）**：本轮实测 `authorityAvailable=false`，`/api/plugins/authority/host/st-restore` GET 404（无 405 证据）、POST+TOKEN 403（与随机路径一致，无法区分存在性）；源码真实探测点为 `POST /api/plugins/authority/probe` 取 `data.stBackup` 标记，任务给定的 `st-restore` 候选与代码不符。结论：**Authority st-restore 增强恢复端点不存在，待 Authority 插件开发**；不臆造探测代码、不实施增强通道，避免死代码与虚假承诺。未来若 Authority 插件提供该端点，再按 D-05 取证后接入「探测成功走增强写入、失败静默回退原生指引」的适配器。

**F3 类目过滤前移（已实现，验证通过）**：包生成阶段已按 selection 过滤条目——`src/core/transform.js:624-625` 在 convert 生成阶段按 `selection[cat] === false` 调用 `entry.skip()`，核心层的预览规划模块同步反映未勾选状态。这替代了依赖宿主解析 restore selection 的旧思路（宿主对恢复请求里的 selection 不敏感，实测带/不带均 restoredCount=1）。

> **取证边界**：端点判据在 ST 实例被对照端点推翻——`GET` 404 是 POST-only 路由的方法不匹配，不能证明端点不存在；全部端点均无 405 证据，POST 受全局 CSRF 拦截。因此本矩阵对 ST / Authority 只作「无可用恢复端点」的**可观测判定**，不断言其绝对不存在；TT / PT 由桌面/纯前端形态与文档交叉确认无服务端 HTTP 恢复端点。Luker 恢复成功证据来自 23:10 轮次真实 HTTP 捕获（见 verdict 的 `screenshotNote`，后续宿主自动更新删除扩展符号链接导致复跑失败，PNG 时间戳仅证明宿主形态）。

## 增量兜底原理

这里说清一个容易被误解的点：**「类目过滤兜底」与「恢复能力」是两件事**。

- `selection` 只作用于**导出 / 拉取阶段**的类目筛选；恢复链路的 `selection` 恒为 `FULL_SELECTION`（`src/ui/host-bridge.js:2274` / `:2168`），与用户勾选无关。
- 恢复请求**技术上能带过滤后的 payload**：分片侧的 `buildRestoreBody` 有 `selection` 形参（`src/core/chunked-restore.js:52`），整包 FormData 也 append 了 `selection`（`src/ui/host-bridge.js:2274`）。但实测宿主对 selection 差异不敏感（带/不带均 `restoredCount: 1`），包内 `manifest.json` 的 selection 也不被宿主解析；**真正决定恢复内容的是包体条目本身**。
- 因此，把类目过滤从「恢复请求」移到「插件内（导出 / 包生成阶段）」在技术上正确且已具备落点：在生成包体时按 selection 过滤条目（`src/core/selection-defaults.js:42` 的 `SPECIAL_SELECTION_FLAGS`、`src/core/transform.js:624-625` 的按类目 `entry.skip()`），替代依赖宿主解析 restore selection。
- **兜底的边界**：插件内过滤兜底只作用于导出阶段，**解决不了「全宿主支持两种恢复模式」的根本障碍**——ST 1.19 两个恢复端点均 404，没有整包写入端点，过滤兜底无法凭空造出写入能力。
- 插件内过滤兜底的现状：ST 必需且可用（全量导出后插件内过滤）；Luker 原生透传勾选、可用但非必需（`hostSelectionCapability()`，`:316-323`）；TT / PT 可用但无浏览器读取端口。

## 写入安全守护

> **取证边界**：以下行为描述来自本文档既有陈述；本次只读追链**未在恢复路径逐字定位到对应实现代码**，暂不作为已确认事实对外断言，待单独取证后再定稿。

为了保护酒馆中已有的珍贵聊天与配置，在真正执行写入操作前，系统会自动核对安全状态：

- 确认当前已有可用的备份文件；
- 检查备份的时效性与目标环境的稳定性；
- 确认当前操作具备合法的写入权限。

如果检测到环境有变动或缺少有效备份，插件会及时弹出温馨提示并暂停写入，确保历史数据万无一失。

## 跨存储模式平滑过渡

> **取证边界**：同上一节，以下描述来自本文档既有陈述，本次追链未在恢复路径定位到「自动清理数据库转储中间文件」的实现代码，暂不作已确认事实。

当你在数据库格式与普通文件格式之间切换恢复时，插件会自动清理数据库转储中间文件，避免主键冲突，让数据平滑入库。

## 批量恢复与容错机制

> 注意与「单选与分卷组」一节衔接：一次回传只接受**一个包或一组同 `splitId` 的分卷**（`index.js:1235-1253`），多个不相干的包会被 `restore.incompatible.multiSelect` 拦下。下面说的「逐包独立处理」因此只在**分卷组内部多 part** 的范围内成立。

以下三项已在主链路定位到实现（批量逐包容错见 `index.js:1269-1320`，进度/失败处理见 `src/ui/host-bridge.js:1983-2160`）：

- **组内逐 part 独立处理**：一次回传虽限一个包或一组分卷，但分卷组内多个 part 仍逐个处理，组内某个 part 格式有问题不影响同组其它 part 的写入；
- **清晰的结果报告**：全部处理完成后，会给出详尽的恢复报告，清楚展示成功与跳过的条目；
- **进度安全保存**：处理进度会自动记录，即便中途遇到断网或刷新，也能接续恢复。

## 大数据包自动分片

在支持分片恢复的酒馆（仅 Luker / ST）中，插件会自动将超大数据包按 **8 MiB** 拆分成多个切片平稳上传（`src/core/chunked-restore.js:17`；`src/ui/host-bridge.js:2053`、`1983-2160`），化解常见的网络单次上传体积限制。TT / PT 不进入分片分支（`src/ui/host-bridge.js:2250-2251`），分片端点缺失时回退整包。

## 恢复完成之后

- 恢复成功后，界面提示条会提供「刷新页面」按钮，点击刷新后即可看到恢复后的全部聊天与内容；
- 如果数据包中包含扩展清单，还会引导你按清单在线自动下载安装相关扩展；
- 扩展安装与管理详情，请参考 [扩展管理与打包](extensions.md)。
