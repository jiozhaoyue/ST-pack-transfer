# 手机扩展「包内」单选 + 数据包列表收起（2026-11-17）

> **状态：✅ 2026-11-17 按用户新裁定重写并双端无头实测。** 用户实测痛点：①手机「包内」仍显示单独数据包下拉（应为只读当前包）；②选了包却不显示扩展清单；③「共 N 项」状态行随滚动条移动。三处均已修，见 §5 与 `./scroll-and-fixed-elements.md`。
> 历史背景：包内单选方向此前做成「手机下拉/桌面只读」，被用户判定为绝对错误，已整体反转为双端只读。

## 1. 扩展「包内」单选契约

- `src/ui/workbench-view.js`：
  - `isExtensionPackageMode()`：`state.extTab==='package' && (state.mainView==='extension' || state.mobileView==='extension')`。
  - `selectPackageForExtension(id)`：唯一入口；同步
    `extSelectedPackageId` / `activePkgs` / `selectedPkgs` / `source` / 引擎。
  - `renderExtInstalled()`：`importPkgs` 只取 `zone !== 'export'`；`selectedPkg` 优先级
    `extSelectedPackageId` → 当前 active → 第一个导入包；进入包内时确定性自动选第一个，并强制 `activePkgs` 只剩一个。
  - 新增 `.ext-pkg-bar` + `.ext-pkg-current` 只读当前包名；`#extmgr-package-select` 下拉 DOM 保留但 `display:none !important`。
    **2026-11-17 用户铁律改版**：桌面与手机**一律只读显示当前包**，包内页不再提供任何单独的数据包列表选择控件；
    切换当前包只走「数据包」抽屉里的卡片/复选框（它们调用 `selectPackageForExtension()`）。
    「手机显示下拉 / 桌面只读」的旧设计被用户判定为绝对错误，已作废。
  - 复选框 click、卡片 click、批量全选/反选/清空，全部走 `selectPackageForExtension()`；
    包内模式点复选框按“单选/单选钮”处理，不允许多选或清空到 0。
  - **选包即扫描**（2026-11-17）：`selectPackageForExtension()` 对新选的、尚无 `nodes/extensions/extManifest` 的包
    调用 `actions.onActivePackage(id)`（`index.js` 里 = `setActivePackage` + `ensurePlan` 补扫 + 完成后重绘）。
    根因：导入多包时只有最新包被 `ensurePlan` 扫描，点到未扫描包会因清单字段全空而显示「当前数据包内未包含扩展条目」——
    正是用户「选了包却不显示扩展」的病根。已有扫描数据的包跳过；demo wrapper 的 `onActivePackage` 为 undefined（自带数据，安全跳过）。
- **禁止**：包内模式依赖 `importPkgs.length===1` 的临时兜底；禁止复选框只改 `selectedPkgs`；禁止让安装报告展开/收起成为“修复选择”的路径。

## 2. 手机数据包列表收起

- 模板：zone-card 头部新增 `#zone-mobile-close`（`data-i18n-title="zones.collapse"`）。
- CSS：`.zone-mobile-close{display:none}`；`[data-view="mobile"][data-zone-open="1"]` 时 `display:inline-flex`。
- JS：`closeMobileZonePanel()` 抽出原有 `is-closing` → `animationend` → 清 `data-zone-open` 的收回动画；view-switch 的 zone 分支与关闭按钮共用。
- 要求：即使数据包列表很长、滚动到底，头部按钮仍可见可点，不能依赖被挤下去的顶部切换按钮。

## 3. 运行时验收清单（下一会话必须做）

1. 390×844：进入教程 → 扩展管理 →「包内」。
2. **包内无下拉、只读当前包**：`.ext-pkg-picker` 计算样式 `display:none`；`.ext-pkg-current` 可见且显示当前包名；不得出现“未选择数据包”（有导入包时）。
3. 依次点数据包抽屉里不同包的复选框/卡片：`.ext-pkg-current` 文本同步为当前包；包内始终只显示一个包，无多选。
4. **选包必出清单**：点到一个此前未扫描的包后，扩展清单显示其扩展行（不再“当前数据包内未包含扩展条目”）；`actions.onActivePackage` 触发补扫描。
5. **状态行固定**：「共 N 项 / 已选 N/N」所在的 `.ext-list-head` 为 `position:sticky;top:0`，扩展列表滚动时其 `getBoundingClientRect().top` 不变。
6. 展开/收起安装报告（`#extmgr-report-bar` / `#extmgr-report-panel`）：包内选择不得变化，“突然能识别”不得重现。
7. 打开手机数据包列表：`#zone-mobile-close` 可见；点击后 `#app[data-zone-open]` 清空，列表收回。
8. 桌面：同 2/4/5（桌面与手机同一套只读语义），不得出现双选或多选。

## 4. 文件地图

- `src/ui/workbench-view.js`：`isExtensionPackageMode()` / `selectPackageForExtension()`、`renderExtInstalled()`、
  `#extmgr-package-select` change、zone-card checkbox/card/batch 处理器、`closeMobileZonePanel()`。
- `src/ui/workbench-template.js`：zone-card 头部 `#zone-mobile-close`。
- `style.css`：`.ext-pkg-bar` / `.ext-pkg-picker` / `.ext-pkg-current` / `.zone-mobile-close`。
