# Frontend Development Guidelines

> 本仓前端（`src/ui/**`、根 `index.js`、`index.html`、`style.css`）的**真实**约定，不是理想设计。
> 项目形态：四酒馆（SillyTavern / Luker / TauriTavern / PureTavern）数据包互转工具，
> **纯前端为主、Authority 服务端为可选增强层**（适配器 + 特性检测 + 静默降级）。

---

## Overview (概述)

本目录收录前端开发规范。每条约定都应能在代码里指出出处（文件路径 + 符号名）。
标注「待验证」的条目表示尚未在代码中证实，其后必须写明验证方法——**禁止臆测**。

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | 三形态入口（独立 Web / 宿主插件 / Node 测试）、`src/**` 分层、构建与部署 | 就绪（2026-09-24 校正） |
| [Component Guidelines](./component-guidelines.md) | 宿主内 UI 注入（幂等 + 自愈）、注入按钮工厂、单一模板源、CSS 作用域铁律、DOM 注入防线 | 就绪（2026-09-25 刷新） |
| [Host Capabilities](./host-capabilities.md) | 宿主能力获取决策树、原生弹窗适配器契约（**含"宿主无 alert，信息提示用 `Popup.show.text`"**）、降级反例构造法、现存能力面表、**UI 控件合宪性（死控件取证）** | 就绪（2026-09-26 增补信息提示） |
| [DOM Write Scope](./dom-write-scope.md) | **宿主 DOM 写入作用域**：锚点白名单（穷举）、`check:dom-scope` 守卫、运行期归因仪器与实测读数、仪器自身的坑、跨宿主安装落点 | 就绪（2026-09-26 新建） |
| [Hook Guidelines](./hook-guidelines.md) | 宿主生命周期接入、备份/恢复端点、CSRF、全局命名空间（**仅 1 个已登记的只读探针**） | 就绪（2026-09-27 刷新） |
| [Resume Checkpoint Invariant](./resume-checkpoint-invariant.md) | **断点续传的「已完成」判据**：不变量（清单里的条目必须已写进产物）· **曾经的违反与其实测读数** · **既有两处断言为何各锁一半**（锁机理 vs 锁不变量）+ 通用判别法 · 修法 (a) 的四段实现与三处「计划被证据否决」 | ✅ 就绪（2026-09-28 **已修**；实现细节见 `state-management.md` §8） |
| [Chat Store Seam](./chat-store-seam.md) | **纯库模式（聊天收进数据库、磁盘无 jsonl）的跨插件接缝**：`ChatFilesysApi` v1 契约、消费侧降级阶梯、绑定判据与易错点、增强包为何在源包层做、未做到项 | 就绪（2026-09-27 新建；**供给侧尚未实现**） |
| [State Management](./state-management.md) | 内存 Blob 生命周期、TaskManager 断点续传、rAF 合帧 | 就绪 |
| [Quality Guidelines](./quality-guidelines.md) | 验证矩阵、守卫命令、转义层契约、10 条禁止模式、纯逻辑可单测约定 | 就绪（2026-09-26 刷新） |
| [Type Safety](./type-safety.md) | JSDoc 契约、运行时目标守卫、manifest 校验 | 就绪 |
| [迁移用户流程](./migration-user-journey.md) | 默认完整迁移、双端向导、统一计划与独立交付 | 已裁定目标契约（2026-10-01）；**计划快照 S1 / 源端三类交付 S2 / 向导默认入口 S5-2 已实现（2026-10-13）** |
| [迁移安全与证据](./migration-safety-and-evidence.md) | 目标备份、写入门、完成判定与安全重试 | 已裁定目标契约（2026-10-01）；**写入门 S3 / 核对四态 S4 已实现（2026-10-13）** |
| [迁移兼容与验收](./migration-compatibility-and-release.md) | 旧会话**强制作废**、渐进重构、真人验收与 file:// 离线交付 | **§3.1 按用户裁定 U-1 改写为硬拒绝（2026-10-13）**；§3.5 向导与离线单文件已实现 |
| [异步阶段超时/取消边界](./async-bounds.md) | **每个 `await` 的边界与取消路径**：阶段边界表（含 `file:line`）· 「总时长 vs 间隔」两种口径 · 三个**刻意不设上限**的阶段及其代价 · 停滞守卫契约 · **测量装置 `createStageRecorder`** 与**实测读数**（Dev ST：TTFB 141ms / 685MB 传输 60.1s / 块间最大间隔 651ms） | ✅ 就位（2026-10-14 新建 + **已取首批实测读数**；Luker / 慢速网络 / 上传方向仍未测） |
| [工作台单一视图与局域网互传](./workbench-single-view.md) | **迁移向导外壳已整体删除**（六步步骤条 / 向导·高级模式切换 / 不兼容门）· `[hidden]` 与 `display` 的特异度事故 · **配色只用 `--SmartTheme*`** · 文案纪律（无说明、无黑话）· 控件纪律（枚举 / 单列 / 紧凑折叠）· 宿主动态识别四宿主判据 · **WebRTC 一次性取件码互传**与必须如实告知的两跳信令限制 | ✅ 就位（2026-10-14 新建；端到端实测 300 KB 字节级一致） |
| [工作台三层架构与 CSS 铁律](./workbench-three-layer.md) | **模块/流程/外壳三层契约**（模块层唯一实现）· 阶段门控与 `hidden` 不移出 DOM 的理由 · **三条 CSS 铁律**（无外层滚动 / 浮层必锚行 / 单行不折，均带 E2E 断言）· body 级浮层的作用域根约定 · **单测夹具须与模板同构**（真实事故）· 模板字符串注释禁反引号 · 首装引导拦截点击（E2E 必读） | ✅ 就位（2026-10-24 新建；断言固化为 `e2e/standalone/specs/s1-remedies.e2e.cjs` 15/15） |

> 上述三份“迁移”文档是经用户批准记录的**后续目标契约**，不是当前实现事实；其中拟新增签名、测试和验收均有状态标注。不得据此宣称产品已完成迁移向导或双击离线交付。

> 现行质量门槛：`npm test` 全绿（当前 **81 个测试文件 / 817 passed / 2 skipped**，零回归），
> 外加**五条**静态守卫 `npm run check:css-scope`、`npm run check:dom-injection`、
> `npm run check:template-source`、`npm run check:control-consumer` 与 `npm run check:dom-scope`
> （详见 quality-guidelines.md 与 dom-write-scope.md）。
>
> **实例 E2E（`npm run e2e`）不是发版门槛**，因为它需要实例在跑且**只许连 Dev 白名单**
> （`8001` / `8003` / `8899`，Real 端口出现即拒绝）。当前覆盖：端口守卫负例（17 项）
> + 加载冒烟（`8001` / `8003`）。契约与纪律见 `../guides/instance-e2e-and-data-sync.md`。
> 同一事实只允许一处权威表述；遇到冲突以本目录文档与根 `CLAUDE.md` 为准。
>
> ⚠ **单个 spec 文件不得超过 Trellis 的 `context_injection.max_file_bytes`（32768 字节）**——
> 超限会被**静默截断**，拿到半截规范的 agent 比拿不到更危险。
> 2026-09-25 因 `component-guidelines.md` 涨到 36.7 KB 而拆出 `host-capabilities.md`；
> 2026-09-26 再拆出 `dom-write-scope.md`。
> 🔴 **已超限（2026-09-28 实测）**：`component-guidelines.md` = **33789 字节 > 32768** ⇒
> **该文件当前会被静默截断**（P-2 类危险：读到半截规范的 agent 比拿不到更危险）。
> **下次动它时必须先按主题拆出新文件**。
>
> （历史记录）曾写到：
> 往该文件新增任何内容前，**先按主题拆出新文件**，不要直接追加。
> 新增内容后请 `wc -c .trellis/spec/frontend/*.md` 自查。

---

## How to Fill These Guidelines (本目录的维护约定)

1. 写**本仓真实约定**（能在代码里指出出处），不写理想设计
2. 代码示例从本仓摘取，路径与符号名逐字核对后再落笔
3. 列出**禁止项**，并写清原因（附真实事故更佳，本仓已发生多起）
4. 记录**已踩过的坑**；无法证实的结论标「待验证」并写明验证方法

目标是让 AI 助手与新人无需通读全仓，即可理解本项目实际如何运作。

---

**Language**: 文档、注释与回复**一律中文**（代码标识符、命令输出、专有名词除外）。
这是对仓群统一规则 L0-15 的落实，**有意覆盖 Trellis spec 模板的 English-only 默认**——不要按模板改回英文。
