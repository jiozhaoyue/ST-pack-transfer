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

[PARTIAL] **功能与四宿主验收完成**；AC-10 真机双设备截图未做，已如实登记（任务保持 in_progress，不归档）

### Next Steps

- ① 两台不同机器的局域网互传（mDNS / 扫码 / 非安全上下文提示）真机验收
- ② PT ↔ TT 跨宿主互传（成本高，ST↔Luker 已代表 HTTP 宿主路径）
- ③ 清理仍按旧 UI 写的 `e2e/specs/matrix.e2e.cjs` / `vault.e2e.cjs`（当前矩阵已改用 newui）
- ④ 归档 10-14-lan-transfer 与 storage-chart-workbench 子任务（按新实现回填验收）

## Session 55: 六对互传 120/120 + TT 浮层修复 + 局域网 UI 二次重做（demo 完成、正式待接）
<!-- trellis-session: v=2 fp=lan-ui-redesign-20261027 -->

**Date**: 2026-10-27
**Task**: 10-14-lan-transfer（in_progress）
**Branch**: `main`

### Summary

补齐全网互传：四宿主 **6 对 × 双向 = 12 次**全部通过（120/120，3 MB、摘要一致、接收端落包）。
排障发现 TT 两个真实缺陷并修复：① TT 的 `<html>` 带 `transform` 且高度 0，所有
`position:fixed;inset:0` 浮层塌成 0/24px（局域网面板跑到屏幕外）⇒ 全屏浮层改 `100vw×100vh`；
② TT 的「扩展更新」dialog 层级高于工作台，盖住且点不到 ⇒ 打开工作台前调
`closeHostExtensionSurface()` 关闭宿主弹层。旧 `matrix/vault/library-inject` 规格移出
`e2e/specs/`（运行器不再扫描）。

随后按用户四轮评审重做局域网 UI（**demo 已完成**）：执行卡内联可折叠、发送/接收同屏、
只发导入区勾选包、接收直接进唯一导入区、徽标区分 `本地导入/远程导入`、宿主仍扫包、
多包排队、各自行内进度、二维码（qrcode-generator + jsQR，本地 vendor）、相机权限失败保粘贴、
导出区也可排序、文本框走主题、内边距补齐。许可证改为 **AGPL-3.0**。

**正式接线未完成**：`index.js` 未提供 `actions.lan`/`qr`，旧 `lan-transfer-panel.js` 仍是浮层，
新 LAN 区块在插件内不可用；重复 `lan-*` id 待清理。详见
`.trellis/tasks/10-14-lan-transfer/HANDOFF.md`。

### Git Commits

| Hash | Message |
|------|---------|
| `f5e2423` | fix(ui)+test(e2e): TT 固定浮层塌陷与宿主弹层遮挡；旧规格移出扫描目录 |
| （本次） | feat(ui): 局域网 UI 二次重做（demo）+ 二维码 vendor + AGPL-3.0 + 交接文档 |

### Testing

- [OK] `npm test` 875 passed / 2 skipped；五守卫全绿（43 控件 / 35 声明）
- [OK] `check:ui-sync` 三件套与 demo 逐字一致
- [OK] 六对互传 120/120（旧浮层 UI；协议未改）
- [OK] demo 探针：二维码/进度/远程徽标/移动端顺序/导出排序，零控制台错误
- [PENDING] 新 UI 的正式接线、LAN E2E 规格更新、PT 快照重装、四宿主复跑、真机双设备

### Status

[PARTIAL] **中间态**：demo 完成并验证；正式插件内新 LAN 区块未接线，不要发版。

### Next Steps

- ① `src/ui/qr.js` + `index.js` 传 `qr`
- ② `lan-transfer-panel.js` 去浮层、绑模板 id、`view.setLan`
- ③ `ORIGINS.LAN` + 本地导入/远程导入徽标 + 远程自动加序号
- ④ 多包队列；更新 LAN E2E；四宿主/六对复跑；PT 重装
- ⑤ 真机双设备 AC-10

## Session 56: demo 依赖方向反转（demo 消费正式代码）+ 局域网内边距对齐
<!-- trellis-session: v=2 fp=demo-live-preview-20261027 -->

**Date**: 2026-10-27
**Task**: 10-27-demo-live-preview（in_progress）
**Branch**: `main`

### Summary

按用户裁定把 UI 依赖方向反过来：**正式三件套是手写唯一源**（`style.css` /
`workbench-template.js` / `workbench-view.js`），`src/ui/ui-demo.html` 只通过
`<link>` + `import` 消费正式代码，演示数据与 harness 仍留在 demo。删除
`scripts/sync-ui-from-demo.cjs` 与 `test/ui-demo-source.test.js`（用户批准），
`package.json` 去掉 `sync:ui` / `check:ui-sync`；新增
`test/ui-demo-isolation.test.js`（正式源码零引用 demo + demo 只消费正式模块）。
demo 现在经 Vite 实时预览：`npm run dev` → `http://localhost:3040/src/ui/ui-demo.html`
（ESM 在 `file://` 下被 CORS 拒，demo 不再支持双击）。

同时修局域网区块内边距：`.lan-block` 水平 `4px → 9px`、`.lan-toggle` `2px → 0`，
收起/展开两态与 `.action-row` / `.progress` 左边缘对齐。

### Git Commits

| Hash | Message |
|------|---------|
| （本次） | refactor(ui): demo 改为只消费正式代码；局域网区块内边距对齐 |

### Testing

- [OK] `npm test` 874 passed / 2 skipped（81 文件通过 / 1 skipped）
- [OK] 五守卫全绿（43 控件 / 35 声明）
- [OK] `npm run build` 通过
- [OK] 3040：正式页 / demo / demo 展开 LAN / demo 移动端，四张截图控制台零错误
- [OK] 实测 LAN 内容左边缘 `x=862`，与 action-row 一致（卡片 `x=853` + 9px）

### Status

[DONE] demo 依赖方向反转 + 内边距对齐完成；正式插件内新 LAN 区块仍未接线（属 10-14-lan-transfer）。

### Next Steps

- ① 继续 `10-14-lan-transfer`：`qr.js` + `actions.lan` 正式接线
- ② `lan-transfer-panel.js` 去浮层、绑模板 id
- ③ 更新 LAN E2E、四宿主复跑、真机双设备

## Session 57: LAN 正式接线完成 + UI 偏移溯源交接
<!-- trellis-session: v=2 fp=lan-wire-ui-trace-20261027 -->

**Date**: 2026-10-27
**Task**: 10-14-lan-transfer（in_progress）
**Branch**: `main`

### Summary

完成局域网正式接线：新建 `src/ui/qr.js`（classic 注入本地 vendor），
`lan-transfer-panel.js` 去浮层改为内联控制器（`view.setLan` + 多包队列），
`index.js` 接 `qr` / `actions.lan` / `getSendTargets`，接收走 `ORIGINS.LAN` 并加「远程导入」徽标；
E2E 重写为两个独立上下文、3 MB + 64 KB 两包排队，**24/24 通过**。
同时修复主题：LAN `.menu_button` 白底回退、原生 checkbox 白方块改自绘、`color-scheme:dark`。

用户随后叫停 UI 改动并要求**只做溯源交接**。已写
`.trellis/tasks/10-26-storage-chart-workbench/HANDOFF-2026-10-27-UI-TRACE.md`：
设置页首次出现在 demo `a1dfa0b`（2026-10-26 23:25），生产由 `3b7aeed`（2026-10-27 03:25）
「按定稿 demo 全面重写」搬入，同时删除了旧主界面「打包」区
（`3b7aeed^:src/ui/workbench-template.js:137-258`）。8 项打包设置与图表双源，
`generate()` 读全局 `settings.*` 覆盖图表勾选；图表虚拟节点（完整扩展/Git/构建/原生资产）
只存在于 demo，`chart-model.js` 从未实现；「导入01」在 `.chart-group-head`（图表卡外）；
「大类折叠到文件」无需求来源；逐级全选未实现；设置页无任何 CSS 且 3 个枚举并排；
最后一 3 项（keepExport/trafficPrompt/autoTutorial）也是死设置；设置不持久化。

### Git Commits

| Hash | Message |
|------|---------|
| （待提交） | feat(lan)+fix(ui): 局域网正式接线；主题回退；UI 偏移溯源交接 |

### Testing

- [OK] `npm test` 874 passed / 2 skipped
- [OK] 五守卫全绿；`npm run build` 通过
- [OK] `npm run e2e:web -- --only lan-transfer --rebuild` 24/24
- [OK] 3040 实跑：上传→勾选→生成取件码→二维码；桌面/设置/图表截图零控制台错误
- [PENDING] 四宿主/六对复跑、PT 快照、真机双设备

### Status

[PARTIAL] LAN 接线完成；**UI 偏移未修，等用户裁定**（设置页承载、图表虚拟节点、逐级全选、导入01 位置）。

### Next Steps

- ① 读 `HANDOFF-2026-10-27-UI-TRACE.md` §0 用户裁定与 §4 待修清单
- ② 等用户确认「打包选项回图表」的具体落点（尤其压缩）
- ③ 再做 P0 修复与四宿主复跑



## Session 58: 宿主图表 / 设置收敛 / 图表唯一选择面 / i18n / 教程定位
<!-- trellis-session: v=2 fp=0d44c10c2bf2cb7c -->

**Date**: 2026-10-27
**Task**: 宿主图表 / 设置收敛 / 图表唯一选择面 / i18n / 教程定位
**Branch**: `main`

### Summary

任务 1/2 已提交；任务 3 主 UI i18n 与教程锚点完成；交接迁入 Trellis 任务目录；剩余 LAN/导出区/二维码 i18n、截图、四宿主复验。

### Main Changes

- 任务 1：宿主图表置灰 + 设置只留 3 开关 + 齿轮 + 持久化
- 任务 2：图表正向节点 + 扩展完整/仅清单 + 官方扁平 index.json
- 任务 3：i18n zh-CN/en-US 293 键 + 教程锚点 + check:i18n 守卫

### Git Commits

| Hash | Message |
|------|---------|
| `00dc830` | feat(ui): 宿主图表置灰与设置收敛 |
| `f5c02c2` | feat(chart): 图表唯一选择面与官方扩展清单 |
| `9aed39a` | feat(i18n): 主工作台 i18n 与教程锚点 |
| `e0cfdcd` | docs(handover): 全面交接 i18n / 图表 / 设置与未完成项 |
| `53a7792` | chore(trellis): 交接迁入任务目录 + 任务状态收口 |

### Testing

- [PARTIAL] npm test：903 passed / 1 failed / 2 skipped（隔离守卫全量失败，单跑 5/5）
- [OK] 六守卫全绿（css/dom-injection/template/dom-scope/control-consumer/i18n）
- [PENDING] UI 截图与四宿主复验未做（预览工具不可用）

### Status

[PARTIAL] **任务 1/2 代码完成；任务 3 主 UI i18n 完成；剩余 LAN/导出区/二维码 i18n、截图、四宿主复验、任务 archive**

### Next Steps

- 迁移 LAN/导出区/二维码 i18n 并扩 SCAN_FILES
- 定位隔离守卫全量失败
- UI 截图 + 四宿主复验 + 任务 archive

## Session 59: 剩余 UI 文案迁移与三个子任务收口

**Date**: 2026-10-27
**Task**: 10-27-i18n-tutorial（归档）/ 10-27-host-chart-settings（归档）/ 10-27-chart-single-source（归档）
**Branch**: `main`

### Summary

LAN / 导出区 / 二维码文案全量迁入 i18n 并纳入守卫；三个 10-27 子任务如实勾选后归档；
按用户指令**跳过四宿主复验与浏览器截图**，只跑定向小测。

### Main Changes

- `lan-transfer-panel.js` / `export-queue.js` / `qr.js`：全部中文改 `t()`，加入 `SCAN_FILES`。
- 语言相关格式走 locale：`lan.duration.{sec,minSec,min}`、`queue.partJoin`、`queue.listSep`；
  核心 `formatDuration` 保持与 UI 无关，UI 侧用本地 `durationText()`。
- 清理 locale 重复键 4 组（`progress.ready` / `toast.selectExport*` / `toast.pluginOnlyRestore`）。
- `dbg()` 调试串统一英文（避免与被守卫文件混淆）。
- spec `frontend/i18n-and-settings.md` 增补守卫覆盖清单、技术消息排除项、重复键盲区。

### Git Commits

| Hash | Message |
|------|---------|
| `7ee02dc` | feat(i18n): 局域网/导出区/二维码文案迁移并纳入守卫 |
| `701de3a` | chore(task): archive 10-27-host-chart-settings |
| `cbb2a1c` | chore(task): archive 10-27-chart-single-source |
| `6c42195` | chore(task): archive 10-27-i18n-tutorial |

### Testing

- [OK] `npm run check:i18n` + 五个既有守卫全绿
- [OK] 定向小测：i18n / lan-transfer / export-queue / durable-mirror / tutorial-anchor = 57 passed
- [OK] `npm run build` 通过
- [OK] 复核全量：904 passed / 2 skipped / 0 failed（隔离守卫失败未复现）
- [SKIPPED] 四宿主复验、浏览器截图 —— 用户 2026-10-27 指令明确跳过

### Status

[DONE] 三个 10-27 子任务已归档推送。父任务 `10-26-storage-chart-workbench` 剩 6 个 planning 子任务。

### Next Steps

- `10-26-naming-injection` 仍卡在两处**非代码项**：本地目录改名（需关掉占用程序）、
  `AGENTS.md` / `CLAUDE.md` 自动生成规则块（真源仓 `tavern-harness` 控制）。
- 生产 `index.js` 未调用 `setHostTree`，宿主真实树接线需单独立项。

## Session 60: 六个子任务收口 + 合并模式 + 私有配置容器

**Date**: 2026-10-27
**Task**: 10-26-storage-chart-workbench 全部子任务（父任务 10/10，已归档）
**Branch**: `main`

### Summary

用户要求「做完剩下 6 个 planning 子任务」。逐条核验后发现绝大多数已由 10-26/10-27 的提交实现；
真正缺口是**多包合并**（用户追加裁定）与**私有配置容器 / 传云上传**，其余为小缺陷修正。
六个子任务与父任务均已按证据收口并归档。

### Main Changes

- **合并模式**（用户裁定：默认仍多图表，切开关才是单图表）：
  `src/core/merge-packages.js`（树合并 / 冲突检出 / 产物合并）、批量条开关 + 合并徽标、
  `index.js` 的 `generateMerged`（各包按合并树勾选转换 → 合并 → 分卷）、同名即停弹窗。
- **私有配置容器**：`src/core/private-container.js`（`manifest.json` + `_private/` + `nativeRestore`）。
- **传云上传**：`host-bridge.js` 新增 `user/files` 适配器（upload/delete/verify，文件名白名单 / 500MB / CSRF），
  图表私有节点「传云」按钮接到真实上传 + 流量提示。
- **修正**：复制回导入区改 `origin: export-copy`；合并上传替换原假冲突桩；
  教程第 3 步锚点由不存在的 `.tree-tools` 改为 `.chart-tree`，目标缺失隐藏高亮环；
  未识别包说明句移入 `?`（`help.chart.p6`）。
- **删除**：`src/storage/vault-store.js` 与其单测（用户授权），`ORIGINS.VAULT` 仅保留读历史。
- 新增单测：`merge-packages` / `private-container` / `user-files-adapter`。

### Git Commits

| Hash | Message |
|------|---------|
| `1484f4c` | feat(chart): 多包合并模式 + 私有配置容器与传云上传 |
| 6× | chore(task): archive 10-26-*（六子任务） |
| `940c2e3` | chore(task): archive 10-26-storage-chart-workbench |

### Testing

- [OK] 六守卫全绿（css / dom-injection / template-source / dom-scope / control-consumer / i18n）
- [OK] 定向小测：i18n / merge-packages / private-container / user-files-adapter / tutorial-anchor /
  chart-model×2 / workbench-session / db-origin / plugin / git-mode / selection-defaults 全过
- [OK] `npm run build` 通过
- [SKIPPED] 四宿主复验、浏览器截图、真实宿主上传（用户 2026-10-27 指令禁止）

### Status

[DONE] 父任务 10/10 子任务已归档。遗留（如实未勾选）：zones-flow AC-20（分区状态机/复制解耦无独立单测）；
package-cards-vault AC-24（`/api/files/delete|verify` 有适配器无界面入口；宿主无列表端点）、AC-26（序号/折行无单测）；
tutorial-copy AC-31（无文案审查脚本）。

### Next Steps

- 剩余活跃任务：`10-01-safe-migration-productization`、`10-14-workbench-overhaul`（3 子）、`10-24-ui-orchestration-r2`。
- 若要把「列出/删除 user/files」做成界面，需先定列表来源（只能靠本地索引）。
