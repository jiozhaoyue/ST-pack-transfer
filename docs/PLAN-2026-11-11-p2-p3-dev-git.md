# PLAN-2026-11-11 · P2 开发者页 / 管理员与误装预案 / P3 Git 可视化（只读）

> 来源：`HANDOFF-2026-11-11-4.md` §四 §五。三项待定项已于 2026-11-11 由用户在交互问答里裁定：
>
> | 待定项 | 裁定 |
> | --- | --- |
> | P3 入口形态 | **数据包列页签互换**：数据包列面板头加「数据包 / Git」分段按钮，同一列内互换（与迁移面板 `lan/cloud` 同构）；桌面与手机同一套逻辑 |
> | 开发者模式判定 | **设置里加开关**（默认关闭）；打开后才出现 Git 页签与 Git 可视化 |
> | 自动更新层级 | **父项总开关 + 逐扩展勾选**：父项「自动更新」为总开关，子项为检查间隔与模式（全局生效）；宿主页每条扩展用复选框表示是否参与，支持全选 / 反选 / 取消；移除逐扩展三档 `select` |
>
> 原四项基线不变：Git 只读、本地宿主 `.git` + 登记仓库（只读）、默认 6h + 仅提醒可配置、桌面整窗铺满。

## 期次状态

| 期 | 范围 | 状态 |
| --- | --- | --- |
| P1 | 铺满 / 顺序 / 教程重开 / 选择锁 / 开发者页 / 折叠 | 已完成（`9b91f3f`、`8ce80c4`） |
| P2 | 父子层级 / 逐扩展勾选 / 可配置间隔与模式 / 管理员分区 / 误装拒绝 / 帮助补全 / 删除重装 | 本轮 |
| P2 | 父子层级 / 逐扩展勾选 / 可配置间隔与模式 / 管理员分区 / 误装拒绝 / 帮助补全 / 删除重装 | 已完成 |
| P3 | Git 可视化（本地 `.git` + 云端只读、分支 / 提交 / 单次 diff / 状态、数据包列互换） | 已完成 |

## 用户第二轮追加裁定（2026-11-11，原话整理）

| 项 | 裁定 |
| --- | --- |
| 安装扩展位置 | 必须是扩展管理面板的**固定页脚**：贴着底部安装报告条，不得停在正文中间 |
| 宿主页版式 | 与存储图表同一套语言：**上部是一条横线放按钮**；列表必须有 DOM 包裹、一条条成列表 |
| 排序 | 扩展**可排序**（拖拽自定义顺序 + 名称 / 版本 / 来源排序，选择要记住） |
| 数量文案 | **禁止**「已装扩展（0 个，点击折叠）」；数量只在**列表头**显示 |
| 折叠可点击性 | 「Git 账号（0）」必须明显可点开：箭头 + 「点击展开 / 收起」+ `cursor:pointer` |

## P2 判据

1. **设置项**（`settings-panel.js`）：`devMode`（默认 `false`）、`gitAutoUpdate`（默认 `false`）、
   `gitUpdateIntervalHours`（默认 `6`，范围 1–168）、`gitUpdateMode`（`notify` 默认 / `auto`）、
   `gitUpdateSelected`（默认 `[]`，参与自动更新的扩展名）。全部走 `SETTINGS_DEFAULTS` + `normalizeSettings`，
   **禁止在业务代码里硬编码 6 或 `notify`**。
2. **`readSettings` 不得回吐默认值覆盖会话内已有设置**：它只读取对话框里存在的控件，
   未出现的键（`gitAccounts` / `gitInstalls` / `gitDevMode` / 新增键）必须保留调用方传入的基线。
   现状 `index.js` 的 `Object.assign(settings, readSettings(body))` 会把 Git 账号与安装登记整段清空，本轮修复。
3. **开发者页父子结构**（`renderExtCredentials`）：
   ```
   ☑ 自动更新                      ← 父项 data-devparent
     ├ 检查间隔 [6] 小时            ← 子项 data-devinterval，父项未勾时 disabled
     └ 模式  (仅提醒|直接更新)       ← 子项 data-devmode，父项未勾时 disabled
   ```
   勾父项时子项随之启用并带出当前值（缺省 6 / `notify`）；「间隔」与「模式」不得拆成两个独立区块。
4. **宿主页逐扩展勾选**：每个**经 Git 安装**（`gitInstalls` 有同名登记）的行首是复选框 `data-devext`，
   勾选即写入 `gitUpdateSelected`；工具栏提供 `全选 / 反选 / 取消`。未登记的扩展不显示复选框。
5. **`runDevAutoUpdate()` 读设置**：`devMode && gitAutoUpdate` 才运行；参与集 = `gitUpdateSelected`；
   模式取 `gitUpdateMode`（`auto` = 直接更新，`notify` = 原生浮层提示 8s 可取消）；
   间隔取 `gitUpdateIntervalHours`，以 `gitAutoUpdateLastAt` 记录上次检查时间，未到间隔直接跳过。
   演示模式下只读不写。
6. **管理员识别**：`GET /api/users/me` 的 `admin` 字段是唯一判据（宿主事实，非推断）。
   非管理员**不显示**服务端插件分区、不伪造空分区；管理员才读 `POST /api/users/plugins/list`
   （返回 `{ok, enabled, pluginsPath, plugins:[{directory, packageName, version, description, remoteUrl}]}`），
   分区可折叠、与前端扩展视觉区分（`ext-server-block`），并如实显示 `enabled` 状态。
7. **前后端误装拒绝**：安装预检阶段识别仓库类型 ——
   有 `manifest.json` ⇒ 前端扩展；无 `manifest.json` 但有 `package.json` ⇒ 服务端插件。
   服务端插件交给前端安装入口时**拒绝**（`runExtInstall` 前置拦截），并给替代措施：
   宿主管理面板 → 服务端插件，或把目录放到 `plugins/`。不得静默安装到扩展目录。
8. **更新失败可删除重装**：更新检查结果里失败 / 需重装的登记行提供「删除后重装」，
   二次确认后 `deleteExtensionViaHost(name, global)` → 重新 `installExtensionBatch`；失败如实显示。
9. **`HELP.extmgr` 补全**：私有仓库设置位置（开发者页 Git 账号 / 隐私说明）、
   前端扩展与服务端插件的区别、开发者页（账号 / 自动更新）与 Git 可视化说明。

## P3 判据

1. **入口**：设置 `devMode=true` 时，数据包列面板头出现 `.segmented`（`数据包 / Git`）；
   两者在同一列内互换；关闭开发者模式时页签隐藏且强制回到数据包。
2. **本地数据源**：仅宿主已装扩展的 `.git` —— `POST /api/extensions/version`（分支 / HEAD / 是否最新 / remoteUrl）
   与 `POST /api/extensions/branches`（分支列表）。`currentCommitHash` 为空 ⇒ 如实显示「历史已丢失 / 非 Git 仓库」，
   不伪造提交。工作区状态宿主未提供端点 ⇒ 显示「宿主未提供」。
3. **云端数据源**：只读该扩展登记的仓库（`gitInstalls` 同源），只取分支 / 标签 / 最近提交 / 单次提交 diff，
   不拉全量历史。
4. **只读**：不提供检出 / 切换 / 提交 / 合并；UI 不出现任何写操作按钮。
5. **占位数据**：示例 / 演示数据一律读 `src/data/*.json`，禁止在 JS 里硬编码仓库清单。

## 实现落点

| 层 | 文件 | 改动 |
| --- | --- | --- |
| 核心 | `src/core/git-site.js` | 新增 `tagsEndpoint` / `commitDetailEndpoint` / `normalizeTags` / `normalizeCommitList` / `normalizeCommitFiles` / `remoteFileUrl` |
| 核心 | `src/core/plugin-kind.js`（新） | `classifyPluginKind({manifest, packageJson})`、`isServerPluginKind` |
| 核心 | `src/core/git-viz.js`（新） | `buildGitSummary()` / `historyLost()` / `formatCommit()` / `selectGitTarget()` |
| 宿主 | `src/ui/host-bridge.js` | 新增 `readHostIdentity()`、`listServerPlugins()`、`readHostExtensionGit()` |
| 网络 | `src/ui/git-remote.js` | 新增 `listCommits()` / `listTags()` / `commitDetail()` / `rawFile()` |
| 设置 | `src/ui/settings-panel.js` | 新增五个设置项 + `readSettings(root, base)` |
| 视图 | `src/ui/workbench-view.js` | 开发者页父子块、宿主页勾选与工具条、服务端插件分区、误装拒绝、删除重装、Git 视图渲染 |
| 模板 | `src/ui/workbench-template.js` | 数据包列加 `数据包 / Git` 分段按钮 + `#zone-side-git` 容器 + `#extmgr-server` 容器 |
| 样式 | `style.css` | `.ext-server-block` / `.git-viz-*` / `.check-sub` 扩展（全部作用域化） |
| 文案 | `src/i18n/locales/{zh-CN,en-US}.js` | 新键成对补齐 |
| 动作 | `index.js` | `hostIdentity` / `listServerPlugins` / `hostExtensionGit` / `deleteExtension` |
| 测试 | `test/git-viz.test.js`、`test/plugin-kind.test.js`、`test/git-site.test.js`、`test/settings-panel.test.js` | 纯逻辑判据 |
| 文档 | spec §9–§11、`DEVELOPER-GUIDE.md`、`README.md` | 同一次提交内同步 |

## 验证命令

```bash
npm run check:css-scope && npm run check:dom-injection && npm run check:template-source \
  && npm run check:dom-scope && npm run check:control-consumer && npm run check:i18n
npm run build
npx vitest run
```

## 纪律

- 不向实例目录写文件；宿主一律只读（Git 可视化**不提供**任何写操作）。
- 真实宿主未启动时，未取证的实机路径在交接里明确标注「未实机取证」，不宣称已验证。
