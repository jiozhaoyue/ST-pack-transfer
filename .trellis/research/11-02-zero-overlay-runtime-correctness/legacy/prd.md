# 零浮层面板内视图 + 宿主配额实读 + 死控件清理与文案体检

## Goal

消除工作台内全部浮动弹窗，把设置、日志、帮助、确认类交互改为同一面板内的视图切换；
接入 Luker 宿主的真实存储配额读数；清理运行时零调用功能与死代码；完成一轮文案体检；
并保证脱离宿主（独立 Web）形态下同样正确。

## 背景事实（2026-11-02 取证）

- **配额定死**：`index.js` 初始化固定传 `view.setStorage({ host: null })`，
  因此 `workbench-view.js` 的 `renderQuota()` 永远落到 `quota.hostEmpty`（「当前宿主无逐项读数」）。
  Luker 宿主自带 `/scripts/storage-inspector.js`，其 `RestProvider({kind:'self'}).fetch([])`
  返回 `{ quota: { usedBytes, quotaBytes, over } }`；本仓 `host-bridge.js` 已动态加载该模块
  用于 `openStorageInspector()`，只差把读数接出来。
- **两个拉取按钮无反应**：空态「读取宿主数据」(`#btn-empty-fetch`) 与执行卡「从宿主拉取」(`#btn-fetch`)
  都会先走流量确认 `openModal(...)`；该模态在 Luker 下只显示暗色遮罩、内容不可见，于是表现为「点了没反应」。
- **设置与日志同源**：设置走同一个 `openModal`；日志是独立的 `#log-overlay`（`position:fixed`），
  在 Luker 下定位失效、落到左上角。与 TauriTavern 已登记的同类故障一致
  （journal Session 55：`html` 带 transform 时固定定位浮层塌陷）。
- **未接线功能**：`renderExtensionInstallerModal`（host-bridge，约 300 行）全仓零调用。
- **仓库分发已收敛**：测试 / E2E / 守卫脚本 / 测试固件与 6 个运行时零引用模块已于 `05ac9eb`
  取消跟踪并从远端移除，本地文件保留。

## Requirements

### R1 零浮层（面板内视图）
- R1.1 设置、日志、帮助、确认（流量 / 删除 / 恢复 / 合并冲突 / 私有件 / 清空队列）一律改为
  `#app.app-container` 内的视图切换，不再使用 `#modal-overlay` / `#log-overlay` / `#help-popover`。
- R1.2 面板内不得再出现 `position:fixed` 的业务浮层；`#fullname-pop` 与 `#toast` 改为面板内
  绝对定位，随面板边界裁剪。
- R1.3 教程全屏引导按用户 2026-11-02 裁定**保留**，不并入视图系统。

### R2 视图切换契约
- R2.1 顶栏「设置 / 日志 / 帮助」进入对应视图；视图内有「返回」回到工作台；Esc 亦返回。
- R2.2 同一时刻只显示一个视图；返回后勾选状态、图表展开状态与滚动位置不丢失。
- R2.3 确认视图复用原 `openModal(title, desc, extraHtml, actions)` 调用形态，调用方零改动。

### R3 宿主配额实读
- R3.1 Luker：经宿主 `Storage Inspector` 模块的 `RestProvider` 读取 `usedBytes` / `quotaBytes`，
  配额行显示真实读数与百分比；`quotaBytes` 为空表示不限，显示已用量。
- R3.2 读取失败、模块不可用或宿主不支持（ST）时，显示明确文案，不得再出现「当前宿主无逐项读数」这类误导表述。
- R3.3 独立 Web 形态不做宿主读取，宿主配额行按「无宿主」处理。

### R4 死代码与未接线功能
- R4.1 删除 `renderExtensionInstallerModal` 及其**仅被其使用**的私有辅助函数；被其它路径复用的函数保留。
- R4.2 删除模板与样式中与已移除浮层对应的死 CSS 与死节点。

### R5 文案体检
- R5.1 面板正文短句化，说明性内容只留在帮助视图与教程。
- R5.2 `npm run check:copy`、`npm run check:i18n` 全绿；中英文案同步。

### R6 脱离宿主运行正确
- R6.1 独立 Web 形态下：设置 / 日志 / 帮助 / 确认视图全部可用；宿主相关动作给出明确提示。
- R6.2 `npm test` 全绿（本地文件），`npm run build` 成功；独立 Web 用浏览器实测验证。
  **注**：现存 `e2e:web` 的 23 个 spec 写于 2026-10-27 UI 重写之前（「计划预览 / 动作 pill /
  高级视图」），与现行图表工作台不符，不作为本轮门槛，待单独重写。

## Acceptance Criteria

- [ ] Luker 中点击「读取宿主数据」或「从宿主拉取」，直接进入面板内流量确认视图；确认后开始拉取，
      全程无固定定位遮罩、无不可见模态。（代码路径已改；待 Dev Luker 8003 实机复验）
- [x] 「设置」「日志」「帮助」均在面板内切换，日志不再出现在左上角；返回后工作台状态保持。
- [ ] 配额行在 Luker 显示真实 `used / total` 与百分比；读取失败时文案准确。（独立 Web 已验证文案；Luker 实读待复验）
- [x] 独立 Web 形态：上述视图全部可用，宿主动作给出提示，无控制台报错。
- [x] `renderExtensionInstallerModal` 确认仍有调用方，改为挂在面板内；6 个运行时零引用模块已取消跟踪。
- [x] `npm run check:copy`、`check:i18n`、`check:control-consumer`、`check:css-scope`、
      `check:template-source`、`check:dom-injection`、`check:dom-scope` 全绿。
- [x] `npm test` 全绿（926 passed / 2 skipped）；`npm run build` 成功。

## 约束

- 遵守 CSS 双前缀铁律，配色只用宿主令牌。
- 不改宿主源码；不写本地实例目录。
- 文档 / 注释 / 回复中文。
