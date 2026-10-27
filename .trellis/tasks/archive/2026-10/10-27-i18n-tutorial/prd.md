# i18n 文案外置与教程定位

## Goal

全量文案清单 → i18n zh-CN/en-US locale 文件 → UI 零硬编码守卫 → 文案全面优化；教程高亮跟随滚动/缩放/transform 容器。

## Requirements

### 文案全量外置 + i18n

- R1 **全量文案清单**：把 UI 所有用户可见字符串逐条列出，至少覆盖
  `src/ui/workbench-template.js`、`src/ui/workbench-view.js`、`index.js`、
  `src/ui/export-queue.js`、`src/ui/lan-transfer-panel.js`、`src/ui/host-bridge.js`、
  `src/ui/chat-store-*.js`、`src/app/*.js` 中的标题/按钮/占位/空态/帮助/教程/toast/弹窗/错误。
  每条给出：文件:行、现文案、建议 key、建议中文、建议英文。
- R2 **i18n 架构**：新增 `src/i18n/index.js`（`t(key,params)`、语言探测、回退、切换通知）、
  `src/i18n/locales/zh-CN.js`、`src/i18n/locales/en-US.js`。
- R3 **零硬编码**：所有 UI 文案只从 locale 取；新增守卫 `npm run check:i18n`，
  禁止 `src/ui/**`、`index.js`、`src/app/**` 出现中文字面量（locale 文件与注释除外）。
- R4 **语言入口**：自动按 `navigator.language` + `?lang=` + `localStorage`；顶栏加地球按钮切换
  zh-CN / en-US；**不占设置页**（设置仍只 3 个开关）。
- R5 **文案优化**：统一术语（数据包 / 包卡 / 导入区 / 导出区 / 生成导出包 / 写回宿主 / 取件码）；
  删除教学口吻、括号说明、分号长句；说明只进「?」与教程；同一信息只留一个承载点。
- R6 **zh-CN + en-US 全量**：两份 locale 键完全一致、无空值；插值 `{name}` 正常。

### 教程定位

- R7 教程高亮环与卡片以 **overlay 自身矩形**为基准计算（`r.left - overlayRect.left`），
  兼容宿主容器的 `transform`；不再直接用视口坐标。
- R8 监听 `scroll`（capture）、`resize`、目标/overlay 的 `ResizeObserver`，用 rAF 合帧重算。
- R9 目标离开视口时环隐藏、卡片钳制在 overlay 内，不越界；卡片不得遮挡高亮元素。
- R10 demo 先行：滚动图表、缩放窗口、切移动宽度时，环必须跟随目标。

## Constraints

- 不改变任何业务行为；本任务只做文案外置/优化与教程几何。
- 文案 key 使用 `area.component.element`；插值用 `{param}`。
- CSS 双前缀；不改 `src/vendor/`；不新增依赖。
- 修改现有文件用块级 `Edit`；提交用显式 pathspec。

## Acceptance Criteria

- [ ] AC-1 `research/copy-inventory.md` 完整覆盖 R1 所列文件，逐条有建议 key/中/英。
- [ ] AC-2 所有 UI 文案经 `t()`；`npm run check:i18n` 全绿。
- [ ] AC-3 zh-CN / en-US 键完全一致、无空值；插值测试通过。
- [ ] AC-4 顶栏地球按钮切换语言即时生效并持久化；刷新后保持；`?lang=` 可覆盖。
- [ ] AC-5 教程在滚动 / 缩放 / 模拟 transform 容器下高亮跟随，无偏移、无越界。
- [ ] AC-6 文案清单逐条评审通过；面板正文无说明性整句。
- [ ] AC-7 demo 截图 + `npm test` + 五守卫 + `npm run build` 全绿。

## Notes

- 依赖：建议在 `10-27-chart-single-source` 之后（文案键覆盖新增节点）。
- 证据：`HANDOFF-2026-10-27-UI-TRACE.md` §3 P1-4 / P1-2 / P1-3；
  教程几何 `workbench-view.js:849-873`、`1105`；`HANDOFF.md` §八.7（TT `transform` 坑）。
