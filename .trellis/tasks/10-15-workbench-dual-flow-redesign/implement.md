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
  - [ ] 推送 origin

## S2 三层重构

- [ ] **2.1 抽出模块层**
  - 在 `src/ui/` 新建模块目录，把现有渲染逻辑迁移为纯函数
  - 契约检查：每个模块**不得**读 `state.flow`、不得写 media query、不得持闭包状态
  - 验证：`grep` 证明每个模块名在 `src/ui/` 下只有一处实现定义（AC-2.1）

- [ ] **2.2 抽出流程层与外壳层**
  - `FLOWS` / `SHELL` 只声明，不含实现
  - 验证：`grep` 证明 `FLOWS` / `SHELL` 内无 DOM 操作

- [ ] **2.3 顶部方向开关 + 两屏切换**
  - 切屏从 DOM **移除**非当前方向模块（非 `display:none`）
  - 验证：AC-2.2 / AC-2.3

- [ ] **2.4 上传槽改单一共享 + 角色标签**
  - `state.slotRole` 驱动；切方向不重传、不重扫
  - 验证：AC-2.4

- [ ] **2.5 阶段门控接入**
  - `visible(stage, flow)` 接线到渲染入口
  - 验证：AC-2.5

- [ ] **2.6 QuotaBoard（配额 + 数据分布，宿主项可置灰）**
  - 先取一次实测读数定「数据分布」维度（`design.md` §9）
  - 验证：AC-2.6

- [ ] **2.7 宿主扩展列表收敛为单行**
  - 改 `src/ui/host-bridge.js` 的注入体；幂等与自愈机制不动
  - 验证：AC-2.7；`npx vitest run test/host-button-factory.test.js`

- [ ] **2.8 双端布局**
  - 桌面两栏 grid（含 `min-width: 0`）；移动单列 + `ActionBar` 吸底
  - 验证：AC-2.8；桌面与移动各一张截图校对

- [ ] **2.9 S2 收口**
  - `npm test` 全绿且用例数不少于重构前
  - 五条守卫全绿
  - `npm run e2e:web -- --rebuild`（涉及删/换文件，mtime 判据不可信）
  - 显式 pathspec 提交 + 推送

## 收口

- [ ] **3.1 规范落 `.trellis/spec/frontend/`**
  - 三条 CSS 铁律 + 三层分层契约写入 spec（自包含，不引用任务目录）
  - 注意：`component-guidelines.md` 已超 32 KB 上限 ⇒ **按主题新建文件**，不要追加
- [ ] **3.2 任务归档**

## 回滚点

| 点 | 位置 |
| --- | --- |
| S1 完成后 | S1 提交哈希 —— S2 出问题回滚到此 |
| 任一守卫转红 | 回滚到上一个全绿提交，不带着红灯继续 |
