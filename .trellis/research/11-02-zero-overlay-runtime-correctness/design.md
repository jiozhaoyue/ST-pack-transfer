# 技术设计：零浮层面板内视图

## 1. 结构

`#app.app-container`（唯一容器）内部改为：

```
header.app-header
  btn-guide / btn-log / btn-locale / btn-settings / btn-close
div.app-body                ← 新增，flex:1; min-height:0; overflow:hidden
  main.app-main  #view-workbench        ← 原工作台
  section.panel.view-card #view-settings  [hidden]
  section.panel.view-card #view-log       [hidden]
  section.panel.view-card #view-help      [hidden]
  section.panel.view-card #view-confirm   [hidden]
tutorial-overlay（保留，fixed 全屏引导）
toast（改为 absolute，限制在 #app 内）
file-input[hidden]
```

- `.app-body` 承接原 `#app` 的 `flex:1;min-height:0` 语义；`.app-main` 保持原 grid 布局。
- `#app` 增加 `position:relative`，供 toast / fullname-pop 绝对定位。

## 2. 视图切换 API（workbench-view.js）

```js
state.view = 'workbench' | 'settings' | 'log' | 'help' | 'confirm'
function showView(name)   // 隐藏所有 .view-card 与 .app-main，只显示目标
function backToWorkbench()
```

- `openModal(title, desc, extraHtml, actions)`：写入 `#view-confirm` 的标题/正文/按钮，
  然后 `showView('confirm')`。签名不变，调用方（index.js / workbench-view 内部）零改动。
- `closeModal()`：`backToWorkbench()`。
- `openHelp(id)`：把帮助内容渲染进 `#view-help`，`showView('help')`。
- `#btn-log`：`renderLog(); showView('log')`。
- `#btn-settings`：调用 `actions.settings?.()`；index.js 改为
  `view.openSettings(buildSettingsHtml(settings), { onSave })`。
- Esc：若当前不是 workbench → 返回；工作台内不关闭面板（避免误触）。

## 3. 宿主配额读取（host-bridge.js）

```js
export async function readHostStorageQuota()
```

- 复用 `loadStorageInspectorModule()`（已存在，动态 import `/scripts/storage-inspector.js`）。
- `mod.RestProvider` 为函数时：`new mod.RestProvider({ kind: 'self' }).fetch([])`；
  取 `resp.quota.usedBytes` / `resp.quotaBytes`（`null` = 不限）。
- 任何异常返回 `null`，绝不抛；调用方（index.js）静默降级。
- index.js：

```js
const hostQuota = host.isPlugin ? await readHostStorageQuota() : null;
view.setStorage({ browser: await readBrowserQuota(), host: hostQuota });
```

- 仅 Luker 暴露该模块；ST/PT/TT 加载失败 → `null` → 文案按「宿主未提供读数」显示。
- 配额行支持 `total: null`：显示 `已用 X · 不限`。

## 4. 确认视图

- `#view-confirm` 复用 `.modal` 的视觉（卡片、标题、描述、额外内容、按钮行），但不再是覆盖层，
  而是占满 `.app-body` 的一屏。
- 流量确认、删除、恢复、合并冲突、私有件、清空队列全部走这一条路径。
- 危险操作按钮沿用现有 danger 风格。

## 5. 死代码清理

- 删除 `renderExtensionInstallerModal` 及其专属私有辅助（`discoverHostExtensions`、
  `checkHostThirdPartyAnomaly`、`normalizeManifestEntries` 等）——**前提**：逐个确认无其它调用方。
- 删除模板中的 `#modal-overlay` / `#log-overlay` / `#help-popover` / `#fullname-pop` 节点，
  以及 `style.css` 中对应的 `position:fixed` 规则。
- 保留 `#tutorial-overlay`。

## 6. 文案

- `quota.hostEmpty` → 「宿主未提供存储读数」（中立、准确）。
- 新增 `view.back`「返回」、`view.settings`/`view.log`/`view.help` 标题。
- 帮助视图沿用 `help.*` 条目，正文短句化。

## 7. 兼容与回滚

- 独立 Web 与插件态共用同一份模板（单一模板源），改动天然同构。
- 回滚点：本轮改动集中在 `workbench-template.js` / `workbench-view.js` / `style.css` / `index.js` /
  `host-bridge.js`，可按文件 revert。
- 不改宿主源码、不写实例目录。

## 8. 验证

- `npm test`（本地测试文件仍在）
- 七项守卫 + `npm run build`
- `npm run e2e:web`（独立 Web 全链路）
- Luker 实机：点击两个拉取按钮、设置、日志、确认、配额行
