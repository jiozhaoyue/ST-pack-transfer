# 任务队列三态（日志半展开 → 全展开）（2026-11-17 用户裁定，待实现）

> **状态：⏳ 待实现。** 用户原话：
> “任务队列这个东西不存在独立的，是点日志可以半展开到任务队列，然后再点一下是全展开到日志队列双切换。”

## 1. 契约

- **不存在独立任务队列页**；任务队列是日志面板的半展开态。
- 三态：
  - `0` 收起：只保留底部进度条 `#workbench-progress`。
  - `1` 半展开：显示任务队列（复用 `#log-pane-queue` / `#lq-list`），高度约 `40–45vh`；默认选中队列页签。
  - `2` 全展开：显示完整 `#view-log`，日志/队列双页签可切换。
- 点击底部进度条：`0 → 1 → 2 → 0` 循环。
- 半展开态点「日志」页签：自动升到全展开并显示日志；点「任务队列」保持半展开/全展开均可。
- `#log-close` 关闭回 `0`。
- 不得再出现“独立任务队列视图”或双滚动条。

## 2. 现有文件

- `src/ui/workbench-template.js`：`#view-log`（约 433-465）、`#log-tabs`、`#log-pane-log`、`#log-pane-queue`、`#task-queue`（约 475-478）。
- `src/ui/workbench-view.js`：`state.logTab` / `state.taskQueueItems`（约 423）、`renderLogTab()`（约 5334）、
  `#workbench-progress` 点击 `showPane('log')`（约 7489）、`showPane()`（约 6009）。
- 建议新增 `state.logExpand = 'closed' | 'half' | 'full'`，并在 `syncMainView()` / `renderLogTab()` / 进度条 handler 中统一处理。

## 3. 验收

- 连续点击进度条：收起 → 半展开队列 → 全展开日志/队列 → 收起，状态与高度正确。
- 半展开时只有队列列表一个滚动容器；全展开时日志/队列页签切换正常。
- 手机 390×844 与桌面 1440×900 均无控件被挤出、无双滚动条。
