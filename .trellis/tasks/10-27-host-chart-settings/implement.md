# 执行计划：宿主图表置灰与设置收敛

## 执行状态（2026-10-27 交接）

- [x] 代码主体完成（提交 `00dc830`）。
- [x] 新增测试与六守卫通过（最后一次全量）。
- [ ] 浏览器截图 / 四宿主复验（预览工具当时不可用）。
- [ ] `task.py archive`（状态收口）。
- 详见 [`HANDOFF-2026-10-27-I18N.md`](../10-26-storage-chart-workbench/HANDOFF-2026-10-27-I18N.md)。


> 顺序执行；每一步完成后跑对应验证，绿了再进下一步。

## 0. 前置

- [ ] 检索先行（GitHub API / WebSearch）记录到 `research/`（本任务已做：SillyTavern 扩展机制）。
- [ ] 回填 `implement.jsonl` / `check.jsonl` 至少各一条真实条目。
- [ ] `python ./.trellis/scripts/task.py start 10-27-host-chart-settings`

## 1. 宿主图表

- [ ] 删除 `workbench-view.js:417` 的 notice 文案。
- [ ] `chartCardHtml` 增加 `disabled`；host 目标按 `mode/hostTree/readable` 判定。
- [ ] `style.css` 加 `is-disabled` 灰化规则（双前缀）。
- [ ] demo 切 ST / 独立 Web 验证：灰化、不可勾选、无说明文案、浏览器配额可见。
- [ ] 验证：`npm test` + `npm run check:css-scope`。

## 2. 设置面板抽取

- [ ] 新建 `src/ui/settings-panel.js`（3 项 HTML + 读取）。
- [ ] 新建 `src/ui/settings-store.js`（load/save/默认值）。
- [ ] `index.js` 的 `openSettings()` 改用共享模块。
- [ ] `ui-demo.html` 的 `actions.settings` 改用共享模块。
- [ ] 设置按钮 SVG 换齿轮。
- [ ] 验证：demo 打开设置 → 恰好 3 行；截图。

## 3. 接线与持久化

- [ ] `index.js` 启动 `loadSettings()`；保存 `saveSettings()`。
- [ ] `keepExport` 接入 `generate()`（不保留时不入导出区，直接下载）。
- [ ] `trafficPrompt` 接入 `fetchFromHost()` / `restoreSelected()`；`confirmTraffic` 暴露到视图。
- [ ] `autoTutorial` 接入自动打开逻辑（index.js + demo）。
- [ ] 验证：三项各自开/关行为；刷新后保留。
- [ ] 补单测：`test/settings-store.test.js`、`test/settings-panel.test.js`。

## 4. 收口

- [ ] `npm test` 全绿。
- [ ] `npm run check:css-scope` / `check:dom-injection` / `check:template-source` / `check:dom-scope` / `check:control-consumer` 全绿。
- [ ] `npm run build` 通过。
- [ ] demo 截图：设置 3 项、齿轮、宿主灰化、浏览器配额。
- [ ] spec 更新：`.trellis/spec/frontend/` 记录设置承载边界与宿主图表降级契约。
- [ ] 显式 pathspec 提交并推送 `origin main`。
- [ ] `task.py archive 10-27-host-chart-settings`。
