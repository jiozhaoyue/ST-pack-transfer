# 执行跟踪清单：10-30-production-readiness

> 遵循 L0-2 铁律：复选框随执行实时勾选，禁止任务结束后凭记忆批量补勾。

- [x] 阶段 1：图表树展开/折叠防跳顶修复（`workbench-view.js` 滚动状态精细化保留与回填）
- [x] 阶段 2：导出行重构（从树行中移除，移入卡片头 `.vol-head` 旁边）
- [x] 阶段 3：设置面板增加导出偏好默认项与持久化（`settings-panel.js`, `settings-store.js`, `workbench-view.js`）
- [x] 阶段 4：目标宿主品牌主题色联动（`style.css`, `workbench-view.js` 设置 `data-target-host`）
- [x] 阶段 5：双通道首屏空态向导与流量保护交互（消除灰色不可用卡片）
- [x] 阶段 6：GitHub Actions 部署工作流定稿为正式 Release 触发（`.github/workflows/deploy.yml`）
- [x] 阶段 7：文案审查与守卫验证（`npm run check:copy`, `npm run check:i18n`, `npm run check:control-consumer`，定向测试）
