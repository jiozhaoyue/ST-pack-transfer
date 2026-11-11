# 扩展管理与 Git 账号（P2 契约，2026-11-11）

> 适用文件：`src/core/git-url.js`、`src/core/git-accounts.js`、`src/core/git-site.js`、
> `src/ui/git-remote.js`、`src/ui/workbench-view.js`（扩展管理）、`src/ui/host-bridge.js`（安装执行）。

## 1. 宿主安装契约（已核对 Dev 实例源码）

`POST /api/extensions/install`，body：

| 字段 | 语义 |
| --- | --- |
| `url` | **必须是仓库根 URL**。宿主用 `URL.pathname` 的**最后一段**做扩展目录名；传 `…/tree/dev` 会装成名为 `dev` 的目录。 |
| `branch` | 可选。宿主 `git clone --depth 1 --branch <branch>`；接受分支或标签，**不接受 commit SHA**。空值 = 仓库默认分支。 |
| `global` | 装到全局 `public/scripts/extensions/third-party/`；需要管理员。 |
| `replace` | `true` 时先删旧目录；否则已存在返回 409。 |

因此：

- 插件必须先 `parseRepoUrl()` 把页面地址解析成「根 + ref」，再把 ref 放进 `branch`；
- **不要**给 `branch` 填默认 `main`——很多仓库默认是 `master`；
- commit 安装只能尝试后如实报错（建议改用标签或分支）。

## 2. URL 归一（`src/core/git-url.js`）

支持输入：`owner/repo`、`gh:`/`github:`/`gitee:`/`gitlab:` 短写、无协议 host/path、
`/tree/<ref>`、`/blob/<ref>/…`、`/commit/<sha>`、`/releases/tag/<tag>`、`/tags/<tag>`、
GitLab `/<group>/<sub>/<repo>/-/tree/<ref>`、`.git` 后缀、query/hash、`https://user:token@host/…`。

规则：

- 仓库根 = `https://<host>/<owner…>/<repo>`；GitLab 允许子组（owner 可含 `/`）。
- `/tree/<ref>` 只取**第一段**作 ref；分支名含 `/` 时由 `refineRefWithBranches()` 在拿到分支列表后取最长匹配。
- 纯 URL 无法区分「ref 里的斜杠」与「仓库内路径」——这是 GitHub 自身的歧义，不猜测。
- 系统 git 形态（`ssh://`、`git@host:path`、`file://`、`git://`）返回 `error:'system-git'`：
  插件只能走 HTTP(S) 宿主克隆。
- `hadCredentials=true` 表示输入里带了用户信息；**解析结果永远不含凭据**。

## 3. 账号与存储（`src/core/git-accounts.js` + `settings-store.js`）

- 单用户口径：账号库属于当前酒馆用户，不区分「多酒馆用户」。
- 每站点可多账号；同 `site+host` 组内**恰好一个** `isDefault`（归一函数强制）。
- 匹配顺序：同 host 优先（默认账号优先），其次同 site。
- 存储位置由 `gitCredentialStorage` 决定：
  - `server`（默认）：随 `extension_settings['ST-pack-transfer']` 写入服务端 `settings.json`；
  - `browser`：只写 `localStorage`，且 `saveSettings()` **会写回空的 `gitAccounts` 覆盖服务端副本**；
    读取时该模式下账号只认本地，避免被 host 的空数组覆盖。
- **隐私文案是硬要求**：任何展示凭据的位置都必须写明「默认存服务端，有服务器/管理员权限者可见；
  可改仅浏览器」。界面、日志、报告一律脱敏（`maskSecret` / `scrubUrlCredentials`）。

## 4. 私有仓库（唯一可行路径与风险）

- 私有仓只能由**宿主服务端克隆**：插件把凭据拼进交给宿主的 URL
  （`https://<token>@host/…` 或 `https://<user>:<pass>@host/…`，见 `buildAuthedUrl`）。
- **风险**：该 URL 可能被宿主写入扩展的 `.git/config`（origin 地址），插件无法回收。
  安装前必须显式提示；失败项在报告里标注「私有/需登录」。
- 安装前预检：仓库信息 401/404 且无账号 ⇒ 判定「私有或不存在」，弹窗拦截（可「仍然尝试」）。

## 5. 站点 API（`src/core/git-site.js`）

| 站点 | 分支 | 仓库信息 | 提交 | 鉴权 |
| --- | --- | --- | --- | --- |
| GitHub | `api.github.com/repos/o/r/branches` | `/repos/o/r` | `/commits?sha=` | `Bearer` |
| GitLab | `<host>/api/v4/projects/<urlenc path>/repository/branches` | `/projects/<path>` | `/repository/commits?ref_name=` | `Bearer` |
| Gitee | `gitee.com/api/v5/repos/o/r/branches` | `/repos/o/r` | `/commits?sha=` | `access_token` query |
| 自建 Gitea | `<host>/api/v1/repos/o/r/branches` | `/repos/o/r` | `/commits?sha=` | `token` |

- 所有请求 8 秒超时（`git-remote.js`），失败返回原因码：
  `network` / `unauthorized` / `forbidden` / `not-found` / `http` / `unsupported`。
- **降级纪律**：任何失败显示「未提供」或原因，不得伪造 0 / 空数据。

## 6. 更新检查（只读）

- 来源登记：只登记**经本面板成功安装**的扩展（`gitInstalls`：`{name, url, ref, at}`）。
- 本地版本：`/scripts/extensions/third-party/<name>/manifest.json`（宿主静态文件）。
- 远端版本：raw manifest（GitHub/Gitee/GitLab/Gitea 各自路径）。
- 判据：两侧都拿到才比较；任一缺失 ⇒ `unknown`。`compareVersions()` 处理 `v` 前缀与多段。
- **不自动更新**，也不调用 `/api/extensions/update`。

## 7. 验收

- `test/git-url.test.js`（13）、`test/git-accounts.test.js`（7）、`test/git-site.test.js`（9）。
- `scripts/ui-verify-ext-git.cjs`（本地专属）：`/tree/dev` 归一、私有提示弹窗、账号脱敏、仅浏览器落盘。

## 8. OAuth 登录与令牌指引（2026-11-11）

**契约**：账号区新增「OAuth 登录」区块与「令牌获取指引」一页教程；OAuth 走**授权码 + PKCE**，
不要求把 client secret 写进前端（Gitee / 自建 Gitea / GitHub 代理除外）。

| 事实 | 结论 | 证据 |
| --- | --- | --- |
| GitLab `POST /oauth/token` 返回 `Access-Control-Allow-Origin: *` | 浏览器可换 token | 2026-11-11 `curl -X OPTIONS` |
| Gitee `POST /oauth/token` 同样允许 CORS | 浏览器可换 token（需 client_secret） | 同上 |
| GitHub `/login/oauth/access_token` 与 `/login/device/code` 返回 404 且无 CORS 头 | **浏览器直连不可用**；只能用 PAT 或自建代理 | 同上 |
| 回调地址 = `location.origin + location.pathname` | 协议 / 主机 / 端口任一不同都不匹配；`127.0.0.1` ≠ `localhost`，端口一变要重登记 | `oauthRedirectUri()` |

**实现落点**：

- `src/core/git-oauth.js`：`oauthProvider()`（端点与能力事实）、`buildAuthorizeUrl()`、
  `makePkce()`、`parseOAuthCallback()`、`exchangeOAuthCode({proxyUrl})`。
- `src/ui/workbench-view.js`：`startOAuth()` 写 `sessionStorage['stpt.oauth.pending']` 后跳转；
  `completeOAuthFromUrl()` 在 `renderAll()` 首次执行时处理回调，校验 `state` 与 15 分钟有效期，
  成功即按普通账号落盘（label = `<站点> OAuth`）并测试。
- 代理协议：`POST <proxyUrl>` JSON `{site, baseUrl, clientId, clientSecret, code, redirectUri, codeVerifier}`，
  返回 `{access_token}`。GitHub 必须走代理（或 PAT）。
- 教程：`HELP.gitToken`，含 GitHub / GitLab / Gitee / 自建 Gitea 的**可点击令牌页链接**、
  步骤与**最小权限**（GitHub Contents/Metadata 只读；GitLab `read_repository`；Gitee `projects`；Gitea `read:repository`）。

**禁止**：把 GitHub 的 OAuth 描述成「浏览器可直接登录」；伪造成功；把 token 写进日志或报告。
**验收**：`test/git-oauth.test.js`（7 项）；`scripts/ui-verify-oauth.cjs`（本地专属，
断言 OAuth 区块、回调地址一致、帮助页链接、GitHub 限制说明、日志并入全局）。

## 9. 页签归属：宿主 / 开发者 / 打包（2026-11-11 用户裁定）

**契约**：

- 页签顺序固定 `宿主 / 开发者 / 打包`，默认 `宿主`；页签 DOM 仍是面板头 `.panel-actions` 里的
  `.segmented > .seg-btn[data-exttab]`，没有新增容器或样式（内部键仍是 `cred`）。
- **开发者页**（`data-exttab="cred"`，`renderExtCredentials()`）= 账号列表 + 凭据存储位置 +
  OAuth 区块 + 令牌指引（自动更新已回到宿主页每条扩展，不在此页）；**不得**出现链接输入、
  上传 / 粘贴 / 分支、解析、开始安装、安装列表、失败链接导出等安装控件，也不提供「去安装」跳转。
- **宿主页版式**（2026-11-11 第二轮用户裁定，见 `workbench-single-view.md` §18）：
  - 顶部是横线工具条 `.ext-toolbar`（导出清单 / 检查更新 / 刷新 + 右侧排序），与存储图表的横线控件同形；
  - 列表头 `.ext-list-head` 才显示数量（`共 N 项`）、拖拽提示与自动更新勾选组；折叠头 summary **只写标题**
    （`已装扩展` + 数量徽标 + 箭头 + 展开提示），**禁止** `已装扩展（0 个，点击折叠）` 这类把数量写进标签的写法；
  - 每条扩展是带 `role="listitem"` 的 `[data-extrow]` 行，含拖拽手柄；自定义顺序存 `settings.extOrder`，
    排序方式存 `settings.extSort`（`custom` / `name` / `version` / `source`）。
- **安装区是面板固定页脚**：`<div class="ext-footer" id="extmgr-install-block">` 位于 `#extension-body`
  **之外**、`#extmgr-report-bar` 正上方（模板已有，不得再写进宿主页正文）；只在 `宿主` 页且报告未展开时显示。
  展开状态 `state.extInstallOpen` 只在本次会话内记住；展开区 `#extmgr-install-area` 在按钮**上方**，
  高度上限 46vh 自滚动（向上展开）。
- 安装区内容 = 链接输入 / 上传 / 粘贴 / 默认分支 / 解析 / 开始安装 / 待装列表（含分支与预检状态）/
  打开日志 / 导出失败链接 / 导出报告 / 清空；绑定函数仍是 `renderExtInstall()`。
- **重绘纪律**：安装进度、预检、分支列表等高频刷新只调用 `refreshInstallArea()`
  （只重绘 `#extmgr-install-area`），**不得**用 `renderExtensionView()`，否则每次都会重新拉取宿主已装扩展。
- 安装成功后的收尾刷新（`finally`）仍可整页重绘一次，用于刷新已装列表。
- **折叠可点击性是硬要求**：`Git 账号` / `OAuth 登录` / `已装扩展` / `服务端插件` 的 summary 必须有
  箭头（`.ext-chev`，展开时旋转 180°）、`cursor:pointer` 与「点击展开 / 收起」提示；数量用 `.ext-count` 徽标，
  **不得**只写「Git 账号（0）」让人不知道能点开。
- **列表内管理**：每行有「更新 / 卸载」与逐扩展自动更新（模式 + 秒级间隔）；列表头有全选 / 反选 / 取消 /
  批量更新 / 批量卸载 / 「指定版本 / 分支」。更新与卸载都必须如实回显宿主结果，失败不静默。
- **数据包恢复的扩展清单统一入口**：`maybeOpenExtensionInstaller()` 不再弹独立浮层，
  通过 `setExtensionManifestSink()` 交给 `view.openExtensionManager(entries)` → 宿主页底部安装区；
  安装 / 更新 / 指定版本分支都在同一处。

**判据**（本地 Playwright 取证）：`#extmgr-install-block` 的父节点是 `#extension-view`，`insideBody === false`；
`footer.bottom === reportBar.top`（间隙 0）；展开后 `area.bottom <= button.top`；`#extension-body` 内
`.ext-toolbar` 有 3 个按钮 + `[data-extsort]`，`.ext-list-head` 含 `共 N 项`，summary 不含「点击折叠」字样。

## 10. 自动更新：逐扩展设置 + 秒级轮询（2026-11-11 第三轮裁定）

**用户裁定**：自动更新**只在宿主页每条已装扩展上设置**（不再有开发者页父项 / 全局开关）；
可设置短至 **5 秒**轮询；模式与之前一致（关闭 / 仅提醒 / 直接更新）。

**设置项**（`settings-panel.js` 白名单 + 归一）：

| 键 | 默认 | 语义 |
| --- | --- | --- |
| `gitAutoUpdateRules` | `{}` | `{扩展名: {mode:'notify'|'auto', intervalSec, url?, global?}}`；缺省即关闭 |
| `extOrder` / `extSort` | `[]` / `custom` | 宿主列表自定义顺序与排序方式 |
| `autoUpdateMinIntervalSec` | `5` | 最短轮询间隔（秒），可手动调 |
| `autoUpdateMaxIntervalSec` | `86400` | 最长轮询间隔（秒），可手动调 |
| `autoUpdateDefaultIntervalSec` | `300` | 新规则默认间隔（秒） |
| `autoUpdateFailureBackoff` | `2` | 失败退避倍数（指数退避） |
| `autoUpdateFailureBackoffMaxSec` | `3600` | 退避上限（秒） |
| `autoUpdateNotifyTimeoutSec` | `8` | 「仅提醒」等待多久后更新（秒，且不超过本轮间隔） |

- `intervalSec` 由 `normalizeUpdateInterval()` 按**上面三个间隔设置**夹紧（边界不再写死）；非法值回落默认间隔。
- 所有运行阈值都来自 `updatePolicyOf(settings)`；代码里只保留单位换算与「最小 1 秒」的防零守卫。
- 旧模型（`gitUpdateSelected` + `gitUpdateIntervalHours` + `gitUpdateMode`）在 `normalizeUpdateRules()`
  中一次性迁移为逐扩展规则；`devMode` / `gitAutoUpdate` / `gitAutoUpdateLastAt` 已删除。

**运行契约**（`scheduleAutoUpdates()` / `runAutoUpdateTick()`）：

- 只有存在规则时才起 `setTimeout` 循环；下一次唤醒时间 = 所有规则的最早到期时间，
  且不早于 `autoUpdateMinIntervalSec`；演示模式不启动、不写设置。
- **失败退避**：每条规则维护连续失败计数，实际等待 = `intervalSec × backoff^failures`，
  截断到 `autoUpdateFailureBackoffMaxSec`；成功一次（含「已最新」）即清零，用户手动改规则也清零。
- 远端地址优先取 `gitInstalls` 登记；未登记时现场读宿主 `.git` 的 `remoteUrl`
  （`readHostExtensionGit`），解析不到就拒绝开启并提示，**不假装会自动更新**。
- `auto` 直接 `installExtensions([{ url, ref, replace:true, credential }])`；
  `notify` 先弹宿主原生浮层（可点击取消），等待 `autoUpdateNotifyTimeoutSec`（且不超过本轮间隔）后更新。
- 读不到本地 / 远端版本、仓库不可达：计一次失败并进入退避，不伪造结果。
- 更新失败记录到 `state.extUpdateFail`，可在更新检查行「删除后重装」。

**列表内批量管理**：每行有「更新 / 卸载」，列表头有全选 / 反选 / 取消 / 批量更新 / 批量卸载 +
可选「指定版本 / 分支」。更新走登记仓库（`install … replace:true`）或宿主 `POST /api/extensions/update`；
卸载走 `POST /api/extensions/delete`，批量卸载需二次确认。

**禁止**：把自动更新重新做成全局开关；未登记又读不到 origin 时仍然显示「已开启」；在演示模式写入真实设置。

## 11. 管理员分区与前后端误装（2026-11-11 第二轮）

- **管理员唯一判据**：`GET /api/users/me` 返回的 `admin === true`（`readHostIdentity()`）。
  非管理员**不显示**服务端插件分区、不伪造空列表；读不到身份同样按非管理员处理。
- **服务端插件清单**：`POST /api/users/plugins/list`（`requireAdminMiddleware`）→
  `{ ok, enabled, pluginsPath, plugins: [{directory, packageName, version, description, remoteUrl}] }`；
  分区可折叠（`details.ext-server-block`），如实显示 `enabled === false` 与路径。
- **插件类型识别**（`src/core/plugin-kind.js`）：仓库根有 `manifest.json` ⇒ 前端扩展；
  无 manifest 但有 `package.json` ⇒ 服务端插件；两者都取不到 ⇒ `unknown`（不猜、不拦截）。
- **误装拒绝**：`runExtInstall()` 在写入前拦截 `kind === 'server'` 的条目，弹出替代措施
  （宿主管理面板 → 服务端插件；或把目录放到 `plugins/` 后重启）。**不得**静默装进扩展目录。
- **更新失败预案**：更新检查结果行提供「删除后重装」，二次确认后
  `deleteExtensionViaHost(name, global)` → 按 `gitInstalls` 登记重装；删除失败即停止，不继续重装。

## 12. Git 可视化（只读，2026-11-11 第二轮）

**入口（常显）**：数据包列面板头固定有 `.segmented`（`数据包 / Git`），同一列内互换；
不再由开发者模式开关控制（用户裁定：看不到等于没有）。桌面与手机同一套逻辑。

**数据源（只读）**：

| 侧 | 端点 / 来源 | 说明 |
| --- | --- | --- |
| 本地 | `POST /api/extensions/version` | `{currentBranchName, currentCommitHash, isUpToDate, remoteUrl, remoteCommitHash}` |
| 本地 | `POST /api/extensions/branches` | `[{name, commit, current, label}]` |
| 云端 | 站点 API（分支 / 标签 / 最近 20 条提交 / 单次提交 diff） | 仅限该扩展在 `gitInstalls` 登记的仓库 |
| 工作区 | — | 宿主无只读端点 ⇒ 固定显示「宿主未提供」 |

**判据与降级**：`currentCommitHash` 为空 ⇒ 「历史已丢失 / 非 Git 仓库」，不伪造提交；
站点不可达 ⇒ 「未提供（原因）」；未登记仓库 ⇒ 只显示本地信息，不猜云端。

**只读**：不渲染检出 / 切换 / 提交 / 合并按钮；分支与提交行只能点开查看。

**核心函数**：`src/core/git-viz.js`（`normalizeLocalGit` / `gitStateOf` / `mergeBranches` /
`buildGitSummary` / `selectGitTargets` / `diffStat`）、`git-site.js`（`tagsEndpoint` / `commitDetailEndpoint` /
`remoteFileUrl` / `normalizeCommitList` / `normalizeTags` / `normalizeCommitFiles`）、
`host-bridge.js`（`readHostExtensionGit`）、`git-remote.js`（`listTags` / `listCommits` / `commitDetail` / `rawFile`）。

**验收**：`test/git-viz.test.js`（9）、`test/git-site-viz.test.js`（6）、`test/plugin-kind.test.js`（4）。

## 13. 作用域互转：全局 ⇄ 用户（2026-11-11 追加）

**端点事实**（`POST /api/extensions/move`，SillyTavern 与 Luker 上游同源；2026-11-11 核对两端
`src/endpoints/extensions.js` 的 `/move` 处理器）：

| 字段 | 语义 |
| --- | --- |
| `extensionName` | 扩展**目录名**（不含 `third-party/` 前缀）；宿主只做 `sanitize()` |
| `source` / `destination` | `global` 或 `local`；宿主把**任何非 `global`** 都当作用户目录 |
| 结果 | 204 成功；404 源目录不存在；409 目标已存在或源=目标；403 非管理员 |

- **双向移动都要求管理员**：两端服务端都先判 `request.user.profile.admin`；原生客户端也只在
  `isAdmin()` 时开放入口（`public/scripts/extensions.js` 的 `onMoveClick()`）。
- 插件判据唯一：`readHostIdentity().admin === true`（`GET /api/users/me`）；非管理员**不渲染**按钮。
- 实现落点：`src/ui/host-bridge.js` 的 `moveExtensionViaHost()`（CSRF、120 s 超时、原文截断）；
  `src/ui/workbench-view.js` 的 `moveScopeWithConfirm()` / `moveInstalledExtension()`；
  `index.js` 的 `actions.moveExtension`。失败按 `forbidden / conflict / not-found / network`
  如实回显，不静默、不伪造成功。
- 安装到全局：`installExtensionViaHost({ url, branch, replace, global })` 透传宿主；
  `installExtensionBatch()` 读 `entry.global`。界面只在管理员时显示「安装到全局」，默认仍是用户作用域。

## 14. 扩展加载顺序（只读事实，2026-11-11 取证）

**事实**：`manifest.json` 的 `loading_order`（数字，越小越早）。缺失时 `parseInt(undefined)` 为 `NaN`，
比较器把它当 0 处理，等价于「最早」，同值再按 `display_name` 排序。

| 宿主 | 排序与执行 | 证据 |
| --- | --- | --- |
| SillyTavern | 升序排序，同值用 `display_name` 兜底；**逐个 `await` 串行激活** | `public/scripts/extensions.js` 的 `sortManifestsByOrder` 与 `activateExtensions()` |
| Luker | 同一升序；**同 `loading_order` 组内并行**，组与组之间串行（等上一组 `activate` 全部 settle） | `public/scripts/extensions.js` 的 `activateExtensions()`（函数注释写明组语义与真实踩坑案例） |

- 原生 UI **没有**调整真实加载顺序的入口；`sortManifestsByName` / `sortManifestsByOrder` 只作用于
  **列表显示**（`loadExtensionSettings` 的排序开关）。
- 宿主扩展端点只有 install / update / move / delete / version / branches / switch / discover，
  **没有**写回 `manifest.json` 的端点。
- 因此「手动调整」= 编辑该扩展自己的 `manifest.json` 的 `loading_order` 后刷新页面
  （全局扩展需要管理员/文件权限）。本插件只展示 `#N` 并支持按它排序，**不得**提供伪编辑控件。

## 15. 扩展写操作串行队列（2026-11-11，规避宿主 staging 竞态）

**宿主事实**（Luker 2.9.0-rc.1，ST 同源）：`POST /api/extensions/update|install` 进入写入前会调用
`makeStagingPath()`（`src/sync/staging.js`）：
- 在目标同级建隐藏目录 `.luker-staging-<label>-<hex>`；
- 建之前先 `sweepStaleStaging(parentDir)`：`readdir` 列出条目 → 逐条 `lstat` →
  删除**早于本进程启动**的 staging 条目。

**缺陷**：两个更新并发 ⇒ 两个 `sweepStaleStaging` 列出同一批旧条目 ⇒ A 删除后，
B 的 `lstat` 抛 `ENOENT` ⇒ 该扩展本次更新失败。失败项随机、重试可能成功。
触发前提是同级目录确实存在上一进程残留的 `.luker-staging-*`（例如强制结束进程）。

**插件侧能做的与不能做的**：
- 启动期自动更新发生在 `bootstrapExtensions()` 内、`activateExtensions()` **之前**，
  任何扩展脚本都尚未加载 ⇒ 插件**无法拦截**它，不能在前端补掉这个服务端竞态。
- 缓解：在宿主 `config.yaml` 关闭 `extensions.autoUpdate`（本机已改 `false`，
  备份 `config.yaml.bak-20261111-autoupdate`），改由本插件逐扩展更新。
- 代码契约：`workbench-view.js` 的 `queueExtMutation()` 把**所有**插件发起的写操作串成
  一条 Promise 链：`runExtInstall` / `updateInstalledExtension` / `uninstallInstalled` /
  `reinstallExtension` / `moveInstalledExtension`。手动、批量、自动更新共用同一条链。
- **禁止**把扩展写操作改回并发（如批量更新用 `Promise.all`）；会重新触发 ENOENT。

**上游修复建议**（不由本插件修改宿主源码）：`sweepStaleStaging` 的 `lstat` 加
`try/catch`，`ENOENT` 直接 `continue`；或对同一 `parentDir` 的 sweep 加进程内互斥。
