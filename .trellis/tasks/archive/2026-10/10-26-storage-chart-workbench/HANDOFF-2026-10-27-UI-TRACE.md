# UI 偏移溯源与全面交接（2026-10-27）

> **自包含**。新会话读完这一份即可接手，不需回溯对话。
> **最高优先级：用户已明确「不要擅自改 UI」。本文件只记录事实与待办，未改设置页/图表结构。**
> 证据顺序：用户最新裁定 → 已定 PRD → 实际代码 → 提交历史。

---

## 0. 用户最新裁定（必须遵守）

1. **设置页只允许最后 3 项**：导出区保留、流量提示、教程自动打开。
   其余 8 项（压缩、扩展包、Git 历史、保留构建配置、backups、派生缓存、私有配置、清理原生资产）
   **不得放在独立设置页**。
2. **Git 与「扩展包」枚举属于图表「扩展」节点**；backups / 派生缓存 / 私有配置 / 构建配置 / 原生资产
   **都在图表里勾选**。
3. **`导入01` / `导出01` 必须在这个图表 DOM 里面**（当前是图表卡片外的同级组头），
   并在这里**补上全选**。
4. **删除「大类折叠到文件」这行字**。
5. **每一级都要能全选 / 全不选 / 反选**（当前只有每张图表卡一层）。
6. 以上标准此前已定；**不要再自造设置页或把图表选项搬到别处**。
7. 本轮要求：先**调查清楚偏移来源**并**全面交接**，不是马上改。

---

## 1. 本次会话已完成（局域网正式接线 + 主题修复）

### 1.1 代码改动（**未提交**，见 §6）

| 文件 | 改动 | 证据/行号 |
| --- | --- | --- |
| `src/ui/qr.js`（新增） | 正式二维码适配器：classic `<script>` 注入本地 vendor；`ready()` / `encodeSvg()` / `scan()` | `qr.js:30/48/64` |
| `src/ui/lan-transfer-panel.js` | 旧浮层 → 内联控制器：删除自建 DOM/overlay/角色页签/文件选择器；只读模板 id + `view.setLan()`；保留协议引擎；多包队列；接收入导入区 | `mountLanTransferPanel` 171、`finishSend` 275、`generate` 423、`acceptOffer` 647 |
| `index.js` | `import { qr }`；`actions.lan` 六个方法；`getSendTargets()`；`importFiles({remote})`；`ORIGINS.LAN` 映射；远程同名加序号；视图传入 `qr`；挂载新控制器 | `uniqueRemoteName` 212、`importFiles` 224、`getSendTargets` 248、`lanActions` 516、挂载 573 |
| `src/storage/db.js` | `ORIGINS.LAN = 'lan'` | `db.js` ORIGINS |
| `src/ui/workbench-view.js` | LAN 发送 `waiting` 状态：生成取件码后禁用「生成」、显示「取消」但不禁用「开始传输」 | `renderLan` 内 |
| `style.css` | LAN 水平内边距 4px→9px；`.menu_button` 主题回退；**原生 checkbox 白方块改为自绘**；`color-scheme: dark`；删除旧 `.wb-lan-*` 浮层样式 | reset 段 / LAN 段 |
| `e2e/standalone/specs/lan-transfer.e2e.cjs` | 重写：两个**独立上下文**（各自 IndexedDB）、3 MB + 64 KB 两包排队、二维码渲染、远程导入徽标、一次性、坏码 | 24/24 |
| `.trellis/spec/frontend/workbench-single-view.md` | §7/§9 更新为正式接线完成、demo 只消费正式代码 | — |
| `.trellis/tasks/10-14-lan-transfer/HANDOFF.md` | 状态更新为「正式接线完成」 | — |

### 1.2 验证读数（2026-10-27）

- `npm test`：**874 passed / 2 skipped**（81 文件通过 / 1 skipped）。
- 五守卫全绿：`check:css-scope` / `check:dom-injection` / `check:template-source` / `check:dom-scope` / `check:control-consumer`。
- `npm run build`：通过。
- `npm run e2e:web -- --only lan-transfer --rebuild`：**24/24**（真 WebRTC、两包排队、QR、远程导入、一次性、坏码）。
- 3040 实跑截图（gitignored）：`out/lancheck/verify-lan-real.png`、`zoom-zone2.png`、`zoom-chart2.png`、`zoom-settings.png`。
- 主题审计：`out/lancheck/audit-theme.cjs`——除强调色按钮外，无浅色背景控件；原生 checkbox 已自绘。

### 1.3 本轮**没有**动的东西

- **设置弹窗的 11 项内容、顺序、承载位置：一律未改**（只读取做溯源）。
- 图表的组头/全选/「大类折叠到文件」：均未改。
- 没有回滚 `3b7aeed` 的重写，也没有改 demo 的演示数据。

---

## 2. 溯源时间线（谁、何时、把什么带进来的）

| 时间 | 提交 | 事件 |
| --- | --- | --- |
| 2026-10-26 23:25 | `a1dfa0b` | 「存储图表工作台规划与 UI demo 交接」。**设置弹窗首次出现在 demo**：`.trellis/tasks/10-26-storage-chart-workbench/deliverables/ui-demo.html:1150`（`openModal('设置','这些选项会记住。',...)`）；同时 demo 有虚拟节点「完整扩展包/保留 Git 历史/保留构建配置」与 `大类折叠到文件`（`:444`）。该提交自称「未改产品代码」。 |
| 2026-10-27 03:25 | `3b7aeed` | 「按定稿 demo 全面重写工作台」。**关键偏移点**：删除了旧主界面「打包」区，把 demo 的设置弹窗搬进 `index.js`（`openSettings` 现 `index.js:466`）；图表组头/全选/`大类折叠到文件` 一并搬入 `workbench-view.js`；`chart-model.js` **没有**实现 demo 里的虚拟节点。 |
| 2026-10-27 13:25 | `5f02e3a` | 「UI 单一源逐字同步」：demo → 正式三件套逐字复制，设置页与图表结构被固化。 |
| 2026-10-27 16:50 | `04d580c` | 局域网 UI 二次重做（demo 完成）。 |
| 2026-10-27（本会话） | 未提交 | 局域网正式接线 + 主题修复；**未碰设置页/图表结构**。 |

**旧主界面的「打包」区（重写前）**：`3b7aeed^:src/ui/workbench-template.js:137-258`
——包含目标平台、压缩、扩展包、Git 历史、分卷、保留构建配置、backups、派生缓存、私有配置、清理原生资产。
这些控件当时在主工作台内，有完整样式；`3b7aeed` 整段删除。

---

## 3. 偏移清单（逐条：既定标准 / 当前实现 / 来源 / 影响）

> 所有行号均为 2026-10-27 当前工作树。

### P0-1 设置页是「无需求来源」的独立页

- **既定标准**：PRD 只允许两类设置入口——
  - R3.9「导出后默认在导出区保留包；可选导出后删除；**设置里可重新开启**」
    （`.trellis/tasks/10-26-storage-chart-workbench/prd.md:39`）
  - R3.10「后端上下传默认提示流量；可不再显示；**设置里可开关**」（`prd.md:40`）
  - 全 PRD **没有**「设置页承载压缩/扩展包/Git/备份/缓存/私有/清理」的条款。
- **当前实现**：`index.js:466` `openSettings()` 一次塞入 **11 项**；设置按钮 `btn-settings` 只是打开这个弹窗。
- **来源**：demo `a1dfa0b` → 生产 `3b7aeed`。
- **影响**：用户明确判定为错误承载；且旧主界面「打包」区（已确认标准）被删除。

### P0-2 8 项设置与图表选择「双源」，且隐藏设置覆盖图表

- **既定标准**：图表是唯一选择面——
  - R2.6 差量在图表顶部切换，不设独立差量区（`prd.md:23`）
  - R2.7 扩展为一级节点，含「完整扩展 / 仅列表」、Git 保留项、构建配置，全部正向复选框（`prd.md:24`）
  - 任务描述：「Git/构建/清理/差量全部内化」（`.trellis/tasks/10-26-storage-chart/task.json`）
- **当前实现**：
  - `generate()` 读全局 `settings.*`：`index.js:386-393`（compression/extensionMode/gitMode/keepDev/includeCache/includeBackups/includePrivate/pruneBuiltin）。
  - 图表勾选只影响 `excludedPaths`：`index.js:383`、`workbench-view.js:1184-1193`。
  - 转换器又用全局 flags 二次过滤：`src/core/transform.js:321-328` 接收；`533`（pruneBuiltin）、`540`（keepDev）、`555`（includeBackups）、`602/630`（includeCache）、`700-793`（extensionMode/gitMode）。
- **影响（实测级）**：
  - 图表里勾「备份快照」→ `includeBackups=false` 仍在 `transform.js:555` 丢弃。
  - 图表里勾「派生缓存」→ `includeCache=false` 仍丢（`602/630`）。
  - 「保留构建配置」→ `keepDevFiles=false` 仍剔（`540`）。
  - 「原生资产」→ `pruneBuiltin=true` 仍清（`533`）。
  - 扩展/Git → 只能靠设置页；图表没有对应可操作节点（见 P0-3）。
  - 结论：**图表勾选对这些维度无效**，用户看到的勾选与实际产物不一致。

### P0-3 图表缺虚拟节点：扩展包/Git/构建/原生资产

- **既定标准**：R2.7 扩展节点含「完整扩展 / 仅列表」、Git 保留项、构建配置；
  10-14-ui-full-rewrite R-03 还要求「Git 历史仅在前者＝完整扩展包时可用」
  （`.trellis/tasks/10-14-ui-full-rewrite/prd.md:14`）。
- **demo 有**：`src/ui/ui-demo.html:155`（完整扩展包）、`:168`（保留 Git 历史）、`:169`（保留构建配置）、
  `:189`（原生资产）。
- **生产没有**：`src/core/chart-model.js:28-38` 只有真实分类（chats/characters/…/extensions/private/backups/cache/unknown），
  `grep -c "完整扩展包\|保留 Git 历史\|保留构建配置" src/core/chart-model.js` = **0**；
  `native`/「原生资产」分类也不存在。
- **来源**：`3b7aeed` 搬 demo 时只搬了 UI，没有把虚拟节点建进 `chart-model`。
- **影响**：R2.7 实际未实现；设置页成了唯一入口。

### P0-4「导入01 / 导出01」在图表 DOM 外，且组头无全选

- **既定标准**：R4.2a「图表组头显示 `导入05` / `导出01`」（`prd.md:138`）——
  只规定「组头」，**没有**规定它必须在图表卡内，也没有规定组头要有全选。用户现裁定：必须在图表 DOM 内，并补全选。
- **当前 DOM**：
  ```
  #chart-stack
    > .chart-group
        > .chart-group-head   ← seqLabel(pkg) 在这里（workbench-view.js:428-433）
        > .vol-grid
            > .vol-card        ← 图表本体
                > .tree-tools  ← 全选/全不选/反选（:374-381）
  ```
- **影响**：包序号与图表卡是兄弟节点；组头只有关闭按钮（`group-close`），没有全选。

### P0-5 逐级全选缺失

- **既定标准**：R2.4「逐级复选框，大类默认折叠、可展开到文件；父级三态；提供全选/全不选/反选」
  （父 `prd.md:21`）；子 PRD 写「每张图表卡带全选/全不选/反选」
  （`.trellis/tasks/10-26-storage-chart/prd.md:14`）。
- **当前实现**：只有每张 `.vol-card` 一层 `.tree-tools`，一次作用整张卡：
  `workbench-view.js:374-381`（按钮）、`:989`（`applyTreeAll(scope,mode)`）、`:1005-1008`（委托）。
  **没有任何节点级/父级全选入口。**
- **判定**：实现符合子 PRD 字面（每张卡一层），但不符合用户「每一级都可以」的裁定。
  这是**规划缺陷**（PRD 没写清逐级），不是单纯代码 bug。

### P1-1 设置页没有任何 CSS，控件并排

- **既定标准**：10-14-ui-full-rewrite R-08「控件单列不并排；区块间距紧凑」
  （`10-14-ui-full-rewrite/prd.md:19`）；`ui-orchestration-rules.md:27`「设置项单列不并排」。
- **当前**：`openSettings` 输出 `settings-grid` / `set-row` 类（`index.js:478-489`），
  但 `style.css` 对 `settings-grid` / `set-row` 的规则数 = **0**（`grep -c` = 0）。
  于是 3 个 `<select>` 按 inline 流并排、互相挤压；复选框靠 `.modal .check` 才有行高。
- **影响**：截图 `zoom-settings.png` 可见三项枚举挤在一行，明显违反既定单列标准。

### P1-2「这些选项会记住」是假的：设置不持久化

- **当前**：`settings` 是 `main()` 内的普通对象（`index.js:92-103`）；
  `grep localStorage.*settings` 无命中；刷新页面全部回默认。
- **影响**：文案撒谎；用户改完设置重开即失效。

### P1-3 最后 3 项也是「死设置」——改了没有任何行为

- `settings.keepExport`：只出现在定义 `index.js:100` 与弹窗读取 `:506`；
  `generate()` 从未读取（导出副本始终保留）。
- `settings.trafficPrompt`：只出现在定义 `:101` 与读取 `:507`；回传/拉取路径没有读取。
- `settings.autoTutorial`：只出现在定义 `:102` 与读取 `:508`；
  教程自动打开实际是无条件 `sessionStorage` 判断（`index.js` 末尾）。
- **影响**：即使用户按「只留最后 3 项」修好承载，这 3 项目前仍然无效；必须接线后才算完成。

### P1-4「大类折叠到文件」是无来源文案

- **既定标准**：`10-26-storage-chart-workbench/design.md:77` 只写**行为**「树的默认展开：大类折叠，展开到文件」；
  没有任何 PRD/规范要求把这个行为写成界面文案。
- **当前**：`workbench-view.js:380` `<span class="hint">大类折叠到文件</span>`；demo 首版 `a1dfa0b:444` 就有。
- **影响**：说明性文案，违反用户「删掉」的裁定与 10-14-ui-full-rewrite R-07「删除一切说明性文案」。

### P1-5 私有配置语义混乱

- **当前**：`settings.includePrivate` 只用于 `transform.js:616` 的 **TT app-private** 分支
  （`target===TT || keepAll || includeAppPrivate`）。
  图表「私有配置」节点是否被排除由 `excludedPaths` 决定。
- **影响**：设置页「打包私有配置」对 ST/Luker 不控制图表里的私有配置节点；
  同一个概念有两个开关，用户无法判断哪个生效。

### P1-6 压缩选项失去主界面入口

- **旧标准**：重写前主界面「打包」区有 `compression-select`（`3b7aeed^:src/ui/workbench-template.js:150-158`），
  默认「标准」。
- **当前**：只有设置弹窗的「压缩」；`generate()` 读 `settings.compression`（`index.js:386`）。
- **用户未指定新落点**（图表顶部？执行卡？），**需用户裁定**，不要擅自放。

### P1-7 主题（本会话已修，但插件宿主未复验）

- 已修：原生 checkbox 白方块 → 自绘（`style.css` reset 段）；LAN `.menu_button` 白底 → 主题回退；
  `color-scheme: dark` 覆盖原生下拉/滚动条。
- 已验证：独立 Web / 3040（`zoom-zone2.png`、`zoom-chart2.png`、`verify-lan-real.png`）。
- **未验证**：Dev ST / Dev Luker / PT / TT 插件内——宿主可能用 `!important` 覆盖 checkbox/button
  （CSS 双前缀铁律仍需遵守，当前规则均带 `#app.app-container`）。

### P2-1 `fmtMB` 未取整

- `workbench-view.js:98-101`：`return mb+' MB'`，3.000152587890625 MB 原样显示；
  E2E 读数 L6 已出现 `已选 2 个包 · 3.062816619873047 MB`。
- 影响：LAN 摘要、图表脚注等体积读数不整洁。

### P2-2 设置弹窗静态守卫覆盖不到

- `#set-*` 控件是 `openSettings()` 动态拼的 HTML，`check:control-consumer` 只扫模板源码；
  设置项改名/删控件不会被守卫发现（`scripts/control-consumer-guard.js` 注释已承认局限）。
- 修设置页时必须同步改 `index.js`，并补一条针对动态控件的测试或显式声明。

### P2-3 文档/任务状态残留

- `.trellis/tasks/10-26-ui-demo/prd.md` 仍写「单文件 / 双击 file://」——顶部已加「已被取代」提示，但 R8.1/AC-32 正文仍在。
- `.trellis/tasks/10-26-storage-chart-workbench/prd.md` 的 R8.1/AC-11 已改为新方向。
- 各子任务 PRD（10-26-storage-chart / zones-flow / package-cards-vault / tutorial-copy）仍是 planning 状态，
  与本轮实际实现存在偏差，收口时需按现状回填（详见 `10-26-storage-chart-workbench/HANDOFF.md` §五）。

---

## 4. 待修改项（完整清单，按优先级；**未获用户确认前不要动**）

### P0（必须修，否则 UI 语义错误）

1. **恢复主界面的打包选择面**（按用户裁定 + 旧标准 `3b7aeed^:workbench-template.js:137-258`）：
   - 扩展包 / Git 历史 → 图表「扩展」一级节点下的虚拟节点（R2.7）。
   - 保留构建配置 → 同上（扩展节点下）。
   - backups / 派生缓存 / 私有配置 → 图表对应一级节点的勾选（现有节点）。
   - 清理原生资产 → 图表「原生资产」节点（需新增分类/虚拟节点）。
   - 压缩 → **落点待用户裁定**（旧主界面打包区曾有；不要擅自塞进设置页）。
2. **删除设置页中的这 8 项**，设置页只留最后 3 项；
   同时把最后 3 项**真正接线**（见 P1-3），并实现持久化（P1-2）。
3. **消除双源**：`generate()` 与宿主拉取不再读全局 `settings.*`（`index.js:181-187`、`386-393`）；
   改为从图表选择派生（或从虚拟节点状态派生），保证「勾了才保留」。
4. **图表虚拟节点**：在 `chart-model.js` 补「完整扩展包 / 保留 Git 历史 / 保留构建配置 / 原生资产」，
   并让 Git 枚举在「只导出清单」时禁用（R-03 联动）。
5. **`导入01/导出01` 移进图表 DOM**，并在该处补「全选」；删除外层独立组头（或按用户确认的 DOM 方案）。
6. **逐级全选/全不选/反选**：每一级（根 / 一级分类 / 子目录）都要有入口；
   父级三态与现有 `syncAncestors` 保持一致。

### P1（应修）

7. 删除「大类折叠到文件」文案（`workbench-view.js:380`）。
8. 设置页（若保留 3 项）加样式：单列、间距、与主题一致；补 `settings-grid/set-row` CSS 或改用现有 `.check` 布局。
9. `fmtMB` 取整（<=1 位小数），统一所有体积读数。
10. 插件宿主复验 checkbox/button 主题（ST/Luker/PT/TT），确认宿主 `!important` 不会盖回白色。
11. 私有配置语义收敛：图表节点为主，删除/改名设置页的「打包私有配置」，避免两个开关。

### P2（收口/证据）

12. 四宿主矩阵与六对互传复跑（新 UI 选择器：`#lan-toggle` → `#lan-btn-generate` → `#lan-offer-input` → `#lan-btn-accept` → `#lan-answer-input` → `#lan-btn-apply-answer`）。
13. PT 快照 `install-pt-extension.cjs --replace` 后跑 pt-load。
14. 真机双设备 AC-10（跨机器 mDNS / 扫码 / 非安全上下文降级）。
15. 任务收口：回填 10-26 各子 PRD、把可复用契约写进 `.trellis/spec/frontend/`，再 archive。
16. 设置弹窗动态控件的守卫缺口（P2-2）。

---

## 5. 关键文件地图

| 区域 | 文件/行 |
| --- | --- |
| 设置弹窗（11 项） | `index.js:466` `openSettings()`；`settings` 定义 `index.js:92-103` |
| 旧主界面打包区（标准参照） | `git show 3b7aeed^:src/ui/workbench-template.js` 行 137-258 |
| 生成选项（全局 settings） | `index.js:386-393`；宿主拉取 `181-187` |
| 图表排除路径 | `index.js:383` → `workbench-view.js:1184-1193` |
| 图表组头（导入01） | `workbench-view.js:428-433` |
| 图表全选（每卡一层） | `workbench-view.js:374-381`、`989`、`1005-1008` |
| 「大类折叠到文件」 | `workbench-view.js:380`；demo `a1dfa0b:444` |
| 虚拟节点（demo 有、生产无） | `src/ui/ui-demo.html:155/168/169/189`；`src/core/chart-model.js:28-38`（无） |
| 转换器全局 flags | `src/core/transform.js:321-328`、`533/540/555/602/630/700-793` |
| 本次 LAN 实现 | `src/ui/qr.js`；`src/ui/lan-transfer-panel.js`；`index.js:212/224/248/516/573` |
| LAN E2E | `e2e/standalone/specs/lan-transfer.e2e.cjs`（24/24） |

---

## 6. 当前未提交改动（工作树，2026-10-27 本会话结束前）

```
 M .trellis/spec/frontend/workbench-single-view.md
 M .trellis/tasks/10-14-lan-transfer/HANDOFF.md
 M e2e/standalone/specs/lan-transfer.e2e.cjs
 M index.js
 M src/storage/db.js
 M src/ui/lan-transfer-panel.js
 M src/ui/workbench-view.js
 M style.css
?? src/ui/qr.js
```

> 这些是**局域网正式接线 + 主题修复**，已验证（§1.2）。
> **不包含任何设置页/图表结构改动**。提交时用显式 pathspec；不要 `git add -A`。

---

## 7. 复现与验证命令

```bash
npm run dev                          # 3040；demo: /src/ui/ui-demo.html
npm test
npm run check:css-scope
npm run check:dom-injection
npm run check:template-source
npm run check:dom-scope
npm run check:control-consumer
npm run build
npm run e2e:web -- --only lan-transfer --rebuild
```

截图（gitignored）：`out/lancheck/verify-lan-real.png`、`zoom-zone2.png`、`zoom-chart2.png`、`zoom-settings.png`。
主题审计脚本：`node out/lancheck/audit-theme.cjs`。

---

## 8. 给接手会话的硬性提醒

1. **先读用户裁定（§0），再读本文件**；不要凭截图或「看起来更合理」改承载位置。
2. **设置页不是需求来源**；它只被允许承载最后 3 项（且这 3 项目前还是死设置）。
3. **图表是唯一选择面**；任何打包选项都应回到图表节点或用户明确指定的位置。
4. **不要用 `Write` 整文件覆盖 UI**；改 `workbench-view.js` / `style.css` / `index.js` 用块级 `Edit`。
5. **CSS 双前缀**：所有新规则必须带 `#app.app-container`；禁止裸 `.menu_button` / `.checkbox_label`。
6. **原生控件**：checkbox 已自绘；新增 select/input 必须显式走主题变量，避免白底。
7. **提交**：显式 pathspec、提交前 `git diff --staged --name-only` 核对、推送 `origin main`。
8. **实例纪律**：E2E 只连 Dev；最多 2 个实例；PT/TT 单独跑。
