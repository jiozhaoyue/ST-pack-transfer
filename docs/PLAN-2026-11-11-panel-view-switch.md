# PLAN-2026-11-11 · 视图切换移入面板头 + 文档同步铁律

> 来源：2026-11-11 用户裁定。**切换在「存储图表 / 扩展管理」各自的面板头里，不在全局页头，也不是页头下另一行。**

## 目标

1. 桌面端：`存储图表 / 扩展管理` 变成**面板头内的切换按钮**（沿用扩展管理面板头的拼图图标），
   页头下方那一条独立切换行 `#view-switch` 整行删除。
2. 手机端：同样在面板头内切换（存储图表 / 数据包 / 扩展管理）；面板头改为两行——
   上一行是切换按钮，下一行是原面板按钮（图表偏好/帮助；扩展管理页签/关闭；数据包帮助）。
3. 项目铁律新增：**每次功能更新必须同一次提交内同步更新开发者文档与 README**。

## 判据

- 桌面 DOM 中不存在 `#view-switch` 独立行；`#top-actions` 之下直接是 `.app-main`。
- 三个面板头（`#chart-card` / `#extension-view` / `#zone-card`）各有一个 `[data-view-switch]` 宿主；
  桌面只渲染 2 项且 `#zone-card` 的宿主为空且 `hidden`；手机每个宿主渲染 3 项。
- 激活项与 `state.mainView` / `state.mobileView` 一致，切换后当前面板内容随之切换。
- 手机端面板头视觉上两行：第一行切换按钮、第二行原按钮；控件文字不拆行、无横向溢出。
- 六守卫全绿；目标测试通过；4173 静态预览多宽度取证。

## 改点

| 文件 | 改动 |
| --- | --- |
| `src/ui/workbench-template.js` | 删除 app-body 的 `#view-switch` 行；三个面板头加 `panel-head--switch` 与 `[data-view-switch]` 宿主；删除被切换按钮取代的 `.panel-title`（zone 保留标题，手机隐藏） |
| `src/ui/workbench-view.js` | `renderViewSwitch()` 渲染到全部宿主（图标 + 文字，aria-pressed）；点击委托从 `#view-switch` 改到 `#view-workbench`；教程锚点改 `#chart-card [data-view-switch]` |
| `style.css` | 旧 `.view-switch` 行样式改为面板头内样式；新增手机两行布局规则 |
| `docs/DEVELOPER-GUIDE.md`、`README.md` | 同步视图切换入口描述 |
| `.trellis/spec/frontend/workbench-single-view.md` | §15.3 行序与入口契约更新 |
| `.trellis/spec/guides/iron-rules.md`、`CLAUDE.md`、`AGENTS.md` | 新增「功能更新必须同步文档与 README」 |

## 依赖与顺序

1. 模板 → 2. 渲染/事件 → 3. CSS → 4. 本地验证脚本选择器 → 5. 文档与铁律 → 6. 测试/守卫/预览取证。

## 状态

- [x] 现状定位与用户裁定对齐
- [ ] 模板改造
- [ ] 渲染与事件
- [ ] CSS
- [ ] 验证脚本
- [ ] 文档与铁律
- [ ] 测试与预览取证
