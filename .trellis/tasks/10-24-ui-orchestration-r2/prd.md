# UI 编排与数据流重规划（含测试推广与知识回流）

## Goal

从头定稿下一代工作台的 **UI 编排**（双栏工作台、列表分组、区块帮助、文案铁律定型）与
**宿主数据流**（Luker 极致省字节、ST 走 Authority 后端 PR、纯本地磁盘 IO 优化、TT 自动化），
并规划**多实例自动化测试定型推广**与**向 tavern-harness 的知识回流**。

> 本任务为**父规划任务**：持有需求全集、任务地图与跨子任务验收；具体实现落在子任务。
> 前置门：先按 D-01 收口 `10-15-workbench-dual-flow-redesign` 未完项。

## 背景与事实（2026-10-24 取证，file:line 可复验）

### UI 与列表现状

- 10-15 已落地：方向开关两屏、模块/流程/外壳三层（`src/ui/workbench-layout.js`）、
  桌面双栏+移动吸底、阶段门控。未完：QuotaBoard（S2.6）、规范落盘（S3.1）、归档（S3.3）。
- 两张列表：源包暂存区 `src/ui/stash-list.js`（origin ∈ upload/host-export）、
  待导出区 `src/ui/export-queue.js`（一切产物统一出口，ephemeral 临时条目）。
- 既有铁律（`.trellis/spec/frontend/workbench-single-view.md`）：单一视图、配色只用 `--SmartTheme*`
  （四宿主无语义色⇒危险动作二次确认）、文案纪律（title ≤ 8 字、无括号/分号/教学 tooltip）、
  控件纪律（枚举、单列、消费点守卫）。五条机器守卫全绿中。
- 教程：`onboarding-guide.js` 已实现（常驻按钮+首装自动+可重放+高亮真实控件）。

### 宿主数据流事实

- 拉取＝`fetchHostBackup()` → `POST /api/users/backup`（`host-bridge.js:728`）；
  ST 无 selection 必全量（浏览器内过滤），Luker 原生透传类目勾选；
  能力声明表 `BACKUP_SELECTION_SUPPORT = {st:false, luker:true, tt:false, pt:false}`。
- 无轻量清单 API：`fetchHostInventory()`（`host-bridge.js:939`）拿清单的代价＝全量拉一次包。
  ⇒「先元数据后按需拉」无免费路径，**不建清单缓存层**（D-03）。
- 暂存必要：转换必须读 ZIP 内容；OPFS 直写已解决 GB 级内存（断点续传 Range）。
- 四宿主通道：ST 拉取✅/整包恢复❌（无端点，只能逐类目喂）；Luker 最完整；
  TT Tauri 桌面无浏览器端口；PT 插件可装（IndexedDB 快照）但 `detectHost()` 未识别（10-14 缺口）。

### 检索结论（L0-3）

- 规则同步业界：中心仓+同步脚本+CI 校验 / symlink / workspace 嵌套——无更成熟轮子，
  harness 已不低于业界；缺「自动发现登记+每次遵守」这一环（正是 D-06 方向）。
- Tauri 自动化三路：官方 **tauri-driver**（Windows WebView2 WebDriver）；**tauri-plugin-playwright**
  （需给 TT 加插件）；**WebView2 CDP 注入**（`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` 开远程调试口，
  Playwright `connectOverCDP`，**无需改 TT**）——优先验证此路（D-11）。
- Authority 仓：`D:\Repo\Tavern-repo\Myfork\ST-Delegation-of-authority`。

## Requirements（需求全集 → 子任务）

### A 线 · UI 编排（子任务 `ui-orchestration-impl`）

| 编号 | 要求 |
| --- | --- |
| R-A1 | 左栏列表按维度分组：源包按来源（上传/宿主拉取）、产物按目标平台；可折叠组头+徽标计数（D-02/D-08） |
| R-A2 | 区块级「?」上下文帮助：标题栏问号→浮层只讲该区块；界面常驻说明文案保持为零（D-09） |
| R-A3 | 《UI 编排铁律》定型：现有纪律+禁做清单收敛为 spec 单页，补机器守卫断言（按钮动词表/枚举文案） |
| R-A4 | `detectHost()` 接入 TT/PT 判据（`window.__TAURITAVERN__` / `globalThis.__PURE_TAVERN__` / `/version` agent 两级判定），未知兜底 `unknown`（清 10-14 缺口） |
| R-A5 | 拉取前预览：发起前显示将包含的类目与能力读数（Luker「按勾选拉取」/ ST「全量拉取后过滤」） |
| R-A6 | 纯本地路径磁盘 IO 审计：OPFS 不可用回退（手机场景）路径读数与优化 |

### B 线 · 数据流（两个子任务）

| 编号 | 要求 |
| --- | --- |
| R-B1 | Luker 极致省字节：取证 `/api/users/backup` selection 契约粒度（类目级→文件级可否），能透传的排除全部透传（D-03①） |
| R-B2 | Authority 后端 PR（在 Authority 仓按其流程规范提交，非本仓私改）：为 ST 补选择性备份/整包恢复能力；本仓走适配器+特性检测，装了增强、未装维持全量拉取（L0-11）（D-03②） |

### C 线 · 测试（两个子任务）

| 编号 | 要求 |
| --- | --- |
| R-C1 | TT CDP 注入取证：WebView2 远程调试口+`connectOverCDP` 冒烟；结论三选一（并入矩阵/转 tauri-driver/登记不可行）（D-11） |
| R-C2 | `e2e:instances` 统一入口：收编 `scripts/` 四脚本（**先提交入库**）、restart+三 Dev 宿主冒烟矩阵（PT 必须 --headed）；跑稳后提炼上贡 harness（D-10） |

### D 线 · harness 回流（tavern-harness 仓任务，走该仓自身流程）

| 编号 | 要求 |
| --- | --- |
| R-D1 | 贡献回流机制：回流清单+审核流程（D-05/D-07） |
| R-D2 | UI 铁律提炼上贡：填 `tavern-helper-frontend` 空位或建 tavern UI skill（素材=本仓 spec/frontend） |
| R-D3 | 扫描登记+遵守校验：harness 侧登记 tavern 项目路径，`--verify` 纳入日常运行（D-06） |
| R-D4 | 工具化访问强化：MCP 查询面扩展（D-07） |

## Acceptance Criteria（跨子任务验收）

- [x] **AC-0**（前置门）`10-15` 收口：QuotaBoard 按现设计完成、规范落 `.trellis/spec/frontend/`、任务归档。—— QuotaBoard `d3d9c6e`；S1 固化与规范页 `f97a000`；归档 `5839079`（2026-10-24）
- [x] **AC-1** 左栏分组列表可见且组头徽标计数正确（源包按来源、产物按目标平台），E2E 断言。—— A 线落地，s1-remedies H1-H7（2026-10-24）
- [x] **AC-2** 每个区块有「?」入口，浮层仅含该区块说明；界面常驻说明文案为零（守卫保持全绿）。—— A 线落地，help-topics 5/5
- [x] **AC-3** 《UI 编排铁律》落 `.trellis/spec/frontend/`，新增守卫断言全绿。—— `ui-orchestration-rules.md` + 动词表/悬空断言（index 登记于 2026-10-24 收口补齐）
- [ ] **AC-4** PT 实例（8899）实测 `detectHost()` 返回 PT 平台码；unknown 兜底单测在。—— 单测已就位（detect-host 30/30）；8899 实测留待 C 线 e2e-instances-runner
- [x] **AC-5** Luker 同勾选拉取字节数较基线下降，附取证报告与实测数字。—— `10-25-luker-selection-max` 七轮取证定案（2026-10-25）：全量 1.79GB；反选 settings 省 50.2%（透传层已生效零改动）；`settings↔backups` 绑死 892.2MB 登记为 R-B2 解绑需求；报告 `10-25-luker-selection-max/research/luker-selection-probe.md` + `deliverables/bytes-report.md`；spec 契约表落 `host-capabilities.md`
- [ ] **AC-6** Authority PR 按该仓流程提交并登记链接；本仓特性检测单测覆盖装/未装两态。
- [x] **AC-7** TT CDP 取证有结论：可行→至少一条 TT 冒烟 spec；不可行→替证策略落 spec。—— `10-25-tt-cdp-probe` 定案可行（2026-10-25）：`WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS=9223` + `connectOverCDP` 全链通，插件安装启用且工作台挂载零异常（结论 `tt-cdp-verdict.md`）；并入 e2e:instances 矩阵 tag `tt-cdp`（spec host-capabilities.md 已落 TT 宿主三条事实）
- [ ] **AC-8** `npm run e2e:instances` 一键三 Dev 宿主冒烟全绿；`scripts/` 四脚本入库。
- [ ] **AC-9** harness 仓内回流任务建立并有交付（回流机制/skill/登记命令至少各一）。
- [ ] **AC-10** 全程 `npm test` 零回归、五守卫全绿；E2E 只连 Dev 白名单 {8001, 8003, 8899}。

## 决策记录（全部已裁定，2026-10-24 两轮 AskUserQuestion）

| 编号 | 决策 |
| --- | --- |
| D-01 | 先收口 `10-15`，再进新规划 |
| D-02 | 编排模式＝双栏工作台（延续 10-15 骨架；移动退化单列+吸底） |
| D-03 | 数据流三线并进：Luker 能省则省；ST→Authority 后端 PR；纯本地磁盘 IO 优化；**不建清单缓存层** |
| D-04 | TT 自动化要研究并流程化（不留真空） |
| D-05 | harness 贡献须规范化流程化（先查范式，不本地随意改） |
| D-06 | harness 强制遵守＝侧扫描登记项目路径 + 每次运行校验 |
| D-07 | 去中心化所指＝贡献回流 + 工具化访问（拆源/开源暂不做） |
| D-08 | 列表细分＝按维度分组（可折叠组头+徽标计数） |
| D-09 | 说明载体＝引导动画 + 区块「?」上下文帮助浮层 |
| D-10 | 测试推广＝本仓固化后上贡 harness |
| D-11 | TT 形态＝先验 CDP 注入路，不可行再评估 tauri-driver/新项目 |
| D-12 | **E2E 只连 Dev 实例，且目标一律用域名，禁止 `localhost` / `127.0.0.1`**（2026-10-24 批准执行时追加） |
| D-13 | **UI 视觉检查用 flash 子代理**：仅少量任务、复用同一子代理会话、间隔 ≤45min–1h（利用缓存）；**整体实现由主代理直接完成**（2026-10-24） |

## 任务地图与依赖

| 序 | 任务 | 仓 | 依赖 |
| --- | --- | --- | --- |
| 0 | 收口 `10-15`（QuotaBoard/S3.1/S3.3） | 本仓 | — |
| 1 | `ui-orchestration-impl`（A 线 R-A1~R-A6） | 本仓 | 0 |
| 2 | `luker-selection-max`（R-B1） | 本仓 | — |
| 3 | `authority-st-capability`（R-B2） | Authority 仓 | — |
| 4 | `tt-cdp-probe`（R-C1） | 本仓 | — |
| 5 | `e2e-instances-runner`（R-C2） | 本仓 | 4（定矩阵是否含 TT） |
| 6 | `harness-reflow`（R-D1~R-D4） | tavern-harness 仓 | 1（R-D2 素材）；其余独立 |

## 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| CDP 注入口被 TT 启动参数覆盖或 WebView2 安全策略禁用 | 依 D-11 降级链：tauri-driver → 登记不可行 |
| Authority PR 受跨仓维护节奏影响 | 本仓适配器先行（特性检测），能力上线自动增强，不阻塞 |
| Luker selection 实际只支持类目级 | 按取证粒度收敛交付，不伪造粒度 |
| 分组列表在包少时空荡 | 组头折叠默认态经浏览器实测裁定，进 A 线任务 |
| harness 侧改动须走其自身流程 | 本任务只建规划与素材，不跨仓直改 |

## 范围外

- 不改 `src/core/` 转换契约；不动宿主源码与实例目录；E2E 只连 Dev 白名单。
- harness 按域拆源、对外开源（D-07 未选）。
- 本仓不实现 Authority 后端功能本体（在其仓走 PR）。
