# ST-pack-transfer · 数据包转运

在 **SillyTavern / Luker / TauriTavern / PureTavern** 之间互转、搬运和恢复用户数据包。

纯前端，装进酒馆就是一个面板；也能当独立网页用，不需要服务端。

[在线使用](https://jiozhaoyue.github.io/ST-pack-transfer/) · [作为扩展安装](#1-装进酒馆推荐) · [本地部署](#2-本地部署)

---

## 一、四酒馆数据包格式

四款酒馆都把用户数据（角色卡、聊天、世界书、预设、背景图、扩展……）放在各自的目录结构里，
导出的 zip 只有对应酒馆认得：

| 平台 | 包内布局 | 导出端点 | 怎么导入 |
| :-- | :-- | :-- | :-- |
| **SillyTavern**（ST） | 用户目录摊平在根 | `POST /api/users/backup`（忽略 selection，全量） | 无恢复端点；解压覆盖到 `data/<用户>/`，或用本工具写回 |
| **Luker**（L） | 目录摊平 + `manifest.json` | 同 ST，**支持 10 键 selection** | `POST /api/users/restore-backup`（8 MiB 分片） |
| **TauriTavern**（TT） | `data/default-user/` 结构 | `POST /api/extensions/data-migration/export`（job_id 轮询） | `POST /api/extensions/data-migration/import`（ZIP/tar/gz，可直接吃 ST 包） |
| **PureTavern**（PT） | 与 TT 相近 + 模块记录 + 扩展来源记录 | `POST /api/backups/archive/export` | `POST /api/backups/archive/import`（支持 TT 包与冲突预览） |

于是换酒馆、备份迁移、把旧包搬给新设备时，常常「包是对的，但那边打不开」。
本工具就是把这一步做掉：**任意一方的包 → 任意一方的包**，尽量不丢东西。

> 扩展在包里的位置：ST/Luker/PT 是 `extensions/<name>/`（平铺，**严禁**再套 `third-party`）；
> TT 是 `data/extensions/third-party/<name>/`；另有 `_tauritavern/extension-sources/` 来源记录。
> 转换器按目标布局自动迁移，并消除错误的 `third-party/third-party` 嵌套。

## 二、四酒馆能力矩阵

### 2.1 数据包

| 能力 | SillyTavern | Luker | TauriTavern | PureTavern |
| --- | --- | --- | --- | --- |
| 导出端点 | `/api/users/backup`（全量） | 同左 + selection | data-migration export | archive/export |
| 导入 / 恢复端点 | ❌ 无 | ✅ + 8 MiB 分片 | ✅（兼容 ST 包） | ✅（兼容 TT 包） |
| 包内布局 | `data/<handle>/` 树 | 同 ST | `data/default-user/` 树 | manifest + 模块记录 |
| 导入策略 | — | 合并 / 覆盖 | 迁移作业 | merge / skip / replace / 受保护替换 |
| 恢复点 | ❌ | ❌ | ❌ | ✅ 导入前自动建 |
| 跨宿主互操作 | ❌ | ❌ | ✅ 吃 ST 包 | ✅ 吃 TT 包 |

### 2.2 传输

| 能力 | ST | Luker | TT | PT |
| --- | --- | --- | --- | --- |
| 局域网互传 | ❌ | ✅ `/api/sync/v1/*`（服务端↔服务端） | ✅ 但为 Rust 命令，扩展不可 invoke | ❌ |
| 云端对象存储 | ❌ | ✅ S3 Sync | ✅ TT-Sync v2 | ❌ |
| WebDAV | ❌ | ❌ | ❌ | ❌ |
| 存储面板 / 配额（原生） | ❌ | ✅ `storage-inspector.js` | ❌ | ❌ |

> 本插件在四宿主都提供**自建存储审查面板**（浏览器源全平台可用）；Luker 额外复用其原生数据源。

### 2.3 插件功能来源

| 插件功能 | 来源 |
| --- | --- |
| 从宿主拉取数据包 / 写回恢复 / 扩展清单与安装 | **优先用宿主原生**，缺失时自建兜底或如实提示 |
| 存储审查（浏览器 / 宿主两处配额） | **同一自建面板**；宿主数据源只在 Luker 可用，其余宿主如实显示「未提供」 |
| 四酒馆格式互转 / 局域网互传 / S3 与 WebDAV 仓库 / 条目级差量 / 暂停续传 | **自建**（四家都没有） |

## 三、功能总览

### 3.1 包转换

- 四方向互转（4 × 4 = 16 条有向路径），含非标准压缩（Zstd / Method 93）透明解压。
- 逐项勾选：聊天、角色卡、世界书、图片、预设、扩展、向量库、私有配置、备份、缓存、原生资产。
- 生成前完整扫描与动作预测（丢弃 / 过滤 / 警告三类清单，可下载报告）。
- 差量合并（新版更新 + 历史独有保留）、智能分卷（规避云酒馆单包上限）。
- 断点续传：暂停 / 继续 / 中止；续传按「半成品里真有它的字节」判定，源包与产物一致。
- 产物统一进待导出区，不自动下载。

### 3.2 从宿主拉取

- 入口：数据包**导入区**模式行的「从宿主拉取」（导出区同一行显示「覆盖 / 增量」）。
- 一步直出目标格式；拉取进度与 Range 续传。
- 宿主原生备份界面的入口注入（ST/TT/PT/Luker 2.9+ 各认各的落点），**只注入备份动作区**。
- 拉取顺序：流量提示 → 原生操作指引 → 打开面板；提示可持久关闭。

### 3.3 恢复写回宿主

- 合并（覆盖同名、不删独有）或覆盖（二次确认）。
- 跨引擎净化：剔除 `_engine_dump.bin` / `_engine_meta.json`，避免 `settings_pkey` 主键冲突。
- 批量恢复逐包容错 + 完整报告 + 「保留 / 丢弃部分成果」；进度落盘。
- 写入门禁：无备份、备份过期、目标变化、权限未知 ⇒ 零写入。
- Luker 大包走 8 MiB 分片，穿过 Cloudflare 100 MB 单请求上限。

### 3.4 扩展管理与打包

- **入口**：工作台左侧面板头内的切换按钮（存储图表 / 扩展管理；手机另有数据包），
  不再占用页头下的独立一行。
- **页签**：宿主 / 安装 / 打包；宿主页列出宿主已装扩展（可刷新、检查更新、导出清单）。
- **报告常驻**：安装报告在扩展管理底部常驻，不随页签切换；点击展开并占满扩展管理区域。
- **OAuth 登录**：授权码 + PKCE；回调地址必须与本页完全一致（协议 + 主机 + 端口，
  `127.0.0.1` 与 `localhost` 是两个来源）。GitLab / Gitee / 自建 Gitea 可浏览器直连；
  GitHub 的 token 端点无 CORS，只能填自建代理或改用令牌。公网 / 云酒馆管理员推荐 OAuth。
- **令牌指引**：一页教程，含各站点可点击的令牌页链接、操作步骤与最小权限。
- **日志**：安装日志并入全局日志（点底栏打开），本页只保留安装报告与失败链接。
- **打包页**：按已载入的每个数据包分组，勾选要打包的扩展；**只过滤扩展**，
  其它类目仍按存储图表勾选；每个包可单独选择 Git 清理（保留历史 / 只留更新所需 / 不含历史）。
  仍按目标宿主布局生成产物。
- **仅清单包**：不带扩展实体，只产出 `_convert/extensions-manifest.json` 与官方索引，恢复后在线安装。
- **批量安装**：多行链接 / `.txt` / `.json`；每行可写 `url | 分支` 或 `url#分支`。
- **URL 归一**：`owner/repo`、`gh:` / `github:` / `gitee:` / `gitlab:` 短写、无协议地址、
  仓库页地址（`/tree/<ref>`、`/blob/<ref>/…`、`/commit/<sha>`、`/releases/tag/<tag>`、GitLab `/-/tree/<ref>`）
  统一解析成「仓库根 + ref」再交给宿主（宿主用 URL 最后一段做目录名，直接传页面地址会装错名）。
- **分支 / 版本**：从站点 API 列远端分支；可填分支、标签或 commit（commit 宿主可能不支持，失败原样回显）。
- **账号**：GitHub / GitLab / Gitee / 自建 Gitea，多站点多账号、☆默认、逐个与全部测试；
  支持 PAT、账密、`https://user:token@host/…` 形式的凭据提取。
- **私有仓库**：安装前显式提示「私有/需登录」；失败项单独标注。私有仓只能由插件把凭据交给宿主服务端克隆。
- **更新检查**：已登记来源的扩展对比本地与远端 `manifest.json` 版本，给出可更新 / 已最新 / 未知；**只读**。
- **导出**：安装日志、失败链接（一行一个）、安装报告 JSON；宿主扩展清单（官方扁平 JSON）。

### 3.5 传输与备份

- 入口：面板头切换行的「迁移与备份」（☁️），整块替换左侧图表面板。
- 局域网：WebRTC 分块 + 二维码信令 + 续传。
- 公网：S3 兼容对象存储与 WebDAV；分片上传、断点续传、逐片加密（填口令才加密）。
- 一键备份：全量时间戳快照（保留最近 N 份）或内容寻址增量备份集（任一版本可独立恢复）。
- 选包只认左侧数据包列表的选中项，面板内不另设文件选择器。

### 3.6 存储审查

- 顶部两处配额（浏览器 / 宿主）打开**同一个面板**；点哪一行进入，面板初始就显示哪一侧，
  面板内可随时切换数据源。
- 面包屑逐层下钻：localStorage / sessionStorage 按键、IndexedDB 库与表、Cache Storage 缓存；
  配额行、堆叠条、图例、列表同屏，列表是唯一滚动区。
- **只读**：不删除、不改写任何键 / 库 / 缓存；浏览器不提供的大小如实显示 `?`，不伪造 0。
- 宿主数据源仅 Luker 提供（复用其 Storage Inspector）；其它宿主如实显示「未提供」。

### 3.7 其它

- **插件数据导入导出**（设置 → 数据）：整个插件的配置导出为一份 JSON（设置、图表偏好与布局、
  云仓库与 WebDAV、账号）；「包含登录凭据」默认关闭，OAuth 令牌需再勾一次才跟随。
  不含数据包与产物。
- **刷新页面只在需要时出现**：安装扩展完成后在完成弹窗里给「刷新页面」；恢复数据后在完成条里给。
  平时没有全局刷新按钮。
- **教程 = 演示模式**：打开先选「数据包转换 / 上传宿主 / 从宿主拉取 / 扩展管理 / 迁移备份」，
  在**占位数据**上直接操作（可勾选、生成、删除、打开存储审查）；顶部横幅随时「退出教程」，
  退出后完整还原，全程不写入任何真实数据或宿主。
- 纯库模式：给聊天库补齐磁盘缺失的聊天 / 从库导出 / 还原后入库（上游接口未实现，未在真实环境跑通）。
- 三形态：独立网页、酒馆插件（全屏模态）、`file://` 单文件离线版。
- 可选后端增强：装了 Authority 时产物可服务端托管；没装则静默降级，功能不缺。

## 四、隐私与凭据（必读）

- **本仓库与插件都没有自己的远端服务，也不会把任何数据或凭据发送到第三方**。
  转换全程在浏览器内完成；唯一的外部请求是你在「扩展管理」里主动触发的站点 API 查询（GitHub / GitLab / Gitee / 自建 Gitea）。
- **凭据默认随宿主设置保存到酒馆服务端 `settings.json`**（`extension_settings`）。
  **任何有服务器访问权限或酒馆管理员权限的人都能看到它**。
- 可以改成**「仅浏览器」**：只写本机 `localStorage`，切换后服务端副本会被清空；
  换浏览器或清缓存需要重新填写。
- 私有仓库只能由插件**把凭据拼进交给宿主克隆的 URL**（宿主服务端执行 git）。
  该 URL 可能被宿主写入该扩展的 `.git/config`（origin 地址）——安装私有仓库前请知悉此风险；
  界面、日志、导出报告一律对凭据脱敏（`ghp_…3456`），但宿主自己保存的那份不在插件控制范围内。
- 插件**不记录**任何多酒馆用户维度：账号库只属于当前酒馆用户。



## 五、安装与部署

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

打开 `http://127.0.0.1:3040`。

构建静态站点：

```bash
npm run build        # 产出 dist/
npm run preview      # 本地预览 dist（4173）
```

> 不要直接双击 `index.html`：浏览器禁止 `file://` 下加载 ES Module，双击只会看到一句说明。
> 独立形态必须经 HTTP(S) 提供（`npm run dev`、`npm run preview` 或任意静态服务器）。

### 3. 在线使用

无需安装：<https://jiozhaoyue.github.io/ST-pack-transfer/>

想部署自己的站点，Fork 仓库后在 **Settings → Pages** 把 Source 设为 **GitHub Actions** 即可，
后续每次推送自动发布。

## 六、开发与质量

- 功能清单与源码落点：[docs/DEVELOPER-GUIDE.md](docs/DEVELOPER-GUIDE.md)（**改代码先读它**）
- 分层规范与踩坑记录：[.trellis/spec/](.trellis/spec/)；存储审查面板规范：
  [.trellis/spec/frontend/storage-inspector.md](.trellis/spec/frontend/storage-inspector.md)
- 当前计划与状态：[docs/PLAN-2026-11-11.md](docs/PLAN-2026-11-11.md)
- 存储审查面板实现契约与取证：[docs/HANDOFF-2026-11-11-storage-inspector.md](docs/HANDOFF-2026-11-11-storage-inspector.md)
- 最近一次会话交接：[.trellis/workspace/jiozhaoyue/HANDOFF-2026-11-11-2.md](.trellis/workspace/jiozhaoyue/HANDOFF-2026-11-11-2.md)

```bash
npm test                      # 单元测试（纯逻辑层无 DOM 依赖）
npm run build && npm run preview   # UI 验收唯一入口（4173 静态服务器）
npm run e2e:web               # 独立 Web / 云部署 / 单文件离线，不需要实例
npm run e2e                   # 实例侧冒烟与功能矩阵（只连 Dev 实例）
npm run check:css-scope check:dom-injection check:template-source check:dom-scope check:control-consumer check:i18n
```

静态守卫覆盖 CSS 作用域、宿主 DOM 写入范围、单一模板源、死控件、i18n；测试只锁不变量，不锁耗时。

## 七、许可证

GNU Affero General Public License v3.0 or later（AGPL-3.0-or-later）。
完整条款见 [LICENSE](LICENSE)。

Copyright (C) 2026 jiozhaoyue
