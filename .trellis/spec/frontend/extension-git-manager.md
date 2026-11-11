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

## 9. 页签归属：宿主 / 凭据 / 打包（2026-11-11 用户裁定）

**契约**：

- 页签顺序固定 `宿主 / 凭据 / 打包`，默认 `宿主`；页签 DOM 仍是面板头 `.panel-actions` 里的
  `.segmented > .seg-btn[data-exttab]`，没有新增容器或样式。
- **凭据页**（`data-exttab="cred"`，`renderExtCredentials()`）只渲染账号列表、凭据存储位置、
  OAuth 区块与令牌指引；**不得**出现链接输入、上传 / 粘贴 / 分支、解析、开始安装、安装列表、
  失败链接导出等安装控件，也不提供「去安装」跳转。
- **安装区**全部搬到宿主页**下半**：已装列表之后再追加
  `<details class="ext-install-block" id="extmgr-install-block">`，默认收起（`state.extInstallOpen=false`），
  summary 文案 `extmgr.installBlock`；展开状态只在本次会话内记住。
- 安装区内容 = 链接输入 / 上传 / 粘贴 / 默认分支 / 解析 / 开始安装 / 待装列表（含分支与预检状态）/
  打开日志 / 导出失败链接 / 导出报告 / 清空；绑定函数仍是 `renderExtInstall()`。
- **重绘纪律**：安装进度、预检、分支列表等高频刷新只调用 `refreshInstallArea()`
  （只重绘 `#extmgr-install-area`），**不得**用 `renderExtensionView()`，否则每次都会重新拉取宿主已装扩展。
- 安装成功后的收尾刷新（`finally`）仍可整页重绘一次，用于刷新已装列表。

**判据**：`宿主` 页 `#extmgr-install-block` 存在且 `open=false`；展开后 `#extmgr-install-area` 内
`#extmgr-run` / `#extmgr-links` 存在；`凭据` 页 `#extmgr-run` 与 `#extmgr-install-block` 均不存在；
页签显示文本为 `宿主 / 凭据 / 打包`。
