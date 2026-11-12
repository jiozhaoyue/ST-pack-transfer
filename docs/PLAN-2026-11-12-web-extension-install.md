# 计划：Web 形态把扩展装进数据包（2026-11-12）

## 背景与现状取证

- 现在「开始安装」= `installExtensionBatch()` → `installExtensionViaHost()` → 宿主 `/api/extensions/install`。
  独立 Web 没有宿主，**这条路必然失败**（`host.platform === 'standalone'`）。
- 仓内**没有**任何拉取仓库归档的代码（grep `tarball|zipball|/archive/` 只命中 PureTavern 备份端点）。
  即：**Web 形态不能安装扩展**是当前事实，不是配置问题。

## 目标

Web / 独立形态下，安装扩展改为「**下载仓库 → 去顶层目录 → 按目标宿主布局写进当前数据包的扩展区**」，
随包一起导出，恢复进任意酒馆即生效。宿主形态保持原样（仍走宿主安装）。

## 判据

| # | 判据 | 证据 |
| --- | --- | --- |
| AC-1 | 站点归档地址正确（GitHub `/tarball/<ref>`、Gitee `/repos/{o}/{r}/zipball/<ref>`、GitLab `/archive.zip?sha=<ref>`、Gitea `/archive/<ref>.zip`） | 单测 |
| AC-2 | 私有仓可用账号令牌下载；日志与报告脱敏 | 单测 + 真机 |
| AC-3 | 解压后去掉顶层目录，按目标宿主落点写入（ST/Luker `extensions/<名>/`；TT 用户级 `data/default-user/extensions/`、全局 `data/extensions/third-party/`；PT `data/extensions/third-party/`） | 单测 |
| AC-4 | 写入当前选中的数据包；生成导出包含该扩展；恢复后宿主能识别（manifest 在根） | 真机 |
| AC-5 | 服务端插件（无 manifest）仍被拦截 | 单测 |
| AC-6 | 插件形态行为零变化 | 目标测试 |

## 改点

| 文件 | 改动 |
| --- | --- |
| `src/core/repo-archive.js`（新） | 归档 URL 构造 + 下载（带凭据）+ 解压 + 去顶层 |
| `src/core/ext-install-web.js`（新） | 纯决策：目标布局落点、同名去重、服务端插件拦截 |
| `src/ui/host-bridge.js` | 不新增宿主分支；仅导出复用 zip 工具 |
| `src/app/` 或 `index.js` | `installExtensions` 在 standalone 时改走包注入 |
| `src/ui/workbench-view.js` | 报告文案：Web 形态显示「已注入到包」 |
| `README.md` / `docs/DEVELOPER-GUIDE.md` | 同提交更新 |

## 风险

- 包模型需先确认：包在 IndexedDB 里是原始 zip 还是解包后的树；注入方式决定是改写 zip 还是重建。
- 大仓库下载内存占用：需流式/限制体积。

## 执行状态

- [x] 取证包模型与注入接缝（源包 Blob + `augmentZip`；`detectLayout` 判布局）
- [x] 归档下载 + 解压 + 布局落点（改用「列树 + 并发逐文件」：归档端点跨域不可用；6 并发、20s 超时）
- [x] 接到安装动作与报告（standalone 走 `installExtensionsIntoPackage`，另存「(含扩展)」包）
- [x] 单测（`test/ext-install-web.test.js` 12 项）
- [ ] 真机（无头浏览器）验证注入结果
- [x] 文档同步
