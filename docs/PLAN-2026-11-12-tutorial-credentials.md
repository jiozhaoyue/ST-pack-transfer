# 计划：教程引导凭据 + 全量文档对齐（2026-11-12）

## 目标

1. 插件内教程（`TUTORIAL_GOALS`）覆盖「去哪填、怎么拿到 token」——扩展管理的 Git 令牌与迁移备份的 S3 / WebDAV 凭据。
2. 帮助视图新增一页「凭据与令牌」，把四类凭据（GitHub / GitLab / Gitee / Gitea、S3、WebDAV）的需要项、最小权限、填入位置集中说明。
3. 把所有已过时的教程 / 帮助 / README / DEVELOPER-GUIDE 文案对齐到当前实现。

## 判据（验收）

| # | 判据 | 证据 |
| --- | --- | --- |
| AC-1 | 扩展管理教程出现「开发者页 → Git 账号 → 令牌获取指引」三步 | 教程步骤数组 + 实机截图 |
| AC-2 | 迁移备份教程出现「公网 → 凭据说明」步骤，能打开 `help.credentials` | 同上 |
| AC-3 | `help.credentials` 四段齐全（Git / S3 / WebDAV / 存储与安全） | `npm test` 与渲染结果 |
| AC-4 | 扩展管理页签名全仓统一为「宿主 / 开发者 / 打包」 | grep 无「宿主 / 凭据 / 打包」 |
| AC-5 | 「包含登录凭据」文案与代码一致（默认勾选） | `settings-panel.js` 与 i18n 对照 |
| AC-6 | 五个 UI 守卫 + 目标测试全绿 | 命令输出 |
| AC-7 | README 与 DEVELOPER-GUIDE 在同一次提交内同步 | `git diff` |

## 改点

| 文件 | 改动 |
| --- | --- |
| `src/i18n/locales/zh-CN.js` / `en-US.js` | 修正 `tutorial.ext.tabsDesc`、`help.extmgr.intro/installP2/dataP2`；新增教程步骤键与 `help.credentials.*` |
| `src/ui/workbench-view.js` | `TUTORIAL_GOALS` 增步骤；`tutorialPrepareStep()` 支持 `extTab / openAccounts / openOauth / view=cloud / transferTab / cloudProvider`；`HELP.credentials`；`oauthHtml` 记忆展开态 |
| `src/ui/workbench-template.js` | 公网页签右侧加「凭据说明」`?` 按钮（`data-help="credentials"`） |
| `README.md` | §3.4 令牌指引扩写；§四 新增「需要哪些凭据」对照表 |
| `docs/DEVELOPER-GUIDE.md` | 页签命名对齐；新增凭据帮助页与教程步骤落点 |

## 依赖 / 风险

- 新按钮无 id，走 `group:.help-btn` 声明，不触发控件消费点守卫新增条目。
- 教程新增的 `view:'cloud'` 分支必须保证离开时能复原，不能污染真实状态（演示模式整体快照已覆盖）。
- `oauthHtml()` 展开态只在内存 state，不落盘。

## 执行状态

- [x] 现状取证（页签 / 文案 / 默认值 / 守卫）
- [x] i18n 修正与新增
- [x] 视图与模板改动
- [x] README / DEVELOPER-GUIDE 同步
- [x] 守卫与目标测试
