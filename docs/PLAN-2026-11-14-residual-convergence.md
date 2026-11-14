# 计划：e2e:web 残余 31 项收敛 + 环境项处置（2026-11-14 续档）

> 上游入口：`docs/HANDOFF-2026-11-14-full-qa.md`（run12 终锁定 514 项 / 483 过 / 31 败）。
> 用户指令：继续 Trellis，完成所有。本文是当轮执行计划与实时读数载体。

## 目标（完成定义）

1. **e2e:web 残余 31 项逐簇收敛**：全量跑数退出码 0（或残余为环境级、逐项带首因登记）。
2. **环境项处置**：TT 注入排查推进一层；PT predev 锚点漂移属宿主源码（L0-1 禁改），如实登记不硬凑。
3. **`check:copy` 91 处咨询性文案**：评估收口成本，能收则收，不能则给出明确处置意见。
4. **文档同步**：PLAN 实时读数 + E2E-DOM-CONTRACT §3 更新 + HANDOFF 终读数 + DEVELOPER-GUIDE/README 如有行为变更。
5. **记账**：mini-trellis 会话记录；显式 pathspec 提交 + push origin。

## 硬约束（沿用上轮纪律）

- 机器独占：vitest / e2e / build 互斥串行；e2e 输出一律落盘再读 exit code（不用 `| tail`）。
- 产物落 `test-results/`（.gitignore 覆盖）；`test/`、`e2e/`、`scripts/` 本地专属——**提交只含 docs/src/tooling**。
- 改码先归因（TESTING-PROCESS §2 速查）；产品语义变更必须同步文档。
- 一次只跑一个 dev 实例；本阶段只跑独立 Web（4173 preview，不占实例位）。

## 残余 31 项清单（run12 口径，按 spec 分布）

| 簇 | 数量 | 首因（handoff §5 / CONTRACT §3） |
| --- | --- | --- |
| targets | 10 | 次级断言 / 投递面细节 |
| workbench | 9 | C8 readCategory 读数等次级断言 |
| 云子路径 | 6 | 未抛异常 / 投递面细节 |
| pause-resume | 3 | R5/R5b running 窗口时序竞态 |
| library E7 | 2 | 纯库上游未实现边界（桩供给不出包） |
| 散项（batch/misc/offline/perf/workbench-shell/flows） | 各 1 | 「未抛异常」次级断言 |

（controls 17/17 已在 run12 全绿；split G6/G8 已绿。）

## 阶段

| 阶段 | 内容 | 判据 | 状态 |
| --- | --- | --- | --- |
| A 基线 | `npm run e2e:web` 全量（run13），输出落盘 | 拿到逐项失败清单 | 进行中 |
| B 逐簇收敛 | 按失败清单逐簇探查 → 修 spec / 修产品 → 定点复跑 | 每簇全绿或带首因登记 | 待做 |
| C 全量锁定 | 复跑全量（run14 终读数） | 退出码 0 / 残余全部登记 | 待做 |
| D 环境项 | TT 注入推进一层；PT 登记处置 | 如实记录 | 待做 |
| E 收尾 | 文档同步 + 记账 + 提交推送 | 显式 pathspec、push origin | 待做 |

## 执行读数（实时追加）

- 10:44 现场取证：工作区干净（仅 `.unipi/` 未跟踪）；无并发测试进程。基线开跑 run13（全量）。
- 10:52 run13 **在 library-export 挂死**（E6 后 4+ 分钟无输出，浏览器进程消失）——杀掉。
  隔离复跑一次仍挂；probe2 完整复刻 spec 序列（双浏览器 + 120s 等待 + 抛错路径）**不挂**；
  再复跑真 spec **正常完成** ⇒ 挂死是杀进程残留的环境问题，非稳定复现。教训：杀 run 后必须
  清干净 chrome-headless-shell / 4173 监听再重跑（TESTING-PROCESS 可补一条）。
- 10:58 **探针 1（library-export）**：功能完全正常——点击后 100ms 转换完成，产物落**导入区**
  （`origin=UPLOAD, role=source` + ensurePlan）。E7 红的首因是**落点**：spec 期望待导出区。
- 11:00 **产品修复 ①（库导出统一出口）**：`index.js exportLibrary` 改为
  `origin=CONVERTED, role=output, namedBlob, setZone('export')`，并**尊重当前 UI 目标平台**
  （此前硬编码 `exportLibraryToPack({})` ⇒ 恒 st——用户选 pt 也只会出 ST 布局）；
  i18n `toast.libraryExported` 导入区→导出区（zh/en）。重建后 library-export **14/14 全绿**
  （solo3 退出码 0；run13b 里亦 14/14）。
- 11:05 **spec 修复 ②（flows F10）**：`deliverCreated` 在 waitForQueue 返回前已落库 ⇒
  「转换后」取的 before 基线已含新记录 ⇒ F10 恒差 1。基线快照挪到 generate 之前。
- 11:20 run13b（全量，带 ①②）：**519 项 / 496 过 / 23 败**。全绿新增：cross-host 94/94、
  flows 15/15、library 14/14、stash 14/14、split 11/11、s1 18/18、云存储 25/25（部分段）等。
- 11:20–11:50 **23 败逐簇归因**（探针 3/4/5/6 + shell DOM 探针 + 源码取证）：
  1. **library 0 败**（已修）；
  2. **offline O18–O20（3）**：死探针 `#btn-restore-inline`/`#wb-slot-role`/「打包选项退场」——
     现行形态是 zone 页签 + 共享 zone-card。已按现行契约重写（页签激活 / 导出动作退场 / 源卡在场）。
  3. **pause-resume（3）**：run12 的「时序竞态」诊断**不准确**——真因是死探针
     （`#task-controls`/`#tc-resume`/`#progress-percent` 全已删，现行 = `#btn-task-pause`/
     `#btn-task-resume`/`#btn-task-abort` 按钮组 + `#progress-pct`）+ **R4 的模态陷阱**：
     `fillNumber('#split-input', 0)` 的 change 要等 blur 才触发（Playwright fill 不 blur ⇒
     读回 '0' 假绿）；随后点 #btn-generate 的 blur 才触发守卫 ⇒ clamp 到 32 + 确认模态弹出、
     整页惰性化 ⇒ **点击被吞、转换永不启动**（探针 6 捕获监听 clicks=[] 实证）。
     修法：R4 改「非法值 0 → 守卫归一 32 → 确认模态提交 → 回读 32」；任务控制断言全部改现行按钮。
     另：续传日志措辞变更（「沿用断点跳过 N 项」→「半成品可用（N 条，命中即跳过）」），R7b/R9/R10 同步。
  4. **perf P19/P21（2）**：`setPackages`（上传触发）→ `applyTopControlsFromPrefs()` 把
     `state.compression` 重置回持久化偏好 ⇒ measureFresh 在上传**前** selectOption 全被冲掉
     （三档产物同体积 5259 B）。修法：selectOption 挪到上传+计划之后。**产品语义**：
     偏好是初始值（applyPrefsToPackage 注释如此声明），顶层控件的重置行为按现状登记。
  5. **targets T-slim/T-chars/T-safe（10）**：spec 内联「合成 change」勾选循环在新树不进
     选择集合（common.setGroupChecks 已改原生 click，内联循环没跟上）。已全部换 setGroupChecks；
     T-safe.0c 的 `.eq-name` 死计数换双路计数。
  6. **workbench F2（1）**：嗅探端点 404 在 console.error 里记一条资源加载失败——与 B4/F4
     同口径豁免。
  7. **misc 未抛异常（1）**：N13 点 `#workbench-progress` 切到**日志视图 pane**，不切回去则
     `#target-btn` 不可见 ⇒ selectTarget 30s 超时。修法：N13 后点 `#log-close` 回工作台；
     顺带修 N15 死计数与 N16/N17 死进度 id（`#progress-pct`/`#progress-label`/`#progress-fill`）。
  8. **workbench-shell B5/D1/未抛异常（3）**：`#wb-flow-switch`/`#btn-flow-out`/`#wb-slot-role`/
     `#usage-dashboard` 全部已删（探针实证），现行 = zone 页签（默认**导入**）+ 共享 zone-card +
     `#quota-head .quota-row`（独立态恰 1 行 browser，宿主行不渲染）。D/E/B5 按探针证据重写。
- 11:52 六个改动 spec 串跑验证（pause-resume → perf → targets → misc → offline → workbench）：
  **pause-resume 22/22 ✅ · perf 22/22 ✅ · misc 15/15 ✅ · offline 25/25 ✅ · workbench 43/43 ✅ ·
  workbench-shell 15/16**（`#dropzone` 仅导入区渲染，D5 断言写反——探针截断误读，已按实证改写）。
- 12:00 targets 复验 60→63：T-chars 全绿，残余 6 = T-full.3/4/6（漏加 ensureSourceLoaded）+
  T-safe.0c/3/4。**探针 7 实证产品语义**：切区页签使「选中集合与当前来源一起失效」
  （2026-11-11 裁定的既有行为）⇒ 转换后树为空。common.cjs 新增 **`ensureSourceLoaded`**
  （点包卡本体载入为源，等树行回归）；targets 各预设段全部换用。
- 12:05 T-safe 深挖（临时插桩 `[DEBUG-EXCL]` 在 index.js generate 取证，取证后已撤除重建）：
  **排除集内容完全正确下发**（`<chats/Fixture Character/2026-09-01.jsonl | secrets.json>`），
  转换无误——**假红首因是取错卡**：基线计数在导入区做（导出卡只在导出区渲染 ⇒ 数成 0）⇒
  `downloadNthRow(0)` 按「创建序 n ⇒ DOM 下标 = count-1-n」下发了**最老的第 1 张卡**
  （全量选择的矩阵产物）。修法：T-safe 改「按名 diff + downloadByName」（与 T-slim/T-chars 同法）。
  另：插桩期间两次被自己的日志格式坑（`items=[...]` 的 `[` 截断正则提取）——教训：调试日志
  格式避开 `[`。
- 12:20 targets 复验 3：**69/69 全绿 ✅**（T-full 补 ensureSourceLoaded + T-safe 按名取产物）。
  至此 9 个问题 spec 全部定点全绿：library 14/14 · flows 15/15 · pause-resume 22/22 ·
  perf 22/22 · misc 15/15 · offline 25/25 · workbench 43/43 · workbench-shell 26/26 · targets 69/69。
- 12:25 run14 全量锁定开跑。12:45 终读数：**550 项 / 550 通过 / 0 失败，退出码 0**——
  **24 个 spec 全绿**（含 specs-src 源码树 17 项）。总盘 514→550（断言细分新增），
  **run12 的 31 项残余 → 0**。
- 12:50 门禁复验：`qa:static` 8/8 ✅（copy-audit 91 处维持咨询性）；`npm test`
  **1244 passed / 2 skipped / 0 failed** ✅；`npm run build` ✅（dist 含库导出修复）。
  L1–L4 全绿。

## 完成定义对照

| 目标 | 结果 |
| --- | --- |
| e2e:web 残余 31 项收敛 | ✅ run14 全量 550/550，退出码 0 |
| 环境项处置 | ✅ TT 静态排查到运行时激活层（安装路径/文件在位已证）；PT predev 属宿主源码（L0-1 禁改）如实登记 |
| check:copy 91 处 | ✅ 判定为中文排版惯例误报，登记不收口（收口反劣化中文文案） |
| 文档同步 | ✅ PLAN / E2E-DOM-CONTRACT / TESTING-PROCESS / DEVELOPER-GUIDE / chat-store-seam.md |
| 记账 + 提交推送 | 见下 |
- 12:30 环境项静态排查：
  - **TT 注入**：安装路径 `%APPDATA%/com.tauritavern.client/data/default-user/extensions/ST-pack-transfer`
    与文件在位均已确认（40+ 扩展同目录）；TT settings 仅 `extension_settings` 键。
    残余问题在 TT 运行时激活层（延迟激活 `activateDeferredThirdPartyExtensions`），需真机轮次。
  - **PT predev 锚点漂移**：宿主仓源码（L0-1 禁改域），维持如实登记。
  - **check:copy 91 处**：逐条核对为**中文排版惯例**（全角括号注记 / 全角分号分句），
    属审计规则的误报而非文案缺陷；收口=改写 91 条中文文案反而劣化 ⇒ 维持咨询性、登记不收口。
