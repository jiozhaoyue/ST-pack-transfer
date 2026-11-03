# 设计：i18n 文案外置与教程定位

## 1. i18n 模块

### API

```js
// src/i18n/index.js
export const SUPPORTED = ['zh-CN', 'en-US'];
export const FALLBACK = 'zh-CN';
export function resolveLocale(search = location.search) { /* ?lang= > localStorage > navigator.language > fallback */ }
export function getLocale() {...}
export function setLocale(locale) {...}          // 写 localStorage + 通知
export function onLocaleChange(fn) {...}
export function t(key, params = {}) {...}        // 嵌套 key 解析 + {param} 插值 + 回退
```

### locale 形状

```js
// src/i18n/locales/zh-CN.js
export default {
  header: { settings: '设置', log: '日志', guide: '基础教程' },
  chart: { title: '存储图表', quota: { browser: '浏览器配额', host: '宿主配额' } },
  tutorial: { basic: [ { title, desc }, ... ] },
  // ...
};
```

- `t('chart.quota.browser')` 按 `.` 取嵌套值。
- 插值：`t('toast.scanDone', { name, files })` → `扫描完成：{name} · {files} 个文件`。
- 缺失 key：开发期 `console.warn` + 返回 key；不静默显示空。

### 语言切换

- 顶栏新增 `#btn-locale`（地球图标），点击弹小面板：中文 / English。
- `setLocale` → 写 `localStorage['st-pack-transfer:locale']` → `renderAll()`。
- 不加入设置页。

## 2. 守卫

### `scripts/i18n-guard.js`

- 扫描文件：`src/ui/**/*.js`、`index.js`、`src/app/**/*.js`。
- 跳过：`src/i18n/locales/**`、注释、`src/ui/ui-demo.html`（demo 外壳）。
- 用**轻量 tokenizer**跳过注释/正则，提取单引号/双引号/模板字符串中的 CJK；
  命中即报 `file:line` 与片段。
- `npm run check:i18n`；失败退出码非 0。

### 键完整性测试

- `test/i18n.test.js`：
  - 两份 locale 扁平化后键集合相等；
  - 无空字符串；
  - `t()` 对每个 key 返回非 key 本身；
  - 插值替换正确；
  - `resolveLocale` 优先级正确。

## 3. 文案清单

### `research/copy-inventory.md`

- 用一次性脚本提取 CJK 字符串（跳过注释），输出：
  | file:line | 现文案 | 建议 key | 建议中文 | 建议英文 | 备注 |
- 人工评审：统一术语、删教学口吻、合并重复承载点。
- 清单是实施顺序的依据：按文件分批迁移，每批测试。

### 迁移顺序

1. `workbench-template.js`（静态文案）
2. `workbench-view.js`（HELP + 教程 + 动态渲染）
3. `index.js`（toast/弹窗/日志）
4. `export-queue.js` / `lan-transfer-panel.js` / `host-bridge.js` / `chat-store-*.js`
5. `src/app/*.js` 与 `src/core/*.js` 的用户可见错误消息

## 4. 教程几何

### 现状问题

- `renderTutorial()` 用 `getBoundingClientRect()` + `position:fixed`（`workbench-view.js:849-873`）。
- 只在 `window.resize` 重算（`:1105`）。
- 若 `#app` 或祖先有 `transform`（TT 实测 `<html>` 带 `matrix(...)`），
  fixed 子元素相对被变换的祖先定位，而 rect 是视口坐标 ⇒ 整体偏移。

### 设计

```js
function renderTutorial() {
  const overlay = document.getElementById('tutorial-overlay');
  const oRect = overlay.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  const left = r.left - oRect.left;
  const top = r.top - oRect.top;
  // ring/card 用 overlay 局部坐标
  // clamp 到 [0, oRect.width/height]
  // 目标不可见：ring 隐藏，card 贴最近边
}
```

- 监听：
  ```js
  document.addEventListener('scroll', scheduleTutorial, true);
  window.addEventListener('resize', scheduleTutorial);
  new ResizeObserver(scheduleTutorial).observe(document.getElementById('chart-stack'));
  ```
- `scheduleTutorial` 用 `requestAnimationFrame` 合帧，避免高频重排（L1-MR-9）。
- 切步 / 打开教程 / 语言切换后调用 `renderTutorial()`。
- demo 增加「模拟 transform 容器」开关，验证偏移修复。

### CSS

- overlay 保持 `position:fixed; top:0; left:0; width:100vw; height:100vh`（TT 兼容，见 HANDOFF §八.7）。
- ring/card 仍 `position:fixed`，但坐标改为 overlay 局部坐标（overlay 与视口同尺寸时等价）。

## 5. 测试与验收

- `test/i18n.test.js`（键一致/插值/探测）。
- `test/tutorial-anchor.test.js`（纯几何函数抽取后单测：目标矩形 + overlay 矩形 → ring/card 位置）。
- demo 截图：中文/英文、滚动图表、移动宽度、模拟 transform。
- 守卫：`check:i18n` + 原五守卫。
