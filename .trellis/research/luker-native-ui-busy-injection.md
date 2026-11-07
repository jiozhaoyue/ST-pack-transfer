# Real/Dev Luker 原生备份 UI 与插件忙态探针、注入锚点的耦合事实（2026-11-08 实证）

## 宿主侧事实（源码取证，勿再假设）

- **Real Luker 8004（旧版 UI）**：账户面板 `.userBackupButton` 是 `<div class="userBackupButton menu_button menu_button_icon">`；
  点击时宿主 `addClass('disabled')`，**备份弹层 promise resolve 后才 removeClass**（user.js:2470）——
  「弹层开着」期间打开器恒带 disabled 类。备份管理器（`templates/userBackupManager.html` +
  `openBackupManager`）里恢复/复制/导入按钮**空闲时也带** `disabled` 类（未选文件/未生成链接）。
  唯一可靠的「原生导出在途」DOM 信号：`.backupDownloadButton.disabled`
  （`setActionBusy` 仅在备份/恢复进行中加、结束必摘；user.js:1222-1234）。
- **宿主 Popup 生命周期**（popup.js）：裸 `dialog.close()` **不走 `complete()`**——`close` 事件监听只是
  防误关守卫（`#isClosingPrevented` 时 showModal 复原）；只有点 `[data-result]` 控件或 ESC(cancel) 才
  `complete()` → `#hide()`（`closing` 动画，`runAfterAnimation` 500ms 兜底）→ `dlg.close()` + `dlg.remove()` + resolver。
  **绕过它（裸 close + 强制 display:none）的后果**：promise 永久挂起 → 打开器 disabled 永不摘、
  弹层 DOM 永不移除（`popup_background` 类在现行宿主已不存在）。
- **Dev Luker 8003（新数据窗口 UI）**：`.userBackupButton`、`openBackupManager` 均已不存在；
  备份/恢复/迁移在 Data Window（`data-window*.js`，`dw-*` 类名，忙态是 JS 变量无 DOM 标记）；
  `.userBackupManager + .backupActionRow` 现在只剩**日志查看器**在用（user.js:528 openLogsViewer）。
- **两版共同点**：日志查看器弹层都挂 `.userBackupManager` + `.backupActionRow`（Real user.js:1704）——
  「取首个匹配行」会注错容器。

## 插件侧教训（修复提交 `6acd259`）

1. **忙态探针禁止按 className 正则判忙**：宿主把 `disabled` 类当「弹层开着/空闲未选」用。
   探针与点击监视必须分表：`NATIVE_BUSY_PROBES`（状态：st/luker 只认
   `.userBackupManager .backupDownloadButton.disabled`，`stateEncoded` 结构化条目）+
   `NATIVE_EXPORT_TRIGGERS`（点击监视挂触发器本体——点击瞬间还没有忙态标记）。
2. **关宿主弹层必须走宿主完成链路**：点 `surface.querySelector('[data-result]')`；
   裸 `close()` 只作回退；非 dialog 才允许旧兜底（摘 open + display:none）。
3. **注入幂等不能用全局 `getElementById` 早退**：残留弹层里的同名按钮会挡住新弹层注入；
   应「在当前行 → 跳过；不在 → remove 旧按钮并注入当前行」，且行选择器限定
   `:has(.backupDownloadButton)` + 可见过滤（`checkVisibility`，缺 API 时 fail-open）。
4. **不可见的残留弹层一律不判忙**（fail-open 与「探测失败不得阻断拉取」同原则）。

## 验证边界

- 单测 `test/native-busy-close.test.js`（本地专属）13 例锁定上述契约。
- **Real Luker 真机复验未做**（实例未在线；E2E 只许 Dev，而 Dev 是新 UI、症状不在其上）。
  预期：拉取不再被取消；数据与备份每次打开都有注入按钮；原生导出进行中点拉取仍让路（点击监视保留）。
- 新 Data Window UI（Dev）无任何 DOM 忙态标记，`isNativeExportBusy` 恒 false = 依赖点击监视让路，属预期形态。
