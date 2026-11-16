# ST-pack-transfer · 数据包转运

在 **SillyTavern / Luker / TauriTavern / PureTavern** 之间互转、搬运、备份与恢复用户数据包。

纯前端，装进酒馆就是一个面板；也能当独立网页用，不需要自己的服务端。
装了 Authority 时产物可服务端托管，没装则静默降级，功能不缺。

[在线使用](https://jiozhaoyue.github.io/ST-pack-transfer/) · [装进酒馆](#四安装与部署) · [功能总览](#一功能总览)

---

## 一、功能总览

### 包转换

- 四方向互转，16 条有向路径；Zstd / Method 93 等非标准压缩透明解压。
- 逐类勾选：聊天、角色卡、世界书、图片、预设、扩展、向量库、私有配置、备份、缓存、原生资产。
- 生成前完整扫描与动作预测（丢弃 / 过滤 / 警告三类清单，可下载报告）。
- 差量合并（新版更新 + 历史独有保留）与智能分卷（规避云酒馆单包上限）。
- 断点续传：暂停 / 继续 / 中止；续传按「半成品里真有它的字节」判定，源包与产物一致。

产物统一进**导出区列表**（下载 / 存入工作区 / 移除），不自动下载。

### 从宿主拉取

- 数据包 `导入 / 导出` 页签右侧一键拉取，一步直出目标格式，支持 Range 续传。
- 在宿主原生备份界面注入入口（ST / Luker / TT / PT 各认各的落点），**只注入备份动作区**。
- 顺序固定：流量提示 → 原生操作指引 → 打开面板；提示可持久关闭。

### 恢复写回宿主

- 合并（覆盖同名、不删独有）或覆盖（二次确认）。
- 跨引擎净化：剔除 `_engine_dump.bin` / `_engine_meta.json`，避免 `settings_pkey` 主键冲突。
- 批量恢复逐包容错 + 完整报告 + 「保留 / 丢弃部分成果」，进度落盘。
- 写入门禁：无备份、备份过期、目标变化、权限未知 ⇒ 零写入。
- Luker 大包走 8 MiB 分片，穿过 Cloudflare 100 MB 单请求上限。

### 扩展管理与打包

- 三个页签：**宿主 / 开发者 / 打包**；宿主页管已装与安装，开发者页放 Git 账号与 OAuth，打包页按数据包挑扩展。
- 安装：URL / 批量链接 / `.txt` / `.json`，支持分支、标签与 commit，私有仓用账号凭据。
- 批量更新、批量卸载、拖拽排序、作用域互转（用户 ⇄ 全局，需管理员）。
- 逐扩展自动更新：关闭 / 仅提醒 / 直接更新，失败指数退避；所有写操作共用一条串行队列。
- **Git 可视化**：提交泳道图、单次提交 diff、本地与云端对齐读数，可按分支或标签重装。
- **仅清单包**：不带扩展实体，只产出清单与官方索引，恢复后在宿主在线安装。
- 平台标识使用各站点原版品牌图标（GitHub / GitLab / Gitee / Gitea / Bitbucket / Codeberg）。

### 传输与备份

- 局域网：WebRTC 分块 + 二维码信令 + 续传。
- 公网：S3 兼容对象存储与 WebDAV，分片上传、断点续传、逐片加密。
- 一键备份：全量时间戳快照（保留最近 N 份）或内容寻址增量备份集（任一版本可独立恢复）。
- WebDAV「测试连接」真实跑 OPTIONS → 列目录 → 建临时目录 → 写读校验 → 删除六步。

### 存储审查

- 浏览器与宿主两处配额打开同一个只读面板，面包屑逐层下钻 localStorage / sessionStorage / IndexedDB / Cache Storage。
- 不删除、不改写任何键或缓存；浏览器不提供的大小如实显示 `?`，不伪造 0。
- 宿主数据源仅 Luker 提供（复用其 Storage Inspector），其它宿主如实显示「未提供」。

### 存储引擎互转（Luker）

- 目标选 Luker 时可选：跟随源包 / 文件系统 / PostgreSQL / MySQL / SQLite。
- 四种形态任意方向互转，含 PG ⇄ MySQL 同构迁移；跨宿主同样成立（先还原为文件再按目标布局落位）。
- 全程本地解析与生成，不上传、不连库；读不出的格式如实报错。

### 其它

- **教程演示模式**：在占位数据上直接操作，全程不写入任何真实数据或宿主；数字读数与演示数据同源。可随时退出并完整还原。
- **插件数据导入导出**：设置、图表偏好与布局、云仓库与 WebDAV、账号整体导出为一份 JSON。
- **三形态**：独立网页、酒馆插件（全屏模态）、`file://` 单文件离线版。
- 窄屏遵循「换行 / 堆叠 / 滚动 → 整块隐藏 → 纯图标」的退让顺序，不压扁控件、不裁掉文案。

## 二、四酒馆数据包格式差异矩阵

四款酒馆都把用户数据放在各自的目录结构里，导出的 zip 只有对应酒馆认得：

| 平台 | 包内布局 | 导出端点 | 怎么导入 |
| :-- | :-- | :-- | :-- |
| **SillyTavern**（ST） | 用户目录摊平在根 | `POST /api/users/backup`（忽略 selection，全量） | 无恢复端点；解压覆盖到 `data/<用户>/`，或用本工具写回 |
| **Luker**（L） | 目录摊平 + `manifest.json` | 同 ST，**支持 10 键 selection** | `POST /api/users/restore-backup`（8 MiB 分片） |
| **TauriTavern**（TT） | `data/default-user/` 结构 | `POST /api/extensions/data-migration/export`（job_id 轮询） | `POST /api/extensions/data-migration/import`（ZIP/tar/gz，可直接吃 ST 包） |
| **PureTavern**（PT） | 与 TT 相近 + 模块记录 + 扩展来源记录 | `POST /api/backups/archive/export` | `POST /api/backups/archive/import`（支持 TT 包与冲突预览） |

### 2.1 数据包能力

| 能力 | SillyTavern | Luker | TauriTavern | PureTavern |
| --- | --- | --- | --- | --- |
| 导出端点 | `/api/users/backup`（全量） | 同左 + selection | data-migration export | archive/export |
| 导入 / 恢复端点 | ❌ 无 | ✅ + 8 MiB 分片 | ✅（兼容 ST 包） | ✅（兼容 TT 包） |
| 包内布局 | `data/<handle>/` 树 | 同 ST | `data/default-user/` 树 | manifest + 模块记录 |
| 导入策略 | — | 合并 / 覆盖 | 迁移作业 | merge / skip / replace / 受保护替换 |
| 恢复点 | ❌ | ❌ | ❌ | ✅ 导入前自动建 |
| 跨宿主互操作 | ❌ | ❌ | ✅ 吃 ST 包 | ✅ 吃 TT 包 |

### 2.2 传输能力

| 能力 | ST | Luker | TT | PT |
| --- | --- | --- | --- | --- |
| 局域网互传 | ❌ | ✅ `/api/sync/v1/*`（服务端↔服务端） | ✅ 但为 Rust 命令，扩展不可 invoke | ❌ |
| 云端对象存储 | ❌ | ✅ S3 Sync | ✅ TT-Sync v2 | ❌ |
| WebDAV | ❌ | ❌ | ❌ | ❌ |
| 存储面板 / 配额（原生） | ❌ | ✅ `storage-inspector.js` | ❌ | ❌ |

> 本插件在四宿主都提供**自建存储审查面板**（浏览器源全平台可用）；Luker 额外复用其原生数据源。

### 2.3 扩展在包里的位置

| 宿主 | 用户级扩展 | 全局扩展 |
| :-- | :-- | :-- |
| ST / Luker / PT | `extensions/<name>/`（平铺，**严禁**再套 `third-party`） | `public/scripts/extensions/third-party/<name>/` |
| TauriTavern | `data/default-user/extensions/<name>/` | `data/extensions/third-party/<name>/` |

转换器按目标布局自动迁移，并消除错误的 `third-party/third-party` 嵌套。

## 三、在线使用

无需安装，直接用：<https://jiozhaoyue.github.io/ST-pack-transfer/>

想部署自己的站点：Fork 仓库后，在 **Settings → Pages** 把 Source 设为 **GitHub Actions**，
此后每次推送自动发布。

## 四、安装与部署

### 1. 装进酒馆（推荐）

扩展管理 → 从 URL 安装，粘贴：

```
https://github.com/jiozhaoyue/ST-pack-transfer.git
```

或手动克隆到 `public/scripts/extensions/third-party/`。
刷新页面后，在扩展列表里展开 **「数据包转运」** → **「打开面板」**。

### 2. 本地部署

```bash
git clone https://github.com/jiozhaoyue/ST-pack-transfer.git
cd ST-pack-transfer
npm install
npm run dev
```

构建静态站点：

```bash
npm run build        # 产出 dist/（GitHub Pages 形态）
npm run preview      # 本地预览 dist（4173）
```

> 不要直接双击 `index.html`：浏览器禁止 `file://` 下加载 ES Module，双击只会看到一句说明。
> 独立形态必须经 HTTP(S) 提供。

## 五、隐私与凭据

插件只有四类外部凭据，其余功能都不需要登录。界面里对应位置都有 `?` 说明。

| 凭据 | 何时需要 | 需要填什么 | 建议的最小权限 | 填在哪 | 存在哪 |
| --- | --- | --- | --- | --- | --- |
| **GitHub 令牌** | 装 / 更新私有仓扩展 | `github_pat_…`（细粒度）或 `ghp_…`（经典） | Contents + Metadata 只读（经典 `repo`） | 扩展管理 → 开发者 → Git 账号 | 默认服务端 `settings.json`，可改仅浏览器 |
| **GitLab 令牌** | 同上 | `glpat-…` | `read_repository`（另需项目信息加 `read_api`） | 同上 | 同上 |
| **Gitee 令牌** | 同上 | 私人令牌 | `projects` | 同上 | 同上 |
| **Gitea 令牌** | 自建实例，同上 | 管理访问令牌 | `read:repository` | 同上 | 同上 |
| **S3 凭据** | 公网备份到对象存储 | 端点 / 区域 / 水桶 / Access Key / Secret Key | 该桶的读写列举删除 | 迁移与备份 → 公网 → S3 | **只存本机浏览器** |
| **WebDAV 凭据** | 公网备份到 WebDAV | 服务器地址 / 用户名 / 密码 | 限定一个目录前缀 | 迁移与备份 → 公网 → WebDAV | **只存本机浏览器** |

- **本仓库与插件都没有自己的远端服务，也不会把任何数据或凭据发送到第三方。**
  转换全程在浏览器内完成；唯一的外部请求是你在「扩展管理」里主动触发的站点 API 查询。
- **凭据默认随宿主设置写入酒馆服务端 `settings.json`**，**任何有服务器或管理员权限的人都能看到**。
  可改成「仅浏览器」，只写本机 `localStorage`，切换后服务端副本会被清空。
- 私有仓库只能由插件把凭据拼进交给宿主克隆的 URL；该 URL 可能被宿主写入扩展的 `.git/config`，
  安装私有仓库前请知悉此风险。界面、日志与导出报告一律对凭据脱敏。
- **S3 / WebDAV 凭据只存本机浏览器**，不写进服务端 `settings.json`。
- OAuth 是 Git 令牌的替代路径：GitLab / Gitee / 自建 Gitea 可浏览器直连；
  GitHub 的 token 端点无 CORS，需填自建代理或直接用令牌。
- **可选网络代理**（设置 → 网络）只转发插件自己的 Git / WebDAV 请求到带 CORS 头的转发地址；
  留空即直连。**S3 不走该代理**：签名绑定域名，转发会失效。

## 六、鸣谢

本插件建立在四款酒馆及其社区的工作之上。没有它们，就没有可转换的数据格式，
也没有可对照的原生行为。名称与图标归各自所有者，本项目与它们没有隶属关系。

| 项目 | 作者 / 维护者 | 本插件参考了什么 |
| :-- | :-- | :-- |
| [SillyTavern](https://github.com/SillyTavern/SillyTavern) | SillyTavern 团队与全体贡献者 | 用户数据目录结构、`/api/users/backup` 备份契约、扩展 `manifest.json` 与加载约定、`--SmartTheme*` 主题变量体系 |
| [Luker](https://github.com/funnycups/Luker) | [@funnycups](https://github.com/funnycups) | **参考最多的一家**：Storage Inspector 存储审查面板（数据源分类与逐层下钻形态）、8 MiB 分片恢复、`/api/sync/v1/*` 局域网同步、S3 Sync 云端对象存储、数据库存储引擎（文件系统 / PostgreSQL / MySQL / SQLite）与转储形态、2.9+ 原生备份入口与 `selection` 十键契约 |
| [TauriTavern](https://github.com/Darkatse/TauriTavern) | [@Darkatse](https://github.com/Darkatse) | `data-migration` 导出 / 导入端点与 job_id 轮询、`data/extensions/third-party` 布局、`_tauritavern/extension-sources/` 来源记录 |
| [PureTavern](https://github.com/Lianues/PureTavern) | [@Lianues](https://github.com/Lianues) | `backups/archive/export\|import` 端点、模块记录、导入前自动恢复点、冲突预览与受保护替换 |

## 七、开发与质量

- 功能清单与源码落点：[docs/DEVELOPER-GUIDE.md](docs/DEVELOPER-GUIDE.md)（**改代码先读它**）
- 分层规范与踩坑记录：[.trellis/spec/](.trellis/spec/)
- 当前计划与状态：[docs/](docs/)

```bash
npm test                      # 单元测试（纯逻辑层无 DOM 依赖）
npm run build && npm run preview   # UI 验收唯一入口（4173 静态服务器）
npm run e2e:web               # 独立 Web / 云部署 / 单文件离线，不需要实例
npm run e2e                   # 实例侧冒烟与功能矩阵（只连 Dev 实例）
npm run check:css-scope check:dom-injection check:template-source check:dom-scope check:control-consumer check:i18n check:no-bundler-only
```

静态守卫覆盖 CSS 作用域、宿主 DOM 写入范围、单一模板源、死控件、i18n，以及宿主直装
（禁止 JSON 静态导入 / `node:` 静态导入 / 裸包名 / Vite 专有语法）。测试只锁不变量，不锁耗时。

## 八、许可证

GNU Affero General Public License v3.0 or later（AGPL-3.0-or-later）。
完整条款见 [LICENSE](LICENSE)。

Copyright (C) 2026 jiozhaoyue
