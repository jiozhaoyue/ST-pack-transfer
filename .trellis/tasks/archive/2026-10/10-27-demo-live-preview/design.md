# 设计：demo 消费正式代码（依赖方向反转）

## 一、问题

现状是 `ui-demo.html` 为唯一源，`npm run sync:ui` 把它的 CSS/HTML/JS 三个标记区
逐字复制到 `style.css` / `workbench-template.js` / `workbench-view.js`。
这造成两条与用户裁定相反的依赖：

1. **正式代码依赖 demo**：三件套是生成物，改正式 UI 必须改 demo 再同步。
2. **demo 不被 require 时无法实时预览**：用户打开 3040 根路径看到的是正式独立页，
   不是 demo；demo 的内联副本与正式代码也可能漂移（虽有守卫，但方向是反的）。

用户裁定（2026-10-27）：

> demo 可以引用正式的 JS 代码，但 demo html 本身不被任何依赖和引用；
> 应当可以实时看 demo。

## 二、目标依赖图

```
ui-demo.html  ──link──▶  style.css
      │        ──import─▶ workbench-template.js (getWorkbenchHtml)
      │        ──import─▶ workbench-view.js (createWorkbenchView)
      └─ 内联 demo 外壳 CSS + 演示 harness（数据/动作）

正式入口 index.js ──import──▶ 三件套        （与 demo 无任何关系）
```

正式三件套成为**手写唯一源**；demo 是消费者，且只在开发期使用。

## 三、demo 页面结构

1. `<link rel="stylesheet" href="../../style.css">`——正式样式（规则均带 `#app.app-container` 前缀）。
2. demo 外壳 `<style>`：`html,body` 底色、`.demo-shell` / `.demo-toolbar` / 入口预览 mock 等，仅 demo 使用。
3. `<div class="app-container" id="app" data-host="luker" data-view="desktop">` 保持为空容器。
4. 引导脚本（module）：`import { getWorkbenchHtml } from './workbench-template.js'`，
   `app.innerHTML = getWorkbenchHtml()`；随后 `import { createWorkbenchView } from './workbench-view.js'`，
   用 demo 数据驱动同一套视图 API。
5. demo harness 保留原样（`demoTree`、`DEMO_PACKAGES`、`DEMO_QUOTA`、`demoLan`、工具条事件）。
6. 二维码库仍以 classic `<script>` 加载 `../vendor/*.js`，只服务 demo harness。

## 四、file:// 支持

`import`/`link` 跨文件模块在 `file://` 下被 CORS 拒绝，因此 demo **只能经 HTTP 查看**：
`npm run dev` → `http://localhost:3040/src/ui/ui-demo.html`。
这是用户「demo 引用正式 JS」的直接代价；正式产品的 `file://` 支持不受影响
（仍由 `index.html` + `public/file-protocol-notice.js` 处理）。

## 五、守卫

新增 `test/ui-demo-isolation.test.js`：

- 正式源码清单（`index.js`、`index.html`、`src/**/*.js`、`scripts/**/*.mjs|cjs`、`.github/**`）
  逐个读取，断言不含 `ui-demo`。
- `ui-demo.html` 断言：含 `href="../../style.css"`、含 `from './workbench-template.js'`、
  含 `from './workbench-view.js'`；不含 `SZC:UI:` 标记区、不含 `export function createWorkbenchView`。
- 正式三件套仍断言无 `demo` / `演示` / `DEMO_` 字样。

删除 `test/ui-demo-source.test.js`（旧的逐字一致守卫）与 `scripts/sync-ui-from-demo.cjs`
（用户已批准删除）。npm 脚本移除 `sync:ui` / `check:ui-sync`。

## 六、内边距

对照实测（1400×1000，demo/正式一致）：

| 区块 | 水平 padding |
| --- | --- |
| `.panel-head` | 12px |
| `.chart-controls` / `.legend` / `.filename-row` / `.quota-head` | 12px |
| `.action-row` | 9px |
| `.progress` | 9px |
| `.zone-body` | 9px |
| `.lan-block` | **4px（异常）** |

修法：`.lan-block{padding:8px 9px 10px}`；`.lan-toggle{padding:6px 0}`，
让取件码输入框、按钮与 `.action-row` / `.progress` 的左边缘对齐。

## 七、回滚

- 若 demo 页面在 Vite 下无法运行，可临时保留旧 demo 副本；
  正式代码不受影响（依赖方向已反转）。
- 内边距为纯 CSS 改动，单行回滚即可。
