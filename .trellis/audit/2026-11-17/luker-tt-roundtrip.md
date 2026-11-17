# Luker ↔ TauriTavern 往返保真审计（2026-11-17）

> 本审计针对本项目最高价值路径：Luker（L）与 TauriTavern（TT）互转。
> 目标是用真实可复现的数字证明往返数据保真，并把"格式改名"与"静默丢失"区分开。
> 全部数字来自本机实测，证据落盘在 `test-results/e2e-flows/luker-tt-*/result.json`。

## 1. 方法

### 1.1 工具
- `tooling/e2e-flows/luker-tt-roundtrip.cjs`（CommonJS，`node` 直跑，动态 `import()` 加载仓内 ESM 核心）
- `test/luker-tt-roundtrip.test.js`（vitest，固定夹具同等断言）

### 1.2 流程
对每个输入包执行：

1. `detectLayout(input)` 判定源布局（`l` / `tt`）。
2. `convert(input → mid, { target: 对端 })` 转换到对端。
3. `detectLayout(mid)` 校验中间包布局 == 对端。
4. `convert(mid → back, { target: 源布局 })` 转回源布局。
5. `detectLayout(back)` 校验回程包布局 == 源布局。
6. 独立校验（不只看 exit code）：
   - a) `back` 能被 zip 读取器枚举中央目录且条目数 > 0（合法 zip）；
   - b) 关键条目存在：角色 / 聊天 / 世界书 / 设置 / secrets / 扩展（按 hub 语义判定，兼容 L 摊平与 TT `data/default-user/` 前缀）；
   - c) 条目集合对比：逐条列出 `lost` / `added` / `renamed`；
   - d) 计数不减少：聊天消息条数、角色数、世界书条目数；
   - e) 确定性：同一输入连转两次，对端产物文件清单（名称 + CRC32）一致。

### 1.3 判定口径
- hub 归一化：去掉 `data/default-user/` 前缀；`data/extensions/third-party/` 与 `extensions/third-party/` 均归一为 `extensions/<名>`（转换器把全局与用户级扩展平铺到同一路径）。
- "丢失"分四类，逐条列入结果 JSON：
  - **改名 `renamed`**：作用域平铺（`extensions/third-party/<名>/` → `extensions/<名>/`）、TT 前缀迁移、来源记录 global→local。属格式改名，不算丢失。
  - **预期丢弃 `expectedLost`**：备份快照 `backups/`、派生缓存 `thumbnails/` `vectors/`、TT 私有 `data/_cache/` `content.log`、系统垃圾 `.DS_Store`、开发冗余（`.git/`、`.github/`、`.editorconfig`、`tsconfig.*`、`webpack.config.*`、`vite.config.*`、`*.map`、`*.spec.js`、`*.test.js` 等）、重合成的 `manifest.json`。均为 `isJunkOrDevFile` 的设计过滤。
  - **同名扩展去重 `dedupLost`**：同名扩展的全局副本独有文件被跳过，但该扩展在回程包中仍存在。宿主加载语义是用户级优先（见 `tavern-datapack-formats.md`），属设计行为；如实计数，不判失败。
  - **关键丢失 `keyLost`**：以上三类之外，角色 / 聊天 / 世界书 / 设置 / secrets / 扩展数据条目消失。判失败。
- 硬指标：扩展目录数不减少；角色 / 聊天 / 消息 / 世界书条目计数不减少；关键项存在；确定性一致。
- 任何校验失败 → 退出码 1，结果 JSON 保留证据，不伪造通过。

## 2. 样本

| 样本 | 路径 | 布局 | 来源 |
| --- | --- | --- | --- |
| fixture-l | `fixtures/fixture-l.zip` | l | 固定夹具（`fixtures/gen.js`） |
| fixture-tt | `fixtures/fixture-tt.zip` | tt | 固定夹具（`fixtures/gen.js`） |
| real-l-to-tt | `out/real-l-to-tt.zip` | tt | 历史 Phase C 真实产物（L→TT），约 586 MB |
| real-tt-to-l | `out/real-tt-to-l.zip` | l | 历史 Phase C 真实产物（TT→L），约 77 MB |

> 真实样本是**已转换产物**，非原始宿主导出；但它们承载真实结构与真实数据量，
> 足以检验 TT↔L 往返的结构保真与计数不减少。原始宿主导出未覆盖（见 §6）。

## 3. 固定夹具实测结果

证据：`test-results/e2e-flows/luker-tt-2026-11-17T14-25-41-877Z/result.json`

### 3.1 fixture-l（L → TT → L）

| 指标 | 值 |
| --- | --- |
| 输入 / 中间 / 回程字节 | 2782 / 3161 / 3366 B |
| 条目数（输入 → 回程） | 12 → 11 |
| 往返耗时 | 146.25 ms（去程 73.32 ms + 回程 19.02 ms + 校验/确定性） |
| 关键项 | 角色 / 聊天 / 世界书 / 设置 / secrets / 扩展 全部存在 |
| 计数（输入 = 回程） | 角色 1、聊天 1、消息 2、世界书 1、世界书条目 1 |
| 确定性 | 两次对端产物清单一致（名称 + CRC32） |
| 结论 | **通过** |

丢失/新增清单：

- 丢失（均预期）：`backups/auto-2026.json`、`thumbnails/fixture-avatar.png`
- 新增：`_convert/extensions-manifest.json`（合成扩展清单）
- 改名：无
- 关键丢失：**无**

### 3.2 fixture-tt（TT → L → TT）

| 指标 | 值 |
| --- | --- |
| 输入 / 中间 / 回程字节 | 3554 / 3387 / 3816 B |
| 条目数（输入 → 回程） | 14 → 11 |
| 往返耗时 | 141.26 ms（去程 12.12 ms + 回程 104.01 ms） |
| 关键项 | 角色 / 聊天 / 世界书 / 设置 / secrets / 扩展 全部存在 |
| 计数（输入 = 回程） | 角色 1、聊天 1、消息 2、世界书 1、世界书条目 1 |
| 确定性 | 两次对端产物清单一致（名称 + CRC32） |
| 结论 | **通过** |

丢失/新增清单：

- 丢失（均预期）：`backups/auto-2026.json`、`data/_cache/derived.bin`、`data/content.log`、`thumbnails/fixture-avatar.png`、`data/_tauritavern/extension-sources/global/test-extension.json`
- 新增：`_convert/extensions-manifest.json`、`data/_tauritavern/extension-sources/local/test-extension.json`
- 改名：`extension-sources/global/test-extension.json` → `extension-sources/local/test-extension.json`（TT 用户级扩展作用域变化，属格式改名，非数据丢失）
- 关键丢失：**无**

> 字节保真另由 vitest 断言锁定：角色卡 PNG 往返字节恒等（`Buffer.compare == 0`）。

## 4. 真实样本实测结果

汇总：4/4 通过，确定性 4/4，总耗时 133,373.84 ms。
证据：`test-results/e2e-flows/luker-tt-2026-11-17T14-25-41-877Z/result.json`

### 4.1 real-l-to-tt（TT → L → TT）

| 指标 | 值 |
| --- | --- |
| 输入 / 中间 / 回程字节 | 586,759,059 / 501,518,961 / 501,651,375 B |
| 条目数（输入 → 回程） | 4197 → 3409 |
| 扩展目录数（输入 → 回程） | 30 → 30 |
| 往返耗时 | 98,584.78 ms（去程 29,944.81 ms + 回程 30,258.69 ms + 枚举/计数/确定性） |
| 关键项 | 角色 / 聊天 / 世界书 / 设置 / secrets / 扩展 全部存在 |
| 计数（输入 = 回程） | 角色 5、聊天 18、消息 868、世界书 6、世界书条目 360 |
| 确定性 | 两次对端产物清单一致（名称 + CRC32，3380 条） |
| 结论 | **通过** |

丢失/新增清单（逐条见结果 JSON 的 `diff` 数组）：

- `lost` 819 条。
- `expectedLost` 652 条：`.git/hooks/*.sample`、`tsconfig.*`、`webpack.config.js`、`*.map`、`.DS_Store` 等开发冗余与系统垃圾。
- `dedupLost` 167 条：同名扩展的全局副本独有文件（`extensions/<名>/utils/*.js` 等）。源包中 st-chatu8、LittleWhiteBox 等扩展同时存在 local 与 third-party 两份，回程只保留用户级副本，30 个扩展目录全部仍在。宿主加载语义是用户级优先，属设计行为。
- `renamed` 2 条：来源记录作用域改名。
- `keyLost` **0 条**：无关键数据静默丢失。
- `added` 31 条：转换器合成清单与来源记录。

### 4.2 real-tt-to-l（L → TT → L）

| 指标 | 值 |
| --- | --- |
| 输入 / 中间 / 回程字节 | 77,296,540 / 79,661,431 / 79,639,490 B |
| 条目数（输入 → 回程） | 650 → 639 |
| 扩展目录数（输入 → 回程） | 2 → 2 |
| 往返耗时 | 34,464.21 ms（去程 8,710.97 ms + 回程 9,545.44 ms） |
| 关键项 | 角色 / 聊天 / 世界书 / 设置 / secrets / 扩展 全部存在 |
| 计数（输入 = 回程） | 角色 6、聊天 18、消息 868、世界书 7、世界书条目 364 |
| 确定性 | 两次对端产物清单一致（名称 + CRC32，639 条） |
| 结论 | **通过** |

丢失/新增清单：

- `lost` 12 条，全部为 `expectedLost`（开发/私有文件）。
- `renamed` 0 条。
- `dedupLost` 0 条。
- `keyLost` **0 条**。
- `added` 1 条：合成清单。

> 审计过程中曾把 `extensions/third-party/<名>/` → `extensions/<名>/` 的作用域平铺误判为丢失。
> 经逐条核对，这些文件在回程包里以平铺路径存在；归一化与改名判定已修正，修正前证据保留在
> `test-results/e2e-flows/luker-tt-2026-11-17T14-20-31-818Z/result.json`。

## 5. 结论

Luker ↔ TauriTavern 往返在固定夹具与真实大包上均数据保真，未发现数据保真缺陷。

- 硬指标全绿：4/4 样本通过，确定性 4/4，关键项齐全，扩展目录数不减少，计数零减少，`keyLost` 全部为 0。
- 真实样本核心数据原样保留：角色 5/6、聊天 18/18、消息 868/868、世界书 6/7、世界书条目 360/364。
- 真实包条目数下降可完全归因于设计行为：开发冗余过滤、同名扩展全局副本去重、TT 私有文件丢弃。
- 这些被过滤项已如实计数（652 / 167 / 12），未隐藏。
- 确定性成立：同一输入连转两次，对端产物文件清单与 CRC32 完全一致。
- 性能参考：586 MB 包完成完整往返约 98.6 秒，77 MB 包约 34.5 秒。
- 固定夹具的角色卡 PNG 字节经 vitest 断言恒等（`Buffer.compare == 0`）。

## 6. 未覆盖项

- 原始宿主导出包（未经本工具转换的 Luker / TauriTavern 原生导出）：真实样本是历史转换产物。
- 宿主运行时恢复/导入（Luker `restore-backup`、TT 原生导入器）：本审计只验证包结构与数据保真，不调用宿主 API、不启动实例。
- 大包极端场景：扩展 `.git` packfile、Method 93（Zstandard）条目的解压后内容逐字节比对。
- UI 层与 Worker 线程：本审计走 Node 主线程核心路径。

## 7. 复现

```bash
# 固定夹具（秒级）
LUKER_TT_SKIP_REAL=1 node tooling/e2e-flows/luker-tt-roundtrip.cjs
npx vitest run test/luker-tt-roundtrip.test.js

# 全量（含真实大包，分钟级）
node tooling/e2e-flows/luker-tt-roundtrip.cjs
```

失败退出码 1；结果 JSON 写入 `test-results/e2e-flows/luker-tt-<时间戳>/result.json`。
