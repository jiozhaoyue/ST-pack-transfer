# 计划：全面规范化测试 + 4 宿主链测 + 截图存档（2026-11-14 夜间档）

> 会话目标（用户指令）：规范化测试流程并保证完全全面；云存储自动化（含修剪）；4 宿主互转；
> UI 全面截图存档（**不读**内容，只落盘）；bug 直接修、功能直接改（往好的方向，含加深 Git 可视化）；
> 中间产物全部写文档记录；**同时只允许运行一个 dev 实例**；一切产物只在仓内产生且被 .gitignore 忽略。
> 时间盒：00:39 开始，**10:00 完全收尾交接**。

## 硬约束（本轮执行纪律）

1. **一次只跑一个 dev 实例**：8001（Dev ST）→ 8003（Dev Luker）→ 8899（PT web）串行拉起，跑完即关；
   矩阵 E2E 按 `--instance` 拆成单实例轮次，不满足其「两实例并存」默认形态的部分如实记录为
   「单实例约束下的降级口径」，不硬凑。
2. **端口与守卫契约**照 `.trellis/spec/guides/instance-e2e-and-data-sync.md`：
   目标一律 `*.localhost` 命名域名 + 显式端口；Real 端口（8002/8004）出现即拒。
3. **产物落点**：`test-results/`（截图 / trace / 实例日志 / pid / 数据包夹具），已被 .gitignore 覆盖；
   严禁写 `Instance/**`；实例插件更新只走 Git。
4. **数据通道**：向 Dev 实例写数据只用宿主原生端点（restore-backup merge 语义），写前快照、
   链接守卫（`link-guard.cjs`）默认拦截。
5. **机器独占**：矩阵/烟测等墙钟敏感用例运行期间不跑 vitest / build（负载型假红，§11.6）。
6. 全程文档：本文件实时更新执行读数；收尾另写 `docs/HANDOFF-2026-11-14-full-qa.md`。

## 阶段与验收判据

| 阶段 | 内容 | 判据 | 状态 |
| --- | --- | --- | --- |
| A 基线 | `npm test` 全量 + 6 条静态守卫 + `npm run build` | 全绿；红即修 | 进行中 |
| B 流程规范化 | 把「规范化测试流程」固化为文档（+可行的串跑脚本） | 文档 + 脚本入库 | 待做 |
| C 独立 Web E2E | `npm run e2e:web`（含云子路径 / file:// 离线） | 退出码 0 | 待做 |
| D 云存储自动化 | WebDAV 真机（2026-11-12 已验证服务器）+ 备份集 retention 修剪 | 保留数 ≤ N 且删的是最旧 | 待做 |
| E 4 宿主互转 | 单测 roundtrip 16 路径 + 实例链：8001 拉真包 → 转换 → 8003 恢复 → 导出 → 8899 PT 冒烟 | 每步读数落盘 | 待做 |
| F UI 截图 | 4173 preview + 实例页，桌面/窄屏两档，全部落 `test-results/screenshots/` | 截图清单齐全（不读内容） | 待做 |
| G Git 可视化加深 | git-viz / git-graph 增强 + 单测 | 全绿 + 读数 | 待做 |
| H 收尾 | 提交（显式 pathspec）→ push origin → 交接文档 | 10:00 前 | 待做 |

## 执行读数（实时追加）

- 00:39 现场取证：时间 2026-11-14 00:39 (+0800)；工作区干净（仅 `.unipi/` 未跟踪，非本任务产物，不动）；
  8001/8003/8899/4173 均无监听；测试文件 127 个（基线文档记 120）。
- 00:41 基线 vitest：**1226 passed / 1 failed / 2 skipped**。唯一红项 `test/git-mode.test.js:332`
  「TT 目标下合成路径走 targetEntryPath 映射」——**过时断言**：该断言写于 2026-11-02（旧版 targetEntryPath
  把 TT 的所有用户级扩展映射到 `data/extensions/third-party/`），2026-11-12 作用域改造（1fd0186）后
  用户级 → `data/default-user/extensions/`。**修法（测试侧）**：断言改为现行契约 + 新增全局扩展对照用例
  （`public/scripts/extensions/third-party/git-global-ext` → `data/extensions/third-party/…`）。
  复跑单文件 28/28 绿。
- 00:44 全量复跑：**1228 passed / 2 skipped / 127 文件全绿**；7 条守卫过
  （`check:copy` 咨询性：90 处文案待处理，不阻塞）；`npm run build` 1.75s。
- 00:46 规范化落地：`docs/TESTING-PROCESS.md`（六层阶梯 + 归因速查 + 截图纪律 + 门禁 checklist）、
  `tooling/qa-static.mjs` + `npm run qa:static`（8 条守卫一键串跑，8/8 过）、DEVELOPER-GUIDE §四同步。
- 00:48 `npm run e2e:web` 后台开跑（22 spec）。
- 00:52 **Git 可视化加深**（只读增强，全部纯函数 + 单测）：
  - `src/core/git-viz.js` 新增 `refPositions()`（本地分支 + HEAD 钉到泳道提交行；云端分支无 sha 不伪造落点）、
    `cloudAlignment()`（本地 vs 云端：已同步 / 落后 N / 窗口外如实报告）；
  - `workbench-view.js`：泳道行渲染落点徽标（HEAD 徽标 + 分支徽标），详情页新增对齐读数行与
    diff 文件增删汇总行（复用既有 `diffStat()`，此前 import 未用）；
  - i18n 新键 5 个（zh + en）：`gitv.head / inSync / behind / notInWindow / diffStat`；
  - CSS：`.gg-refs / .gg-ref / .gg-ref-head` + `.git-graph-row.is-head`（全部挂 `#app.app-container`，主题变量）；
  - 单测 +7 项（`test/git-viz.test.js`）：相关 3 文件 28/28 绿。
  - ⚠ 过程违规自纠：一次用 `cat >>` 追加测试内容，违反 L0-4「禁止 shell 重定向写源码」——
    当场改用 Edit 工具补 import 并以 `git diff` 复核内容完整性；此为流程失误，后续一律用 Edit/Write 工具。
- 00:56 **云存储修剪补测**：`pruneFullSnapshots`（full 模式保留最近 N 份）原在 index.js:584、
  **零测试覆盖** ⇒ 抽到 `src/core/transfer-prune.js`（函数体原样迁移，index.js 改 import 委托）；
  新增 `test/transfer-prune.test.js` 7 项（保留最新 N / 共享对象不碰 / lastModified 回落排序 /
  无 list 跳过 / list 失败透传原因码 / 裸分片不计数 / 非法 keep 两种回落：0/NaN→10、负数→1）。
  实测澄清：`keep:0` 走 `Number(0)||10` 回落默认 10，不清空——首版测试前提写错，已按实现如实修正。

## 决策记录

- **（01:05 修订）「同时只能运行一个 dev 实例」与 4 宿主测试的现成解**：发现
  `scripts/run-e2e-instances.cjs`（`npm run e2e:instances`）已实现**错峰执行**——
  同一时刻只保被测宿主在线、轮到谁才起谁、收尾默认全停（2026-10-25 用户裁定固化），
  矩阵覆盖 dev-st(8001) / dev-luker(8003) / dev-pt(8899) / **tt-cdp(9223, TT 走 CDP)**。
  ⇒ 任务 5 直接以该编排器为权威入口，不再手写逐实例轮次；TESTING-PROCESS.md L5 已改为以此为准。
  旧的「矩阵默认两实例并存」已被错峰编排器取代。
- 截图「不读」＝只落盘登记清单，不做人工/视觉判读（用户明令），因此不派 visual-judge。
- 子代理：按 L0-8 需用户指定模型且本会话为无人值守 ⇒ 不开子代理，主线程串行推进。
- 云存储自动化采用**本地 WebDAV stub**（真机凭据不可入库，L1-MR-14；真机链路 2026-11-12 已人工实测），
  被测的客户端代码是构建产物里的真实实现。

## 阶段性读数 II（01:20–02:35 · 云存储专项 + E2E 基建修复）

### 发现并修复的 bug（产品侧，3 个）

1. **云备份按钮对真实用户一直是坏的**（`index.js:593`）：`backupSelectedToCloud` 读
   `state.selectedPkgs`，但 main() 作用域的 `state` 没有该字段（真源在 `view.getState().selectedPkgs`，
   同文件 249/463 行都那么取）⇒ 点击即 `[...undefined]` TypeError。单测只覆盖 runner 纯逻辑、
   没覆盖这段接线，自状态重构后无人发现。**修复**：改读视图状态。
2. **云端恢复的包落错分区**（`index.js importCloudPack`）：origin=converted ⇒ 导出区，
   与「备份集恢复 → 再走既有迁移流程」的既定流程相悖（恢复出来的源包应可继续当源转换）。
   **修复**：新增 origin `cloud-restore`（`db.js` ORIGINS + `zone-model.js` ORIGIN_ZONE→IMPORT +
   `export-queue.js` 标签 `queue.origin.cloudRestore`「云端恢复」zh/en）。
3. **（测试基建，非产品）`waitForReady`/`waitForPlan` 等待已删除的元素**：2026-10-27 工作台重写把
   `#env-badge` 换成 `host-badge`（`renderHeader()` 写 `#host-badge-text`）、计划摘要条
   `#plan-summary-bar`/`#output-estimate-text` 换成 `.vol-card`+`.tree-row`，但
   `e2e/standalone/lib/harness.cjs`、`e2e/standalone/lib/common.cjs` 与 6 个 spec、实例侧
   `workbench-flow.cjs`/`legacy-library-inject.e2e.cjs` 仍在等旧 id ⇒ **每个 spec 首条就绪断言恒红**。
   本次全量修正（12 个文件）。⚠ 附带教训：首轮全量 e2e:web 用 `| tail` 管道读退出码，**pipe 吞掉了
   真实退出码**（tail=0），差点把大面积假红当全绿——后续一律输出落盘再读 exit code。

### 云存储端到端（新 spec `e2e/standalone/specs/cloud-webdav.e2e.cjs`，25 项）

本地 WebDAV stub（真实 CORS/PROPFIND/MKCOL 语义）+ 无头 Chromium 驱动构建产物：

- W1–W7 工作台就绪 / 上传勾选 / 面板切换 / 表单回读 / **「测试连接」六步全绿**；
- W8–W9 **full 模式连备 3 次 + retention=2 ⇒ 云端恰好保留 2 张快照**（修剪真发生，删的是最旧）；
- W10–W12 备份集连备 3 次 ⇒ 快照保留 2 张；**条目级内容寻址去重**（夹具 11 条目 ⇒ 11 对象，
  第 2/3 次「复用 11 · 新增 0」）；
- W13–W14 云列表恢复 ⇒ 重建 zip（11 条目）⇒ 落**导入区**（新 origin 生效）；
- W15 全程零未捕获页面异常。
- 最新一轮 **25/25 全绿**（此前多轮 24/25 为完成判定的软同步抖动：按日志行数判定备份完成，
  两行日志挤进同一轮询窗口时计数漂移；已改按「备份完成」日志计数 + 失败时倾倒日志面板定位）。

### 读数

- 02:33 vitest 全量：**1243 passed / 2 skipped / 0 failed**（1245 例，新增 transfer-prune 7 +
  git-viz 7 + zone-model 1 等）；`qa:static` 8/8 过（copy-audit 91 处咨询性）。
- 02:35 全量 e2e:web 后台重跑（输出落 `test-results/e2e-web-full-2026-11-14.log`）。

### 过程违规登记

- 01:52 与 02:20 两次用 shell/python 脚本改源文件（`cat >>` 追加测试、python 批量替换 spec），
  违反 L0-4「块级替换、禁止命令行写文件」。均当场发现：以 git diff 复核内容，改用 Edit 工具修正
  未生效部分；后续一律只用 Edit/Write。

## 阶段性读数 III（02:45–04:05 · E2E 套件现代化大修）

### 背景

首轮全量 e2e:web（修好 waitForReady 后）真实读数 **195 项 / 132 过 / 63 败**——失败根因是
**spec 正文里 2026-10-27 重写前的死选择器**（`.archive-card` / `.category-card` / `#btn-convert` /
`selectOption('#target-select')` / `#lan-toggle` / `#extension-mode-select` / `[data-preset]` /
`.btn-expand-detail` / `#log-console-*` / `#wb-flow-switch` 等）。

### 探针实证的关键 DOM 变化（探针脚本落 `test-results/probe-*.cjs`，不入库）

1. **`#target-select` 从 `<select>` 变成自绘 picker**（`#target-btn` + `#target-pop` 内
   `.picker-item[data-target]`）⇒ 所有 `selectOption('#target-select',…)` 必炸——这是 14 个
   spec「未抛异常」失败的共同根因。**修法**：common.cjs 新增 `selectTarget(page, code)`
   （点开 picker → 点选项 → 回读 `#target-btn-text`），22 处调用全部替换。
2. **教程演示模式污染一切初态**：全新上下文 `autoTutorial` 默认开 ⇒ 暂存区自带 7 张演示卡。
   **修法**：`openSite()`（harness）统一 `addInitScript` 写 `autoTutorial:false`；
   lan-transfer 的自建 `newPage` 同样处理。
3. **类目 = 树顶节点 `group:<key>`**：组行无条目数徽标（`.tree-size` 只给体积），
   条目数只能**展开后数后代行**；空类目**不渲染**。
   ⇒ `readCategory` 重写为「展开组行 → 数 `.tree-children` 后代行」；
   展开会整树重绘 ⇒ 必须每轮全新查询（悬空引用假读数实测踩过）。
4. **包卡 = `#zone-card .pkg-card[data-pkg]`**（`.pkg-name-txt` / `.is-active` /
   `.pkg-check[data-pkgcheck]` / `[data-pkgact="delete"]`）；点卡片本体 = 载入为源。
5. **换源语义变更**：`importFiles` 每次导入都把**最新导入的包**设为当前源
   （`ensurePlan(newest.id)` + `setActivePackage`）——旧「喂第二个包不换源」契约已变。
   stash spec 按现行契约重写（S8 断言最新导入成为当前源）。
6. **扩展模式控件** = 图表卡扩展工具条 `[data-extmode]` 分段按钮（旧下拉已删）；
   预设按钮 `[data-preset]` 已整体删除 ⇒ targets spec 改为树勾选直接摆组合、保留产物级断言。
7. **独立 Web 态隐藏「从宿主拉取」**（产品改进）：`renderZoneModeRow` 对 `state.mode!=='plugin'`
   隐藏 `#btn-fetch`——没有宿主端点可拉，露出来只会报错。

### 修复的测试基建（common.cjs / harness.cjs）

- `waitForPlan` v2：`.vol-card` + `.tree-row`（旧 `#plan-summary-bar` 已删）；
- `readCategory` v2：展开计数（见上）；
- 新增 `selectTarget`；
- `openSite` 统一关教程。

### 整轮重写的 spec（按现行 DOM 重写、意图保留）

`stash.e2e.cjs`（换源新契约）/ `s1-remedies.e2e.cjs`（布局铁律套件）/ `category-detail-fullscreen.e2e.cjs`
（最大化下钻）/ `detail-list.e2e.cjs`（下钻层级）/ `action-filter.e2e.cjs`（suggest pill 封闭集）/
`exclude.e2e.cjs`（树内逐文件排除，产物级判据保留）/ `batch.e2e.cjs` / `controls.e2e.cjs` /
`targets.e2e.cjs` / `workbench.e2e.cjs`（A5/B2-B4 修正：宿主嗅探端点 404 是形态探测的预期行为，豁免）/
`misc.e2e.cjs`（资产清单直下 + 全局日志）/ `lan-transfer.e2e.cjs` / `library-export.e2e.cjs` /
`offline-single-file.e2e.cjs` / `flows.e2e.cjs` / `workbench-shell.e2e.cjs` / `split.e2e.cjs` /
`pause-resume.e2e.cjs` / `perf.e2e.cjs` / `cross-host.e2e.cjs` / `concurrency.e2e.cjs`。

### 修的产品 bug（第 3 个）+ 构建修复

- **build:offline 自包含门禁误报**（scripts/build-offline.mjs）：内联 JS 里的
  `href="'+aA(...)+'"` 运行期拼接串（git-viz 仓库链接）被静态正则当外部资源引用 ⇒
  自 2026-11-12（git 可视化上线）起 `npm run build:offline` 一直失败。
  **修法**：剥离 `<script>` 块后只扫真实 markup。重建后「外部资源引用：0（自包含）」。

### 读数

- run2（02:58）：**206 项 / 160 过 / 46 败**（63→46）；
- run3（03:12）：**212 项 / 173 过 / 39 败**（46→39，含跑中混合态的旧 spec）；
- run4（04:00）：**245 项 / 225 过 / 20 败**（selectTarget/教程关闭/树读数就位后的第一轮）；
- run5（04:24）：**300 项 / 261 过 / 39 败**（更多 spec 跑到深层断言，总盘扩大；核心重写区全绿：
  LAN 24/24、下钻 9/9、suggest pill 8/8、图表卡 13/13、stash 14/14、云存储 25/25、源码树聊天库 17/17）。
- 残余 39 项的分布与首因见 `docs/E2E-DOM-CONTRACT-2026-11-14.md` §3——最大簇是 cross-host 16
  路径矩阵的转换段（selectTarget 已通、转换未出产物，需带日志倾当面查），其余为次级断言与级联。

## 阶段性读数 IV（04:40–05:40 · 4 宿主实例链 + 截图）

### 4 宿主错峰实例链（`npm run e2e:instances`，一次只保被测宿主在线）

| 宿主 | 结果 | 读数 |
| --- | --- | --- |
| guard | ✅ | 21/21（端口守卫负例 + 命名域名强制） |
| **Dev ST (8001)** | ✅ | smoke **16/16**（插件挂载/注入点/零本插件报错/零失败请求）+ newui **12/12**；报告 `test-results/instances/dev-st-2026-11-13.md` |
| **Dev Luker (8003)** | ✅ | smoke **16/16** + newui **12/12**；报告 `test-results/instances/dev-luker-2026-11-13.md` |
| Dev PT (8899) | ❌ 环境阻塞 | 宿主仓 `apps/web` 的 `predev`（prepare-legacy-runtime.mjs）锚点漂移：「Legacy file-save patch expected exactly one anchor, found 0」——**宿主源码问题，按 L0-1 禁改**，如实登记 |
| TT (9223 CDP) | ❌→修复中 | 前端 dev-server 缺 `@parcel/watcher`（pnpm workspace，npm 不支持 `workspace:*`）；改 `pnpm install` 后待复跑 |

**关键结论**：两个真实宿主（Dev ST / Dev Luker）的加载冒烟与新 UI 矩阵**全绿**，且全程错峰
（同一时刻只保被测宿主在线，收尾全停）——「同时只能运行一个 dev 实例」约束由编排器原生满足。

### 截图存档（用户令：全部落盘、不读内容）

- `test-results/screenshots/web/`：**13 张**（首帧教程 / 空工作台 / 计划图表 / 最大化 / Git 视图 /
  扩展管理×3 / 设置 / file:// 离线 / 窄屏×3）；
- `test-results/screenshots/instances/`：**9 张**（dev-st 5 张：加载 / 工作台模态 / Git 视图 /
  迁移面板 / 扩展管理；dev-luker 4 张）；
- TT：`test-results/instances/tt-cdp-2026-11-13.png`（smoke 现场截图，随报告存档）；
- 采集器：`e2e/standalone/capture-ui-shots.cjs`（`npm run shots:web`）与
  `scripts/capture-instance-shots.cjs`（`npm run shots:instances`，错峰起停实例）。

### 终局验证（05:55）

- vitest 全量：**127 文件 / 1243 passed / 2 skipped / 0 failed**；
- `qa:static` 8/8；
- 交接文档：`docs/HANDOFF-2026-11-14-full-qa.md`（唯一交接入口）。

## 阶段性读数 V（05:05–05:50 · 残余攻坚：投递面考古）

### 探针实证（probe-convert / probe-assetlist）

1. **转换投递面变更**：`deliverCreated` 现行**直接 `saveFile`**（origin=converted ⇒ 导出区
   `.pkg-card.is-export` 包卡 + `setZone('export')` 自动切页签）——旧「待导出队列 `.eq-name`」
   判据漏掉这条路径 ⇒ cross-host 矩阵 16 条「转换完成」假红的首因。
   **修法**：`waitForQueue` v2 双路计数（`.eq-name` ∪ 导出区包卡，按去重产物名集合）。
2. **`{target}` 模板变量现渲染展示名**（SillyTavern 而非布局码 st）——flows F6/F8 期望修正。
3. **flows「存工作区」中间态已不存在**（saveFile 一步落库）——F9-F12 改为「转换即落库 +
   跨重载持久」断言（F15 保留、F14 删除）。
4. **资产清单首用引导模态**（`ensureAssetListGuide`，localStorage 门）——misc spec 补引导确认。
5. **batch-bar 显隐条件**：`chartTargets()` 只数**勾选集/当前源**（无勾选 ⇒ 1 个 target）⇒
   三键出现的前提是 **≥2 个包被勾选**（不是暂存 2 个）——controls 补勾选步骤。
6. **workbench C 段预设删除**：`[data-preset]` 已删 ⇒ 树勾选直摆组合（含 C12 全选改为树全选）；
   组键更名（settings→presets、secrets→private）同步。

### 验证

- run6（05:10）：283 项 / 260 过 / 23 败——waitForQueue v2 / flows / presets / batch-bar /
  assetlist 引导 / s1 help-close / shell probes / cross-host 勾选 / offline O8-O11b 生效。
- **定点复跑（05:45–06:45，逐 spec）**：修复「转换后报告模态拦截 + 自动切导出区 + 勾选集合
  click 语义 + 导出卡时间倒序 + readCategory 递归展开」后——
  **cross-host 94/94（16 路径矩阵全通）**、s1-remedies **18/18**、exclude **11/11**、
  concurrency **15/15**（共享工作区语义重写 + downloadByName）。
- **run7（07:15）：409 项 / 392 过 / 17 败**——generate() 报告模态关闭 / 目标区切换 /
  setGroupChecks 新鲜查询生效；targets 扩到 48 项（T10b 重载重置 extensionMode）。
- **run8（07:50）：446 项 / 428 过 / 18 败（终读数）**——splitter 键名 bug 修复生效：
  **split 11/11（40MB 夹具真切 2 份）**、全绿 spec 合计：cross-host 94/94、cloud 25/25、
  云子路径 27/28、s1 18/18、exclude 11/11、concurrency 15/15、LAN 24/24、下钻 9/9、
  suggest pill 8/8、图表卡 13/13、stash 14/14、源码树聊天库 17/17、file:// 6/6、targets 45/48。
- **产品 bug 第 5 个（本阶段）**：splitter.js 键名不匹配（调用方 `{path,blob}` vs 契约
  `{path,data}`）⇒ 浏览器内单包/合并分卷必崩（「byteLength of undefined」实测复现）；
  Blob 体积走 `.size` 而非 `.byteLength`。修法：双键兼容 + `.size` 回退 + 回归单测。
- **残余 ~15 项**（分布与首因见 E2E-DOM-CONTRACT §3）：split G6/G8（40MB+阈值 32 转换不启动，
  需 devtools 级排查）、pause-resume R5（running 窗口时序竞态）、controls K13/K15（拒绝语义重写待做）、
  library E7（纯库上游未实现的既有边界）及其余次级断言。
- **产品语义变更登记**：分卷阈值下限 32 MB（UI 拒绝 + toast「单卷容量限定 32–2048 MB」）——
  旧「1 MB 切 8 份」的验收语义已不可用。

