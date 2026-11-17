# PureTavern 集成实测记录（2026-11-17）

## 结论摘要

| 项目 | 结果 |
| --- | --- |
| PT 端口改为 8005 并启动 | 成功 |
| PT 就绪 | 成功（HTTP 200） |
| 本仓插件安装进 PT | **失败**（三次尝试均 HTTP 502，插件未出现） |
| PT 是否可测 | **暂不可**——PT 可启动可访问，但插件装不上，跨宿主实测无法开始 |
| 8005 状态 | 已释放（无监听，HTTP 连接被拒） |

全程未手工复制任何文件进实例目录；安装只尝试 PT 自身的安装 API。

## 1. 端口变更

| 文件 | 改动 |
| --- | --- |
| `Instance/Dev/PureTavern/apps/web/vite.config.ts` | 第 26 行 `port: 8899` → `port: 8005`，`strictPort: true` 保留 |
| `e2e/lib/instances.cjs` | `pt-web` 的 `port: 8899` → `8005`；`url: http://dev-pt.localhost:8899` → `http://dev-pt.localhost:8005`（主机名保持 `dev-pt.localhost`） |

端口纪律核对：8000 禁用，启动前由 PID 24248 占用，本轮未使用也未改动；8001–8004 实例独占，未动；8005 登记为「PT 实例端口例外」；本仓 dev 统一 3040，启动前已被 PID 40016 占用，未动。启动前实测 8001–8005 与 8899 全部空闲，因此最多只启动了 PT 一个酒馆实例。

## 2. 8005 就绪证据

- 启动命令：`pnpm dev`，cwd = `Instance/Dev/PureTavern/apps/web`。`predev`（`prepare-legacy-runtime.mjs`）成功，输出 `Prepared Legacy runtime: index.html + .generated\public`。
- Vite 日志：`VITE v8.1.5 ready in 520 ms`，`Local: http://127.0.0.1:8005/`。
- 有界轮询（≤120s，每 2s，命中即停）：`READY HTTP 200 len=734845`。
- 浏览器页面侧：`document.readyState=complete`、`typeof window.__PURE_TAVERN__=object`、`document.documentElement.dataset.databaseState=ready`。
- Vite 启动期有既存的 Html/资源告警（`parse5 control-character-reference`、`/scripts/i18n.js` 等 Pre-transform 提示），属 PT 上游既有现象，与本轮端口/安装无关，未修改。

## 3. 安装请求与真实响应

### 3.0 前置：curl 直连探测

`curl.exe -X POST http://127.0.0.1:8005/api/extensions/install`（body `{"url":"...","global":true,"branch":""}`）返回 **HTTP 404 / Content-Length 0**。证明该路由不是服务端端点，而是前端 `CompatibilityRouter` 替换 `window.fetch` 后的页面内路由（见 `src/legacy-hook/bootstrap.ts` 的 `installCompatibilityFetch`），必须在浏览器页面上下文调用。

桌面浏览器未连接到本会话（`browser.disconnected`），改用系统已有 Chromium + CDP（Node 24 内置 WebSocket，临时 profile 放在系统临时目录），未安装任何依赖，未向实例写文件。

### 3.1 尝试 1：默认分支

- 请求：`POST /api/extensions/install`，body `{"url":"https://github.com/jiozhaoyue/ST-pack-transfer","global":true,"branch":""}`（分支留空，由 PT 解析默认分支）。
- 响应：**HTTP 502**，`ok=false`，耗时 63838ms。片段：
  `{"error":"Unable to fetch extension source. The remote host must allow browser CORS: https://raw.githubusercontent.com/jiozhaoyue/ST-pack-transfer/HEAD/.agents/skills/mini-trellis-remember/SKILL.md","code":"network","pureTavern":true}`

### 3.2 尝试 2：显式默认分支 main

- 浏览器内 CORS 探测（同一页面发起）：`raw.githubusercontent.com` 该文件 **200 / 3482 字节 / 21969ms**；`cdn.jsdelivr.net` 同文件 **200 / 3482 字节 / 824ms**。说明 CORS 本身正常，不是 CORS 被拦。
- 请求：body `{"url":"https://github.com/jiozhaoyue/ST-pack-transfer","global":true,"branch":"main"}`。
- 响应：**HTTP 502**，`ok=false`，耗时 13769ms。片段：
  `{"error":"Extension source request failed: HTTP 404  (https://raw.githubusercontent.com/jiozhaoyue/ST-pack-transfer/main/.trellis/research/09-26-all-instance-data-sync-e2e/research/import-st-dev-st-1791875027489.json)","code":"http","pureTavern":true}`
- 根因复核（只读外部查询）：该 JSON 的 raw 为 **HTTP 404**（响应 14 字节），GitHub API `contents` 为 **404**，jsDelivr 为 **404**。PT 的 GitHub 源适配器逐文件下载，遇到这一个 404 文件即整包失败。
- GitHub 仓库默认分支经 API 确认为 `main`；仓库无 Release，无法走 Release ZIP。

### 3.3 尝试 3：direct HTTPS/HTTP ZIP（PT 支持的备用路径）

- GitHub archive ZIP：`https://github.com/jiozhaoyue/ST-pack-transfer/archive/refs/heads/main.zip` 最终 **HTTP 200**，但 `Access-Control-Allow-Origin: https://render.githubusercontent.com`，不允许 `http://127.0.0.1:8005` 跨源读取，浏览器 CORS 会拒绝，故放弃该源。
- 本地静态服务端口：3040 已占用，按端口纪律不能另开第二端口；也未把文件放进实例目录。
- 替代：用 `git archive --format=zip HEAD` 在系统临时目录生成 `<temp>/st-pack-transfer.zip`（6,645,311 字节，路径已脱敏），经 PT 自带 Vite dev server 的 `/@fs/` 同源提供（curl 该 URL 为 **HTTP 200**），再走 PT 安装 API。
- 请求：body `{"url":"http://127.0.0.1:8005/@fs/<temp>/st-pack-transfer.zip","global":true,"branch":""}`。
- 响应：**HTTP 502**，`ok=false`，耗时 6680ms。片段：
  `{"error":"Extension source request failed: HTTP 404 Not Found (http://127.0.0.1:8005/@fs/<temp>/st-pack-transfer.zip)","code":"http","pureTavern":true}`
- PT 源网关对 direct ZIP 有 `/\.zip$/i` 约束且原样使用该 URL；curl 200 而 PT 侧 404 属网关请求差异，未继续深挖。

### 3.4 安装后复核

三次尝试后均调用 `GET /api/extensions/discover`，每次都返回 **HTTP 200**，但列表只含 PT 内置项与两个随版 bundled 扩展（`third-party/JS-Slash-Runner`、`third-party/ST-Prompt-Template`），**没有 `ST-pack-transfer`**。因此判定安装失败，不伪造成功。

## 4. 插件目录检查结果

- 目录：`Instance/Dev/PureTavern/apps/web/.generated/public/scripts/extensions/third-party/`，只读检查。
- 全程始终只有 `.gitkeep` 一个文件，**未出现插件目录**。
- 补充：PT 是纯前端，已安装扩展存 IndexedDB / M13 资源，并非磁盘目录；磁盘目录不出现属预期，但 API 侧 `discover` 也未出现该插件，双向确认未安装。

## 5. 端口释放结果

- 关闭方式：`taskkill /PID <监听 8005 的 node.exe> /T /F`（即该轮 `pnpm dev` 派生的 vite 进程树）。
- 复查：8005 无监听，输出 `8005 RELEASED`；主动 HTTP 探测 `http://127.0.0.1:8005` 连接被拒（预期）。
- 未占用、未修改 8001–8004、8899、3040、8000。

## 6. 后续跨宿主测试怎么跑

1. 先修复仓库可安装性：补回或删除 `.trellis/research/09-26-all-instance-data-sync-e2e/research/import-st-dev-st-1791875027489.json`（GitHub 上确定 404），或确认 jsDelivr 能列出完整文件树。
2. 重新启动 PT：`pnpm dev`（cwd 同上）→ 轮询 `http://127.0.0.1:8005` 至 200 → 在 PT 扩展管理页安装 `https://github.com/jiozhaoyue/ST-pack-transfer`，或调用 `POST /api/extensions/install`。
3. 用 `GET /api/extensions/discover` 确认出现 `third-party/ST-pack-transfer`，再确认页面能加载其 manifest/js/css。
4. 用 `e2e/lib/instances.cjs` 的 `pt-web`（8005）跑跨宿主用例；注意 PT 无磁盘 `userDir`，登录态只在浏览器 Profile。
5. 同时最多两个酒馆实例；本轮只起 PT，未并行其他实例。

## 7. 风险

- PT 更新可能覆盖 `apps/web/vite.config.ts` 的 8005，端口变更需重新打补丁并同步 `e2e/lib/instances.cjs`。
- 8005 是 PT 实例端口例外，不占用 8001–8004；若后续把 PT 并入常规端口段，需重新评估端口纪律。
- PT 源网关逐文件下载，仓库内**任何一个** raw/jsdelivr 404 文件都会导致整包安装失败；本仓含较多 `.trellis/` 研究数据文件，版本升级后需复核。
- PT 无 Release、GitHub archive 的 CORS 头受限，direct ZIP 备用路径也不可用。
- 端口变更落在 PT 实例仓，不在本仓 git；按约束未做 git 提交，需父会话确认是否单独登记。

## 8. 操作边界声明

- 修改仅：`vite.config.ts` 端口一处、`e2e/lib/instances.cjs` 的 `pt-web` 一处、本报告。
- 未改本仓产品代码/测试/package.json；未装依赖；未改其它实例；未做 git 提交；未派生子代理。
- 系统临时目录中的 CDP 脚本与 ZIP 为诊断产物，未写入实例或本仓工作区。
