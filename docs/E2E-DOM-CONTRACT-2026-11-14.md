# E2E DOM 契约（2026-11-14 套件现代化）

> `e2e/`、`scripts/`、`test/` 是**本地专属目录**（.gitignore 覆盖，2026-11-02 取消跟踪），
> 本文是那轮大修的**入库知识载体**：新 DOM 契约与 helper 语义，供后续会话直接引用。
> 当轮全量读数：**63 败 → 39 败**（300 项 / 261 过），核心重写区全部全绿；残余清单见
> `docs/PLAN-2026-11-14-full-qa.md` 的 run5 段。

## 0. 面向 spec 作者的硬契约

1. **目标平台选择**：`#target-select` 是**自绘 picker**（div，不是 `<select>`）。
   一律 `common.selectTarget(page, 'st'|'l'|'tt'|'pt')`——点 `#target-btn` → 点
   `#target-pop .picker-item[data-target="SillyTavern|Luker|TauriTavern|PureTavern"]`
   （**data-target 是展示名**，helper 内做布局码映射）→ 回读 `#target-btn-text`。
2. **转换按钮**：`#btn-generate` 挂在动作条上、**勾选包后才渲染**（`renderActions`）。
   idle 态的常驻控件是 `#target-btn`；要转换必须先点 `#zone-card .pkg-card .pkg-check`。
3. **「从宿主拉取」**：`#btn-fetch` 仅在宿主插件态（`state.mode==='plugin'`）且导入分区可见；
   独立 Web 态隐藏（2026-14 产品修正）。旧 `#btn-host-fetch` 不存在。
4. **就绪判据**：`waitForReady` = `#host-badge-text` 有读数（旧 `#env-badge` 已删）；
   `waitForPlan` = `#chart-stack .vol-card` ≥1 且 `.tree-row` ≥1（旧 `#plan-summary-bar` 已删）。
5. **教程**：`openSite()` 已统一 `autoTutorial:false`（演示占位包会污染初态断言——
   全新上下文实测自带 7 张演示卡）。spec 自建 context 的（如 lan-transfer）必须同样 addInitScript。

## 1. DOM 映射速查（旧 → 现）

| 旧（2026-10-27 前已删） | 现 |
| --- | --- |
| `#env-badge` | `#host-badge-text`（`renderHeader()` 写入；独立态 =「Web」） |
| `#btn-convert` | `#btn-generate`（勾选包后才渲染） |
| `.category-card[data-category]` + `.cat-badge` | 树顶节点 `.tree-row[data-id="group:<key>"]`；条目数 = 展开后数 `.tree-children` 后代行（组行无徽标）；**空类目不渲染** |
| 类目三键 `#btn-select-all` 等 | `#batch-bar [data-batchall/none/invert]`——**只在 ≥2 个包被勾选时渲染**（`chartTargets()` 只数勾选集/当前源） |
| `.file-detail-row` / `.btn-expand-detail` / `.wb-detail-overlay`（类目明细） | 图表卡最大化 `[data-volmax]` + 逐层下钻 `[data-voldrill]` + 面包屑 `[data-volcrumb]`（`.vol-breadcrumb`） |
| `#stash-list .archive-card` / `.archive-name` / `.badge-active-file` | `#zone-card .pkg-card[data-pkg]` / `.pkg-name-txt` / `.is-active` |
| 暂存行「⋯」菜单 / `.btn-archive-action.load` | 点卡片本体 = 载入为源；行内 `[data-pkgact="delete"]` + 确认弹窗 |
| `.stash-select-box` | `.pkg-check[data-pkgcheck]` |
| `#extension-mode-select` | 图表卡扩展工具条 `[data-extmode="full"/"manifest"]` 分段按钮 |
| `[data-preset="chars/chats/safe"]` | **已删除**——用树勾选直接摆组合（联动恒开：chats ⇄ characters） |
| `#filename-template-input` | `#filename-template`（textarea，默认折叠 ⇒ 先点 `#filename-toggle`） |
| `#log-console-*` / `#btn-toggle-log` / `#btn-clear-log` | 常驻底栏日志 `#log-lines`（**无条件写入**，视图隐藏也在写；点 `#workbench-progress` 打开） |
| `#report-panel` + `#count-*` | 自绘报告模态 `.rep-grid`（`.rep-row` 计数行） |
| `#wb-flow-switch .wb-flow-tab` | `#zone-tabs .zone-tab`（导入 / 导出两枚） |
| `#lan-toggle` | 迁移与备份视图（`.view-switch-btn[data-wbview="transfer"]`，LAN 是默认 pane） |
| `#host-fetch-preview` / `.wb-help-btn` / `#wb-guide` | 帮助 = 面板头 `.help-btn[data-help]` → `#help-title`/`#help-body`，`#help-close` 关闭 |
| `#btn-export-ext-manifest`（清单导出） | 图表卡 `[data-assetlist="1"]` 直下官方扁平 JSON；**首次使用弹引导模态，必须点确认**（`stpt.assetListGuideSeen` 门） |
| `readCategory` 计数口径 | `common.readCategory` v2：展开组行 → 数后代行（点击会整树重绘 ⇒ helper 内部已用全新查询循环） |

## 2. 本轮修掉的产品级问题（与 e2e 相关）

- 云备份按钮 `TypeError`（读不存在的 `state.selectedPkgs`）→ 已修；
- 云端恢复的包落导出区 → 新 origin `cloud-restore` 落导入区；
- 独立 Web 态隐藏「从宿主拉取」；
- `npm run build:offline` 自包含门禁把内联 JS 的运行期拼接串（`href="'+…+'"`）误判为外部引用
  ⇒ 自 2026-11-12 起一直失败；扫描器剥离 `<script>` 块后重建通过。

## 3. 已知残余（run6 时点，283 项 / 260 过 / 23 败；从首轮 63 败收敛）

- `waitForQueue` v2（run6 起生效）：投递面双路计数——旧 `.eq-name` 队列行 ∪ 现行
  `deliverCreated` 直存的导出区包卡（`#zone-card .pkg-card.is-export .pkg-name-txt`），
  按去重产物名集合判定；`deliverCreated` 还会 `setZone('export')` 自动切页签。
- `{target}` 文件名模板变量现渲染**展示名**（SillyTavern/Luker/TauriTavern/PureTavern）。
- flows「存工作区」中间态已不存在（转换即落库，F9-F14 改为直存 + 跨重载断言）。
- 残余 23 项的分布：批量/并发/排除/库导出/离线 O14-O15/日志容器（N11）等**次级断言**，
  多与「转换产物呈现细节」与「纯库桩供给」相关——下一轮入口：单跑对应 spec +
  在转换后倾倒 `#zone-card` 与 `#log-lines` 读数。
