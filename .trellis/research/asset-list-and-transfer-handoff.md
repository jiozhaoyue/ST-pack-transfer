# 资产列表导入 + 迁移备份统一面板 + S3/WebDAV（2026-11-09 第二批）

> 第一批（Luker 2.9 适配 / 配额 / 教程 / 日志）见
> [`luker-2.9-adaptation-and-handoff.md`](./luker-2.9-adaptation-and-handoff.md)。
> 本页是第二批的裁定、证据与实现落点，**自包含**。

---

## 1. 用户裁定（覆盖旧表述）

| 编号 | 裁定 | 判据 |
| --- | --- | --- |
| D-3 | 导出物**不是 Markdown 表格**；只做可导入酒馆原生「下载扩展和资源菜单」的官方扁平 JSON | `Array.isArray(json) === true`；条目五键 `id/type/name/description/url`；`url` 为 http(s) |
| D-4 | 入口**只在**每个图表卡 + 从宿主拉取（空态与动作行）；设置「诊断」导出入口删除 | `settings-panel.js` 无 `export-extensions`；`.vol-card [data-assetlist]`；`#btn-assetlist-host` / `#btn-host-assetlist` |
| D-5 | 点「从宿主拉取」顺序固定为 **流量警告 → 原生指引 → 打开原生界面**；指引默认每次、可持久化关闭 | `src/app/pull-entry.js`；`settings.nativePullNotice` 默认 true |
| D-6 | UI 验收统一走本地静态服务器（`npm run build && npm run preview`，4173）+ 插件 UI；禁止 `file://` / `npm run dev` 作验收 | `docs/DEVELOPER-GUIDE.md`；`.claude/launch.json` |
| D-7 | 本轮覆盖 PLAN 全部剩余（R4–R8 + 本轮 5 项） | `docs/PLAN-2026-11-09.md` 状态表 |
| D-8 | **绝对禁止全量/大内存测试**；只跑目标小文件 | 本轮只跑 7 个小文件 / 47 例 |

**长期禁令**：本插件**不做后端插件**；服务端直传 / 服务端代理 / 服务端定时任务登记在
[`docs/FUTURE-BACKEND-CAPABILITIES.md`](../../../docs/FUTURE-BACKEND-CAPABILITIES.md)，
不在本插件实现。

---

## 2. 宿主事实与取证

### 2.1 资产列表

- 酒馆资产菜单 `downloadAssetsList(url)` 明确要求顶层**数组**，否则抛
  `Assets list is not an array`；来源：`Instance/Dev/Luker/public/scripts/extensions/assets/index.js:289`。
- 宿主扩展发现端点是 `GET /api/extensions/discover`，返回
  `[{ type: 'system'|'local'|'global', name: 'third-party/<folder>' }]`；
  **不含 URL / 版本**。来源：`Instance/Dev/Luker/src/endpoints/extensions.js:1106`。
- 每个扩展的静态清单在 `/scripts/extensions/<name>/manifest.json`（客户端自身也是这样加载的，
  `public/scripts/extensions.js:541`）；`manifest.homePage` 是当前唯一可用的可安装 URL 线索。
- `system` 是宿主内置扩展，不应出现在「可安装资产列表」；本实现过滤掉。

### 2.2 拉取提示顺序

- Luker 2.9 账户窗口是 `dialog.dw-layer`（顶层图层）；先开窗口会让随后的
  `Popup.show.text` 被压在后面，用户看不到指引。
- `openAccountWindow` 在窗口已开时只导航、不重建（`account-window.js:606`），
  所以第二次点拉取「像是什么也没发生」。
- 修法：把流量警告与原生指引放在**开窗之前**；实现 `src/app/pull-entry.js`。

### 2.3 实例状态（2026-11-09 实测）

`curl 8001 / 8003 / 8004 / 8899` 全部 `000`（离线）⇒ 宿主注入实测（Luker 2.9 账户窗口、
配额跳转、原生按钮拉取）本轮**无法重跑**；只做了独立 Web / 静态 UI 取证。

---

## 3. 实现落点

| 事项 | 文件 |
| --- | --- |
| 官方扁平数组、URL 过滤、discover 归一 | `src/core/asset-list.js` |
| 宿主扩展 discover + manifest | `src/ui/host-bridge.js` 的 `listHostExtensions(platform)` |
| 包内/宿主导出入口 | `index.js` 的 `exportPackageAssetList()` / `exportHostAssetList()` |
| 图表卡 / 空态 / 动作行按钮 | `src/ui/workbench-view.js` 的 `chartCardHtml()` / `renderChart()` / `renderActions()` |
| 拉取顺序 | `src/app/pull-entry.js`；`index.js` 的 `fetchFromHost()` / `pullFromNativeUi()` |
| 分片台账 / 清单 | `src/core/transfer-plan.js` |
| S3 / WebDAV 统一目标 | `src/core/transfer-target.js` |
| S3 HEAD/Range/multipart | `src/core/s3-client.js` |
| WebDAV 全方法降级 | `src/core/webdav-client.js` |
| 上传/下载/断点编排 | `src/app/transfer-runner.js` |
| 迁移与备份面板 | `src/ui/workbench-template.js` 的 `#transfer-view`；`src/ui/workbench-view.js` 的 `renderTransfer()` |
| 宿主能力声明 | `src/core/host-capabilities.js` |
| 统一 UI 验收 | `npm run build && npm run preview` + `scripts/ui-verify-static.cjs`（本地专属，不入库） |

---

## 4. 验证读数（2026-11-09）

| 项 | 结果 |
| --- | --- |
| 小规模目标测试 | 47 例通过：`asset-list`(9) / `pull-entry`(7) / `settings-panel`(3) / `transfer-plan`(7) / `webdav-client`(11) / `transfer-runner`(6) / `host-extensions`(4) |
| 静态守卫 | CSS 作用域 / DOM 注入 / 单一模板源 / 控件消费点 / i18n 全绿 |
| 构建 | `npm run build` 通过（1.0–1.3s） |
| 单页 UI 取证 | 工作台骨架 / 迁移面板 / S3-WebDAV 切换 / 设置 / 宿主导出失败提示 / 包内资产列表 JSON 全部通过；0 pageerror |
| 包内资产列表 | 实测下载为数组，键 `description,id,name,type,url`，URL 为 `https://github.com/example/test-extension` |
| 全量测试 | **未跑**（用户 2026-11-09 明令禁止大测试） |

---

## 5. 未验证 / 已知边界

- **宿主注入实测**：Luker 2.9 账户窗口、配额跳转、原生按钮拉取、提示顺序，因实例离线未重跑。
- **真实 WebDAV**：405/401/409/CORS/Range 仅单测覆盖，尚未对真实服务器跑过。
- **R7**：只做「选中包 → 云端」一键分片备份；**无 cron、无服务端直传**；加密短语需整包加密，
  自动备份如实拒绝。
- **R1–R3 / R12**：代码与单测就绪，真机/浏览器复验仍待实例在线。
- **资产列表 URL**：只来自 `manifest.homePage`；没有该字段的扩展无法导出可导入地址（如实提示）。

---

## 6. 下次入口

1. 启动 Dev Luker 8003 / Dev ST 8001，重跑宿主注入实测与原生拉取顺序。
2. 用真实 WebDAV 服务器验证降级分支与 Range 下载。
3. 用户允许时再跑全量 `npm test`；当前只跑目标小文件。
4. 若继续 R7：先决定是否引入服务端执行体（当前禁令下不做），否则保持一键备份。
