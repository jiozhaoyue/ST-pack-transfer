# 计划 · 日志类型多选 / WebDAV 真机自检 / Git 平台链接全通 / 可选代理

日期：2026-11-12　状态：**已实现，待提交**

## 完成情况（2026-11-12）

- 日志类型多选：已改 4 类独立开关（INFO/WARN/ERROR/SUCCESS），默认全选；无选中时给提示；
  SUCCESS 行补样式。浏览器实测：默认 4 个激活、逐类关闭条数变化、全关出提示、恢复后回 4 个激活。
- WebDAV：新增 `selfTest()` 六步 + `#webdav-test`「测试连接」按钮；`probe()` 不再按 `Allow`
  判死写入（真机 Apache 的 Allow 不含 PUT/MKCOL 却可写）；列表过滤自身条目；
  清理集合必须带尾斜杠（否则 301 到 http 触发 CORS 预检失败）。
  真机无头实测：OPTIONS 200 / PROPFIND 207（17 项）/ MKCOL / PUT / GET 一致 / DELETE 204，控制台零报错。
- Git：`resolveSite()` 按账号站点类型解释自建主机（GHE → `/api/v3`）；读文件带凭据走内容 API
  （GitHub `Accept: raw` 绕开 raw 域名不收 Authorization）；Gitee raw 保留 `access_token`；
  GitLab token-only 克隆改 `oauth2:<token>`。单测覆盖 4 平台端点与回落。
- 代理：`net-proxy.js` + 设置 → 网络；Git / WebDAV（含备份、上传、下载、删除）全部接线；
  S3 不代理（SigV4 绑定域名）。宿主原生 `requestProxy` / `enableCorsProxy` 事实已写入文档。
- 门槛：目标小测 99 项全绿；六个 UI 守卫全过。

## 第二轮（同日「继续」）：健壮性补强

1. **数据面超时与 8 MiB 分片**：原先 PUT/GET 与 OPTIONS 共用 20 秒 ⇒ 8 MiB 分片要求
   ≈410 KB/s，远端酒馆/家宽上行必然每片超时、上传永远失败。改为 `transferTimeoutMs`
   默认 120 秒（≈70 KB/s 下限），控制面仍 20 秒。单测用「尊重 AbortSignal 的慢响应」验证两套超时各自生效。
2. **自检分级 + 跟随前缀**：`OPTIONS/PROPFIND` 改为参考项（服务器禁列目录时上传仍可用），
   只计 `advisoryFailed`；测试目录落在用户填的目录前缀下，写入位置与正式上传一致。
3. **GitHub raw 域名不可达**：本机实测 `raw.githubusercontent.com` 连接重置、`api.github.com` 200。
   `readFile` 改为双通道：有凭据 API 优先→raw 回落；无凭据 raw 优先→失败回落内容 API。
   真机抽查：GitHub 公共仓 rawFile 由「network 失败」变为 `via:api` 5941 B；GitLab 仍 `via:raw`；
   Gitee 对不存在的文件如实 404。
4. 三平台公共仓真机读数（2026-11-12）：
   - GitHub `SillyTavern/SillyTavern`：分支 12，默认 `release`，rawFile via api 5941 B
   - GitLab `gitlab-org/gitlab-foss`：分支 100，默认 `master`，rawFile via raw 14596 B
   - Gitee `mirrors/nginx`：分支 24，默认 `master`（该镜像无 package.json/README，404 为真实结果）

## 目标与验收判据

1. **日志筛选改为类型多选，默认全选**
   - 判据：工具栏出现 INFO / WARN / ERROR / SUCCESS 四个可独立开关的类型按钮，初次打开四类全选；取消某一类后该级别行消失，其余仍在；四类全不选时显示「未选择类型」而不是空白；SUCCESS 日志首次可被筛选（此前无入口）。
2. **WebDAV 真机可用，并提供「测试连接」**
   - 判据：以 `https://webdav.zhaoyuecst.us.ci/`（azureuser）实测 OPTIONS→PROPFIND→MKCOL→PUT→GET 校验→DELETE 六步全部成功，逐步显示状态；失败显示原因码。
   - 客户端健壮性：OPTIONS 的 `Allow` 缺 `PUT`/`MKCOL` 不得判成不可写（该服务器实际 `Allow` 就不含 PUT 但写入正常）；目录列表过滤自身条目。
3. **Git 账号登录后，四个平台（GitHub / GitLab / Gitee / 自建 Gitea、含 GitHub Enterprise）链接都可用**
   - 判据：带凭据时远程 manifest / 原始文件走各站点**鉴权可用的**通道（GitHub 私有 raw 直连不可用 ⇒ 走 contents API；Gitee 必须带 `access_token` 查询参数）；自建 GitHub Enterprise 端点走 `https://<host>/api/v3`。
4. **插件可选 CORS 代理**
   - 判据：设置里可填代理地址，留空即直连；填了之后 Git 站点请求与 WebDAV 请求经该代理转发；不影响任何本地路径。
   - 文档如实说明：Luker/ST 的 `requestProxy` 只能改服务端 `config.yaml`（需要能编辑服务端文件并重启，不是 OS 管理员权限），`enableCorsProxy` 同为配置项；浏览器插件无法直接使用 SOCKS/HTTP 代理。

## 改点

| 面 | 文件 | 内容 |
| --- | --- | --- |
| 日志 UI | `src/ui/workbench-template.js`、`workbench-view.js`、`style.css`、i18n | 4 类多选；`state.logLevels`；SUCCESS 行样式；未选中提示 |
| WebDAV | `src/core/webdav-client.js`、`workbench-view.js`、模板、i18n | `runSelfTest()` 六步；`#webdav-test` 按钮与结果区；`probe` 的 Allow 语义；列表自条目过滤 |
| Git | `src/core/git-site.js`、`src/ui/git-remote.js` | host 感知端点（GHE `/api/v3`）；各站点鉴权内容端点；raw 请求不再丢弃 token 查询参数 |
| 代理 | `src/core/net-proxy.js`（新）、`git-remote.js`、`webdav-client.js`、`settings-panel.js`、`settings-store.js`、模板 | `netProxyUrl` 设置项 + URL 改写；留空直连 |
| 守卫/文档 | `scripts/single-template-source.js`、`scripts/control-consumer-guard.js`、`docs/DEVELOPER-GUIDE.md`、`README.md` | 新控件登记；功能清单同步 |

## 依赖与顺序

1. 检索门禁已满足（GitHub API 双通道检索）。
2. 先纯逻辑（webdav selfTest、git-site、net-proxy）→ 单测 → 再接 UI → 最后守卫与文档。
3. UI 验收走 `npm run build && npm run preview` + Playwright 无头（铁律 23）。

## 证据记录

- 2026-11-12 curl 实测该 WebDAV：`OPTIONS 200`（Allow 不含 PUT/MKCOL）、`PROPFIND 207`、`MKCOL 201`、`PUT 201`、`GET 200`、`DELETE 204`；响应含 `Access-Control-Allow-Origin: *`，浏览器直连可行。
- 代码取证：`workbench-view.js:3478` 的 `listObjects` 未过滤自身目录条目；`git-remote.js:113/155` 拿 `authed()` 时丢弃了返回的 URL（Gitee 的 `access_token` 丢失）；`git-site.js` 对 `github` 站点硬编码 `api.github.com`（GitHub Enterprise 无法使用）。
