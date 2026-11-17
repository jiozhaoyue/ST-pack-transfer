# 贡献指南

感谢你愿意改进 ST-pack-transfer。提交前请先读完本页，尤其是**兼容性矩阵**与**隐私红线**。

## 一、先确认运行形态

同一个仓库支持五种入口，改动必须说明影响哪一种：

| 形态 | 入口 | 适合场景 | 关键限制 |
| --- | --- | --- | --- |
| SillyTavern 扩展 | 仓库根目录装进扩展管理器 | 酒馆内拉取、恢复、扩展管理 | 依赖 ST 公开端点 |
| Luker 扩展 | 仓库根目录装进扩展管理器 | 同上 + Luker 账户窗口/存储页 | 账户窗口与存储页需要 Luker 2.9+ |
| TauriTavern 扩展 | 仓库根目录装进扩展管理器 | TauriTavern 内迁移 | 按宿主公开能力探测 |
| PureTavern 扩展 | 仓库根目录装进扩展管理器 | PureTavern 内迁移 | 部分端点可能返回 501 |
| 独立 Web / 单文件 HTML | `index.html`（HTTP）或 `download/ST-pack-transfer-offline.html`（`file://`） | 纯本地转换、分析、分卷 | 不能直接读写酒馆后端 |

单文件 HTML 的对外下载路径固定为 `download/ST-pack-transfer-offline.html`，由 `npm run build:offline` 同时写入 `dist-offline/` 与 `download/`。

## 二、兼容性矩阵（提交前对照）

### 宿主

| 宿主 | 已实测版本 | 最低要求 | 说明 |
| --- | --- | --- | --- |
| SillyTavern | 1.19.0 | 1.19.0 级别端点 | 更低版本未验证 |
| Luker | 2.7.0 / 2.9.0 级别 | 2.7.0 级别基础功能；2.9+ 账户窗口 | 2.9+ 才有账户窗口、存储页、备份选择 |
| TauriTavern | 当前公开桌面构建 | 按宿主公开版本 | 迁移端点按能力探测 |
| PureTavern | 当前公开版本 | 按宿主公开版本 | 不支持的能力必须明确提示 |
| 独立 Web | 不适用 | 现代浏览器 | 宿主功能禁用 |

### 浏览器 / WebView

| 内核 | 建议版本 | 已验证 | 降级要求 |
| --- | --- | --- | --- |
| Chromium（Chrome / Edge 等） | 120+ | Chromium 151 | 旧内核回退普通下载 |
| Firefox | 120+ | 未单独实测 | 回退普通下载 |
| Safari / iOS WebView | 17+ | 未单独实测 | 无 `color-mix` 时用 rgba 边框 |
| Tauri WebView | 随宿主 | 按宿主 | Windows WebView2 / macOS WKWebView |

### 布局

- 桌面：1440×900。
- 手机：390×844。
- 日志三态：收起 → 半展开任务队列 → 全展开日志/队列双页签 → 收起。
- 手机数据包列表：展开后有常驻收起按钮；扩展「包内」只能单选。

## 三、开发环境

```bash
npm install
npm run dev          # 地址以终端输出为准
npm test             # 单元测试
npm run build        # 生产构建
npm run build:offline # 单文件 HTML
npm run qa:static    # 静态守卫串跑
npm run docs:verify  # 文档同步基线
```

要求：

- Node.js 18+。
- 不提交 `node_modules/`、`dist/`、`dist-offline/`、真实数据包、真实截图。
- `download/ST-pack-transfer-offline.html` 是发布产物；只有确认要更新对外 HTML 时才提交。

## 四、改动边界

1. **先检索**：确认没有现成实现、技能或依赖可复用。
2. **先计划**：复杂改动先写清目标、影响面、验收方式。
3. **块级编辑**：修改现有文件用最小 diff，不做整文件覆盖。
4. **核心与 UI 分层**：`src/core/` 不得依赖 DOM；宿主差异集中在宿主桥接层。
5. **单一真源**：目标平台、UI 令牌、体积模型、模板都只允许一个来源。
6. **样式作用域**：所有注入样式必须挂在 `#app.app-container` 或自有覆盖层下，禁止裸选择器污染宿主。
7. **有界等待**：任何 `await` 都必须能被超时或销毁信号 settle。

## 五、测试矩阵

至少跑：

```bash
npm test
npm run qa:static
npm run build
npm run docs:verify
```

按改动范围补充：

| 改动 | 必测 |
| --- | --- |
| 转换 / 检测 / 分卷 / 体积 | 单元测试 + 真实 fixture 回归 |
| 宿主桥接 / 拉取 / 恢复 | 至少一个真实宿主；说明宿主与版本 |
| 扩展管理 / Git | 安装、更新、冲突自愈、清单/完整/双选 |
| UI / 响应式 | 桌面 1440×900 + 手机 390×844 |
| 云端 / WebDAV | 你自己的测试端点；不得使用真实凭据 |
| 单文件 HTML | `npm run build:offline` 后双击，确认零外部资源、Worker 降级可用 |
| 文档 | 中文页、英文页、教程截图、`docs:verify` 全部同步 |

没有条件测试的项必须**如实标注未验证**，不能写成“已支持”。

## 六、隐私红线

提交前确认：

- 不含真实聊天、角色卡、世界书、预设、图片、语音、日志。
- 不含 API Key、Token、Cookie、OAuth code、密码、私钥、私有仓库地址。
- 不含本机路径、用户名、机器名、IP、实例目录、端口。
- 截图只来自教程演示模式；不能有浏览器书签栏、下载路径、系统通知。
- `docs/` 不出现日期、内部任务/计划/交接/研究内容、内部规范引用。
- 测试 fixture 必须是合成数据或明确可公开的样本。

## 七、提交与 PR

- 提交信息用 `type(scope): 摘要`，例如 `fix(ui): 修复手机包内单选`。
- 一个 PR 只做一类改动；不要混入无关格式化或依赖升级。
- PR 描述必须填写：影响形态、宿主/浏览器版本、测试命令与结果、未验证项。
- 文档与 README 必须与行为变更同一次提交更新。
- 不提交内部任务目录、计划、交接、研究底稿；这些不进公开历史。
- 合并前确保 CI 全绿；隐私守卫或文档同步失败时不要绕过。

## 八、安全

发现漏洞不要公开 Issue。请按 [SECURITY.md](SECURITY.md) 使用 GitHub Private Vulnerability Reporting。

## 九、行为准则

参与本项目即表示同意遵守 [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)。
