# PLAN-2026-11-11 · 扩展管理：选扩展打包 + 每包 git + P2

> 用户 2026-11-11 追加指令。**执行中实时更新状态**，不凭记忆补记。

## 一、用户裁定（本轮口径）

1. 扩展管理新增「打包」页，**按图表逻辑组织**：已载入的每个数据包分组，不切包。
2. git 清理（保留 / 只留更新所需 / 无历史）**每包独立**。
3. 「本体全量」= **只过滤扩展**；聊天、角色、世界书等其它类目仍按图表树勾选，互不影响。
4. 仍**按目标宿主形式打包**（沿用既有 transform 目标布局映射，不做二次改写）。
5. 范围做到 **P2**；凭据多站点多账号 + 服务端持久化是必需项；始终按**单用户（酒馆用户）**设计。

## 二、目标与判据

| # | 目标 | 判据（可验证） |
| --- | --- | --- |
| E1 | 扩展管理有「打包」页 | `#extmgr-tabs` 出现第四页；桌面/手机都能进 |
| E2 | 按包分组列出扩展 | 每个已载入包一组；组头显示包名与目标布局；无扩展的包不出组 |
| E3 | 勾选只影响扩展 | 取消某扩展 ⇒ 产物无该扩展目录；聊天/角色等勾选不变 |
| E4 | 与图表树双向同步 | 打包页取消 ⇒ 图表树该扩展组变未选；图表树取消 ⇒ 打包页取消 |
| E5 | git 每包独立 | 两包设不同 git 模式 ⇒ 两次产物分别按各自模式，互不覆盖 |
| E6 | 仅清单模式兼容 | 仅清单时扩展组显示清单条目；打包页勾选同样生效 |
| E7 | 目标宿主形式不变 | 换目标布局后产物目录仍按目标映射（`extensions/` ↔ `data/default-user/extensions/` 等） |

## 三、改点（文件级）

- `src/core/ext-pack.js`（新，纯逻辑）：从 `group:extensions` 节点树派生「扩展单元」
  （名称 / 叶子 id / 体积），覆盖 `extensions/<n>`、`extensions/third-party/<n>`、
  `public/scripts/extensions/third-party/<n>`、`data/extensions/third-party/<n>`、
  `_tauritavern/extension-sources/<n>` 五种路径形态。
- `src/ui/workbench-view.js`：
  - `state.gitModeByPkg = {}`；`packageGitMode(pkg)`；`getExportOptions(pkg)` 读本包模式。
  - 图表卡 git 选择器写 `state.gitModeByPkg[pkg.id]`。
  - 新增 `renderExtPack(body)`：多包分组、每包全选/全不选、每包 git 选择、每扩展复选框；
    勾选直接写 `state.sel[treeKey('pkg:'+id, leaf.id)]`，随后 `renderChart()` 同步。
- `src/ui/workbench-template.js`：`#extmgr-tabs` 增加 `data-exttab="pack"`。
- `src/i18n/locales/{zh-CN,en-US}.js`：新增打包页文案。
- 规范回流：`.trellis/spec/frontend/workbench-single-view.md` 增节。

## 四、P2 / 凭据（本轮执行）

### 4.1 已核实事实（宿主源码 2026-11-11）

- `POST /api/extensions/install` 收 `{ url, global, branch, replace }`，服务端 `git clone --depth 1 --branch <branch>`。
- 目录名取 **URL 最后一段**：直接传 `https://host/o/r/tree/dev` 会装成名为 `dev` 的目录 ⇒
  **`/tree/<ref>` 必须由插件解析成「仓库根 URL + branch 参数」**再交给宿主。
- `--branch` 接受分支或标签；**commit SHA 不被 `git clone --branch` 支持**，因此 commit 安装只能
  尝试后如实报错，并给出「改用分支/标签」的建议。
- 私有仓库只能经宿主服务端克隆：插件把凭据拼进 URL（`https://<token>@host/o/r`）。
  该 URL 可能被宿主写入该扩展的 `.git/config`。**必须在安装前显式告知**。

### 4.2 目标与判据

| # | 目标 | 判据 |
| --- | --- | --- |
| P2-1 | URL 归一 | `owner/repo`、`gh:`/`github:`/`gitee:`/`gitlab:` 短写、无协议 host/path、仓库页地址（`/tree/<ref>`、`/blob/<ref>/…`、`/commit/<sha>`、`/releases/tag/<tag>`、`/-/tree/<ref>`）→ 仓库根 + ref；纯函数可测 |
| P2-2 | 分支列举 | 站点头像 API 列分支；无凭据时公开仓可用；失败返回原因码，UI 显示「未提供」，不伪造 |
| P2-3 | 仓库摘要 | 描述 / 默认分支 / 星标 / 最近推送；失败显示「未提供」 |
| P2-4 | 更新检查 | 已登记来源的已装扩展显示「可更新 / 已最新 / 未知」；只读，不自动改 |
| C1 | 多站点多账号 | 每站点多账号、☆默认、逐个登录/测试、全部测试 |
| C2 | 服务端持久化 | 默认写宿主 `extension_settings`（随 settings.json 落服务端）；可选「仅浏览器」不写宿主 |
| C3 | 单用户口径 | 不引入任何「多酒馆用户」分支 |
| P2-5 | 隐私提示 | 安装页/账号区/设置/README 均写明：插件无自有远端、不向第三方发送；默认存服务端（有服务器或管理员权限者可见）；可改仅浏览器 |
| P2-6 | 私有仓提示 | 安装前若识别为私有/不存在，显式提示「需要登录账号」；失败信息按 401/403/404 分类给出结论 |

### 4.3 改点（文件级）

- 新增 `src/core/git-url.js`：`normalizeRepoInput` / `parseRepoUrl` / `classifyGitUrl` /
  `buildAuthedUrl` / `isCommitRef`（纯逻辑，无 DOM/fetch）。
- 新增 `src/core/git-accounts.js`：账号归一/增删/默认/按仓库匹配/脱敏（纯逻辑）。
- 新增 `src/core/git-site.js`：站点识别 + API 端点与鉴权头构造 + 响应归一（纯逻辑）。
- 新增 `src/ui/git-remote.js`：有界超时的 fetch 封装（分支 / 摘要 / 远端最新提交），失败返回原因码。
- 新增 `src/ui/git-accounts-store.js`：账号与安装登记读写；`server` 模式走宿主 settings，`browser` 模式只写 localStorage。
- `src/ui/settings-panel.js`：新增 `gitCredentialStorage`（server / browser）设置项与隐私说明。
- `src/ui/workbench-view.js`：安装页增加「账号」区与 URL 归一预览、分支下拉、摘要；已装页增加「检查更新」。
- `src/i18n/**`、`README.md`、`docs/DEVELOPER-GUIDE.md`、`.trellis/spec/frontend/extension-git-manager.md`。

### 4.4 执行状态

- [x] P2-1 URL 归一（`git-url.js`，13 例）
- [x] P2-2 分支列举（`git-site.js` + `git-remote.js`）
- [x] P2-3 仓库摘要（同上）
- [x] P2-4 更新检查（已装页，只读，unknown 不伪造）
- [x] C1/C2/C3 账号与存储（多站点多账号、默认、测试、服务端/仅浏览器）
- [x] P2-5/P2-6 隐私与私有仓提示（安装前弹窗 + 失败标注 + 账号区隐私块）
- [x] 文档（README 重排 / DEV GUIDE / spec `extension-git-manager.md`）
- [x] 验证：core 29 例 + `ui-verify-ext-git.cjs` + 六守卫 + 构建

## 五、执行状态

- [x] E1 打包页 tab（`#extmgr-tabs` 第四页）
- [x] E2 多包分组（`renderExtPack` + `src/core/ext-pack.js`）
- [x] E3 只过滤扩展（勾选写回叶子，其它类目不动）
- [x] E4 双向同步（同用 `state.sel`，任一侧改动后 `renderChart()`）
- [x] E5 每包 git（`state.gitModeByPkg` + `packageGitMode(pkg)`）
- [x] E6 仅清单兼容（清单态显示「仅清单（勾选不生效）」并禁用）
- [x] E7 目标形式不变（沿用 transform 目标映射）
- [x] 响应式统一：JS 阈值 640→860，并与 CSS 合并为单一 `data-view` 判据；`#top-actions` 与 `#view-switch` 换位
- [x] 目标小测试 + 守卫（`ext-pack` 6 项通过；六守卫全绿；构建 exit 0）
- [x] UI 取证：六档宽度无溢出且切页正确；fixture 包打包页勾选与图表树双向同步、每包 Git 保持
