---
title: 开发者指南
layout: default
translation: pending
---

# 开发者指南

本页面向想阅读源码、构建或参与改进的开发者。普通用户请从 [安装与部署](install.md) 开始。

## 一、运行形态

同一份核心逻辑支持五种入口：

| 形态 | 入口 | 适合场景 | 主要限制 |
| --- | --- | --- | --- |
| SillyTavern 扩展 | 仓库根目录装进扩展管理器 | 在酒馆内直接拉取、恢复、管理扩展 | 依赖 ST 的 `/api/users/*` 与扩展端点 |
| Luker 扩展 | 仓库根目录装进扩展管理器 | 同上，并额外支持 Luker 账户窗口与存储页 | 账户窗口 / 存储页需要 Luker 2.9+ |
| TauriTavern 扩展 | 仓库根目录装进扩展管理器 | 在 TauriTavern 内转换与迁移 | 宿主能力按公开端点探测 |
| PureTavern 扩展 | 仓库根目录装进扩展管理器 | 在 PureTavern 内转换与迁移 | 宿主能力按公开端点探测 |
| 独立 Web / 单文件 HTML | 根目录 `index.html`（HTTP）或下载的单文件 HTML（`file://`） | 纯本地转换、分析、分卷、清单化 | 无法直接读写酒馆后端；云功能受 CORS 限制 |

### 单文件 HTML 的确切下载位置

- **从仓库直接下载**：`download/ST-pack-transfer-offline.html`
- **直接下载链接**：`https://github.com/jiozhaoyue/ST-pack-transfer/raw/main/download/ST-pack-transfer-offline.html`
- **在线 HTML（无需下载）**：`https://jiozhaoyue.github.io/ST-pack-transfer/`

根目录的 `index.html` 是开发骨架，**不能单独下载后双击运行**；它需要 Vite 开发服务器或构建后的静态服务器。单文件 HTML 才是双击即用的形态。

## 二、宿主与浏览器兼容性

### 宿主版本

| 宿主 | 已实测版本 | 最低要求 | 说明 |
| --- | --- | --- | --- |
| SillyTavern | 1.19.0 | 1.19.0 级别端点 | 更早版本未验证；缺少端点时会明确降级并提示 |
| Luker | 2.7.0 / 2.9.0 级别 | 2.7.0 级别基础功能；2.9+ 账户窗口 | 2.9+ 才提供自绘账户窗口、图形化存储页与备份选择 |
| TauriTavern | 当前公开桌面构建 | 按宿主公开版本 | 扩展注入与迁移端点按能力探测，不锁定内部版本 |
| PureTavern | 当前公开版本 | 按宿主公开版本 | 部分迁移端点在宿主侧可能返回 501，插件会如实提示 |
| 独立 Web | 不适用 | 现代浏览器 | 无宿主后端，宿主相关功能明确禁用 |

“已实测”表示在当前开发环境的真实宿主中完成过注入、转换、拉取或恢复验证；“最低要求”表示低于该版本不承诺对应端点存在。插件不会猜测宿主版本，而是按能力探测并降级。

### 浏览器 / WebView

| 内核 | 建议版本 | 已验证 | 降级行为 |
| --- | --- | --- | --- |
| Chromium（Chrome / Edge / 其他 Chromium 浏览器） | 120+ | Chromium 151 实测 | 支持文件选择保存与拖拽下载；旧内核回退为普通下载 |
| Firefox | 120+ | 未单独实测 | 不支持 `showSaveFilePicker` / 拖拽下载时回退为浏览器下载 |
| Safari / iOS WebView | 17+ | 未单独实测 | `color-mix` 不支持时使用普通 rgba 边框；文件保存回退为下载 |
| Tauri WebView | 随宿主 | 按宿主实测 | Windows 使用 WebView2，macOS 使用 WKWebView；以宿主实际能力为准 |

移动端按 390×844 视口做布局验收；桌面端按 1440×900 做布局验收。手机浏览器与酒馆内置 WebView 都走同一套响应式规则。

## 三、目录结构

| 路径 | 职责 |
| --- | --- |
| `index.html` | 独立 Web 的空骨架，只提供 `#app` 容器 |
| `index.js` | 根控制器：宿主嗅探、动作绑定、启动 |
| `src/core/` | 纯逻辑核心：转换、检测、计划、分卷、差量、体积模型、引擎桥 |
| `src/ui/` | 有 DOM 的界面层：模板、视图、宿主桥、导出队列、设置、传输面板 |
| `src/storage/` | IndexedDB 封装 |
| `src/data/` | 目标平台、UI 令牌、演示数据等可读配置 |
| `src/vendor/` | 本地依赖副本，勿升级改动 |
| `docs/` | 公开文档站（纯 Markdown） |
| `download/` | 可下载的单文件 HTML 产物 |
| `test/` | 单元测试 |
| `tooling/` | 构建、文档同步、静态守卫 |
| `scripts/` | 本地实例探针与调试脚本（不随公开仓库分发） |

核心层不得依赖 DOM；界面层不得反向持有宿主判断。平台差异集中在宿主桥接层。

## 四、构建与测试

```bash
npm install
npm test                 # 单元测试
npm run build            # 生产构建，输出 dist/
npm run preview          # 预览 dist/，固定使用本地唯一端口 3040
npm run dev              # 本地开发服务器，同样使用 3040
npm run build:offline    # 生成单文件 HTML
npm run qa:static        # 静态守卫串跑
```

**本地端口只有一个**：`vite.config.js` 的 `LOCAL_PORT`（默认 `3040`），`dev` / `preview` / 本地静态服务共用；也可用环境变量 `PORT` 覆盖。不要再为预览另开端口，也不要占用 `5173`（env-sync 桌面应用的 Tauri `devUrl`）。

`npm run build:offline` 会生成：

- `dist-offline/ST-pack-transfer-offline.html`
- `download/ST-pack-transfer-offline.html`（对外下载路径）

单文件 HTML 必须保持 `file://` 可双击运行：脚本为 IIFE、Worker 强制主线程降级、字体与样式内联、零外部资源。

### 视觉与响应式约定（2026-11-17 起）

- **禁止整块实色填充**：按钮/胶囊/徽章条/注入入口一律「浅染底（`*-soft`）+ 1px 品牌描边（`*-ring`）+ 品牌色文字」；
  实色只用于 ≤16px 圆点、勾选标记、进度条、图表色块。目标平台按钮同理，选中项再加左侧 2px 色条。
- **对比度**：强调控件文字与底色实测 ≥ 4.5:1；不要白字压品牌实色底。
- **手机滚动**：唯一纵向滚动容器是 `.app-main`；只有自带内滚的视图（传输/扩展）才禁外滚，
  禁止把 `overflow-y:hidden` 写成全局手机规则。
- **触屏桌面布局**：`@media (pointer: coarse)` 下折叠箭头 ≥24px、紧凑文字按钮 ≥28px。
- 自动守卫：`npm test -- ui-solid-fill-guard`。
- 改动 UI 后跑 13 视口矩阵：`node tooling/ui-audit/matrix.cjs`（需 3040 服务），
  产物在 `test-results/audit/<stamp>/`，含截图、`probe.json`、`summary.md`。

### 本地云与实例自动化（2026-11-17 起）

- 本机 S3 兼容服务器：`npm run cloud:serve:s3`（端口 0 自动分配，仅测试、无鉴权）。
- 本机 WebDAV 服务器：`npm run cloud:serve:webdav`（同上）。
- 客户端契约测试：`npm run test:local-cloud`（真实 HTTP + Range/multipart/PROPFIND）。
- 核心云全流程：`npm run e2e:cloud-core`（真实数据包 → 上传 → 下载 → sha256）。
- 实例成对启动：`npm run e2e:instance-pair -- dev-st dev-luker`；
  **同一时刻最多两个实例**，退出时校验端口释放。
- 说明与限制：`tooling/local-cloud/README.md`、`docs/audit/2026-11-17/instance-availability.md`。

## 五、体积与分卷模型

体积预测集中在 `src/core/size-model.js`，输入选中条目与导出选项，输出：

- `predictedBytes`：已知条目的压缩后预测；
- `breakdown`：按类目拆分的未压缩 / 压缩字节；
- `range`：未知项导致的区间；
- `confidence`：`high` / `medium` / `low`；
- `unknowns`：读不到体积的条目，界面必须显示 `?` 或区间。

界面不得再散落压缩比常量；新增类目、分卷、扩展模式或引擎载体时，只扩展模型与测试。

## 六、质量门槛

提交前至少通过：

```bash
npm test
npm run build
npm run qa:static
npm run docs:verify
```

文档站的中文页、英文页、教程截图与基线哈希必须同步；源页改动但译文或截图未更新会被 CI 拒绝。

## 七、参与与安全

- 贡献方式与测试矩阵见 [CONTRIBUTING.md](https://github.com/jiozhaoyue/ST-pack-transfer/blob/main/CONTRIBUTING.md)。
- 安全问题请按 [SECURITY.md](https://github.com/jiozhaoyue/ST-pack-transfer/blob/main/SECURITY.md) 的私密渠道报告，不要公开提交可利用细节。
- 许可证：AGPL-3.0-or-later，详见 [LICENSE](https://github.com/jiozhaoyue/ST-pack-transfer/blob/main/LICENSE)。
