# 响应式与美观铁律

> 来源：用户 2026-11-12 指令——「任何响应式的绝对不允许任何不美观的响应，绝对优先保持美观，
> 不为任何屏幕要塞下而硬做，也不能显示不全」。

## 1. 判据（违反即返工）

1. **不压扁**：任何控件不得被 `flex-shrink` 压到文字不可读、图标变形。控件的尺寸是 `flex:0 0 auto`
   或 `min-width:max-content`；宁可让容器换行/堆叠/滚动。
2. **不裁切**：功能性文字（按钮、下拉选中项、状态、读数）不得被 `overflow:hidden` 截断。
   内容型长文本（文件名、路径、URL）优先换行多行；确需单行时**必须** `text-overflow:ellipsis`
   且同一元素可读到完整值（`title`/详情区）。
3. **不塞**：放不下就**少显示**，不是压小。允许的退让顺序：
   ① 换行 / 堆叠 / 容器滚动 → ② 整块隐藏次要信息 → ③ 纯图标（带 `aria-label` + `title`）。
   **禁止** ①`line-clamp` 裁掉功能性文案 ②缩小字号硬塞 ③把两列压成一列细条。
4. **不出现半截**：隐藏/切换必须整块生效；不得出现半个字符、半个按钮、被盖住的 0 高度面板。
5. **唯一滚动容器**：手机形态只有 `.app-main` 滚动；内部面板 `overflow:visible`，避免「第二个滚动条」。

## 2. 现有实现落点

| 场景 | 做法 | 落点 |
| --- | --- | --- |
| 底部视图切换行 | 行内 `flex-wrap:nowrap`；溢出即整行退化为纯图标（保留可读标签） | `.view-switch.is-icon-only`、`applySwitchDensity()` |
| 图表卡片空间不足 | 优先隐藏占用可视化，标题与勾选保留 | `.vol-card.is-tight .vol-chart`、`initChartTight()` |
| 图表控制行 | 容器 `flex-wrap:wrap`，控件 `flex:0 0 auto` | `.chart-controls` |
| 教程按钮行 | `flex-wrap:wrap`，按钮不缩 | `.tutorial-card .acts` |
| 手机左右切换条 | 标签 `min-width:max-content`，绝不省略号 | `.mobile-switch .msw` |
| 手机空态文案 | 完整多行，不 `line-clamp` | `[data-view="mobile"] .empty-guide-card .guide-desc` |
| 手机下拉 | 可占满整行，不限制到截断 | `[data-view="mobile"] .field select{max-width:100%}` |

## 3. 已知不受本条约束的例外

- 列表行里的**单个超长标识**（包名、路径、URL、提交信息）使用单行省略号是刻意选择：
  行高与对齐必须稳定；但必须能通过详情区/`title` 读到完整值。
- `#app.app-container[data-view="mobile"]` 的**布局切换**（例如视图切换整行换到面板头第一行）
  属于容器级重排，不是「控件内文字换行」。
