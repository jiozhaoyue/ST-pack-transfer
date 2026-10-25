# 技术设计：Luker 极致省字节拉取

> 配套 `prd.md`。取证驱动：先实测契约，再按结论二选一实施。父任务 design §5.3 的展开。

## 1. 取证设计（先于一切代码改动）

### 1.1 目标与环境

- 目标：Dev Luker `http://dev-luker.localhost:8003`（白名单内；D-12 域名强制，禁裸 IP/localhost）。
- 工具：一次性 Node 取证脚本（放本任务 `research/probe.mjs`，不进 `src/`/`scripts/`），
  复用宿主 CSRF 流程：`GET /csrf-token` → `POST /api/users/backup`（body `{handle, selection}`）。
- handle 取值：`GET /api/users/me` 或登录态默认用户（脚本只读元数据，不落任何真实数据文件）。

### 1.2 取证矩阵

| # | 请求变体 | 判读 |
| --- | --- | --- |
| Q1a | selection 全 13 键 true（基线） | 记录响应字节数 / Content-Length 有无 |
| Q1b | `backups:false, cache:false`（其余 true） | 与 Q1a 差分 ⇒ 重类目实际字节占比 |
| Q2 | selection 塞**非法形状**（嵌套 exclude 数组 / 路径串） | 400 且报错文案 ⇒ 契约边界；200 ⇒ 粒度可能更细，继续 |
| Q3 | 勾选最小集（全 false） | 端点最小必然载荷（清单/manifest 等元数据底座） |
| Q4 | 响应头检查 | `Content-Length` 是否存在（Luker 打包若流式则可能缺省） |

- 每个变体记：status、响应头（截选）、字节数、（失败时）错误体。
- 每变体跑 2 次取稳定值（排除宿主缓存扰动）；差分为 0 时标注「疑似端点忽略该键」。

### 1.3 复现纪律

- 脚本头注释写明运行方式与依赖；结论报告 `research/luker-selection-probe.md`
  逐条挂「请求体 + 响应摘录 + 结论」三段。
- 只连 Dev（8003）；不触碰 Real（8004）。

## 2. 实施分支（依取证结论）

### 分支甲：契约支持更细粒度（文件/路径级）

- `selection-defaults.js` 扩可选形状（如 `excludes: string[]`），**默认值 = 现状**（零行为变化）；
- `fetchHostBackup` luker 分支组装新 body；端点 4xx/校验失败 ⇒ 自动降级类目级重试一次并
  `logger.warn`（L0-11 精神：增强不可用不阻塞主路径）；
- 拉取前预览 `describeHostFetchPlan` 读数同步细化（预估字节数，若 Q4 有 Content-Length）。

### 分支乙：契约仅类目级（现状已到顶）

- 不改 `src/`；本任务产出 = 取证报告 + 父任务 AC-5 勾结（引用实测数字证明现状最优）；
- 若 Q1b 差分显示重类目已有效排除 ⇒ 现状透传即「极致省字节」的可达上限，结论落
  `.trellis/spec/frontend/host-capabilities.md`（进 git，防下次重问）。

## 3. 单测设计

- 分支甲：透传形状断言（fetch mock 捕获 body）、4xx 降级重试断言、能力表不变断言。
- 分支乙：无代码改动 ⇒ 补一条「selection 形状契约快照」测试防回归（锁 13 键布尔形状）。

## 4. 回滚

- 分支甲改动独立提交；降级开关 = 不传新形状（默认路径即现状）。
- 取证脚本与报告在任务目录内，天然可弃。

## 5. 提交边界

- 提交 1（若有代码）：luker 分支细粒度透传 + 降级 + 单测。
- 提交 2：spec/结论落盘（host-capabilities.md 增补）。
- 全程 `git add <显式路径>`，提交前 `git diff --staged --name-only` 校验（L0-7）。
