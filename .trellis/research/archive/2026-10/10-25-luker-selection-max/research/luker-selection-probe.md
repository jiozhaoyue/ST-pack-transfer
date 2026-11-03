# Luker `/api/users/backup` selection 契约取证报告

> 任务 `10-25-luker-selection-max`（父任务 R-B1 / D-03①）。全部读数为 2026-10-25
> 对 **Dev Luker 8003**（`https://dev-luker.localhost:8003`，Luker 2.7.0 @ `e1dbd1904`）
> 认证态黑盒实测；方法沿 `09-25-batch-restore-luker-endpoint` 确立的「黑盒为主、
> 源码仅作交叉印证非契约」（L1-MR-5 取证例外模式）。
> 复现：同目录 `probe-*.cjs` 六轮探针；原始读数 `probe-*.json` + `tmp/*.zip` 清单。
> 环境备注：该实例 config `disableCsrfProtection: true`（取证读数），故探针不带 X-CSRF-Token。

## 0. 结论速览（回答 PRD 三问 + 分支判定）

| 问 | 结论 | 证据 |
| --- | --- | --- |
| ① selection 是否支持文件/路径级排除 | **否**。契约 = **10 标准类目键 × 布尔**。非布尔形状（数组等）与未知键被**静默忽略**（按缺省语义处理）；`exclude:['backups/**']` 无效 | R1 qF 忽略；R3 数组变体差分噪声级 vs R5 真布尔差分精准命中目录大小 |
| ② `backups` 等重类目可否排除 | **半可**。`backups/cache/appPrivate` 三键被静默忽略（不是开关）；但 `backups/` 892.2MB（占包 49.8%）**挂在 `settings` 键下、与 `settings.json` 绑死**——`settings:false` 即双双缺席（清单实证），勾 settings 则被迫同拉 | R2 qB≈qA；R6 逐键 settings 省 899.3MB；R7 M3 清单无 backups |
| ③ 端点是否返回 Content-Length | **否**（200 响应一律 `transfer-encoding: chunked`）⇒ 拉取前预估总量无免费读数 | R1 全部 200 变体响应头 |

**分支判定：乙（透传层现状已到顶，零代码改动）**——10 标准键布尔全部有效且本仓已忠实透传
（`src/ui/host-bridge.js:784-787`）；「极致省字节」的最后 892MB 卡在 **`settings↔backups`
绑死**（勾设置必拖备份），属端点契约缺陷，本仓透传层无从解绑——登记 R-B2
（Authority/Luker 上游需求），另记两段式拉取为候选方向（§6.4）。

**核心数字（同勾选集字节读数，父 AC-5）**：现状全量拉取 **1,794,066,397 字节（1.79GB）**；
反选 `settings`（不要设置与备份）⇒ **894,775,736 字节（895MB），省 50.2%**——
现状透传此路径**已生效**；用户勾 settings 时 892.2MB 不可免（绑死）。

## 1. 环境与数据面

- 取证目标只连 Dev 白名单（8003），D-12 域名形式；会话走 `.pw-profile-dev` 持久档案。
- 打包确定性：同 selection 重复请求总量**逐字节一致**（R2 qA 1,794,066,398 vs R4 M1 1,794,066,397，
  差 1 字节为 zip 时间戳噪声级）——差分法可靠。
- 服务端打包缓存：`x-response-time` 显示同指纹请求 <10ms 直接复用 zip，新指纹触发重打包
  （qB 9.2s）——连续探针的耗时读数不反映打包成本，字节读数不受影响。
- **Dev Luker `data/default-user` 数据面**（`du -sm` 未压缩 → 包内压缩）：

| 目录 | 未压缩 MB | 包内压缩 MB | 包内占比 | selection 开关 |
| --- | --- | --- | --- | --- |
| `backups/` | 2304 | **892.2** | **49.8%** | **`settings`（与 settings.json 绑死）** |
| `extensions/` | 482 | 344.6 | 19.2% | `extensions` ✓ |
| `chats/` | 671 | 226.5 | 12.6% | `chats` ✓ |
| `user/` | 154 | 159.2 | 8.9% | `assets` ✓ |
| `public/` | — | 79.4 | 4.4% | `globalExtensions` ✓（缺省=排除，唯一特例） |
| `characters/` | 110 | 50.5 | 2.8% | `characters`（+`OpenAI Settings/` 12.3） ✓ |
| `OpenAI Settings/` | 37 | 12.3 | 0.7% | 随 `characters`（差分 62.8=50.5+12.3） |
| `worlds/` + 其余小项 | <40 | ~13 | <1% | `lorebooks`/`presets` 等 |
| `extensions-data/` | 643 | **0（不进包）** | — | — |

## 2. 第一轮：形状与边界矩阵（`probe-backup-selection.cjs`）

每变体 POST 后收 ≤64KB 即 cancel（TTFB/首块读数，不拉全量）：

| 变体 | selection | status | 判读 |
| --- | --- | --- | --- |
| qE-std10-all-false | 10 键全 false | **400** | `At least one backup category must be selected.`——空集被拒 |
| qA-std10-all-true | 10 键全 true（**现状等价**） | 200 | 基线 |
| qB-13-special-false | + `backups/cache/appPrivate:false` | 200 | 特殊键不报错（宽容）——但见 R2：也**不生效** |
| qC-13-all-true | + 三特殊键 true | 200 | 同上 |
| qD-shape-array | `{characters:['*.png']}` 单键 | 200 | 数组形状不报错——但见 R3：**值被忽略，按缺省处理** |
| qF-shape-exclude | + `exclude:['backups/**']` | 200 | 路径级键被静默忽略 |

## 3. 第二~三轮：总量与「数组伪 false」排除（`probe-totals.cjs` / `probe-key-diff.cjs`）

| 变体 | selection | 总字节 | 判读 |
| --- | --- | --- | --- |
| qA-total | 10 键 true | **1,794,066,398** | 基线（现状等价） |
| qB-total | 特殊三类显式 false | 1,794,012,698 | 差 53,700（噪声）⇒ **特殊键被忽略，显式 false 无效** |
| qC-total | 特殊三类显式 true | 1,794,012,697 | 同上 |
| qD-total | 单键 `characters:['*.png']` | 1,714,545,035 | 少 79.5MB——**不是 characters 生效**，是缺省语义差异（见 §4：缺的是 `public/`） |
| V2-ext-off | `extensions:['*.probe-off']`+9 true | 1,794,012,697 | 节省 53,701（噪声）⇒ **数组值被忽略** |
| V3-chats-off | `chats:['*.probe-off']`+9 true | 1,794,066,397 | 节省 **1 字节** ⇒ 同上（第三轮「数组=伪 false」方法论作废） |

## 4. 第四轮：包内清单（`probe-manifest.cjs` + python zipfile）

M1（10 键 true）与 M2（单键数组）完整存盘（`tmp/`）后按顶级目录聚合：

- 两包**唯一差异**：M1 有 `public/`（79.4MB / 356 文件），M2 无。
- M2 仍含全部类目目录（chats/characters/extensions/backups…）⇒ **缺省键=包含**；
  唯 `public/` 在「assets 之外某键缺省」时缺席（该键缺省=排除）——逐键表（§5）定案归属。
- `backups/` 892.2MB / 296 文件**两包皆在**——推翻早前「backups 未进包」的推测
  （错误根源：拿未压缩 du 2304MB 与压缩包 1794MB 比大小）。
- `extensions-data/` 643MB **不进包**（两包清单均无此目录）。

## 5. 第五~七轮：真布尔 false、逐键映射与绑死验证

**方法论更正**：第三轮「数组=伪 false」无效（数组值被端点忽略、按缺省处理）；
第五轮起一律用**真布尔 false** 差分，并用清单法（第四/七轮）独立验证关键结论。

**完整逐键映射表（10 键布尔全部有效，`false` 精准排掉对应目录）**：

| selection 键 | false 节省 | 包内映射（清单/差分双证） | 缺省语义 |
| --- | --- | --- | --- |
| `characters` | 62.8MB | `characters/` 50.5 + `OpenAI Settings/` 12.3 | 包含 |
| `chats` | 226.9MB | `chats/` 226.5 | 包含 |
| `lorebooks` | 8.2MB | `worlds/` 8.2 | 包含 |
| `presets` | 12.4MB | presets 系目录（`context/instruct/sysprompt/reasoning`…） | 包含 |
| **`settings`** | **899.3MB** | **`settings.json` 6.9 + `backups/` 892.2 —— 绑死** | 包含 |
| `secrets` | 0.06MB | `secrets.json` | 包含 |
| `assets` | 159.2MB | `user/` 159.2（**非** public/） | 包含 |
| `extensions` | 345.9MB | `extensions/` 344.6 | 包含 |
| `globalExtensions` | 79.5MB | `public/` 79.4（M2 之谜定案） | **排除**（唯一特例） |
| `vectors` | 0.05MB | 向量小文件 | 包含 |

**`settings ↔ backups` 绑死独立验证（第七轮 `probe-settings-off.cjs`）**：
`settings:false` 包（M3，894,775,736 字节）清单聚合——`backups/` 与 `settings.json`
**双双缺席**，其余目录齐全（extensions 344.6 / chats 226.5 / user 159.2 / public 79.4 …）。
差分推断（899.3 ≈ 892.2+6.9）与清单实证一致。

**绑死的语义后果**：用户勾选「设置」类目（常见：迁移要带走设置）⇒ Luker 端**被迫**
把 `backups/` 892.2MB（占全量包 49.8%）一起打包传输，插件侧再按 `includeBackups=false`
在**拉取后**丢弃——字节已过网络。契约内无分离开关。

## 6. 对产品的影响（分支乙：透传层零改动 + 两项登记）

1. **`fetchHostBackup` 不改**：10 键布尔透传有效且已在线；布尔之外的形状不传（探针的数组形状是取证专用，产品永不发出）。
2. **`BACKUP_SELECTION_SUPPORT.luker = true` 语义保持**——spec 增补契约表（键→目录映射 + settings↔backups 绑死 + globalExtensions 缺省特例），见收口提交。
3. **拉取前预览读数无需改**：`describeHostFetchPlan`「按勾选拉取」表述与实测一致；无 Content-Length ⇒ 不承诺预估字节（现状正确）。
4. **登记 R-B2（Authority PR 需求增强）**：Luker 端点解绑 `settings` 与 `backups/`
   （或增加独立 `includeBackups` 开关）。用户勾「设置」被迫同拉 892.2MB 是契约缺陷。
   本仓候选缓解（**不在本任务做**，改动面大，由父任务地图决定是否立任务）：
   **两段式拉取**——Luker 且「勾 settings、未勾 backups」时传 `settings:false` 拉 895MB 包，
   再经独立端点单取 `settings.json` 注入工作流（需重打包/附属产物契约改动）。
5. **字节读数表（AC-4/父 AC-5）**：见 §5 逐键映射表与 `deliverables/bytes-report.md`。

## 7. 复现纪律

- 六轮探针均 `node` 直跑（Playwright 全局解析，见 `e2e/lib/resolve-playwright.cjs`；
  第四轮 Node 侧 fetch 因自签证书需 `NODE_TLS_REJECT_UNAUTHORIZED=0`，仅限该取证进程）。
- 只连 Dev 8003；POST 触发服务端打包属只读导出，无数据写入。
- 全量收流共 ~14 次（1.79GB × 10 + 存盘 2 次），均本机环回；`tmp/*.zip` 分析后删除。
