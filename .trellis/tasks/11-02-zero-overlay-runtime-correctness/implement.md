# 执行清单：零浮层面板内视图

> 复选框随执行实时勾选（L0-2）。

## 阶段 1：模板结构
- [x] `.app-body` 包裹 `main.app-main`，新增 `#view-settings` / `#view-log` / `#view-help` / `#view-confirm`
- [x] 删除 `#modal-overlay` / `#log-overlay` / `#help-popover` / `#fullname-pop` 节点
- [x] 保留 `#tutorial-overlay`；`#toast` 移入 `#app` 内绝对定位

## 阶段 2：视图切换与接线
- [x] `workbench-view.js` 增加 `showPane` / `backToWorkbench`
- [x] `openModal` / `closeModal` 改为渲染确认视图
- [x] 日志按钮 / 关闭 / Esc 改为视图切换
- [x] 帮助 `?` 改为帮助视图
- [x] `openSettings` 改为 `view.openSettingsView(...)`；修复被误插进 onClick 的 `modalRefreshHook`
- [x] 全名提示改面板内 toast（删除固定定位浮层）

## 阶段 3：宿主配额
- [x] `host-bridge.js` 新增 `readHostStorageQuota()`（Storage Inspector RestProvider）
- [x] `index.js` 初始化时读取并传入 `view.setStorage`
- [x] 配额行支持 `total: null`（不限）
- [x] 文案改为「宿主未提供存储读数」等准确表述

## 阶段 4：死代码
- [x] 确认 `renderExtensionInstallerModal` 仍被恢复流程调用 ⇒ 不删除，改为挂在面板内（absolute）
- [x] 取消跟踪 6 个运行时零引用模块与开发预览页（`05ac9eb`）
- [x] 清理对应死 CSS 与节点

## 阶段 5：文案
- [x] 帮助视图与设置视图文案短句化
- [x] 中英文案同步

## 阶段 6：验证
- [x] `npm test`（926 passed / 2 skipped；隔离测试并行超时、单跑通过）
- [x] 七项守卫
- [x] `npm run build`
- [x] `npm run e2e:web`（**注**：现存 23 个 spec 是 10-27 重写前的旧设计——「计划预览 / 动作 pill / 高级视图」，与现行图表工作台不符；本轮改用 Playwright 直接验证独立 Web 的视图切换，见下条）
- [x] 浏览器实测（Playwright + 本机 dev server）：设置/日志/帮助均为面板内 `static` 视图，旧浮层节点为 0，配额文案正确，零控制台错误
- [ ] Luker 实机：两个拉取按钮 / 设置 / 日志 / 确认 / 配额行（需启动 Dev Luker 8003）
