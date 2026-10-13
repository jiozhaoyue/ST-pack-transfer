# 宿主能力矩阵（S0 取证）

> 取证日期：2026-10-13。证据来自本仓**代码事实**（`file:line`）与上一轮**黑盒实测记录**；
> 本轮未重新运行实例测试，凡未取证者一律标 `unknown`，**不得**以助手推断替代。
> 状态三态：`available`（已实现且有证据）/ `unavailable`（明确不支持）/ `unknown`（未取证）。
> 能力四维（`design.md` §3 的 `capabilities` 契约）：`sourceRead` / `formatConvert` / `targetWrite` / `targetVerify`，
> 另列 `backup`（宿主原生备份导出）。

## 0. 为什么要有这张表

`R-01` 要求四宿主同等优先、12 条有向迁移路径逐条验收。但「能转换某种格式」**不等于**「能写入该宿主」，
更不等于「目标数据已验证」。本表把四种能力**分开**列，防止把 `formatConvert=available` 误读成 `targetWrite=available`。

## 1. 判定依据（代码证据，逐条可核）

| 编号 | 事实 | 证据 |
| --- | --- | --- |
| E-1 | 源导出走 `POST /api/users/backup`，带 `selection` 请求体 | `src/ui/host-bridge.js:747`（`fetchHostBackup`） |
| E-2 | 恢复端点候选表：`luker` = `/api/users/restore-backup` → `/api/users/restore`；`st` = `/api/users/restore` → `/api/users/restore-backup` | `src/ui/host-bridge.js:70-73` |
| E-3 | **ST 1.19.0 两个恢复端点均 404 ⇒ ST 无整包恢复能力** | `src/ui/host-bridge.js:67`（2026-09-25 认证态黑盒实测） |
| E-4 | **Luker 2.7.0 `/api/users/restore` → 404，`/api/users/restore-backup` 存在** | `src/ui/host-bridge.js:66`（同上实测） |
| E-5 | 恢复能力三态 `unknown/available/unsupported`，判定为 `unsupported` 时禁用入口并给原生导入指引 | `src/ui/host-bridge.js:85, 91-103, 133-140` |
| E-6 | 恢复端点回退**只在 404/405**；超时/5xx/413/网络中断/取消**绝不换端点重试**（防重复写同一用户目录） | `src/ui/host-bridge.js:143-186` |
| E-7 | 恢复在途互斥：`restoreInFlight` 为真时第二次调用直接抛错 | `src/ui/host-bridge.js:908-911` |
| E-8 | 取消是**请求级**：已上传数据宿主可能已部分落盘，须提示用户核对 | `src/ui/host-bridge.js:49-51` |
| E-9 | `selection` 透传能力**显式声明**：`st=false`（需插件内过滤）、`luker=true`、`tt/pt=false`（未取证，保守） | `src/ui/host-bridge.js:283-306`（`hostSelectionCapability`） |
| E-10 | PT 原生归档可**识别**（manifest 带 per-file `moduleId`）但 v1 **不支持转换** | `src/core/detect.js:7, 55-57`；`src/core/transform.js:363-365` |
| E-11 | 转换入口 `convert(sourcePath, targetPath, { target, selection, excludedPaths, ... })`，`target ∈ {st,l,tt,pt}` | `src/core/transform.js:312-337, 39-44` |
| E-12 | 导出后形状软校验：Luker 应有 `manifest.json`，ST 不应有；失败仅告警不阻断 | `src/ui/host-bridge.js:567-589` |
| E-13 | 宿主平台码 → 布局码归一唯一落点：`luker→l` | `src/ui/host-bridge.js:222-225`（`hostLayoutCode`） |
| E-14 | 拉取/转换支持断点续传（OPFS 半成品 / crc 跳过门 `appendedNames`） | `src/ui/host-bridge.js:724-887`；`src/core/transform.js:378-401` |
| E-15 | TT **无浏览器端口** ⇒ 不自动化（C-3） | `09-27-plugin-driven-instance-sync` PRD `C-3` |

## 2. 能力矩阵

图例：`A` = available（已实现且有证据）；`U` = unavailable（明确不支持）；`?` = unknown（未取证）。

| 宿主 | sourceRead | formatConvert | targetWrite | targetVerify | backup |
| --- | --- | --- | --- | --- | --- |
| **SillyTavern (st)** | A（E-1，selection 需插件内过滤 E-9） | A（`target=st` E-11） | **U**（E-3：两恢复端点 404） | ?（无核对实现） | A（原生备份导出，人工落盘） |
| **Luker (l)** | A（E-1，selection 原生透传 E-9） | A（`target=l` E-11） | A（E-4：`restore-backup` 存在） | ?（无核对实现） | A（原生备份导出） |
| **TauriTavern (tt)** | ?（无浏览器端口 E-15） | A（`target=tt` E-11） | U（C-3：人工交付） | ? | 人工（无自动化端口） |
| **PureTavern (pt)** | ?（PT 原生归档不可读 E-10） | **部分**：TT 迁移包同形 A；PT 原生归档 **U**（E-10） | U（宿主数据管理面板，人工） | ? | A（宿主原生归档） |

## 3. 关键边界（供 S1 判定契约使用）

1. **ST 的 `targetWrite` 是硬 `unavailable`，不是「未知」。** `restoreCapability==='unsupported'` 由 E-3 实测支撑；
   安全门遇到 ST 目标时**不得**把它当「可以试试」，必须走「原生分类导入指引」（`R-02` / `D-24`）。
2. **`sourceRead` 与 `selection 透传` 是两件事。** ST 能读源，但端点不透传 `selection` ⇒ 必须先拉全量、插件内过滤（E-9）。
   范围语义（`selection-semantics.md`）必须区分「用户请求的类目」与「宿主实际返回的类目」。
3. **`targetVerify` 四宿主当前**全部**是 `?`。** 现无任何宿主侧核对实现；`src/core/report.js` 的转换报告**不是**目标核对证据。
   ⇒ `R-05` / `AC-07` 的「已核对 / 人工确认 / 已接受缺项 / 待核对」四态，初期只能给「人工确认」与「待核对」。
4. **PT 原生归档是明确缺口**（E-10）。`D-23` 已裁定「首版补齐 PT 原生归档的识别、校验和转换」，
   但**实现细节未定**——本片只登记缺口，实现归 S0 之后的独立格式适配分片，不在 S1 范围内。
5. **`formatConvert` 的可用性依赖 `detect` 成功**：源布局必须落在 `st|l|tt`（PT_NATIVE 与 UNKNOWN 均抛错，E-10/E-11）。

## 4. 本片未做的事（诚实边界）

- 未重新运行 `npm test` / E2E / 未启动任何实例（`ready-decisions.md`：本轮未授权实例写入）。
- `tt` / `pt` 的 `sourceRead` 标 `?` 而非 `A`：本仓无证据表明能经浏览器读取其数据。
- 各宿主**官方稳定版快照**（`D-27`）未逐一固定 commit，本表以「本机 Dev 载体 + 代码事实」为据，非官方版本承诺。
