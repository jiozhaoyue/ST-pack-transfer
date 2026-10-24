# 工作台双方向重设计：导入导出分屏 + 模块三层复用

## Goal

把工作台从「8 区块平铺长页」重构为「模块 / 流程 / 外壳」三层：导出与导入各自成屏（顶部方向开关切换），上传槽单一共享带角色标签，打包选项只归导出侧；先修 4 个现症（待扫描永不消失 / 明细竖排 / 行菜单覆盖上传区 / 外层滚动条）再整体重设计；桌面与移动共用同一批模块，差异只落在外壳布局。

## Requirements

> 用户 2026-10-15 裁定（四项经 AskUserQuestion 确认，均取推荐项）：
> ① 建 Trellis 任务并进规划；② 方向分离取「顶部开关 · 两屏切换」；
> ③ 上传槽取「单一共享槽 + 角色标签」；④ 节奏取「先修 4 个现症，再整体重设计」。

### S1 现症修复（先行，独立可验收）

- **R1.1** 「待扫描」必须随扫描结果消失。现状：`isUnscanned` 只在 `renderCategoryDefaults()` 置 `true`
  （`src/ui/category-filter.js:110`），而真实扫描的两个调用点 `index.js:1390`、`index.js:1793`
  均未传 `{unscanned:false}` ⇒ 标志永不翻转。附带缺陷：`isAvailable = isUnscanned || count > 0`
  恒真 ⇒ 源包中不存在的类目被启用并默认勾选，假勾选一路传入 `convert()`。
- **R1.2** 「明细」按钮文字不得竖排换行（`style.css:1235` 缺 `white-space:nowrap`）。
- **R1.3** 暂存区行「更多」菜单不得覆盖上方上传区（`style.css:2644` 的 `.stash-row-menu`
  为 `position:absolute`，但全仓无 `.stash-row` 定位规则 ⇒ 包含块落在更上层祖先）。
- **R1.4** 工作台不得出现外层滚动条。

### S2 三层重构（主交付）

- **R2.1 模块层**：`QuotaBoard` / `SourceSlot` / `ScopeTree` / `PackOptions` / `RestoreOptions` /
  `ActionBar` / `ProductList` / `ExtensionRow` / `LogConsole` 各**只有一份实现**，
  契约 = 纯渲染函数 `state → DOM`，不判方向、不管布局、不写 media query。
- **R2.2 流程层**：`FLOWS.out` / `FLOWS.in` 只声明「模块清单」，不新增实现。
  两流程差异仅一项：`out` 有 `PackOptions`，`in` 有 `RestoreOptions`。
- **R2.3 外壳层**：`SHELL.desktop` / `SHELL.mobile` 只声明摆法，不新增实现。
- **R2.4** 方向分离：顶部开关切两屏，任一时刻只渲染当前方向的模块。
- **R2.5** 上传槽单一共享，带「角色」标签（源包 / 待恢复包）；同一包可先导出再导回，不重复上传。
- **R2.6** 阶段渐进披露：`idle` 只显示 配额 + 上传槽 +（导出侧）打包选项 /（导入侧）恢复选项；
  `scanned` 追加内容范围；`running` 只留配额 + 执行条；`done` 追加产物与日志。
- **R2.7** 顶部常驻配额与数据分布（Luker 式）；独立模式下宿主相关项**置灰**而非隐藏。
- **R2.8** 宿主扩展列表只占**一行**：`[● 启用开关] [打开]`，`打开` 为全屏工作台。

### 约束

- **C1** 三条 CSS 铁律（见 `design.md` §4）必须可程序化断言。
- **C2** 桌面与移动共用同一批模块，禁止出现「桌面版模块」与「移动版模块」两份实现。
- **C3** 现有五条静态守卫（`check:css-scope` / `check:dom-injection` / `check:template-source` /
  `check:control-consumer` / `check:dom-scope`）必须保持全绿。
- **C4** CSS 双前缀铁律（`.app-container` / `.st-converter-drawer-app`）不得回归。
- **C5** 配色只继承 `--SmartTheme*`，禁止硬编码色值。
- **C6** 文案纪律：无括号说明、无分号、无解释性长句。

## Acceptance Criteria

### S1

- [ ] **AC-1.1** 上传 `tauritavern-data-*.zip` 后，13 个类目徽标显示真实 `N 项 · X MB`，
      全仓**零**「待扫描」残留；源包中不存在的类目被置灰且 `checkbox.disabled === true`。
- [ ] **AC-1.2** 窄至 320px 视口下，`.btn-expand-detail` 的 `offsetHeight` 为单行高度
      （计算样式 `white-space === 'nowrap'`）。
- [ ] **AC-1.3** 展开暂存区行「更多」菜单后，菜单矩形与 `#dropzone` 矩形**不相交**。
- [ ] **AC-1.4** 工作台根容器 `scrollHeight <= clientHeight + 1`；根容器计算样式
      `overflow-y` 不为 `auto` / `scroll`。

### S2

- [ ] **AC-2.1** `grep` 证明每个模块名在 `src/ui/` 下只有一处实现定义。
- [ ] **AC-2.2** 导出屏 DOM 含 `PackOptions` 标识、不含 `RestoreOptions` 标识；导入屏反之。
- [ ] **AC-2.3** 切到导入屏后，导出屏模块从 DOM 移除（非 `display:none`）。
- [ ] **AC-2.4** 上传包后切方向，上传槽仍持有同一个包，角色标签随之更新，**不触发二次上传**。
- [ ] **AC-2.5** 初始（`idle`）态 DOM 中只存在 `QuotaBoard` + `SourceSlot` + 选项槽三个模块。
- [ ] **AC-2.6** 独立模式（无宿主）下宿主配额项带置灰类且 `aria-disabled` 为真；有宿主时为可读读数。
- [ ] **AC-2.7** 宿主注入的扩展列表区只渲染一行，行内恰有 1 个启用开关 + 1 个「打开」入口。
- [ ] **AC-2.8** 桌面（≥1024px）为两栏 grid；移动（≤480px）为单列且 `ActionBar` 吸底
      （`position: sticky/fixed` 且滚动后仍在视口内）。
- [ ] **AC-2.9** `npm test` 全绿且用例数不少于重构前（零回归）；五条静态守卫全绿。

## Notes

- 四项方向性决策已由用户 2026-10-15 经 AskUserQuestion 裁定，不再回问。
- 「上传槽 / 打包槽」是本任务唯一需要再讨论的设计张力，用户已给出方向（共享槽 + 角色标签），
  具体交互细节落在 `design.md` §3，实施中若出现新歧义按 L0-5 聚合提问。
- 技术设计与执行计划见 `design.md` / `implement.md`。
