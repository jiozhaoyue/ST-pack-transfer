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

## 3. 已知残余（定点复跑后，从首轮 63 败收敛到 ~15 败；全绿 spec：cloud-webdav 25/25、
## cross-host 94/94（16 路径矩阵全通）、s1-remedies 18/18、exclude 11/11、concurrency 15/15、
## LAN 24/24、下钻 9/9、suggest pill 8/8、图表卡 13/13、stash 14/14、源码树聊天库 17/17）

### 本轮追加的关键 helper（common.cjs）

- **`generate(page)`**：切回导入区 → 保证有勾选包（真实 click，合成 change 不进勾选集合）→
  点 `#btn-generate`。**为什么必须**：转换后 `deliverCreated` 会 `setZone('export')` 自动切页签 +
  弹报告模态（复用 `#confirm-dialog`）⇒ 同 spec 的后续转换全部被拦。
- **`closeModalIfOpen(page)`**：报告模态拦截的统一处置；已内嵌进 `waitForQueue` /
  `downloadNthRow` / `selectTarget` / `ensureImportZone`。
- **`confirmActiveModal(page)`**：点掉确认模态的**主确认按钮**（副作用生效，例如分卷的
  commitSplit——只 close 会把要提交的值丢掉）。
- **`downloadByName(page, prefix, dir, file)`**：共享工作区场景（concurrency 的同 context 双页签）
  按产物名前缀下载——按下标取会拿错（两页产物同列一区是**正确行为**）。
- **`downloadNthRow` v2**：双路（旧队列行 / 导出区包卡）；导出卡 DOM 序 = **时间倒序**，
  调用方的创建序 n ⇒ DOM 下标 = count-1-n。⚠️ 基线计数必须在**卡片实际渲染的分区**做
  （导出卡只在导出区渲染；导入区数恒 0 ⇒ 下发最老的卡——targets T-safe 假红的首因）。
- **`ensureSourceLoaded(page)`（2026-11-14 新增）**：确保导入区有**当前源**（树可见）。
  **为什么必须**：切区页签让「选中集合」与「当前来源」**一起失效**（2026-11-11 裁定，
  workbench-view zone-tabs 处理器注释）⇒ 转换后切回导入区，树是**空的**——摆预设前必须
  点包卡本体重新载入为源（探针实证：导出区 9 行树，切回导入 0 行）。
- **`readCategory` v2.1**：组行展开后**递归展开全部子级折叠行**再数后代
  （chats/Fixture/bulk-*.jsonl 的目录嵌套默认折叠——只展开组行数到 1 个目录节点）。
- **`readLogText` v2（2026-11-14）**：现行日志 = 常驻底栏 `#log-lines`（**无条件写入**），
  无需「先展开」；旧 `#log-stream-container`/`#log-console-body`/`#btn-toggle-log` 已删。

### 2026-11-14 下午轮实证的新契约（run13b→run14 期间）

1. **任务控制是按钮组，不是容器**：`#task-controls`/`#tc-resume`/`#tc-discard` 已删。
   现行 `renderActions()` 按任务状态增删按钮：running ⇒ `#btn-task-pause`+`#btn-task-abort`、
   paused ⇒ `#btn-task-resume`+`#btn-task-abort`、结束 ⇒ 按钮整个消失。
2. **进度读数现行 id**：`#progress-pct`（文本 "42%"）/ `#progress-fill`（width %）/
   `#progress-label`。旧 `#progress-percent`/`#status-label`/`#progress-bar-fill` 已删。
3. **分卷阈值不可为 0**：非法值（<32 / >2048）被守卫 **clamp 到边界 + toast + 「确认分卷容量」
   模态**，确定后才提交（commitSplit）。⚠️ **change 事件在 blur 才触发**——Playwright `fill`
   不 blur ⇒ `fillNumber` 读回的值是「还没提交」的假象；随后的下一次点击（blur）才触发守卫，
   **模态在点击瞬间弹出并惰性化整页 ⇒ 该点击被吞**（capture 监听实证 clicks=[]）。
   spec 侧处置：fill 后显式 `blur()` → 等模态 → `confirmActiveModal` → 回读 clamp 后的值。
4. **上传会重置顶层控件**：`setPackages`（上传触发）→ `applyTopControlsFromPrefs()` 把
   compression/splitMb/filenameTemplate 重置回**持久化偏好** ⇒ 想自定义压缩等级必须在
   **上传+计划就绪之后**再 `selectOption('#compression-select', …)`（perf P19/P21 假红首因）。
5. **「点进度条」= 切到日志视图 pane**：`#workbench-progress` 点击 → `showPane('log')`
   （`#view-workbench` 被隐藏）⇒ 之后所有工作台控件「元素不可见」。回工作台点 `#log-close`。
6. **配额看板**：`#quota-head` + `.quota-row[data-quota-kind]`；独立态恰 1 行（`browser`），
   **宿主行不渲染**（旧「宿主区置灰」语义已删）。
7. **纯库导出落导出区（2026-11-14 产品修正）**：`#btn-library-export` → 产物
   `library-export-<target>.zip` 进**导出区**（origin=converted 统一出口），且**尊重当前 UI
   目标平台**（旧实现硬编码 st 且落导入区当源包）。i18n toast 同步改为「已导出到导出区」。
8. **库内计数基线必须在 generate 前取**：现行 `deliverCreated` 在 waitForQueue 返回前已落库
   ⇒ 转换后取的 before 已含新记录（flows F10 恒差 1 的首因）。
9. **运行器杀进程后的清理**：杀掉 e2e run 后必须清干净 `chrome-headless-shell` 残留与
   4173 监听再重跑——残留会让下一轮在首次 openSite 处挂死（run13 实测，probe2 复刻不挂）。

### 仍未收敛的残余（2026-11-14 下午轮已全部收敛 ⇒ 本节留档作废）

- split G6/G8、pause-resume R5/R5b、controls K13/K15、workbench C8、library E7 及各散项：
  全部收敛（见 `docs/PLAN-2026-11-14-residual-convergence.md` 的逐簇首因链）。
  「library E7 = 上游未实现」的旧诊断**不准确**：功能一直已实现（`exportLibraryToPack` 完整），
  真因是落点（导入区 vs 导出区）与目标平台硬编码——已按统一出口修产品。
