# Journal - jiozhaoyue (Part 2)

> Continuation from `journal-1.md` (archived at ~2000 lines)
> Started: 2026-10-24

---



## Session 44: UI 编排调整与宿主令牌修正 + 独立 E2E 存量红读数登记
<!-- trellis-session: v=2 fp=9735db8019391b75 -->

**Date**: 2026-10-15
**Task**: UI 编排调整与宿主令牌修正 + 独立 E2E 存量红读数登记
**Branch**: `main`

### Summary

扩展列表只留宿主一行、工作台改全屏打开、上传槽加角色标签；修正宿主令牌映射颠倒（面板底色取 BlurTint、文字取 BodyColor）；登记独立 E2E 存量红读数并逐条归因

### Main Changes

- 扩展入口收敛：扩展列表只留宿主一行，工作台全屏打开
- 宿主令牌映射颠倒修复（面板底色/文字取值对调）
- 独立 E2E 存量红读数登记与逐条归因（docs(task)）

### Git Commits

| Hash | Message |
|------|---------|
| `93c803f` | feat(ui): 扩展列表只留宿主一行，工作台改全屏打开；上传槽加角色标签 |
| `be04efd` | fix(ui): 修正宿主令牌映射颠倒（面板底色取 BlurTint、文字取 BodyColor） |
| `37f0006` | docs(task): 登记独立 E2E 存量红读数与逐条归因 |

### Status

[OK] **Completed**


## Session 45: 10-15 任务收口——S1 四现症固化 + 规范落盘 + 归档
<!-- trellis-session: v=2 fp=f23d50bdd56b4653 -->

**Date**: 2026-10-24
**Task**: 10-15 任务收口——S1 四现症固化 + 规范落盘 + 归档
**Branch**: `main`

### Summary

S1 四现症固化为 s1-remedies E2E（15/15）；三层架构与 CSS 铁律落规范页（workbench-three-layer.md）；10-15 任务归档

### Main Changes

- s1-remedies E2E 15/15（无外层滚动/浮层锚行/单行不折等断言固化）
- workbench-three-layer.md 规范页新建并登记 index
- task.py archive 10-15-workbench-dual-flow-redesign

### Git Commits

| Hash | Message |
|------|---------|
| `5839079` | chore(task): archive 10-15-workbench-dual-flow-redesign |
| `f97a000` | test(e2e)+docs(spec): 10-15 收口——S1 四现症固化为 s1-remedies E2E（15/15），三层架构/CSS 铁律落规范页 |

### Status

[OK] **Completed**


## Session 46: UI 编排与数据流重规划（r2 父任务）+ D-12 域名强制守卫
<!-- trellis-session: v=2 fp=49c5b449cff10934 -->

**Date**: 2026-10-24
**Task**: UI 编排与数据流重规划（r2 父任务）+ D-12 域名强制守卫
**Branch**: `main`

### Summary

两轮 AskUserQuestion 定稿 D-01~D-13 裁决与任务地图（A UI 编排/B 数据流/C 测试/D harness 回流）；D-12 域名强制落地——实例目标一律实例命名式域名，裸 localhost/127 与域名端口错配即拒（guard 21/21）

### Main Changes

- 父任务 10-24-ui-orchestration-r2 prd/design 定稿（需求全集+决策记录+任务地图）
- D-12 域名强制：guard.e2e.cjs 21/21，instance-e2e-and-data-sync.md 补纪律

### Git Commits

| Hash | Message |
|------|---------|
| `7fb7b1e` | feat(e2e): D-12 域名强制——实例目标一律实例命名式域名（*.localhost），裸 localhost/127 与域名端口错配即拒（guard 21/21） |

### Status

[OK] **Completed**


## Session 47: A 线实施——分组列表/帮助层/UI 铁律/detectHost TT·PT/拉取前预览 + flash 视觉复审
<!-- trellis-session: v=2 fp=f218725b1bf59cb9 -->

**Date**: 2026-10-24
**Task**: A 线实施——分组列表/帮助层/UI 铁律/detectHost TT·PT/拉取前预览 + flash 视觉复审
**Branch**: `main`

### Summary

落实 R-A1~R-A6：列表按维度分组+组头三态、区块「?」帮助层、UI 编排铁律定型+动词封闭集守卫、detectHost 注册表接入 TT/PT、拉取前预览、纯本地 IO 审计；flash 子代理视觉复审三条高危处置；npm test 892 passed 零回归

### Main Changes

- 分组列表：groupStashFiles/groupQueueItems 纯函数 + groupBy=null 回退（列表测试 30/30）
- 帮助层：HELP_TOPICS 8 主题 + 幂等注入 + 悬空断言（5/5）
- UI 铁律：ui-orchestration-rules.md 四节 + ui-verb-table.test.js
- detectHost：HOST_REGISTRY 数据化，detect-host 30/30（含跨族冲突/alien→unknown）
- 拉取前预览：describeHostFetchPlan + 确认步 + 单测 4 项
- E2E s1-remedies 扩至 25/25，连带修掉 done 门控藏打包区真缺陷
- 视觉复审：fullPage 截图 fixed 伪象修正（独立态容器自铺 --bg-primary，整页统一 #1A1B1F）

### Git Commits

| Hash | Message |
|------|---------|
| `72021f1` | feat(ui): A 线落地——列表按维度分组、区块「?」帮助、铁律定型+动词守卫、detectHost 接入 TT/PT、拉取前预览 |
| `17c26e6` | fix(ui): 独立态容器自身铺 --bg-primary——fullPage 截图/打印下 fixed 伪元素只按视口合成会露出 body 白底（flash 视觉复审实测），双保险后整页统一 #1A1B1F |

### Testing

- [OK] npm test 892 passed / 2 skipped（基线 865，+27）；五守卫全绿；e2e:web exit 0

### Status

[OK] **Completed**


## Session 48: A 线收口——四脚本入库、任务登记归档、journal 断档修复、spec index 补登记
<!-- trellis-session: v=2 fp=90652836c9b01015 -->

**Date**: 2026-10-24
**Task**: A 线收口——四脚本入库、任务登记归档、journal 断档修复、spec index 补登记
**Branch**: `main`

### Summary

上一会话被 API 报错打断的收口续完：四脚本按 design §6.2 先入库（P-18 防捎带）；r2/impl 两任务目录登记并勾结 AC（impl 八项、父任务 AC-0~3；AC-4 的 8899 实测留 C 线）；spec index 抓出并补上 ui-orchestration-rules 漏登记、读数对齐 892/21；journal 补记 44-47 并回填索引断档 27-43（add_session 会话号解析只认冒号头的坑已踩明）；impl 归档，r2 保持 active 待 B/C/D 线

### Main Changes

- scripts/ 四脚本入库（PT 安装/扩展行探针/实例探针/实例重启）
- 10-24 r2+impl 任务目录入库，PRD AC 勾结附证据
- spec frontend index 登记 UI 编排铁律页 + 计数对齐
- journal-2 拆卷、Session 44-47 补记、index 27-43 回填
- task.py archive 10-24-ui-orchestration-impl（父任务 1/1 done）

### Git Commits

| Hash | Message |
|------|---------|
| `f793e6c` | chore(scripts): 四脚本入库——PT 扩展安装/扩展行探针/实例探针/实例重启 |
| `1d5ae0d` | chore(task): 登记 10-24-ui-orchestration-r2 父任务与 A 线 impl 子任务 |
| `cc16777` | docs(spec): frontend index 补登记 UI 编排铁律页，对齐现状读数 |
| `0057175` | docs(journal): 补记 Session 44-47 并回填索引断档 27-43 |
| `4b2734b` | chore(task): archive 10-24-ui-orchestration-impl |

### Testing

- [OK] npm test 复跑 892 passed / 2 skipped 零回归（收口门禁）

### Status

[OK] **Completed**

### Next Steps

- B/C/D 线子任务创建（luker-selection-max / authority-st-capability / tt-cdp-probe / e2e-instances-runner / harness-reflow），建前按 L0-2 回填 PRD


## Session 49: B/C 线三子任务登记 + Luker selection 契约七轮取证定案（luker-selection-max 完结归档）
<!-- trellis-session: v=2 fp=09a7aadc752a48b6 -->

**Date**: 2026-10-25
**Task**: B/C 线三子任务登记 + Luker selection 契约七轮取证定案（luker-selection-max 完结归档）
**Branch**: `main`

### Summary

登记 tt-cdp-probe/e2e-instances-runner/luker-selection-max 三子任务（PRD+manifest 全过 validate）；luker-selection-max 七轮黑盒取证（Dev 8003）：10 标准键布尔全有效、settings 与 backups/892.2MB 绑死（勾设置必拖备份占包 49.8%）、无 Content-Length、特殊键静默忽略——透传层现状已到顶（分支乙零产品代码改动），反选 settings 实测省 50.2%；解绑诉求登记 R-B2；spec host-capabilities 增补契约表+三条硬约束；父任务 AC-5 勾结；npm test 892 零回归五守卫全绿；任务归档

### Git Commits

| Hash | Message |
|------|---------|
| `2dd2055` | feat(task)+docs(spec): B/C 线子任务登记 + Luker selection 契约七轮取证定案 |
| `a29fdc8` | chore(task): archive 10-25-luker-selection-max |

### Testing

- [OK] npm test 892 passed / 2 skipped 零回归；五守卫全绿；取证只连 dev-luker.localhost:8003

### Status

[OK] **Completed**

### Next Steps

- C 线 tt-cdp-probe（WebView2 CDP 冒烟，结论定 e2e-instances 矩阵）→ e2e-instances-runner（吸收本次 163s 冷启动读数：restart 脚本 90s waitReady 不够）；B 线 authority-st-capability 在 Authority 仓建任务（含 settings↔backups 解绑诉求）


## Session 50: r2 任务群全线推进：luker 取证/tt-cdp/e2e:instances 错峰模型/harness 回流四件套/Authority ST 适配器（交接）
<!-- trellis-session: v=2 fp=0b01b2597a11367b -->

**Date**: 2026-10-26
**Task**: r2 任务群全线推进：luker 取证/tt-cdp/e2e:instances 错峰模型/harness 回流四件套/Authority ST 适配器（交接）
**Branch**: `main`

### Summary

五线并行推进至交接点：B-1 luker-selection-max 七轮取证完结归档（settings↔backups 绑死 892MB、反选省 50.2%、透传层零改动）；C-1 tt-cdp-probe 完结归档（CDP 链全通、TT 三铁则进 spec）；C-2 e2e-instances-runner 落地错峰模型（用户裁定计入规则：同刻只保被测宿主在线+收尾全停），st 93/93·luker 93/93·pt 28/28·guard 21/21 全绿，唯一阻断 KI-3（TT 重启后扩展停用+自动启用兜底未通）；B-2 Authority 仓 e4fb996（st-backup 手写 stored-zip 端点+probe 标记+5/5 测试）+本仓适配器 probeAuthorityStBackup 单测 8/8；D 线 harness f068c2c/b5e28d0（contributions 机制/tavern-ui-style skill/scan_register/MCP 查询面×2）。修复存量缺陷六项（DRAWER_ID 残留/M-3 口径/dialog 遮障/日志 id 改版/PT 临时档案安装/restore-probe 负载 flake 定性）。交接文档 workspace/HANDOFF-2026-10-25.md

### Git Commits

| Hash | Message |
|------|---------|
| `098e158` | feat(e2e)+feat(host-bridge): e2e:instances 错峰模型落地 + Authority ST 适配器 + 六项存量缺陷修复（交接提交） |

### Testing

- [OK] npm test 900 passed / 2 skipped；五守卫全绿；错峰矩阵 st/luker/pt/guard 全绿、tt-cdp 待 KI-3

### Status

[OK] **Completed**

### Next Steps

- ① KI-3（TT 自动启用兜底，known-issues.md 三选一续法）→ 整轮 exit 0 → 勾 AC-1/AC-8；② 终跑 npm test 勾 AC-10；③ 归档 e2e-instances-runner 与 r2 父任务；④ harness C-002/C-003 回流审核；⑤ KI-1 st 命名疑点独立小任务；⑥ Authority st-restore 待治理裁定

## Session 51: KI-3 定案根治 + 四宿主矩阵全绿 + 仓功能真实后端取证与并发渲染缺陷修复
<!-- trellis-session: v=2 fp=zcode-continue-20261026 -->

**Date**: 2026-10-26
**Task**: 10-25-e2e-instances-runner（收口）+ 10-26-host-vault（收口）
**Branch**: `main`

### Summary

接 ZCode 会话（session_6f09b483…）最后一个动作（vault 提交推送后因并发限流中断）续跑。KI-3 五轮探针定案：TT 第三方扩展是**延迟激活**（APP_READY 后 nextPaint→initTokenizers→initScrapers），冷启动实测 28.6–34.6s 才注入痕迹；旧冒烟读完一次即判死、旧兜底 `#extensions_menu_button` 在现版 TT 已不存在（flopped 从未执行）、`mentionsPlugin` 因面板显示名而假命中。修 `e2e/lib/tt-cdp.cjs` 为有界等待插件自注入信号（menu-item/open-btn/drawer/app-container，上限 120s）。`npm run e2e:instances` 全量复跑 **exit 0**：guard 21/21 · st 16+93 · luker 16+93 · pt 28 · tt-cdp ✅（冷启动 waitedMs=34639）。仓功能做真实宿主取证：Dev Luker 8003（Authority）徽标「服务端」、backend=authority、存入/导出字节一致 2782B/删除归零、插件错误 0；Dev ST 8001 降级 backend=indexeddb 同链路全过。取证中发现并修复**仓面板并发渲染重复行**（1 条后端记录渲染成 4 行）：渲染序号 + DOM 写入集中在最后一次 await 之后；新增守护用例。

### Git Commits

| Hash | Message |
|------|---------|
| （本次） | fix(vault)+fix(e2e): KI-3 延迟激活定案 + 仓面板并发渲染竞态 + 仓功能双后端运行时取证 |

### Testing

- [OK] npm test 924 passed / 2 skipped（+1 并发渲染用例）；五守卫全绿
- [OK] e2e:instances 四宿主全绿 exit 0（tt-cdp 冷启动 34.6s）
- [OK] 仓运行时：dev-luker(authority)/dev-st(indexeddb) 双后端全链路 + 截图 + 后端真值断言

### Status

[OK] **Completed**（两个子任务可归档；父任务 AC-6 Authority 整包恢复端点仍待治理裁定）

### Next Steps

- ① 归档 10-26-host-vault 与 10-25-e2e-instances-runner；② 父任务 r2 仅剩 AC-6（Authority 整包恢复端点，待治理裁定）；③ 仓 UI 在 TT/PT 的运行时截图未取证（TT 延迟激活 ~35s 需并入矩阵才稳）；④ KI-1 st 产物命名疑点仍独立待办

## Session 52: 仓运行时验证固化进 e2e:instances 矩阵（四宿主含 TT/PT）
<!-- trellis-session: v=2 fp=vault-e2e-20261026 -->

**Date**: 2026-10-26
**Task**: 10-26-vault-e2e-spec
**Branch**: `main`

### Summary

把 `10-26-host-vault` 的一次性取证脚本固化为 `e2e/specs/vault.e2e.cjs`（后端真值判定 + 存入/导出字节一致/删除双归零），并入矩阵 dev-st / dev-luker / dev-pt；TT 走 `tt-cdp.cjs` 新增的 `ttVaultSmoke`。四宿主全绿：st 17/17（indexeddb·本地）、luker 17/17（authority·服务端，连跑 3 次稳定）、pt 17/17、tt PASS；整轮 `e2e:instances` exit 0，npm test 924 + 五守卫全绿。实测暴露并修掉四件事：TT 已装副本过期导致插件 import 404（ensureInstalled 改刷新式）、TT 冷启动导航致 evaluate 上下文销毁（retryOnNav）、PT 阶段停在 scanned（按 fixture- 前缀清源包）、Luker 删除后 UI 刷新 4.5–9s 且弹窗叠层（按文案锁定弹窗 + 30s）。TT 截图改为工作台元素截图，避免带进真实聊天内容（P-11）。

### Git Commits

| Hash | Message |
|------|---------|
| （本次） | feat(e2e): 仓运行时验证固化为 vault spec 并入四宿主矩阵（含 TT/PT 取证） |

### Testing

- [OK] node e2e/run.cjs --only vault --instance dev-st / dev-luker / pt-web 各 17/17
- [OK] npm run e2e:instances 全量 exit 0（st 16+93+17 / luker 16+93+17 / pt 28+17 / tt smoke+vault）
- [OK] npm test 924 passed / 2 skipped；五守卫全绿

### Status

[OK] **Completed**（可归档）

### Next Steps

- ① 父任务 r2 仍只剩 AC-6（Authority 整包恢复端点，待治理裁定）；② KI-1 st 产物命名疑点仍独立待办

## Session 53: naming-injection 落地 + 仓库改名 / README / GPL-3.0 / Pages 部署清理
<!-- trellis-session: v=2 fp=naming-injection-20261027 -->

**Date**: 2026-10-27
**Task**: 10-26-naming-injection
**Branch**: `main`

### Summary

实现父任务 R1 / R6.5 / R10.1：新增 `src/core/naming.js`（11 个占位符语义独立，`{target}` 输出英文全称，`{datetime}` 到秒，默认 `{target}_{user}_{part}_{datetime}.zip`）取代 `filename-template.js`（已删）；新增 `src/ui/host-icons.js`（四宿主本地内置图标，data URI）；目标平台下拉固定四项英文全称 + 当前宿主「（宿主）」，`native` 分支全删且未知值回落宿主布局；扩展行改为宿主同款内联下拉（只含「打开面板」），删除 `registerMenuButton` 并把 `#extensionsMenu`/`#options` 移出 `check:dom-scope` 锚点白名单；顶栏徽标改为「宿主图标+英文全名+插件 / GitHub+Web」，`style.css` 增品牌色令牌（仅标识用途）。

随后按用户要求完成仓库维护：GitHub 远端改名 `jiozhaoyue/ST-pack-transfer`（origin 已切换并推送）；README 精简重写（四酒馆数据包说明 / 功能 / 优点 / 安装与本地部署 / 在线使用）；LICENSE 由 MIT 换成 GNU GPL v3（package.json 与 lock 同步 `GPL-3.0-or-later`）；清理 GitHub Pages 历史部署，只留最新一条（215 → 1）。

### Git Commits

| Hash | Message |
|------|---------|
| `9b5d57c` | feat(naming): 改名 ST-pack-transfer 并落命名引擎、四项目标选择器、三处入口与顶栏徽标 |
| `13247a6` | refactor(naming): 删除已被 naming.js 取代的 filename-template.js |
| `29e4ccd` | docs(trellis): 登记改名与验收现状（远端已改、本地目录受阻、Web E2E 待补） |
| `924e919` | docs: 精简 README 并改用 GPL-3.0-or-later |

### Testing

- [OK] `npm test` 945 passed / 2 skipped（88 文件，1 skipped）
- [OK] `check:css-scope` / `check:dom-injection` / `check:dom-scope` / `check:template-source` / `check:control-consumer` 五条全绿
- [OK] `getWorkbenchHtml()` 渲染断言：标题「数据包转运」、徽标结构、四项目标下拉、无 `native`
- [FAIL] `npm run e2e:web` 本轮未跑完：运行器 9 分钟无输出、静态服务器常驻（已清理），未取得读数

### Status

[PARTIAL] **in_progress**：AC-2/3/4/5 已满足（AC-3 的实例 E2E、AC-5 的浏览器截图待补）；AC-1 未清零

### Next Steps

- ① **本地目录改名**（`ST-zip-converter` → `ST-pack-transfer`）被 Windows「另一个程序正在使用」阻塞（会话/编辑器持有项目根），需关闭相关程序后执行并同步 `.codex/hooks.json` 绝对路径
- ② 补跑 `npm run e2e:web -- --rebuild`，并补一次浏览器截图核验徽标
- ③ 之后按顺序推进 `10-26-storage-chart` → `zones-flow` → `package-cards-vault` → `tutorial-copy`

## Session 54: UI 单一源逐字同步 + 正式代码去演示化 + 局域网修复 + 四宿主/跨宿主实证
<!-- trellis-session: v=2 fp=goal-continue-20261027 -->

**Date**: 2026-10-27
**Task**: 10-14-lan-transfer（收口）+ 10-26-storage-chart-workbench（UI 单一源）
**Branch**: `main`

### Summary

继承上一会话 goal：demo html 必须是唯一 UI 源、四宿主运行时与 demo 逐字一致、局域网两两成功。
把唯一源从会被归档移动的任务目录迁到 `src/ui/ui-demo.html`，`sync:ui` 逐字复制三区；
按用户裁定清掉正式三件套里的所有演示物（演示工具条样式、假配额、假启动日志、`resetDemo`、
入口预览、演示 sessionStorage key），假配额改为 `navigator.storage.estimate()` 真值，
宿主无读数时如实标注。新增 `test/ui-demo-source.test.js` 硬门禁：三件套与 demo 不一致、
或出现 `demo` / `演示` / `DEMO_` 即红。

局域网修复真实缺陷：接收端在 OPFS sink 打开前收到数据帧会直接丢弃（实测首 8 块丢，产物缺字节），
改为 `sinkReady` 让写链等待；`failRecv` 只认第一次失败。独立 Web 3 MB 真互传 18/18。

四宿主排障：改名前的 `st-zip-converter` 副本仍残留在实例里（ST/Luker junction、TT/PT 旧目录），
旧 UI 抢占初始化导致 PT/TT 表现为「插件未挂载」。已移出扩展目录保留 `.linkbak` / `.disabled`；
PT 安装脚本 `--replace` 同时删除新旧两个名字。PT 规格从旧 UI 重写到新工作台（21/21）。

### Git Commits

| Hash | Message |
|------|---------|
| `5f02e3a` | feat(ui)+fix(lan): UI 单一源逐字同步并清除演示残留；局域网修复丢块 |
| （本次） | test(e2e): PT 规格改写新工作台；安装器清理改名前旧副本；PRD/日志收口 |

### Testing

- [OK] `npm test` 875 passed / 2 skipped；五条守卫全绿
- [OK] 独立 Web 局域网真互传 18/18（3 MB 分块、SHA-256 一致、一次性、坏码）
- [OK] Dev ST smoke 16 + newui 12；Dev Luker smoke 16 + newui 12
- [OK] Dev PT pt-load 21/21（新工作台：上传 → 图表 → 四目标 → 生成导出包 → 零报错）
- [OK] TT ttCdpSmoke PASS（激活 21.3s、零插件报错）
- [OK] 跨宿主 Dev ST ↔ Dev Luker 双向 20/20（摘要一致、接收端工作区出现同名包）

### Status

[OK] **Completed**（AC-10 真机双设备截图未做，已如实登记）

### Next Steps

- ① 两台不同机器的局域网互传（mDNS / 扫码 / 非安全上下文提示）真机验收
- ② PT ↔ TT 跨宿主互传（成本高，ST↔Luker 已代表 HTTP 宿主路径）
- ③ 清理仍按旧 UI 写的 `e2e/specs/matrix.e2e.cjs` / `vault.e2e.cjs`（当前矩阵已改用 newui）
- ④ 归档 10-14-lan-transfer 与 storage-chart-workbench 子任务（按新实现回填验收）

