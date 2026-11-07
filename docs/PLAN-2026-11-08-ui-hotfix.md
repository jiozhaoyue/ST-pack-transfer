# PLAN-2026-11-08 · UI 全面异常热修（最小侵入）

## 背景

- 用户报告：**UI 全部异常**（2026-11-08）。要求：本地 dev 运行测试，完全修复。
- 上游变更：Session 64（`1533ac3`）接回四项能力——断点续传（`src/app/conversion-runner.js`）、
  暂停/继续/中止、转换报告（`view.showReport`）、待导出区（`ExportQueue` + `#pending-exports`），
  且交接明记**未做真实浏览器实测**。单测 961 passed / 2 skipped 全绿 ⇒ 错误在浏览器运行时层。

## 约束

- 最小侵入：只修导致异常的最小集合，不顺手重构；块级 Edit，禁整文件覆盖。
- dev 端口避开保留段与被占的 3040（用 5173 显式端口）。
- 完全修复 = 真机（浏览器）复验通过 + `npm test` 全绿 + 三守卫 + `npm run build` 通过。

## 步骤

- [x] 1. 起 dev server（5173），browser 打开独立页，采集：截图 + console 报错 + DOM 缺口
- [x] 2. 定位根因（见下）
- [x] 3. 最小侵入修复（Edit 块级，共 2 行），逐项复验 UI
- [x] 4. 回归：npm test + check:css-scope / check:dom-injection / check:template-source + build
- [x] 5. 提交推送（显式 pathspec），更新本计划勾选，mini-trellis 记录会话

## 结论（已验证）

**根因（唯一、系统性）**：`index.js:992` 向 `createWorkbenchView` 传入的 actions 对象里，
待导出区两个动作写成简写属性 `pendingDownload,` / `pendingStash,`，而控制器内这两个函数
实际名为 `downloadPending` / `stashPending` → 构造对象时抛
`ReferenceError: pendingDownload is not defined` → `main()` 在视图构造后当场死亡 →
其后全部接线未执行：宿主徽标 / 文件监听 / `syncPackages` / 动作行按钮（生成·拉取·合并）/ LAN / 配额 / 日志订阅全灭。
单测全绿（961 passed）不拦它：`index.js` 的 DOM 接线层无单测覆盖。

**修复**：`index.js:992-993` 改为 `pendingDownload: downloadPending,` / `pendingStash: stashPending,`（2 行）。

**真机验证（localhost:5173，IAB）**：
- 初始化零未捕获异常；`count-import/export` 由模板占位 4/1 变为真实 0/0；
- 动作行按钮齐全（从宿主拉取 / 生成导出包[无勾选时正确禁用] / 合并上传 / 局域网互传 / 云端仓库）；
- 配额条真实读数（0.0 GB / 220.1 GB · 0%）、宿主配额「未提供」、Web 徽标、ST 图标正常；
- 冒烟：导入↔导出页签切换 ✓、设置视图打开 ✓、日志视图「工作台已就绪 · Web」✓。

**回归**：`npm test` 961 passed / 2 skipped；三守卫全过；`npm run build` ✓。

**附注**：排查中 fullPage 截图出现「工作台 4 份平铺」为 IAB 截图对 fixed 元素的伪影，非产品 bug（DOM 仅 1 份、命中测试干净）。
**教训**：新增接线引用既有函数时必须先确认函数名；actions 简写属性是这类 ReferenceError 的高发位，且会以「整页半残」形态出现。

---

# §2 插件态热修：从宿主拉取被永久取消 + 注入按钮消失（2026-11-08 第二批）

## 现象（Real Luker 实测，frontend-log-manager 日志）

1. 做过一次原生导出后，点「从宿主拉取」必被取消（WARN `宿主原生导出优先，插件拉取已取消`）；
2. 此后到 账户 → 数据与备份（Backup & Restore 弹层），插件注入的「从宿主拉取」按钮不再出现。

## 根因（两症状同根，均经宿主源码取证）

**关键宿主事实（Real Luker 8004，旧版 UI）**：
- 账户面板 `.userBackupButton` 点击时宿主 `addClass('disabled')`，**弹层 promise resolve 后才 removeClass**
  （user.js:2470）——即弹层开着 = 打开器带 disabled 类；管理器里恢复/复制按钮**空闲时也带** `disabled` 类。
- 宿主 Popup 的裸 `dialog.close()` **不走 `complete()`**（closeListener 只是防误关守卫）；
  只有 `[data-result]` 控件点击 / ESC(cancel) 才会 complete → 动画后 `dlg.remove()` + resolver。

- **症状 A**：旧 `isNativeExportBusy` 按 className 正则（busy|loading|generating|disabled）判忙 →
  把「弹层开着/空闲态」的 `disabled` 类误判成「原生导出在途」→ 拉取被取消；
  且我们 `closeNativeBackupUi` 用裸 `close()`+强制 `display:none` 绕过 Popup 生命周期 →
  promise 永久挂起 → 打开器的 `disabled` 类永不摘除 → **此后每次拉取都被取消**。
- **症状 B**：同一次裸关让弹层 DOM 永久残留 → `mountLukerBackupManagerButton` 的全局
  `getElementById` 幂等检查命中残留按钮 → 新弹层不再注入。
- **放大器**：日志查看器弹层**同样**用 `.userBackupManager + .backupActionRow`（Real/Dev 的 user.js 均如此），
  「取首个动作行」会注错容器；Dev Luker（新数据窗口 UI）已无 `.userBackupButton`，旧选择器全部落空。

## 修复（全部在 `src/ui/host-bridge.js`，4 处）

1. **探针/点击监视分表**：新增 `NATIVE_BUSY_PROBES`（状态探针）与 `NATIVE_EXPORT_TRIGGERS`（点击监视）分离。
   st/luker 的在途探针只认 `.userBackupManager .backupDownloadButton.disabled`
   （`setActionBusy` 仅在备份/恢复进行中加、结束必摘——唯一可靠信号）；
   tt/pt 仍探触发器本体但只认 `disabled` 属性/`aria-busy`/`data-busy`。
2. **`isNativeExportBusy`**：结构化探针条目（`stateEncoded`）；加 `checkVisibility` 可见过滤
   （已关未移除的残留弹层放行）；排除自家注入按钮；**删除 className 正则**。
3. **`closeNativeBackupUi`**：优先点宿主自己的 `[data-result]` 完成控件（走 complete → 动画移除 → promise resolve），
   裸 `close()` 只作回退，非 dialog 才用旧兜底；锚点改为管理器按钮优先；删除 `.popup_background` 盲扫
   （现行宿主无此类，纯死代码）。
4. **注入自愈**：`mountLukerBackupManagerButton` 只认**含 `.backupDownloadButton` 的可见动作行**
   （日志弹层行排除），残留在旧弹层的同名按钮 `remove()` 后注入当前行；
   `openNativeBackupUi('luker')` 的 `.userBackupManager` 判定同步加 `:has(.backupDownloadButton)` 限定。

## 验证

- 新增 `test/native-busy-close.test.js`（本地专属）13 例：真信号命中 / 打开器 disabled 不误判 /
  残留弹层放行 / 自家按钮不自证 / tt-pt 属性判据 / 三级关闭兜底 / 锚点优先级 /
  注入行限定 / 陈旧按钮搬家 / 已在当前行不重注 / 无行静默。
- `npm test` **974 passed / 2 skipped**（+13）；三守卫 + `npm run build` 全过。
- **未做**：Real Luker 真机复验（实例未在线；且只允许 Dev 跑 E2E——Dev 是新 UI，症状本就不在其上）。
  用户下次在 Real 实测预期：拉取不再被取消、数据与备份弹层每次打开都有注入按钮、
  原生导出进行中点拉取仍会让路（点击监视保留）。
