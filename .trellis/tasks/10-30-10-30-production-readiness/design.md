# 技术设计方案：10-30-production-readiness

## 1. 架构目标与约束

本方案旨在闭环阻碍 ST-pack-transfer 正式上线的最关键缺陷，并在零新增独立浮层的前提下完成交互体验与发布治理的最终定稿：
- **零跳顶**：解决图表树展开/折叠时 DOM 重构导致的滚动丢失问题；
- **排版降噪**：将侵入树内的导出行移至包卡头，恢复树结构整洁度；
- **偏好闭环**：设置面板增加导出偏好默认项，并持久化到 localStorage；
- **视觉归位**：恢复基于目标宿主品牌色的强调色联动（ST红/Luker板岩/TT黄/PT紫）；
- **首屏自愈**：双通道空态引导卡代替死灰置灰卡，不自动偷跑后端流量；
- **安全发布**：GitHub Pages 仅对正式 Release 构建，严格屏蔽隐私信息。

---

## 2. 核心模块重构设计

### 2.1 图表树防跳顶机制 (Scroll & Focus Preservation)
- **问题根因**：`renderChart()` 调用 `stack.innerHTML = html` 破坏了所有旧 DOM，虽然保存了 `stack.scrollTop`，但：
  1. 每一张卡片内部的 `.chart-tree` 拥有自己的 `overflow: auto`，其 `scrollTop` 被无声重置为 0；
  2. 移动端/窄屏下外层可能滚动，仅恢复 `stack` 无法覆盖子级滚动丢失。
- **设计实现**：
  ```javascript
  // 渲染前：采集全部滚动容器状态
  const stack = document.getElementById('chart-stack');
  const stackScroll = stack ? { top: stack.scrollTop, left: stack.scrollLeft } : null;
  const treeScrollMap = new Map();
  stack?.querySelectorAll('.vol-card')?.forEach(card => {
    const key = card.dataset.volkey;
    const tree = card.querySelector('.chart-tree');
    if (key && tree) {
      treeScrollMap.set(key, { top: tree.scrollTop, left: tree.scrollLeft });
    }
  });

  // 渲染后：精细回填
  stack.innerHTML = html;
  if (stackScroll) {
    stack.scrollTop = stackScroll.top;
    stack.scrollLeft = stackScroll.left;
  }
  stack.querySelectorAll('.vol-card').forEach(card => {
    const key = card.dataset.volkey;
    const tree = card.querySelector('.chart-tree');
    if (key && tree && treeScrollMap.has(key)) {
      const pos = treeScrollMap.get(key);
      tree.scrollTop = pos.top;
      tree.scrollLeft = pos.left;
    }
  });
  ```

### 2.2 导出行移位至卡头 (.vol-head extension tools)
- **旧结构**：`groupToolsOf(o)` 动态塞入 `group:extensions` 树行内部。
- **新结构**：
  - 在 `chartCardHtml(o)` 的 `.vol-head` 中，紧随 `o.capText` 与 `o.totalText` 之后直接内联渲染 `o.extToolsHtml`；
  - 清除 `groupToolsOf(o)` 对 `group:extensions` 的侵入；
  - 样式适配：`.vol-head .extension-tools` 设为 `display: inline-flex; align-items: center; gap: 6px;`，并随卡头紧凑收纳，超出时自适应换行。

### 2.3 设置面板默认项与设置存储扩展
- **`src/ui/settings-panel.js`**：
  扩展 `SETTINGS_DEFAULTS`：
  ```javascript
  export const SETTINGS_DEFAULTS = Object.freeze({
    keepExport: true,
    trafficPrompt: true,
    autoTutorial: true,
    defaultExtensionMode: 'full',   // 'full' | 'manifest'
    defaultGitMode: 'minimal',      // 'keep' | 'minimal' | 'strip'（默认：仅保留更新所需）
    defaultKeepDev: false,          // 默认未勾选保留构建配置
  });
  ```
  在设置面板 HTML 中增加对应的选择表单；
- **`src/ui/workbench-view.js`**：
  读取设置面板初始值时，将 `state.extensionMode`、`state.gitMode`、`state.keepDev` 初始化为用户的持久化默认值。

### 2.4 目标宿主品牌强调色联动
- 在 `workbench-view.js` 的 `setTarget(target)` 与初始化阶段：
  通过 `targetCodeOf(state.target)` 获得宿主码 `hostCode`，设置在 `#app.app-container` 上的 `data-target-host="${hostCode}"`；
- 在 `style.css` 中注入 CSS 变量联动规则，使 `accent-color: var(--accent)` 与各类徽标、选中态按目标平台呈现主题色彩。

### 2.5 双通道空态卡 (Dual-Channel Empty State)
- 当 `targets` 仅含 `target.host` 且 `!(state.hostTree && state.hostTree.length)` 时：
  渲染 `emptyGuideHtml()`：
  - 左通道：读取当前宿主（显式按钮，受流量提示保护，绝不静默启动）；
  - 右通道：导入数据包（引导从右侧面板或拖拽导入）。

### 2.6 Release 触发部署工作流
- 修改 `.github/workflows/deploy.yml`：
  ```yaml
  on:
    release:
      types: [published]
    workflow_dispatch:
  ```
  保证只有经过正式发版并打标签时才触发构建上线。
