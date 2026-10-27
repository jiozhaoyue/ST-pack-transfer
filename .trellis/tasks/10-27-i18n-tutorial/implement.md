# 执行计划：i18n 文案外置与教程定位

## 执行状态（2026-10-27 收口）

- [x] i18n 基础设施 + 主工作台 UI（模板/视图/控制器/设置面板）迁移完成（已提交 `9aed39a`）。
- [x] `lan-transfer-panel.js` / `export-queue.js` / `qr.js` 文案迁移完成，三者已加入守卫 `SCAN_FILES`。
- [x] zh-CN / en-US 键完全一致（各 400+ 键），重复键已清理；`check:i18n` 通过。
- [x] 教程锚点几何 + scroll/resize/ResizeObserver + 单测完成。
- [x] 全量测试不再复现隔离守卫失败（复核 904 passed / 2 skipped / 0 failed）。
- [x] `host-bridge.js` / `chat-store-*.js` / `src/app` / `src/storage` 判定为技术消息，**不纳入 UI 文案守卫**；
      这些文件内的 `dbg()` 调试串统一改英文，避免与被守卫文件混淆。
- [ ] 浏览器截图 / 四宿主复验 —— **用户 2026-10-27 指令明确跳过**（禁止四宿主测、禁止大量测试）。
- 详见 [`HANDOFF-2026-10-27-I18N.md`](../10-26-storage-chart-workbench/HANDOFF-2026-10-27-I18N.md)。


> 依赖：建议在 `10-27-chart-single-source` 之后执行（覆盖新增节点文案）。
> 每批迁移后跑测试，绿了再进下一批。

## 0. 前置

- [x] `implement.jsonl` / `check.jsonl` 至少各一条真实条目。
- [x] `python ./.trellis/scripts/task.py start 10-27-i18n-tutorial`

## 1. 文案清单

- [x] 写一次性提取脚本（输出到 `research/`，不入库）。
- [x] 生成 `research/copy-inventory.md`：文件:行 / 现文案 / 建议 key / 中文 / 英文。
- [x] 人工评审术语与教学口吻，形成最终 key 表。
- [ ] 把清单摘要发给用户过目（重点：删除的说明句、改写的按钮）。

## 2. i18n 基础设施

- [x] `src/i18n/index.js`：`t` / `resolveLocale` / `setLocale` / `onLocaleChange`。
- [x] `src/i18n/locales/zh-CN.js`（全量）。
- [x] `src/i18n/locales/en-US.js`（全量）。
- [x] `test/i18n.test.js`：键一致、插值、探测优先级。
- [x] 顶栏地球按钮 + 切换面板；`renderAll()` 响应语言变化。
- [x] 验证：demo 中/英切换即时生效、刷新保持。

## 3. 分批迁移文案

- [x] `workbench-template.js` 静态文案 → `t()`。
- [x] `workbench-view.js`：HELP、教程、动态渲染、toast。
- [x] `index.js`：toast、弹窗、日志、错误。
- [x] `export-queue.js` / `lan-transfer-panel.js` / `qr.js` 全量迁移并纳入守卫；
  `host-bridge.js` / `chat-store-*.js` 判定为技术消息，不纳入 UI 文案守卫。
- [x] `src/app/*.js` / `src/storage/*.js`：判定为技术消息，不纳入 UI 守卫。
- [ ] 删除面板正文说明性整句；说明只进「?」与教程。
- [x] 每批：定向小测（`vitest run <受影响文件>`）——按用户 2026-10-27 指令不做全量与截图。

## 4. i18n 守卫

- [x] `scripts/i18n-guard.js`（tokenizer 跳注释，禁 CJK）。
- [x] `package.json` 加 `check:i18n`。
- [x] `npm run check:i18n` 全绿；失败样例测试。
- [ ] 把守卫加入收口命令清单与 CI。

## 5. 教程定位

- [x] 抽出纯几何函数 `anchorOf(targetRect, overlayRect, cardSize)`（可单测）。
- [x] `renderTutorial` 改用 overlay 局部坐标。
- [x] scroll(capture) + resize + ResizeObserver + rAF 合帧。
- [x] 目标不可见时环隐藏、卡片钳制。
- [ ] demo 增加「模拟 transform 容器」开关。
- [x] `test/tutorial-anchor.test.js` 单测。
- [ ] 验证：滚动/缩放/移动宽度/transform 下环跟随。

## 6. 收口

- [x] `npm test` 全绿。
- [x] `check:i18n` + 五守卫全绿。
- [x] `npm run build` 通过。
- [ ] demo 截图：中/英、滚动教程、移动宽度、transform —— **用户指令跳过**。
- [x] spec 更新：`.trellis/spec/frontend/` 记录「文案单一源 / i18n 契约 / 教程锚点几何」。
- [x] 显式 pathspec 提交并推送 `origin main`。
- [x] `task.py archive 10-27-i18n-tutorial`。
