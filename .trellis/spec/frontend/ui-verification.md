# UI 实测通道：无头 Playwright（**禁止 Claude 预览**）

> 用户 2026-11-12 明令，最高优先级：
> **禁止使用任何 Claude 预览（Claude 内置浏览器 / Browser 面板 / `preview_*` 工具）做 UI 验证。**
> 一律改用**后台无头 Chromium**（Playwright），弹窗式或前台浏览器同样禁止。

---

## 1. 硬规则（MUST）

| # | 规则 | 判据 |
| --- | --- | --- |
| V-1 | UI 实测只走 `e2e/` 的库 + 无头 Chromium | 脚本里出现 `chromium.launch()`（headless 默认 true），且**不出现**任何 `preview_*` 调用 |
| V-2 | 必须**后台**运行，不得弹出窗口、不得占用前台浏览器面板 | 运行方式为后台任务（`run_in_background`），进程结束前不阻塞会话 |
| V-3 | 不新装包 | 复用 `e2e/lib/resolve-playwright.cjs`（`loadPlaywright()` 解析本机全局 Playwright） |
| V-4 | 读数与截图落盘 | 截图写 `e2e/standalone/out/*.png`，读数以 JSON 打到 stdout 并落日志 |
| V-5 | 断言可判定 | 脚本以退出码表态：全部通过 `0`，任一失败非 `0`，并打印失败项 |
| V-6 | 端口显式、占用即失败 | 静态服务器 `startStaticServer({ root, port })`，`strictPort` 语义（不自动换端口） |

## 2. 现成装置

| 装置 | 用途 | 出处 |
| --- | --- | --- |
| `startStaticServer({ root, port })` | 托管 `dist/`（独立 Web 形态），支持子路径前缀 | `e2e/standalone/lib/static-server.cjs` |
| `openSite(url)` | 无头 Chromium 打开页面，采集 console/pageerror/失败请求/坏响应 | `e2e/standalone/lib/harness.cjs` |
| `waitForReady(page)` | 有界等待工作台就绪 | 同上 |
| `useAdvancedView(page)` | 实例侧切到高级视图 | `e2e/lib/harness.cjs` |

## 3. 最小验证脚本骨架

```js
const { startStaticServer } = require('./lib/static-server.cjs');
const { openSite } = require('./lib/harness.cjs');

const server = await startStaticServer({ root: 'dist', port: 4175 });
const h = await openSite(server.url);          // 无头，不弹窗
try {
  await h.goto();
  await h.page.setInputFiles('#file-input', 'dist/fixture.zip');
  await h.page.waitForSelector('.vol-card');
  // …断言…
  await h.page.screenshot({ path: 'e2e/standalone/out/case.png', fullPage: true });
  if (!ok) process.exitCode = 1;
} finally {
  await h.close();
  await server.close();
}
```

参考实现：`e2e/standalone/verify-ext-scope.cjs`（扩展作用域汇总条验证）。

## 4. 与既有规范的关系

- 本条**取代**任何「用 Claude 预览面板 / `preview_start` 验收 UI」的旧做法；旧做法一律视为违规。
- `npm run build && npm run preview` 仍可用于**人工**查看（用户自己看），但**不得**作为自动化验收通道。
- 宿主实例侧的实测仍受铁律 23 约束：只连 Dev 实例、走 `e2e/` 库、后台无头。

## 5. 违规后果

预览面板是**前台、可被用户操作、且状态不稳定**的通道（本会话已实测：其写入被服务端间歇拒绝，
导致验证中断、结论不可复现）。用它做验收会产出**无法复现的读数**，等于没有验证。

## 6. 必踩的坑：教程演示模式会吞掉真实包

`buildDemoPackages()` 在**进入教程模式**时占住 `state.packages`，而 `setPackages()` 开头有
`if (state.tutorialMode) return;` ⇒ 教程期间**真实包永远进不来**，图表恒为演示数据
（`extGroups` 实测为 `demo-st-4g-1`）。

**每个独立站 UI 自动化都必须在导航前关掉自动教程**：

```js
await page.addInitScript(() => {
  try { localStorage.setItem('st-pack-transfer:settings', JSON.stringify({ autoTutorial: false })); } catch {}
});
await h.goto();
```

**不要**靠点 UI 去退教程：`exitTutorialMode()` 会恢复进入教程前的状态快照，把刚上传的包一起还原掉。
（这条来自 2026-11-12 的 E2E 实测事故，同一根因曾让「生成导出」断言连续两次误红。）
