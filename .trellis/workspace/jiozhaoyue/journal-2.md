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

## Session 61: 互传矩阵回滚 + demo 修复 + 交接

**Date**: 2026-10-27 → 2026-10-28
**Branch**: `main`

### Summary

做过「跨宿主互传矩阵」并实现插件调 Luker 原生 LAN Sync，用户叫停后整体回滚；
按用户裁定只修 demo 的三处致命缺陷；四宿主原生互传事实与新产品边界写入 spec 与本任务 HANDOFF。

### Git Commits

| Hash | Message |
|------|---------|
| `1110f47` | feat(transfer): 互传矩阵 + 插件调原生（**已回滚**） |
| `82b237b` | Revert `1110f47` |
| `9c38374` | fix(demo): 修复三处阻断整页脚本的既有缺陷 |

### Status

[OK] 代码回到 `306e3d1` + demo 修复。交接见
`.trellis/tasks/10-28-handover-post-revert/HANDOFF.md`。

### Next Steps

- 待裁定：私有件管理弹窗是否违反「禁止独立弹窗」。
- 仍缺：序号/折行单测、宿主真实树接线（单独立项）。

---

## Session 2026-10-30

**Date**: 2026-10-30
**Branch**: `main`
**Task**: `10-30-10-30-production-readiness`

### Summary

从前序 Claude 会话无缝接棒，落实用户明确裁定的 4 项核心缺陷与交互定稿：
1. 图表树防跳顶：在 `renderChart` 中对所有滚动容器（`#chart-stack`、子树 `.chart-tree`、`.app-main`、`window`）实现精细捕获与回填，彻底杜绝展开/折叠目录时的跳顶问题；
2. 导出行重构：从树节点行移出，收归至包卡头部（与 "导入01整包 2.0 GB" 并排），消除视觉割裂；
3. 设置面板闭环：新增扩展模式、Git 模式、保留构建配置默认选项并持久化至 `settings-store`；
4. 目标宿主品牌色联动：切换目标宿主时动态切换 `--accent`，复选框与高亮元素联动适配对应宿主色彩；
5. 双通道空态向导：未导入外部包且宿主树未拉取时，呈现「读取当前宿主」与「导入外部包」双通道引导，杜绝偷跑后端流量与超时 408 风险；
6. 部署工作流治理：`.github/workflows/deploy.yml` 调整为正式 Release 触发。

### Status

[OK] 守卫全绿（i18n、DOM 注入、Control Consumer、文案审查）；定向单元测试与 Vite 构建全部通过。

---

## Session 2026-11-02

**Date**: 2026-11-02
**Branch**: `main`
**Task**: `11-02-zero-overlay-runtime-correctness`

### Summary

用户裁定「取消全部面板内浮层」：设置 / 日志 / 帮助 / 确认（流量 / 删除 / 恢复 / 合并冲突 /
私有件 / 清空队列）全部从 `position:fixed` 浮层改为 `#app` 内 `.view-card` 视图切换。
根因是宿主 `html` 带 transform 时嵌套固定定位失效（Luker `public/style.css:143`；
TT 同类见 Session 55），表现为设置只剩暗遮罩、日志跑到左上角。
教程全屏引导按用户裁定保留。宿主配额接通 Luker 的 `/scripts/storage-inspector.js`
（`RestProvider` 只读读取 used/quota）；ST/PT/TT 读不到时显示「宿主未提供存储读数」。
恢复后的扩展安装器也收进面板（absolute）。仓库侧按用户命令取消跟踪
测试 / E2E / 守卫脚本 / 测试固件与 6 个运行时零引用模块（`05ac9eb`），本地文件全部保留。

### Testing

- [OK] `npm test` 926 passed / 2 skipped（隔离测试并行超时、单跑通过）
- [OK] 七项守卫全绿
- [OK] `npm run build`
- [OK] 浏览器实测：设置/日志/帮助均为面板内 static 视图，旧浮层节点为 0，零控制台错误
- [N/A] `e2e:web`：23 个 spec 是 10-27 UI 重写前的旧设计，与现行图表工作台不符，待单独重写
- [PENDING] Luker 8003 实机复验（两个拉取按钮 / 配额真实读数）

### Status

[PARTIAL] 代码与独立 Web 已验证；Luker 实机待复验。

---

## Session 2026-11-03

**Date**: 2026-11-03
**Branch**: `main`
**Task**: 宿主拉取性能 / 确认浮层 / 审计日志

### Summary

Dev Luker 实测「从宿主拉取 ~1MB/s，比原生慢 20 倍」。取证确认三条主因：
① Luker `selection.settings` 在 `getUserBackupTargets()` 里隐式加入 `<user>/backups/`
（本机 2.5GB / 308 个 22MB 设置快照）；② OPFS 逐 16–64KB 块 `await write`；
③ 拉取完成后整包再写 IndexedDB。另发现工作台重写后丢失了 OPFS 描述符归一，
`namedBlob({kind:'opfs'})` 会产出 `"[object Object]"` 文件。

修复：拉取改 `settings:false` + `/api/settings/get` 取运行态设置 +
`src/core/zip-append.js` 原地追加 `settings.json`（不重写旧字节）；OPFS 8MB 合并写；
宿主导出包改 OPFS 索引（IDB 只存 opfsName/size）；进度 rAF 合帧；
确认框改为原生 `<dialog>` 顶层（440×140 居中，top layer 不受宿主 html transform 影响）；
日志视图新增导出 `.txt` 与 localStorage 持久化，宿主导出链路写分段 TTFB/吞吐/读写耗时。

### Upstream PR

- <https://github.com/funnycups/Luker/pull/54>
- 分支 `jiozhaoyue:feat/backups-decouple`，提交 `97e47da`
- 新增 `settingsBackups` 选择键（默认 true 保持旧行为），`settings` 只管 `settings.json`。

### Testing

- [OK] `npm test` 926 passed / 2 skipped（含新增 `zip-append` / `host-fetch-buffered` 用例）
- [OK] 七项守卫全绿
- [OK] `npm run build`
- [OK] 独立 Web：dialog 顶层实测（1280×800 下 440×140 居中）、日志持久化与导出
- [PENDING] Luker 8003 实机复验：点一次「从宿主拉取」后导出审计日志，依据
  `TTFB / 传输 / OPFS写` 三段读数判断是否达到 10s 目标

### Notes

- 4.7GB → 约 2.2GB（排除 backups）后，10s 是否可达取决于宿主 deflate 与磁盘；
  审计日志是唯一判据，不再凭经验设阈值。
- 原生下载与插件拉取共用 `/api/users/backup`，插件拉取越快，对原生的占用窗口越短。



## Session 62: 宿主原生导出入口：TT/PT 分支与调研纪律
<!-- trellis-session: v=2 fp=10686bd3816ddc70 -->

**Date**: 2026-11-04
**Task**: 宿主原生导出入口：TT/PT 分支与调研纪律
**Branch**: `main`
**Spec**: [`.trellis/spec/frontend/host-capabilities.md`](../../spec/frontend/host-capabilities.md)（四宿主原生导出入口事实表 · 调研纪律）

### Summary

点「从宿主拉取」改为打开宿主原生导出界面并在其中注入拉取按钮；补齐此前误判的 TauriTavern（扩展列表 Data Migration）与 PureTavern（一方数据管理 dialog + /api/backups/archive/export）两条路径；把四宿主入口事实表与「禁止同构假设、先读宿主 docs」写进 spec 与 CLAUDE.md

### Main Changes

- 四宿主入口按平台分派：ST 账户面板 / Luker 备份弹层 / TT #data_migration_export_button / PT #ptdm-export
- 新增 fetchPtBackup（POST /api/backups/archive/export，500ms 滑窗实时速度）、readPtExportOptions、mountTtDataMigrationButton、mountPtDataManagementButton
- 拉取落库抽成 commitPulledPack；宿主无 toastr 时回退插件内提示
- Luker fork 把 backups/ 拆成独立类目（11 行，已推 jiozhaoyue/Luker:release b978e69b3），PR note 在 docs/

### Git Commits

| Hash | Message |
|------|---------|
| `adc317b` | feat(host-pull): 补 TauriTavern / PureTavern 的原生导出入口 |
| `3326598` | fix(host-pull): Luker 只在备份弹层注入一个拉取入口 |
| `5f3c8d4` | docs: 补 Luker fork「backups 拆分为独立类目」的 PR note |
| `0310edf` | docs(spec): 记录 TT/PT 实机验证的平台阻塞 |

### Testing

- [OK] npm test 934 passed / 2 skipped；七项守卫全绿
- [OK] Dev Luker 8003 实测：原生弹层打开、注入按钮、只勾 characters 得 59.9MB/19.1s、原生 toast、勾选未被回写
- [BLOCKED] PT dev 8899：GET /api/extensions 返回 501（第三方扩展未迁移），#pure-tavern-data-management-entry 与插件容器 40s 内均未出现 ⇒ PT 侧只有单测覆盖

### Status

[OK] **Completed**

### Next Steps

- ~~git push~~ 已于网络恢复后推送（origin/main = fff95a2）；TT 侧需 debug 可执行产物才能实机复验


## Session 63: Session 63 · 工作台收口（布局 / 分卷 / 联动 / 云端包仓库）
<!-- trellis-session: v=2 fp=4850047f2fec7ecf -->

**Date**: 2026-11-05
**Task**: Session 63 · 工作台收口（布局 / 分卷 / 联动 / 云端包仓库）
**Branch**: `main`

### Summary

补完截断批次，落地分卷确认、角色卡联动、S3 云端包仓库；本地目录永不入库

### Main Changes

- 修复 style.css 截断与两处守卫失败
- 移动端切换与配额宿主数据折叠
- P1-5 分卷失焦确认
- P2-1 角色卡↔聊天联动
- P2-2 A+B：局域网概览 + S3 云端包仓库
- 铁律 21：test/e2e/scripts/fixtures 永不入库

### Git Commits

| Hash | Message |
|------|---------|
| `9cbacad` | feat(sync): 分卷确认、角色卡联动与云端包仓库 |
| `35713ec` | docs(plan): 收口本轮状态与两条新坑位 |

### Testing

- [OK] npm test 956 passed / 2 skipped
- [OK] 七守卫全绿
- [OK] 浏览器 375/320/1440 实测

### Status

[OK] **Completed**

### Next Steps

- 起 Dev 实例后复验 D-1/D-2


## Session 64: Session 64 · 文档对齐与四项接线恢复（续传/暂停/报告/待导出区）
<!-- trellis-session: v=2 fp=e1b15a6d5fcb128c -->

**Date**: 2026-11-06
**Task**: Session 64 · 文档对齐与四项接线恢复（续传/暂停/报告/待导出区）
**Branch**: `main`

### Summary

计划与规范对齐代码事实；重写十个已删 UI 模块的规范锚点；把断点续传、暂停中止、转换报告、待导出区四项能力接回当前 UI

### Main Changes

- 计划：D-1~D-3、P0-1~P0-6、P1-1~P1-4、P2-1/P2-2 按代码符号核对收口，坑位表清零「待取证」
- 规范：十处已删模块（stash-list/category-filter/log-console 等）的引用改为现役锚点或历史记录；纠正「三态」为两态、目录树补 src/app/
- 新增 src/app/conversion-runner.js：TaskManager + persistPartial + onProgress 断点；OPFS 半成品 + localStorage 标记跨重载续传
- index.js 的 generate / generateMerged 统一经 runner，携带 signal / resumeCrcMap / appendFrom / finalizeOnAbort
- 动作行动态渲染暂停/继续/中止；转换报告 showReport 模态；keepExport=false 时产物进本次待导出队列且不再自动下载

### Git Commits

| Hash | Message |
|------|---------|
| `1533ac3` | feat(convert): 恢复断点续传、暂停中止、转换报告与待导出区接线 |

### Testing

- [OK] npm test 961 passed / 2 skipped；七项守卫全绿；npm run build 通过
- [OK] test/conversion-runner.test.js 5 例：成功传参 / 暂停不 fail / 中止清理 / 续传重建台账 / 空转安全

### Status

[OK] **Completed**

### Next Steps

- 真实浏览器实测暂停→继续→产物完整（3040 被其他会话占用，需换端口起本会话 dev server）
- restore-batch.js（写回批次）与 renderExportQueue 整块旧面板仍未接线
- AGENTS.md:369 / CLAUDE.md:437 的 L1-MR-3 仍在真源同步块内，需回 tavern-harness 修正后重新同步


## Session 65: UI 全面异常热修:index.js ReferenceError 杀死初始化链
<!-- trellis-session: v=2 fp=a3e5873aacf2e0fe -->

**Date**: 2026-11-08
**Task**: UI 全面异常热修:index.js ReferenceError 杀死初始化链
**Branch**: `main`

### Summary

用户报告整页异常、该有按钮全无。定位为 Session 64 四项接线引入的 index.js:992 actions 简写属性 pendingDownload/pendingStash 指向不存在标识符（实际名 downloadPending/stashPending），构造时 ReferenceError 使 main() 中断，其后全部接线静默死亡；单测 961 全绿拦不住（index.js DOM 接线层无覆盖）。修复 2 行显式键值并真机复验（计数归零、按钮齐全、页签/设置/日志冒烟过、零未捕获异常）；npm test 961 passed/2 skipped、三守卫与 build 全过，已推送。复用发现见 .trellis/research/ui-init-chain-debugging.md（初始化链中断判据、cache-bust 重跑捕获法、简写属性高发位、fullPage 伪影等排查干扰项）。
Topics: [.trellis/research/ui-init-chain-debugging.md](../../research/ui-init-chain-debugging.md)

### Git Commits

| Hash | Message |
|------|---------|
| `532e5e2` | fix(ui): 待导出区动作引用错名函数杀死整条初始化链 |

### Testing

- [OK] npm test 961 passed/2 skipped; check:css-scope/check:dom-injection/check:template-source 过; npm run build 过

### Status

[OK] **Completed**

### Next Steps

- 宿主态（Luker/ST 抽屉）同样走 main() 初始化链，本修复对其同样生效；如需继续收口，按 HANDOFF-2026-11-06 决定 restore-batch 与旧导出面板接回与否


## Session 66: 插件态热修:拉取误取消与注入消失(宿主生命周期+忙态探针)
<!-- trellis-session: v=2 fp=0763c716095262d8 -->

**Date**: 2026-11-08
**Task**: 插件态热修:拉取误取消与注入消失(宿主生命周期+忙态探针)
**Branch**: `main`

### Summary

Real Luker 实测双症状：原生导出后「从宿主拉取」必被取消、数据与备份弹层不再注入按钮。取证（Real/Dev 宿主源码比对）确认同根：① isNativeExportBusy 按 className 正则判忙，把「弹层开着/空闲态」的 disabled 类误判成导出在途；② closeNativeBackupUi 裸 close+强制隐藏绕过宿主 Popup 生命周期（close 事件不走 complete），promise 永久挂起→打开器 disabled 永不摘+弹层 DOM 残留→残留 id 挡住再注入；③ 日志查看器弹层共用 .userBackupManager/.backupActionRow，「取首个行」注错容器。修复 4 处（host-bridge.js）：忙态探针/点击监视分表（探针只认 .backupDownloadButton.disabled+可见过滤+去 className 正则）、关闭改走宿主 [data-result] 完成链路、注入行限定下载行+残留按钮搬家。新增本地单测 13 例，npm test 974 passed/2 skipped、三守卫+build 全过，已推送。Real 真机复验待实例在线（详见 .trellis/research/luker-native-ui-busy-injection.md）。
Topics: [.trellis/research/luker-native-ui-busy-injection.md](../../research/luker-native-ui-busy-injection.md)

### Git Commits

| Hash | Message |
|------|---------|
| `6acd259` | fix(host): 从宿主拉取被误取消与注入按钮消失（双症状同根） |

### Testing

- [OK] npm test 974 passed/2 skipped; 三守卫+build 过; test/native-busy-close.test.js 13 例

### Status

[OK] **Completed**

### Next Steps

- 用户在 Real Luker 实测：拉取不再被取消、数据与备份每次打开有注入按钮、原生导出进行中拉取仍让路；Dev 新 UI 依赖点击监视让路属预期


## Session 67: Luker 2.9 适配与工作台增强（第一批）
<!-- trellis-session: v=2 fp=0d38453f92940990 -->

**Date**: 2026-11-09
**Task**: Luker 2.9 适配与工作台增强（第一批）
**Branch**: `main`

### Summary

按用户需求适配 Luker 2.9 账户改版并完成工作台增强：注入锚点改 .dw-foot、配额两行跳转宿主存储页、教程首帧覆盖、日志改造（按钮计数/毫秒时间戳/条数设置/防刷屏）、设置分组、扩展清单导出、图表最大化下钻。982 测试 + 六守卫 + 构建通过；浏览器实测因预览分类器故障未做。第二批（迁移与备份合并、S3 通用化、WebDAV）未动工。
Topics: [.trellis/research/luker-2.9-adaptation-and-handoff.md](../../research/luker-2.9-adaptation-and-handoff.md)

### Main Changes

- host-bridge：新增账户窗口/存储页能力表与 openHostAccountWindow/openHostStoragePage；.dw-foot 注入用原生 dw-btn；勾选读取兼容 .dw-chip；忙态只认 .busy
- workbench-view：renderQuota 改两行可点按钮；openTutorial 首帧禁用过渡；renderLog 按钮带计数与毫秒时间戳；图表卡最大化与逐层下钻
- settings-panel：四个可收起分组 + 日志条数/加载清空 + 诊断导出扩展清单；index.js 接线与自动教程下一帧

### Git Commits

(No commits - planning session)

### Testing

- [OK] npm test 982 passed / 2 skipped；六条 UI 守卫全绿；npm run build 通过

### Status

[OK] **Completed**

### Next Steps

- 浏览器实机复测第一批（preview_start 曾因分类器故障不可用）：教程即时性、配额点击、日志计数与时间戳、图表最大化下钻
- 第二批 R4-R6：迁移与备份入口合并、S3 分包增量、WebDAV 全降级传输（判据见 docs/PLAN-2026-11-09.md）


## Session 68: 资产列表导入 + 迁移备份统一面板 + S3/WebDAV（第二批）
<!-- trellis-session: v=2 fp=288cf887cf86e4df -->

**Date**: 2026-11-09
**Task**: 资产列表导入 + 迁移备份统一面板 + S3/WebDAV（第二批）
**Branch**: `main`

### Summary

完成第二批：资产列表改为可导入下载扩展和资源菜单的官方扁平 JSON（每张图表卡 + 从宿主拉取入口），拉取顺序改为流量警告→原生指引→开面板并持久化开关，局域网/公网合并为迁移与备份面板并接入 S3/WebDAV 分片/断点/降级。小规模目标测试 47 例、五守卫、构建与单页 UI 取证全绿；按用户禁令未跑全量/大内存测试。宿主注入与真实 WebDAV 因实例离线/缺服务器未实测。
Topics: [.trellis/research/asset-list-and-transfer-handoff.md](../../research/asset-list-and-transfer-handoff.md)

### Main Changes

- 资产列表：官方五键扁平 JSON，过滤非 http(s) 与宿主内置 system；宿主 discover + manifest.homePage；无 URL/不支持如实提示
- 入口：每张图表卡 + 从宿主拉取空态/动作行；设置诊断导出删除；教程放按钮 title 与导出 toast
- 拉取顺序：流量警告→原生指引→开面板；原生按钮拉取前也警告；nativePullNotice 默认每次并持久化
- 迁移与备份：lan/cloud 合并 #transfer-view，S3/WebDAV 二级 tab；动作行只留 #transfer-open-btn
- 传输：transfer-plan/transfer-runner/transfer-target；S3 HEAD/Range/multipart；WebDAV 全降级
- 验收：build+preview(4173)+单页 DOM 取证；launch.json 与 docs 改为唯一路径

### Git Commits

| Hash | Message |
|------|---------|
| `9e9f93e` | feat(transfer): 资产列表可导入下载菜单 + 迁移备份统一面板 + 分片/WebDAV |
| `f474b4d` | docs(asset-list): 导出提示加入下载扩展和资源菜单使用教程 |
| `5a5bb03` | fix(asset-list): 动作行补宿主扩展导出入口 |

### Testing

- [OK] 47 个小规模目标用例通过：asset-list/pull-entry/settings-panel/transfer-plan/webdav-client/transfer-runner/host-extensions
- [OK] 五守卫全绿；npm run build 通过；UI 取证 0 pageerror，包内资产列表 JSON 合法
- [OK] 未跑全量/大内存测试（用户 2026-11-09 明令）

### Status

[OK] **Completed**

### Next Steps

- Dev 实例 8001/8003 在线后补宿主注入实测：Luker 2.9 账户窗口、配额跳转、原生按钮拉取、提示顺序
- 真实 WebDAV 服务器验证 405/401/409/CORS 与 Range 下载
- 用户允许后再跑全量 npm test；当前只跑目标小文件
- R7 保持一键备份；cron/服务端直传按禁令不做，已登记 FUTURE-BACKEND-CAPABILITIES.md


## Session 69: 云端备份：加密可选 / 全量快照 / 增量备份集 / 选包统一
<!-- trellis-session: v=2 fp=4db089f95b2a1c23 -->

**Date**: 2026-11-09
**Task**: 云端备份：加密可选 / 全量快照 / 增量备份集 / 选包统一
**Branch**: `main`

### Summary

云端备份完成两条路（全量时间戳快照 + 内容寻址增量备份集），加密改为可选；所有选包统一走侧栏列表；目标测试与五项守卫全绿，脱离酒馆运行时的静态截图验收通过。
Topics: [.trellis/spec/frontend/transfer-s3-webdav.md](../../spec/frontend/transfer-s3-webdav.md)

### Main Changes

- 新增 src/core/backup-set.js 与 src/app/backup-set-runner.js：sets/<set>/objects/<sha256> + snapshots/<ts>.json + index.json；对象按明文 sha256 去重，每版快照清单完整，任一张可独立恢复
- 一键备份拆为 full（时间戳快照，保留最近 N 份）与 set（增量备份集）两种模式；full 仅在全部包成功时执行保留策略
- 加密改为可选：口令留空不加密；transfer-runner 逐片加密（每片独立 IV，salt 写清单），续传沿用原 salt；新增 provisional 清单防止中断后 salt 丢失
- 备份集恢复 restoreBackupSet：读 index+snapshot → 取对象 → zip.js 重建 ZIP → actions.importCloudPack 落入工作区，复用既有迁移/写回流程
- 删除云端面板内独立文件选择器（#cloud-file/#cloud-pick）；#cloud-upload 与 #cloud-backup-selected 统一读 state.selectedPkgs
- 选包变化即时刷新云端按钮；renderAll 同步 renderCloud；上传/备份完成后自动 cloudRefresh
- i18n 新增备份方式/备份集名称/保留数/加密说明/恢复/上传完成等键；模板与五个 UI 守卫声明同步
- 规范回流: .trellis/spec/frontend/transfer-s3-webdav.md（加密字段、备份集协议、选包唯一来源）；docs/DEVELOPER-GUIDE.md M 节

### Git Commits

| Hash | Message |
|------|---------|
| `35a52f9` | feat(transfer): 云端备份支持全量快照与增量备份集，加密可选 |

### Testing

- [OK] 目标小测试 31 passed：transfer-plan / s3-crypto / transfer-runner（含加密中断续传）/ backup-set（含去重、独立恢复、保留、对象缺失）
- [OK] 五守卫 + i18n 守卫全绿；npm run build 通过
- [OK] 脱离酒馆运行时截图验收：scripts/ui-verify-cloud.cjs ok:true / errors:[]；既有 ui-verify-static.cjs ok:true
- [OK] 截图: test-results/cloud-ui-full-mode.png / cloud-ui-set-mode.png / cloud-ui-webdav.png（本地专属，不入库）

### Status

[OK] **Completed**

### Next Steps

- 真实 S3/WebDAV 服务器验证：上传/续传/下载/405/401/409/CORS 与备份集恢复
- 四宿主导入兼容性：用恢复出的 ZIP 在 Dev/Real 实例实际导入一次
- 未跑全量 npm test（用户禁令）；需要时再征得同意
- 无 cron、无服务端直传（用户禁令），已登记 docs/FUTURE-BACKEND-CAPABILITIES.md
- 备份集对象 GC 未做；当前只增不改，删除快照不回收共享对象


## Session 70: Session 70 交接：图表动态宫格 / 数据包偏好 / Luker 式配色
<!-- trellis-session: v=2 fp=5b2377b257a41d26 -->

**Date**: 2026-11-10
**Task**: Session 70 交接：图表动态宫格 / 数据包偏好 / Luker 式配色
**Branch**: `main`

### Summary

图表区按 1–5 卡动态宫格重做，新增数据包偏好与 Luker 式多色单条，设置重组，并修复全屏/多选/勾选/通知/配额等缺陷

### Main Changes

- 图表 1–5 卡宫格 + 行列拖拽条；移除自由拉伸与逐文件上传
- 数据包偏好（默认仅备份快照不勾）+ 设置提示/导出/日志重组
- Luker 式鲜艳单条多色、树行色标、紧凑卡头、全屏占满插件 DOM
- 扩展清单入口与 file:// 教程、原生顶部通知、Luker 配额修复
- 修复多选不重绘、目录分组勾选、最大化键清空、openModal 字符串报错

### Git Commits

| Hash | Message |
|------|---------|
| `46899f9` | feat(chart): 图表动态宫格 / 数据包偏好 / Luker 式配色 |

### Testing

- [OK] 六守卫全绿：template-source / control-consumer / css-scope / dom-injection / dom-scope / i18n
- [OK] 目标测试 10 文件 89 项通过
- [OK] 浏览器：1–5 卡布局 ok、偏好默认勾 10、全屏 1280×900、扩展清单可下载、0 pageerror

### Status

[OK] **Completed**

### Next Steps

- 回传宿主 413 待单独测试
- 分卷上下传待实测


## Session 71: Session 71：动作落点重构 / 图表下钻 / 云上传分片
<!-- trellis-session: v=2 fp=72304ae92302f44f -->

**Date**: 2026-11-10
**Task**: Session 71：动作落点重构 / 图表下钻 / 云上传分片
**Branch**: `main`

### Summary

重构工作台动作落点与图表交互，修复云酒馆大包上传失败
Topics: [.trellis/spec/frontend/large-pack-upload.md](../../spec/frontend/large-pack-upload.md), [.trellis/spec/frontend/workbench-single-view.md](../../spec/frontend/workbench-single-view.md)

### Main Changes

- 顶部全局动作条 + 勾选后底部动作；删除合并上传与卡后三按钮
- 图表最大化逐层下钻；占比按勾选动态计算；修复聊天记录误取消
- PT 产物保留声明布局；导出区多选上传逐包顺序恢复
- 设置新增加载时清空暂存包；仅清单包展示与补 URL
- Luker/ST 恢复改 8 MiB 分片，端点缺失回退整包

### Git Commits

| Hash | Message |
|------|---------|
| `1c9e943` | feat(ui): 重构动作落点与图表交互，支持云酒馆分片恢复 |

### Testing

- [OK] 目标测试 93 passed（chunked-restore/restore-chain/settings-panel/zone-model/export-queue/workbench-session/restore-manifest/restore-probe）
- [OK] 六守卫全绿：css-scope/dom-injection/template-source/dom-scope/control-consumer/i18n
- [OK] 浏览器 4173 实测：动作落点/PT/下钻/动态占比/清空设置/清单安装器，页面错误 0

### Status

[OK] **Completed**

### Next Steps

- 在 Cloud-Luker 实测 >100 MB 分片恢复（需用户授权对外写操作）
- README 四酒馆规则变更时同步 zh-CN/en-US 的 help.chart.rule*


## Session 72: 图表放大/引擎转储/扩展管理 P1
<!-- trellis-session: v=2 fp=df46eacb4d4a5514 -->

**Date**: 2026-11-11
**Task**: 图表放大/引擎转储/扩展管理 P1
**Branch**: `main`

### Summary

图表放大改为铺满插件容器；新增 engine-sanitize 净化 Luker 引擎转储（PG↔文件系统、PG→PG 不兼容）；批量恢复逐包容错+报告+保留/丢弃；内联扩展管理 P1（批量安装/分支版本/日志/失败链接/报告）；从宿主拉取只注入备份区。目标测试169项、六守卫与构建全绿；浏览器预览取证未完成。
Topics: [.trellis/research/11-11-chart-maximize-and-extension-manager.md](../../research/11-11-chart-maximize-and-extension-manager.md)

### Git Commits

| Hash | Message |
|------|---------|
| `b9719a8` | feat: 图表放大铺满插件容器 + 内联扩展管理与恢复容错 |

### Testing

- [OK] 14文件119项 + 注入4文件50项通过；六守卫全绿；npm run build exit 0

### Status

[OK] **Completed**

### Next Steps

- 浏览器预览取证；P2/P3 移植 st-git-improve 能力


## Session 73: 扩展选择打包 + 每包 Git + P2（URL 归一/账号/更新检查）
<!-- trellis-session: v=2 fp=903aa18f059a0b3e -->

**Date**: 2026-11-11
**Task**: 扩展选择打包 + 每包 Git + P2（URL 归一/账号/更新检查）
**Branch**: `main`

### Summary

扩展管理新增打包页（多包分组、只过滤扩展、每包 Git）；响应式统一 data-view 并交换动作条/切页条；实现 URL 归一、站点分支与摘要、多账号凭据（服务端/仅浏览器）、私有仓提示、只读更新检查；README 与开发者文档重排。

### Main Changes

- 扩展管理「打包」页 + core/ext-pack
- 每包 gitMode；图表卡与打包页同源
- core/git-url · git-accounts · git-site + ui/git-remote
- 账号存储服务端/仅浏览器，全链路脱敏
- 响应式单一判据 data-view（修 641–860px）

### Git Commits

| Hash | Message |
|------|---------|
| `b8550a6` | feat(ext): 扩展选择打包 + 每包 Git + P2（URL 归一 / 账号 / 更新检查） |

### Testing

- [OK] core 29 例 + 六守卫 + build + 三个 UI 取证脚本全绿

### Status

[OK] **Completed**

### Next Steps

- Dev 实例实测私有仓安装与更新检查（需真实账号与 Dev 端口）
- TT/PT 宿主上的扩展安装通道实测


## Session 74: UI 修复计划与交接（下一轮执行）
<!-- trellis-session: v=2 fp=1bc4805208b2fb95 -->

**Date**: 2026-11-11
**Task**: UI 修复计划与交接（下一轮执行）
**Branch**: `main`

### Summary

按用户实测反馈整理六条 UI 问题的根因、改点与判据，写下一轮执行计划与交接文档；本轮不实现。

### Main Changes

- 新增 docs/PLAN-2026-11-11-ui-fixes-next.md（六条逐项判据）
- 新增 HANDOFF-2026-11-11.md（状态/关键文件/验证命令/未验证边界）

### Git Commits

| Hash | Message |
|------|---------|
| `aa48f7a` | docs(ui): 下一轮六条 UI 修复计划与 2026-11-11 交接 |

### Testing

- [OK] 本轮为文档轮；上轮 core 29 例 + 六守卫 + 三个 UI 取证全绿

### Status

[OK] **Completed**

### Next Steps

- 按计划依次修 U1–U6，并在 4173 多宽度取证


## Session 75: Session 75 交接：统一存储审查面板
<!-- trellis-session: v=2 fp=cbe1c70dc6b5cb29 -->

**Date**: 2026-11-11
**Task**: Session 75 交接：统一存储审查面板
**Branch**: `main`

### Summary

用户裁定存储明细改为占满插件容器的统一面板（照抄 Luker），内联方案作废；已写实施契约，代码待实现。

### Main Changes

- 交付 docs/HANDOFF-2026-11-11-storage-inspector.md（统一 provider 契约 / 文件级改点 / 10 条验收判据 / 待裁定项）
- DEV GUIDE、PLAN、README 标注浏览器配额内联实现为过渡方案并指向交接

### Git Commits

| Hash | Message |
|------|---------|
| `5fe7dc1` | docs(handoff): 统一存储审查面板契约（占满插件 DOM） |

### Testing

- [OK] 文档引用逐条核对：readHostStorageQuota / openHostStoragePage / Luker /storage/inspect 端点与模板路径

### Status

[OK] **Completed**

### Next Steps

- 按 HANDOFF 实现：storageInspector 模板 + 视图 + 浏览器 provider + 宿主 provider + 六守卫 + 4173 多宽度取证


## Session 76: 统一存储审查面板落地（浏览器/宿主同面板）
<!-- trellis-session: v=2 fp=daab017d276a1729 -->

**Date**: 2026-11-11
**Task**: 统一存储审查面板落地（浏览器/宿主同面板）
**Branch**: `main`

### Summary

存储明细改为统一面板并完成文档同步

### Main Changes

- 两行配额共用 #storage-inspector-view：初始来源=点击行，面板内可切换；占满内容区且只读
- 浏览器 L0 五类与下钻（storage-inspector-browser.js + 纯模型）；宿主源经 RestProvider，非 Luker 如实未提供
- 删除内联明细与宿主存储页跳转；README / DEV GUIDE / 应用内帮助 / 规范页全量同步

### Git Commits

| Hash | Message |
|------|---------|
| `d8fb38f` | feat(ui): 统一存储审查面板（浏览器/宿主同面板，来源跟随点击行） |
| `22b9cc4` | docs: 存储审查面板全量文档同步（README / DEV GUIDE / 帮助 / 交接） |
| `e4ee291` | docs(help): 帮助页新增「存储审查」章节 + Session 76 台账 |

### Testing

- [OK] 六守卫全绿；28 项新单测（模型 14 / 浏览器 10 / 宿主适配 4），三文件 33 项通过
- [OK] 4173 + Playwright 取证 26/26、页面零错误（1280 / 380）；npm run build exit 0

### Status

[OK] **Completed**

### Next Steps

- Dev Luker（8003）启动后补宿主源实机下钻取证
- 删除能力维持只读；如要开放须先过用户裁定


## Session 77: 视图切换入面板头 / 扩展管理改版·OAuth / 动作入口归位
<!-- trellis-session: v=2 fp=f5e210da89acb383 -->

**Date**: 2026-11-11
**Task**: 视图切换入面板头 / 扩展管理改版·OAuth / 动作入口归位
**Branch**: `main`

### Summary

三个已提交的 UI 阶段补记台账：视图切换进面板头并删独立切换行；扩展管理改版（宿主/安装/打包 + 报告条 + OAuth PKCE + 设置→数据导入导出）；取消全局三按钮行并按场景归位动作入口。复核时六守卫全绿、build exit 0、全量 npm test 1119 passed/2 skipped，并修正 3 处陈旧断言。
Topics: [.trellis/spec/frontend/workbench-single-view.md](../../spec/frontend/workbench-single-view.md), [.trellis/spec/frontend/extension-git-manager.md](../../spec/frontend/extension-git-manager.md), [.trellis/spec/frontend/i18n-and-settings.md](../../spec/frontend/i18n-and-settings.md)

### Main Changes

- 视图切换移入三个面板头的 [data-view-switch] 宿主，桌面删 #view-switch；手机面板头两行
- 扩展管理改版：无 ✕（? 打开教程）、宿主/安装/打包页签、报告条常驻展开占满、安装日志并入全局日志
- src/core/git-oauth.js：授权码 + PKCE、回调必须完全同源、GitHub token 端点无 CORS 如实标注
- src/ui/plugin-data.js：整插件配置导入导出放设置→数据，凭据与 OAuth 令牌默认不跟随
- 取消 #top-actions 三按钮行：迁移备份入面板头第 4 项，从宿主拉取入数据包模式行，刷新改按需出现

### Git Commits

| Hash | Message |
|------|---------|
| `a9ab2c9` | feat(ui): 视图切换移入面板头，桌面去掉独立切换行 |
| `62054d7` | feat(extmgr): 扩展管理改版 · OAuth 登录 · 插件数据导入导出 |
| `dbbd8cd` | feat(ui): 取消全局三按钮行，动作入口按场景归位 |

### Testing

- [OK] npm test 全量 1119 passed / 2 skipped（116 文件，115 passed / 1 skipped）
- [OK] 六条静态守卫全绿；npm run build exit 0
- [OK] 修正陈旧断言：settings 勾选 8→10、listHostExtensions type→sourceType（objectContaining）

### Status

[OK] **Completed**

### Next Steps

- Dev Luker 8003 起来后补宿主源下钻与扩展管理宿主页签实机取证
- OAuth 端到端需用户先登记回调地址（协议/主机/端口完全一致）


## Session 78: 迁移面板头同构（无 ×）+ 扩展管理凭据页 / 安装区折叠
<!-- trellis-session: v=2 fp=f7996b84aee8bf23 -->

**Date**: 2026-11-11
**Task**: 迁移面板头同构（无 ×）+ 扩展管理凭据页 / 安装区折叠
**Branch**: `main`

### Summary

迁移与备份面板头改为与图表/扩展管理完全同构：panel-head--switch + 共享 [data-view-switch]（存储图表/扩展管理/迁移与备份）+ panel-actions 内两个页签，删除自写标题块与关闭按钮（全站迁移面板内 × 数量 0）。扩展管理安装页签改名凭据，安装入口全部下移到宿主页底部 details 折叠区（默认收起、可完全收起），新增 refreshInstallArea 避免进度刷新重拉宿主列表。
Topics: [.trellis/spec/frontend/workbench-single-view.md](../../spec/frontend/workbench-single-view.md), [.trellis/spec/frontend/extension-git-manager.md](../../spec/frontend/extension-git-manager.md)

### Main Changes

- 迁移面板头与另两个面板同构，禁止标题块与任何 ×；离开靠切换行
- 扩展管理页签 宿主/凭据/打包；凭据页只留账号与 OAuth
- 安装区移入宿主页底部 #extmgr-install-block（details，默认收起）
- refreshInstallArea() 只重绘安装区，避免高频重绘重拉宿主扩展

### Git Commits

| Hash | Message |
|------|---------|
| `77f0699` | feat(ui): 迁移面板头同构（无 ×）+ 扩展管理改「凭据」、安装区下移可收起 |

### Testing

- [OK] 六守卫全绿（控件 88 / 节点 106）
- [OK] npm run build exit 0
- [OK] 全量 npm test 1119 passed / 2 skipped
- [OK] 无头截图取证：桌面/手机、迁移面板 ×=0、宿主页折叠/展开、凭据页无安装控件

### Status

[OK] **Completed**

### Next Steps

- Dev Luker 8003 起来后补宿主源与扩展管理实机取证


## Session 79: 恢复模式归位 / 待导出并入导出区 / 迁移教程 / 开发模式自动更新 / 设置三态与凭据双写
<!-- trellis-session: v=2 fp=914738224aac419e -->

**Date**: 2026-11-11
**Task**: 恢复模式归位 / 待导出并入导出区 / 迁移教程 / 开发模式自动更新 / 设置三态与凭据双写
**Branch**: `main`

### Summary

第五、六轮 UI 裁定落地：数据包模式改名恢复模式并移到页签右侧；删除本次待导出两列区块，产物并入导出区条目；迁移面板加 ? 教程；教程走完不退出演示模式且图标改书本；演示数据改为四宿主 7 导入/3 导出（16MB-4GB）；扩展管理新增逐扩展开发模式（静默/提示自动更新，原生 toast 可取消 + 刷新提示）；设置改为 × 保留草稿 / 取消丢弃 / 保存双写，Git 凭据始终双写，导出默认含登录凭据、OAuth 为子项默认不勾。
Topics: [.trellis/spec/frontend/workbench-single-view.md](../../spec/frontend/workbench-single-view.md), [.trellis/spec/frontend/extension-git-manager.md](../../spec/frontend/extension-git-manager.md), [.trellis/spec/frontend/i18n-and-settings.md](../../spec/frontend/i18n-and-settings.md)

### Main Changes

- 恢复模式归位到 #zone-tabs 右侧；#pending-exports 两列区块删除，队列条目渲染进导出区
- 迁移面板 ? 教程（局域网互传 / 云端仓库 / 恢复模式）；教程走完只回目标菜单，图标改书本
- 演示数据：4 宿主、导入 7 / 导出 3，16 MB–4 GB；默认选中改为取第一个导入包
- 开发模式：逐扩展 silent/prompt 自动更新，toastr 原生浮层可点击取消，完成后提示刷新
- 设置三态：× 保留内存草稿（刷新即丢）/ 取消丢弃 / 保存双写 localStorage+settings.json
- 凭据双写 + 导出默认含登录凭据（OAuth 子项默认不勾）

### Git Commits

| Hash | Message |
|------|---------|
| `2ee9617` | feat(ui): 恢复模式归位 + 待导出并入导出区 + 迁移教程 + 开发模式自动更新 |
| `1ed73d9` | feat(settings): 三态关闭/取消/保存 + 凭据双写 + 导出默认含凭据 |
| `3710a00` | docs: 同步设置三态 / 凭据双写 / 导出默认值 |

### Testing

- [OK] 六守卫全绿；npm run build exit 0
- [OK] 全量 npm test 1119 passed / 2 skipped（修正 settings 两组陈旧断言，新增 gitDevMode）
- [OK] 无头取证：迁移 ? 与三段帮助、导入 7 包/导出 4 条、× 保留草稿/取消丢弃/保存写入 localStorage

### Status

[OK] **Completed**

### Next Steps

- Dev Luker 8003 起来后补开发模式自动更新与迁移教程实机取证


## Session 80: P1 铺满与教程浮层 + 开发者页 / 恢复模式 / 待导出合并 / 设置三态（含 P2/P3 交接）
<!-- trellis-session: v=2 fp=84ed983cf9c2dcd3 -->

**Date**: 2026-11-11
**Task**: P1 铺满与教程浮层 + 开发者页 / 恢复模式 / 待导出合并 / 设置三态（含 P2/P3 交接）
**Branch**: `main`

### Summary

第七轮裁定落地 P1：桌面整窗口铺满、切换行顺序改为 存储图表/迁移与备份/扩展管理、教程跳过只关浮层（横幅可重开）、全局选择锁、凭据页改名开发者、Git 账号与宿主列表可折叠、安装区底部按钮向上展开、占位扩展改读 src/data/demo-extensions.json（GitHub st 前缀仓库）。同时收口前几轮：恢复模式归位、待导出两列删除并入导出区、迁移 ? 教程、教程不自动退出、演示数据 4 宿主 7+3 包、开发模式自动更新、设置三态与凭据双写、导出默认含凭据。P2（父子勾选/间隔可配/管理员服务端分区/误装拒绝/帮助补全）与 P3（Git 可视化只读，本地+登记云端）尚未开工。
Topics: [.trellis/spec/frontend/workbench-single-view.md](../../spec/frontend/workbench-single-view.md), [.trellis/spec/frontend/extension-git-manager.md](../../spec/frontend/extension-git-manager.md), [.trellis/spec/frontend/i18n-and-settings.md](../../spec/frontend/i18n-and-settings.md)

### Main Changes

- P1：桌面 100vw×100vh 铺满、选择锁、切换行顺序交换、教程跳过不退出且可重开、开发者页签、宿主列表折叠、安装区底部向上展开
- 占位数据改读 src/data/demo-extensions.json（GitHub st 前缀 9 仓库，含 1 个 server 占位）
- 恢复模式归位到 #zone-tabs 右侧；#pending-exports 两列区块删除，队列条目渲染进导出区
- 教程：迁移 ? 教程、走完不退出、图标改书本；演示数据 4 宿主 7 导入 + 3 导出
- 开发者自动更新（silent/prompt，toastr 可取消 + 刷新提示）；设置三态与凭据双写、导出默认含凭据

### Git Commits

| Hash | Message |
|------|---------|
| `2ee9617` | feat(ui): 恢复模式归位 + 待导出并入导出区 + 迁移教程 + 开发模式自动更新 |
| `1ed73d9` | feat(settings): 三态关闭/取消/保存 + 凭据双写 + 导出默认含凭据 |
| `3710a00` | docs: 同步设置三态 / 凭据双写 / 导出默认值 |
| `826a558` | docs(trellis): 补记 Session 79 台账 |
| `9b91f3f` | feat(ui): P1 铺满/顺序/教程重开/选择锁/开发者页/折叠与向上展开 + 占位数据读文件 |
| `8ce80c4` | docs: 同步 P1（铺满/顺序/教程重开/选择锁/开发者页/折叠） |

### Testing

- [OK] 六守卫全绿（控件 90 / 节点 106）；npm run build exit 0
- [OK] 全量 npm test 1119 passed / 2 skipped
- [OK] 无头取证：铺满 1280×900 零边距、顺序三项、页签 宿主/开发者/打包、9 个占位扩展、跳过→横幅→重开

### Status

[OK] **Completed**

### Next Steps

- P2：父项自动更新套子项（间隔/模式）、逐扩展勾选与全选反选、间隔与模式入设置默认 6h+仅提醒
- P2：管理员服务端插件分区 + 前后端误装拒绝 + HELP.extmgr 补全 + 更新失败可删后重装
- P3：先出桌面/手机 Git 可视化切换草图，再做本地 .git + 登记云端只读视图（分支/提交/diff/状态）


## Session 81: P2 开发者层级 / 管理员分区 / 误装拒绝 / P3 Git 只读可视化 + 宿主页版式返工
<!-- trellis-session: v=2 fp=17c31a52cc02615b -->

**Date**: 2026-11-11
**Task**: P2 开发者层级 / 管理员分区 / 误装拒绝 / P3 Git 只读可视化 + 宿主页版式返工
**Branch**: `main`

### Summary

完成 P2 七项与 P3 六项：自动更新父项+逐扩展勾选+可配置间隔/模式、管理员服务端插件分区、前后端误装拒绝、删除重装、HELP 补全；Git 只读可视化（本地 .git + 云端分支/标签/提交/diff）；按用户第二轮裁定把安装扩展改为面板固定页脚、宿主页加横线工具条与可拖拽排序列表、数量只进列表头、折叠头加箭头与展开提示；修复 readSettings 清空 Git 数据的缺陷。六条静态守卫全绿、build exit 0、全量 vitest 通过。
Topics: [.trellis/spec/frontend/extension-git-manager.md](../../spec/frontend/extension-git-manager.md)

### Main Changes

- P2：devMode/gitAutoUpdate/gitUpdateIntervalHours/gitUpdateMode/gitUpdateSelected + runDevAutoUpdate 只读设置
- P2：readHostIdentity/listServerPlugins 管理员分区；plugin-kind 误装拒绝；delete+reinstall 二次确认
- P3：git-viz/plugin-kind 新核心 + git-site 只读端点 + readHostExtensionGit + 数据包列 Git 页签
- 版式：安装扩展固定页脚（间隙 0 贴报告条）、横线工具条、列表头计数、拖拽排序、折叠箭头与展开提示
- 文档：spec §9–§12 / workbench §18 / i18n §11 + DEVELOPER-GUIDE K4 + README

### Git Commits

(No commits - planning session)

### Status

[OK] **Completed**


## Session 82: 逐扩展自动更新（5 秒级）/ 批量更新卸载 / 清单统一入口 / Git 常显 / 教程居中
<!-- trellis-session: v=2 fp=00c711eb075abf0f -->

**Date**: 2026-11-11
**Task**: 逐扩展自动更新（5 秒级）/ 批量更新卸载 / 清单统一入口 / Git 常显 / 教程居中
**Branch**: `main`

### Summary

按用户第三轮裁定：自动更新从开发者页搬回宿主页每条扩展，支持 5 秒级轮询与仅提醒/直接更新；列表内加逐条与批量更新/卸载及指定版本分支；数据包恢复的扩展清单改为统一进宿主页安装区（移除独立浮层）；Git 页签常显；教程卡片居中于浮层；修复数据包面板 ? 被删与设置页默认字号偏小的问题。守卫全绿、build exit 0、全量 1142 passed。
Topics: [.trellis/spec/frontend/extension-git-manager.md](../../spec/frontend/extension-git-manager.md)

### Main Changes

- settings：删除全局自动更新键，新增 gitAutoUpdateRules（5–86400 秒，旧模型迁移）
- 宿主页：逐扩展模式/间隔、更新/卸载、批量全选反选取消、批量更新卸载、指定版本分支
- host-bridge：updateExtensionViaHost + setExtensionManifestSink；恢复清单统一进安装区
- Git 页签常显；教程卡片居中；? 恢复；字号体检
- 规范与指南：§9–§12 / §18.3 / §11、DEVELOPER-GUIDE K4、README

### Git Commits

(No commits - planning session)

### Status

[OK] **Completed**


## Session 83: 自动更新失败退避 + 全部运行阈值可调
<!-- trellis-session: v=2 fp=1a4d094a59c5552d -->

**Date**: 2026-11-11
**Task**: 自动更新失败退避 + 全部运行阈值可调
**Branch**: `main`

### Summary

按用户裁定给逐扩展自动更新加入指数退避（间隔×倍数^连续失败，截断上限，成功或手动改规则清零），并把最短/最长/默认轮询、退避倍数与上限、提醒超时全部提升为设置项（设置→自动更新），代码不再写死；调度器按最早到期时间唤醒。守卫全绿、build exit 0、全量 1145 passed。
Topics: [.trellis/spec/frontend/extension-git-manager.md](../../spec/frontend/extension-git-manager.md)

### Main Changes

- settings：新增 updatePolicyOf / updateBackoffDelay，六个策略键可手调
- workbench：autoUpdateFailures 退避计数，调度按最早到期唤醒，提醒超时可调
- 测试：策略夹紧、退避递增与上限、设置面板六项输入
- 规范与指南：§10 / §11、K4、README

### Git Commits

(No commits - planning session)

### Status

[OK] **Completed**


## Session 84: 宿主直装修复 + 原生扩展作用域互转/加载顺序（Session 84）
<!-- trellis-session: v=2 fp=3220a76951543a48 -->

**Date**: 2026-11-11
**Task**: 宿主直装修复 + 原生扩展作用域互转/加载顺序（Session 84）
**Branch**: `main`

### Summary

修复 JSON 静态导入导致的宿主整图加载失败；新增管理员作用域互转与安装到全局；加载顺序只读展示；删除无包空态导出按钮；新增宿主直装守卫
Topics: [.trellis/spec/frontend/extension-git-manager.md](../../spec/frontend/extension-git-manager.md), [.trellis/spec/frontend/asset-list-export.md](../../spec/frontend/asset-list-export.md)

### Main Changes

- 演示数据 JSON → ESM，根因是浏览器直装不能 import JSON
- moveExtensionViaHost / 安装 global / 管理员作用域互转
- loading_order 只读展示与排序
- 删除 #btn-assetlist-host 与死 i18n 键
- check:no-bundler-only 守卫（scripts 本地专属）

### Git Commits

| Hash | Message |
|------|---------|
| `5bd092d` | fix(host): 修复宿主直装整图失败 + 原生作用域互转与加载顺序 |

### Testing

- [OK] vitest 1152 passed / 2 skipped / 120 文件
- [OK] 六条既有守卫 + no-bundler-only 全绿
- [OK] npm run build 成功（5.01s）
- [OK] 纯静态+Playwright：index.js 200，无模块加载失败

### Status

[OK] **Completed**

### Next Steps

- 在 Dev 实例实机点一次作用域互转与安装到全局
