# 设计：宿主图表置灰与设置收敛

## 1. 宿主图表降级

### 现状

- `renderChart()` 对 host 目标输出 `noticeHtml`（`workbench-view.js:417`），但图表卡仍按普通卡渲染。
- `hostNodes()` 返回 `{ unavailable, nodes: state.hostTree || [] }`（`workbench-view.js:68-70`）。
- 生产 `index.js` 从未调用 `view.setHostTree()`，所以插件内宿主树为空；demo 提供演示树。
- `HOSTS.st.readable=false`；其它宿主 `readable=true`。

### 设计

- 删除 `noticeHtml` 那段文案，不保留任何替代说明句。
- `chartCardHtml(o)` 新增 `disabled` 选项：
  - 根节点加 `is-disabled` 类；
  - `renderTreeRows(..., readonly=true)` 并禁用复选框；
  - 禁用展开/收起？保留展开以查看空树无意义；`disabled` 时隐藏 `tree-tools` 的勾选按钮，避免死控件。
  - 加 `aria-disabled="true"`。
- 判定 `disabled = t.host && (state.mode==='web' || !HOSTS[state.host].readable || !state.hostTree?.length)`。
- 「浏览器配额」行由 `renderQuota()` 独立渲染，不受影响。
- 不新增任何 endpoint / host bridge 能力。

### 样式

```css
#app.app-container .vol-card.is-disabled { opacity: .55; filter: grayscale(1); }
#app.app-container .vol-card.is-disabled .tree-check { cursor: not-allowed; }
```

## 2. 设置面板抽取

### 新模块 `src/ui/settings-panel.js`

```js
export const SETTING_KEYS = ['keepExport', 'trafficPrompt', 'autoTutorial'];
export function buildSettingsHtml(settings) { /* 3 行开关 */ }
export function readSettings(root) { /* 从 DOM 读 */ }
```

- `index.js` 的 `openSettings()` 改为调用 `view.openModal(...)`，内容来自 `buildSettingsHtml`。
- `ui-demo.html` 的 `actions.settings` 改为同一个模块；这样 demo 与正式完全同源。
- 动态控件不再散落在 `index.js`，`check:control-consumer` 可扩展到该模块。

### 持久化 `src/ui/settings-store.js`

```js
const KEY = 'st-pack-transfer:settings';
const DEFAULTS = { keepExport: true, trafficPrompt: true, autoTutorial: true };
export function loadSettings() { /* JSON.parse + 白名单 + 布尔化 */ }
export function saveSettings(patch) { /* merge + setItem */ }
```

- 只持久化 3 个键；非法值回落默认。
- `index.js` 启动时 `const settings = loadSettings()`；保存时 `saveSettings(settings)`。

## 3. 3 项接线

### keepExport

- 现状：`generate()` 始终把只读副本加入导出区。
- 设计：`keepExport=true` 保持现状；`false` 时不把副本加入导出区，改为直接触发下载并 toast。
- 需要 `view` 暴露 `downloadBlob` 或复用现有下载动作；若现有下载流程依赖导出队列表项，则在生成后立即 `download` 并跳过入队。
- 在 PRD 已注明需定义；实施时以现有 `export-queue` API 为准，不新增第二套下载逻辑。

### trafficPrompt

- 现状：`openTrafficModal` 已定义（`workbench-view.js:783`）但**无调用点**。
- 设计：视图暴露 `confirmTraffic(onConfirm)`；`index.js` 在 `fetchFromHost()` 与 `restoreSelected()` 前调用。
- `trafficPrompt=false` 时直接执行，不弹窗。
- 弹窗内「不再显示」写回 `settings.trafficPrompt=false` 并持久化。

### autoTutorial

- 现状：`index.js:587` 无条件按 sessionStorage 自动打开。
- 设计：`if (settings.autoTutorial && !sessionStorage.getItem(...))`。
- demo 的 `szc-demo-tutorial-seen` 同样受该设置控制。

## 4. 齿轮图标

- 把 `workbench-template.js:21` 的太阳 SVG（circle + 8 rays）换成齿轮：
  - 使用 `ICO.gear` 同款路径（`workbench-view.js:55`）或标准 cog 路径。
  - 保持 `viewBox="0 0 24 24"`、`width/height=14`、`stroke=currentColor`。

## 5. 验证

- 单测：`settings-store` 读写/非法值；`settings-panel` HTML 恰好 3 个控件。
- demo：切换 3 项 + 刷新；切 ST/独立 Web 看宿主图表灰化。
- 守卫：`npm test`、五守卫。
- 截图存 `out/`（gitignored）。
