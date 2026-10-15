# 执行计划：工作台双方向重设计

> 配套 `prd.md` / `design.md`。复选框**随执行实时勾选**（L0-2 铁律），
> 禁止任务结束后凭记忆批量补勾。每一步末尾的验证命令必须实际跑过再勾。

---

## S1 现症修复（先行 · 可独立验收 · 独立提交）

- [x] **1.1 修「待扫描」永不消失** —— 2026-10-15 完成
  - 改 `index.js:1390` → `renderCategoryStats(plan, { unscanned: false });`
  - 改 `index.js:1793` → `renderCategoryStats(hostPlan, { unscanned: false });`
  - 新建 `test/category-filter-render.test.js`（`test/filter.test.js` 只覆盖 `inspectArchive` 纯逻辑，
    **零** `renderCategoryStats` 用例；沿用 `stash-list-render.test.js` 的最小 DOM 桩，不引入 jsdom）
  - 实测：新用例 3/3 通过；全量 `821 passed / 2 skipped / 0 failed`（修前 818，+3 即新增）
  - ⚠ **该测试锁的是模块契约，不是接线**——它直接调 `renderCategoryStats(plan, {unscanned:false})`，
    因此即使 `index.js` 的两处接线回退，它仍会绿。接线由 E2E 与浏览器实测守（见 1.5）

- [x] **1.2 修「明细」竖排** —— 2026-10-15 完成
  - `style.css` `.btn-expand-detail` 增 `white-space: nowrap;`
  - `.category-right-group` 增 `flex-shrink: 0;`
  - 实测：`npm run check:css-scope` 通过；**320px 视口截图校对未做**（浏览器工具当轮不可用）

- [ ] **1.3 行菜单覆盖上传区** —— **初判被现场证据推翻，未改动**
  - 原假设「`.stash-row-menu` 缺定位祖先」**错误**：`.archive-buttons` 早在
    `style.css:1107` 就有 `position: relative; /* 行内「更多」菜单的定位基准 */`（已提交，非在途）
  - 截图中的重叠**尚未归因**。候选：`.archive-item-list` 的 `overflow-y:auto; max-height:250px`
    （`style.css:1023-1029`）裁剪了绝对定位子元素；或重叠物实为 `#stash-batch-bar`
    （该 id 在 `style.css` 中**零 CSS 规则**，全仓 grep 只命中模板与 JS）
  - **未验证前不改动**——避免把「看起来像」当「是」（本仓已有多次此类返工）

- [ ] **1.4 消除外层滚动条** —— **真因已定位，真修法属 S2，移至 2.5**
  - 取证：5 处 `overflow-y:auto` 中 4 处是**模块内滚动**且合法（`pre` 160px / `.archive-item-list`
    250px / `.detail-file-list` 220px / `.log-stream-container` flex:1），
    **唯一的外层滚动条**是 `style.css:1919-1924` 的模态根
    `#st-converter-modal-overlay #app.app-container { max-height:92vh; overflow-y:auto }`
  - 真因：8 个区块常驻 ⇒ 内容必然超 92vh。把滚动挪到内层 div 只是把滚动条换个位置，
    **不解决「用户看到滚动条」**；真正的修法是 **2.5 阶段门控**（`idle` 态内容短到不触发滚动）
  - ⇒ 本项不单独修，并入 2.5 验收（AC-1.4 随 2.5 一起判定）

- [ ] **1.5 S1 收口**
  - [x] `npm test` 全绿（821 passed / 2 skipped / 0 failed）
  - [x] 五条守卫全绿：`check:css-scope` / `check:dom-injection` / `check:template-source` /
    `check:control-consumer` / `check:dom-scope`（逐条实跑通过）
  - [ ] **浏览器实测未做**——当轮 `preview_start` 不可用（分类器临时故障）。待补：
    `npm run dev` 后上传一个包，确认 ① 无「待扫描」残留 ② 空类目置灰
    ③ 320px 下「明细」单行 ④ 展开行菜单不压上传区
  - [ ] 提交前必须解决**工作区在途改动归属**（见「提交边界」节）
  - [x] 推送 origin —— `d96da6f..8834361`

### S1 提交记录（2026-10-15）

| 提交 | 内容 |
| --- | --- |
| `fb344bc` | 在途改动单独落库（**非本任务产物**，并行会话的 UI 还原重构）；提交信息已如实标注来源 |
| `8834361` | 本任务 S1 前两项 + 新测试 + 任务规划件 |

拆分手法：先临时撤回本任务的 4 处编辑 → 提交在途改动 → 重新落回编辑 → 提交本任务。
全程 `git diff --staged --name-only` 校验暂存区恰为目标文件（L0-7）。
备份留档：`~/st-zip-wip-backup.patch`（撤回前的完整工作区 diff）。

## S2 三层重构

> 2026-10-15 实况：**声明层与外壳层已落地并通过真浏览器验收**；模块层的「迁移为纯函数」
> 未做（现有渲染函数已是模块粒度的函数，只是签名不统一）。下表的复选框按实况勾。

- [x] **2.1 声明层：模块 / 流程 / 外壳**（`src/ui/workbench-layout.js`，纯数据无 DOM）
  - `MODULE_IDS` / `FLOWS` / `SHELL` / `visibleModules()` / `stageOf()` / `resolveLayout()`
  - 实测：`test/workbench-layout.test.js` 34 项全绿
  - ⚠ **模块层的「统一签名为 `state → DOM` 纯函数」未做**——现有 `renderCategoryStats` /
    `renderExportQueue` / `renderStashList` 已是模块粒度，但签名各异。收口为统一契约
    属后续增量，不阻塞本任务的可见目标（AC-2.1 的 grep 判据已满足：每个模块只有一处实现）

- [x] **2.2 外壳层：摆法落 DOM**（`src/ui/workbench-shell.js`）
  - 按 `resolveLayout()` 翻 `hidden` + 移入栏目；方向开关接线；移动端折叠把手
  - 实测：`test/workbench-shell.test.js` 10 项全绿

- [x] **2.3 顶部方向开关 + 两屏切换**
  - 切屏 = 翻 `hidden`（**不是**移出 DOM，见 `design.md` §2.5 —— 初稿方向被证据推翻）
  - 实测：E2E `workbench-shell` D1–D9 全绿（真浏览器）

- [ ] **2.4 上传槽「角色标签」**
  - 共享槽已成立（切方向不重传、不重扫，E2E D5 已验）；**「源包 / 待恢复包」角色标签未做**
  - 现以 `#wb-restore-target` 的文案承担部分语义（「待恢复 <包名>」）

- [x] **2.5 阶段门控接入**
  - `applyShell()` 挂在 `applyActionAvailability()`（既有的「状态唯一应用点」）与
    `refreshPlan` 的 `latestPlan` 赋值之后
  - 实施中新增 `awaiting` 阶段：宿主拉取等文件树确认时必须保留 `scope`，否则死锁
  - 实测：E2E B4/B5 证明 idle 态范围与产物确实不显示

- [ ] **2.6 QuotaBoard（配额 + 数据分布，宿主项可置灰）**
  - 现有 `usage-dashboard.js` 已有配额条；**「数据分布」维度与独立模式置灰未做**

- [ ] **2.7 宿主扩展列表收敛为单行**
  - `host-bridge.js` 注入体未改

- [x] **2.8 双端布局（部分）**
  - 桌面两栏 grid（含 `min-width: 0`）、移动单列 + `action` 吸底 + 折叠把手已落
  - 实测：E2E 用 1600×950 桌面视口验过；**移动视口（≤480px）未在真浏览器验过**

- [ ] **2.9 S2 收口**
  - [x] `npm test` 全绿：**864 passed / 2 skipped / 0 failed**（S2 前 821）
  - [x] 五条守卫全绿
  - [x] 新增 E2E `e2e/standalone/specs/workbench-shell.e2e.cjs`，**20/20 全绿**
  - [x] ⚠ 既有 E2E 24 项失败与本任务无关（`common.cjs` 还在点已删除的
        `#btn-wb-view-toggle`，见 `design.md` §11.3），已取证登记
  - [ ] 提交 + 推送

## 收口

- [ ] **3.1 规范落 `.trellis/spec/frontend/`**
  - 三层分层契约 + `hidden` 而非移出 DOM 的理由 + 三条 CSS 铁律 + 「夹具须与模板同构」
  - 注意：`component-guidelines.md` 已超 32 KB 上限 ⇒ **按主题新建文件**，不要追加
- [ ] **3.2 清理陈旧 E2E spec**（向导残留：`#btn-wb-view-toggle` / `#wizard-step-counter`）
- [ ] **3.3 任务归档**

## 回滚点

| 点 | 位置 |
| --- | --- |
| S1 完成后 | `8834361` —— S2 出问题回滚到此 |
| 任一守卫转红 | 回滚到上一个全绿提交，不带着红灯继续 |
