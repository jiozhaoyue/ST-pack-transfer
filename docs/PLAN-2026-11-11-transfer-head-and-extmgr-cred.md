# PLAN-2026-11-11 · 迁移面板头同构 + 扩展管理「凭据」/安装区下移

> 来源：2026-11-11 用户第三轮裁定（口头，逐条）。
> 口径：只改 UI 结构与入口归属，不动 LAN / 云端 / Git 安装的**行为逻辑**。

## 一、用户裁定（原文要点）

1. **迁移与备份面板头必须和另外两个面板同一套逻辑**：绝对不新 DOM，头不是另一套逻辑。
2. 头里只有：`迁移与备份`、`局域网互传`、`云端仓库`。
3. **禁止任何 ×**（不许有关闭按钮）。
4. 扩展管理的 `安装` 页签**改名 `凭据`**。
5. **安装功能全部搬到 `宿主` 页下半**，并且可以**完全收起**。

## 二、判据

### T1 迁移面板头同构

- `#transfer-view` 的头是 `<div class="panel-head panel-head--switch">`，内含
  `<div class="view-switch" data-view-switch></div>` 与 `<div class="panel-actions">`。
- 头里**不存在** `.panel-title`、**不存在** `#transfer-close-btn`、**不存在**任何 `×` 文本按钮。
- 切换按钮由 `renderViewSwitch()` 统一渲染（`迁移与备份` 项为 active），**没有**新增独立渲染/监听。
- `.panel-actions` 里只有 `#transfer-tabs`（`局域网互传` / `云端仓库` 两个 `seg-btn`）。
- 手机形态走 `.panel-head--switch` 既有两行规则：第一行切换按钮，第二行两个页签。
- 离开迁移面板：点切换行的 `存储图表` / `扩展管理`（既有委托已支持），并**不依赖**关闭按钮。
- `#transfer-view` 内不再有 `transfer-close-btn` 相关监听、教程锚点、i18n 残留。

### T2 扩展管理：安装 → 凭据

- 页签顺序固定 `宿主 / 凭据 / 打包`，默认 `宿主`。
- `凭据` 页只渲染账号列表、存储位置、OAuth 区块、令牌指引；**不渲染**链接输入、解析、开始安装、安装列表、失败导出等安装控件。
- `凭据` 页**没有**「去安装」跳转入口。

### T3 安装区在宿主页下半，可完全收起

- `宿主` 页结构：已装扩展操作行 + 已装列表 + 更新块 → 其下 `#extmgr-install-block`（`<details>`）。
- 收起时看不到任何安装控件（链接输入、上传、粘贴、分支、解析、开始安装、待装列表、日志/失败/报告/清空）。
- 展开/收起由 `summary` 触发；`state.extInstallOpen` 会话内记住，默认 `false`（完全收起）。
- 展开后安装控件功能与改造前**完全一致**（绑定、预检、私有仓库提示、安装执行路径不变）。
- `#extmgr-report-bar` 展开时仍隐藏整个正文（既有行为不变），收起后回到宿主页并保持安装区状态。

## 三、改点

| 文件 | 改动 |
| --- | --- |
| `src/ui/workbench-template.js` | 迁移面板头换 `.panel-head--switch` + `[data-view-switch]` 宿主，删 `.panel-title` 与 `#transfer-close-btn`；扩展页签 `data-exttab="install"` → `"cred"` |
| `src/ui/workbench-view.js` | 删 `#transfer-close-btn` 监听；`renderExtInstall` 拆成 `renderExtCredentials`（凭据页）与安装区渲染；`renderExtInstalled` 末尾追加 `#extmgr-install-block` 并绑定折叠；`state.extTab` 的 `'install'` → `'cred'`；`state.extInstallOpen` 新状态 |
| `style.css` | 迁移面板头改走后，删/改 `transfer-view` 下失效的头样式；新增 `#app.app-container .ext-install-block` 作用域样式 |
| `scripts/control-consumer-guard.js` | 新增控件 `extmgr-install-block` 的消费点声明 |
| `src/i18n/locales/zh-CN.js` / `en-US.js` | `extmgr.tabInstall` 文案改「凭据 / Credentials」；新增安装区标题与折叠提示；移除旧「安装」页签相关描述 |
| `README.md`、`docs/DEVELOPER-GUIDE.md` | 同步：迁移面板头入口说明、扩展管理页签改名与安装区位置 |
| `.trellis/spec/frontend/workbench-single-view.md` | §7.3 / §12.4：迁移面板头契约（同构、无 ×、三项） |
| `.trellis/spec/frontend/extension-git-manager.md` | 页签 `宿主/凭据/打包`、凭据页范围、安装区折叠契约 |

## 四、执行顺序

1. 计划落盘（本文件）。
2. 模板：迁移面板头 + 扩展页签值。
3. 视图：迁移渲染/监听清理 → 扩展管理拆分与折叠。
4. CSS 与控件声明。
5. i18n 双语。
6. 文档与规范同步。
7. 验证：六条静态守卫 → 目标测试 → `npm run build` → 全量 `npm test`。

## 五、状态

- [x] 计划落盘
- [x] 迁移面板头同构（无 ×）
- [x] 扩展管理「凭据」页签
- [x] 安装区下移到宿主页并可完全收起
- [x] 控件声明 / i18n（**未新增任何样式**：页签沿用 `.segmented > .seg-btn`，折叠区沿用既有 `details` 样式基线）
- [x] 文档与规范同步
- [x] 六守卫 + 目标测试 + 构建 + 全量测试（1119 passed / 2 skipped）
- [x] 无头截图取证（桌面 + 手机；`scripts/ui-shot-transfer-head.cjs`，本地专属）

## 六、不要做的事

- 不动 LAN 信令、云端 S3/WebDAV、Git 安装执行逻辑。
- 不给迁移面板新增 `×`、不给凭据页加安装入口。
- 不为折叠区新增 `<dialog>` / 浮层；就在宿主页内联展开。
