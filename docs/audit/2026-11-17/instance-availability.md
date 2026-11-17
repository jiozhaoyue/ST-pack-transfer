# PT / TT 跨宿主局域网互传实测可用性侦察（2026-11-17）

> 侦察员：集成侦察（只读）。范围：`PureTavern` / `TauriTavern` 两实例目录、实例注册表、本仓 E2E 规约。
> 纪律：全程只读侦察；**未启动任何实例、未装依赖、未改任何文件、未提交 Git**；仅写本审计文件。
> 路径以标准仓群布局相对表达：`<Repo>` = `ST-pack-transfer`，`<Instances>` = `Instance`。

## 一、证据清单（文件路径 + 关键行）

### 1. 实例注册表（唯一定义点）

- `<Repo>/e2e/lib/instances.cjs:55-105`：登记 5 个实例，`dev-st/real-st`（8001/8002）、`dev-luker/real-luker`（8003/8004）、`pt-web`（8899）。**TT 不在登记表内**。
- `instances.cjs:95-104`：`pt-web` = `host:'pt'`, `port:8899`, `url:http://dev-pt.localhost:8899`, `dir:<Instances>/Dev/PureTavern/apps/web`, `startCmd:['pnpm','dev']`, `userDir:null`。
- `instances.cjs:100` 注释：PT 是纯前端，用户数据在浏览器 Profile（IndexedDB），**没有磁盘数据目录**。
- `instances.cjs:116-123`：`userDirOf('pt-web')` 会抛错（纯前端 Profile 存储）。

### 2. PureTavern

- `<Instances>/Dev/PureTavern/apps/web/package.json:6-10`：`predev = node scripts/prepare-legacy-runtime.mjs`；`dev = vite`；`prebuild` 同前置。
- `<Instances>/Dev/PureTavern/package.json:6` `packageManager: pnpm@10.17.1`；`dev` 脚本为 `pnpm --filter @pure-tavern/web dev`。
- 依赖前置已满足：`<Instances>/Dev/PureTavern/node_modules` 与 `.../apps/web/node_modules` 均存在；`apps/web/.generated/public` 已生成（含 `scripts/extensions/third-party/`、`__pure_tavern/`、`index.html` 等），说明 `predev` 产物已在位。**无需 `pnpm install`**。
- `<Instances>/Dev/PureTavern/apps/web/vite.config.ts:24-28`：`server.host = '127.0.0.1'`, `port = 8899`, `strictPort = true`。
- `<Instances>/Dev/PureTavern/README.md:61`：开发服务默认监听 `http://127.0.0.1:8899/`，端口占用直接报错、不回退。
- `<Instances>/Dev/PureTavern/README.md:3,23-26`：纯前端 + 可选后端；不需要 ST Node 服务端；保留 ST 前端扩展兼容层；角色/聊天/设置/世界书/密钥/资源存 IndexedDB。
- `<Instances>/Dev/PureTavern/apps/web/src/legacy-hook/README.md:5-9`：Compatibility Router 接管原版 `/api/**`，安装各功能模块，初始化 records/blobs 存储。
- `<Instances>/Dev/PureTavern/apps/web/src/features/extensions/README.md:3,11-15,27-33`：保留 ST 原版扩展管理器与 loader；第三方包装为 `/scripts/extensions/third-party/<folder>/...` 由上游 loader 在页面上下文加载；**只支持远程 GitHub/GitLab/direct HTTPS ZIP（需浏览器 CORS）；HTTP 仅限 localhost 开发与浏览器测试**。
- 同文件 `:56`：`local`/`global` 只是单个浏览器 Profile 内的兼容标签，无多用户服务器目录。
- `<Instances>/Dev/PureTavern/apps/web/src/features/extensions/LEGACY-CONTRACT.md:18`：`POST /api/extensions/install` 入参 `{url,global,branch}`——**无本地磁盘目录安装路径**。
- `<Instances>/Dev/PureTavern/apps/web/src/features/extensions/THREAT-MODEL.md:41-43`：不模拟 Node 服务端插件、任意 Express 路由、子进程、文件系统访问、包管理器安装。
- 现状：`apps/web/.generated/public/scripts/extensions/third-party` 下**未发现本仓插件**；插件未安装。

### 3. TauriTavern

- `<Instances>/Dev/TauriTavern/package.json:30-32`：`web:build = rspack build ... --mode production`（产物到 `src/dist`，供 Tauri 注入）；`web:dev = rspack build ... --watch`（**只构建、不起 HTTP 服务**）；`tauri:dev = node scripts/tauri-app.mjs --prepare-frontend dev`。
- `<Instances>/Dev/TauriTavern/scripts/tauri-app.mjs:34-61`：dev 分支跳过前端构建后调用 `@tauri-apps/cli` 起**桌面窗口**；需 Tauri CLI + Rust 工具链 + 桌面环境。缺 CLI 时 `:14-17` 直接报 `Run pnpm install first`。
- `<Instances>/Dev/TauriTavern/rspack.config.js:125-225`：5 个 bundle 配置（vendor-libs / agent-system / mcp-manager / in-app-agent / tauri-settings），输出均为 `*.bundle.js` 到各 `dist`，**无 dev server / port 配置**。
- `<Instances>/Dev/TauriTavern/tests/browser/web-host-fixture.mjs:1,46-49`：所谓 "Web Host" 是内存 mock backend（`backend.handle(request)`），非真实 HTTP 服务。
- `<Instances>/Dev/TauriTavern/tests/browser/web-host-startup.test.mjs:4,42`：用 `createBrowserRuntime` + `window.happyDOM.close()`，是 **happy-dom 单测夹具**，不是可浏览器访问的宿主。

### 4. 本仓现有 E2E 对宿主的覆盖

- `<Repo>/e2e/standalone/specs/cross-host.e2e.cjs:20-21` 明文登记：
  - TT：「Tauri 桌面应用，**无浏览器端口** ⇒ 人工交付」；
  - PT：「宿主数据管理面板，人工导入」。
- 同文件 `:10-23`：跨宿主 4×4 矩阵只覆盖**格式转换 + 交付**，目标侧写入不纳入自动化。
- `<Repo>/e2e/standalone/specs/lan-transfer.e2e.cjs:2,111-119`：局域网互传 E2E 是「同一浏览器两个独立上下文、**同源直连**」（WebRTC offer/answer + DataChannel），不依赖酒馆实例端口互访，只依赖插件页面能打开。

## 二、PT 可测性判定

**判定：有条件可参与；但不是"开箱即第三个宿主"，需用户授权两步。**

具备的条件：

1. 注册表已登记 `pt-web`，E2E 启动链路（`start-instance.cjs` 按 `getInstance`）可直接复用。
2. 依赖与运行时产物齐备：`node_modules` 已装、`.generated/public` 已生成，`pnpm dev` 前置条件满足，无需安装。
3. 不需要初始化磁盘 `data`：PT 纯前端，数据全在 IndexedDB，`userDir:null`。
4. 保留 ST 前端扩展兼容层与 `third-party` 加载路径，本仓插件（ST 扩展形态）理论上可在页面上下文运行。
5. "跨宿主局域网互传"走 WebRTC 取件码，不需要宿主的 8899 端口被外部访问；Playwright 同机访问 `127.0.0.1:8899` 即可驱动两个上下文。

阻塞/缺口：

1. **插件未装入 PT**：PT 只接受远程 GitHub/GitLab / 允许 CORS 的 HTTPS ZIP 安装，无本地目录安装路径；当前 `third-party` 下无本仓插件。需先把本仓插件发布为可安装来源或在 PT 数据管理面板导入含扩展的备份。
2. **监听地址仅 loopback**：`vite.config.ts` 写死 `127.0.0.1:8899` 且 `strictPort`。同机自动化可用；若要求真实跨设备局域网互传（另一台机器/另一 IP 访问 PT 页面），需改监听为 `0.0.0.0`。
3. **端口规则张力**：PT 上游固定 8899，与本仓「本地服务唯一端口 3040」规则存在张力；需用户裁定是否豁免或改用静态产物 + 本地静态服务。

## 三、TT 判定

**判定：不能参与本机双实例浏览器自动化实测；只能桌面 App 或 happy-dom 单测夹具。**

依据：

1. 未登记进实例注册表，无 `startCmd` / 端口 / `url`，E2E 框架无法直接拉起。
2. 无 HTTP dev server：`web:dev` 是 `rspack build --watch`，产物是给 Tauri 注入的 bundle，不是可托管 web 站点。
3. `tauri:dev` 走 Tauri CLI 起桌面窗口，需 Rust + 桌面环境，且当前任务明令禁止启动任何实例。
4. `tests/browser` 的 Web Host 是 happy-dom 内存 mock，不构成可浏览器访问的宿主。
5. 本仓 `cross-host.e2e.cjs:20` 已将其定性为「无浏览器端口 ⇒ 人工交付」。

补充辨析：PT 的 `import-export` 模块有 "TauriTavern interop"（`README.md:18-23`），但那是 `data/default-user` 树 ↔ PT 模块记录的**数据格式转换**，不等于运行 TT 宿主，不能据此认定 TT 可测。

## 四、对"跨宿主局域网互传实测"的影响

- 现有 LAN E2E 只在 standalone 站点的两个上下文跑，**未跨真实宿主**。要"跨宿主"，本质是让本仓插件在 PT 页面里运行后，两端各自打开 PT 页面走 WebRTC。
- 因此 PT 是该实测唯一有可能补上的第三个宿主；TT 在浏览器自动化层面不可补。
- 即便 PT 补上，其实测形态仍是「同一 PT 应用的两个浏览器上下文」，而非 ST↔PT 两种宿主页面互传；若要 ST↔PT 跨宿主，需两端分别打开 ST 与 PT 页面并都装好插件。

## 五、最小步骤建议（标注授权）

> 以下均为**后续建议**，本次侦察未执行任何一步。

**PT（需用户授权）**

1. 【需授权·对外写操作】把本仓插件做成 PT 可安装的包：推送到 GitHub/GitLab 公开仓库，或生成允许浏览器 CORS 的 HTTPS ZIP URL；再在 PT 扩展面板按官方 `/api/extensions/install` 流程安装并同意第三方警告。
   - 备选（纯本地、不对外发布）：用 PT 数据管理面板导入一个含该扩展的备份 ZIP；或用 Playwright 在 PT Profile 的 IndexedDB 中注入扩展记录（仅自动化手段，非产品路径）。
2. 【需授权·改外部实例配置】若要求真实跨设备局域网访问：把 `apps/web/vite.config.ts` 的 `server.host` 改为 `0.0.0.0`（或启动时加 `--host 0.0.0.0`），或改用 `pnpm build` 静态产物 + 本地静态服务。
3. 【需授权·启动实例】待当前占用实例端口的任务结束后，按注册表 `pt-web` 启动 `pnpm dev`（8899），用 Playwright 打开两个上下文验证 LAN 互传。
4. 【需用户裁定】决定是否豁免「本地服务唯一端口 3040」规则对 PT 8899 的约束。

**TT（需用户授权；成本高，建议维持人工交付）**

1. 【需授权·安装/构建】安装 Rust 工具链与 Tauri CLI，执行 `pnpm tauri:dev` 构建并启动桌面 App。
2. 【需授权·改测试方案】改用桌面自动化（非现有 Playwright 浏览器 E2E）才能纳入实测。
3. 【推荐】维持现状：按 `cross-host.e2e.cjs:20` 登记为「人工交付」，不纳入本机双实例自动化。

## 六、结论摘要

- **PT 结论**：**有条件可参与**，是本实测唯一有希望补上的第三个宿主。不缺依赖、不需初始化 data；缺的是「插件装入 PT（仅远程 CORS 源/面板导入）」与「若真跨设备则需放开 127.0.0.1 监听」。两者都需用户授权，本次未执行。
- **TT 结论**：**不能参与**。无浏览器 web 服务/端口，只能桌面 App 或 happy-dom 单测夹具；未被实例注册表登记，本仓 E2E 已明确登记为「无浏览器端口 ⇒ 人工交付」。要纳入需用户授权安装 Rust/Tauri 并更换桌面自动化方案，建议维持人工交付。
