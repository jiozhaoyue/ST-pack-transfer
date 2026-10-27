# 执行计划：i18n 文案外置与教程定位

## 执行状态（2026-10-27 交接）

- [x] i18n 基础设施 + 主工作台 UI（模板/视图/控制器/设置面板）迁移完成（**未提交**）。
- [x] zh-CN / en-US 各 293 键、键一致；`check:i18n` 通过。
- [x] 教程锚点几何 + scroll/resize/ResizeObserver + 单测完成。
- [ ] `lan-transfer-panel.js` / `export-queue.js` / `qr.js` 文案未迁移（仍含中文，英文模式会显示中文）。
- [ ] `host-bridge.js` / `chat-store-*.js` / `src/app` / `src/storage` 技术消息未迁移（待用户裁定是否纳入）。
- [ ] 全量测试有 1 个隔离守卫失败（单跑通过，未定位）。
- [ ] 浏览器截图 / 四宿主复验。
- 详见 [`docs/HANDOVER-2026-10-27-i18n.md`](../../../docs/HANDOVER-2026-10-27-i18n.md)。


> 依赖：建议在 `10-27-chart-single-source` 之后执行（覆盖新增节点文案）。
> 每批迁移后跑测试，绿了再进下一批。

## 0. 前置

- [ ] `implement.jsonl` / `check.jsonl` 至少各一条真实条目。
- [ ] `python ./.trellis/scripts/task.py start 10-27-i18n-tutorial`

## 1. 文案清单

- [ ] 写一次性提取脚本（输出到 `research/`，不入库）。
- [ ] 生成 `research/copy-inventory.md`：文件:行 / 现文案 / 建议 key / 中文 / 英文。
- [ ] 人工评审术语与教学口吻，形成最终 key 表。
- [ ] 把清单摘要发给用户过目（重点：删除的说明句、改写的按钮）。

## 2. i18n 基础设施

- [ ] `src/i18n/index.js`：`t` / `resolveLocale` / `setLocale` / `onLocaleChange`。
- [ ] `src/i18n/locales/zh-CN.js`（全量）。
- [ ] `src/i18n/locales/en-US.js`（全量）。
- [ ] `test/i18n.test.js`：键一致、插值、探测优先级。
- [ ] 顶栏地球按钮 + 切换面板；`renderAll()` 响应语言变化。
- [ ] 验证：demo 中/英切换即时生效、刷新保持。

## 3. 分批迁移文案

- [ ] `workbench-template.js` 静态文案 → `t()`。
- [ ] `workbench-view.js`：HELP、教程、动态渲染、toast。
- [ ] `index.js`：toast、弹窗、日志、错误。
- [ ] `export-queue.js` / `lan-transfer-panel.js` / `host-bridge.js` / `chat-store-*.js`。
- [ ] `src/app/*.js` 与用户可见错误消息。
- [ ] 删除面板正文说明性整句；说明只进「?」与教程。
- [ ] 每批：`npm test` + demo 截图。

## 4. i18n 守卫

- [ ] `scripts/i18n-guard.js`（tokenizer 跳注释，禁 CJK）。
- [ ] `package.json` 加 `check:i18n`。
- [ ] `npm run check:i18n` 全绿；失败样例测试。
- [ ] 把守卫加入收口命令清单与 CI。

## 5. 教程定位

- [ ] 抽出纯几何函数 `anchorOf(targetRect, overlayRect, cardSize)`（可单测）。
- [ ] `renderTutorial` 改用 overlay 局部坐标。
- [ ] scroll(capture) + resize + ResizeObserver + rAF 合帧。
- [ ] 目标不可见时环隐藏、卡片钳制。
- [ ] demo 增加「模拟 transform 容器」开关。
- [ ] `test/tutorial-anchor.test.js` 单测。
- [ ] 验证：滚动/缩放/移动宽度/transform 下环跟随。

## 6. 收口

- [ ] `npm test` 全绿。
- [ ] `check:i18n` + 五守卫全绿。
- [ ] `npm run build` 通过。
- [ ] demo 截图：中/英、滚动教程、移动宽度、transform。
- [ ] spec 更新：`.trellis/spec/frontend/` 记录「文案单一源 / i18n 契约 / 教程锚点几何」。
- [ ] 显式 pathspec 提交并推送 `origin main`。
- [ ] `task.py archive 10-27-i18n-tutorial`。
