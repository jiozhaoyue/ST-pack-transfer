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

## 3. 已知残余（run5 时点，300 项 / 261 过 / 39 败）

- **cross-host 16 路径矩阵的转换段**（13 败）：selectTarget 已通，转换未出产物——
  需要带日志倾当面查（下一轮入口：跑单 spec `node e2e/standalone/run.cjs --only cross-host --no-build`
  并在 per-target 循环里倾倒 `#log-lines`）；
- library-export E7（纯库导出出包）、split G4（放大包 chats 计数——readCategory v2 后待复核）、
  offline O14/O15（计划面板读数）、s1 H3（转换入队）等次级断言；
- 其余为「未抛异常」连锁——多半由上述首断言失败级联。
