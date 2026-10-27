# 跨宿主互传矩阵

## Goal

让四酒馆（ST / Luker / TauriTavern / PureTavern）与独立 Web（含 GitHub Pages）之间**任意两端**都能互传数据包，
并且在**同宿主设备之间优先复用宿主原生局域网通道**；收发角色随时可交换。
界面先在 demo 定稿，再落正式实现。

## 取证（2026-10-27，直接读实例源码）

| 宿主 | 原生互传 | 证据 |
| --- | --- | --- |
| Luker | **有**：局域网同步 | `src/sync/categories.js` 的 `user-files` 类别 `syncDefault:'on'`（路径 `directories.files` = `user/files/`）；端点 `/api/sync/v1/{health,peers,categories,availability,pair/start,pair/accept,peers/:id/sync,pull,undo}`，挂载见 `src/server-main.js:491` |
| TauriTavern | **有**：LAN Sync v2 | `docs/CurrentState/Sync.md`：本机 HTTPS peer + SPKI pin + 配对 URI/二维码；`/v2/*` 协议族；支持 bundle+zstd、自动同步 |
| SillyTavern | 无 | 实例源码检索 `局域网/LAN Sync/WebRTC/RTCPeerConnection/PeerJS/mDNS` = 0 命中 |
| PureTavern | 无（传输） | README 中「局域网」只指把 Provider/代理指向局域网地址，不传文件 |
| 独立 Web | 不适用 | 浏览器上下文，只能走自研 WebRTC |

**推论**：不存在能同时打通四宿主的「原生」协议（Luker 与 TT 的协议不同源，不能互通）。
因此形态只能是**分通道**：同宿主设备用原生同步，其余用自研 WebRTC。

## Requirements

- R-T1 **通道选择**：按「发送方宿主 + 接收方」给出可用通道，并在面板里逐条显示可用性：
  - 同宿主且已配对（Luker / TT）→ **原生局域网同步**；
  - 其余任意组合（ST、PT、Web、跨宿主）→ **自研 WebRTC**（现有取件码 + 扫码）。
- R-T2 **原生通道（Luker）**：端点契约以实例源码为准（`src/endpoints/sync.js:889`）：
  `POST /api/sync/v1/peers/:peerId/sync` **只有「本机拉取」语义**（无 direction 参数），
  即调用方从已配对设备拉取；**没有远端直推端点**。
  - 「接收」= 调该端点拉取，对端 `user/files/` 里的包会落到本机；
  - 「发送」= 把包写入本机 `user/files/`（`/api/files/upload`），再**由对端设备的用户**在其同步面板点一次同步；
    插件必须如实说明这一步，**不得伪称已直推**。
  - 宿主不可用 / 未配对 / 端点缺失一律**显式降级**到 WebRTC，不静默失败。
- R-T3 **原生通道（TauriTavern）**：TT 扩展不能直接 invoke Tauri 命令（实测见 design §2），
  故插件只做两件事：把包写入可同步目录；提示用户在原生 Sync 面板或自动同步里完成。
  **不得**伪称已直连。
- R-T4 **收发角色交换**：一键互换当前会话的发送/接收方向：
  - WebRTC：清空当前会话，把「发送」切为「接收」（或反之），旧取件码作废；
  - 原生：在 push / pull 方向之间切换（Luker 的 `peers/:id/sync` 支持方向参数）。
- R-T5 **Web 形态**：独立 Web（含 GitHub Pages）与插件、插件与插件之间都能互传；
  同源多标签用 `BroadcastChannel` 自动配对（免复制码），跨设备仍走取件码 + 扫码。
- R-T6 **公网无中继**：只使用 STUN；穿透失败必须明确提示「当前网络需要中继」，
  **不引入 TURN、不偷偷降级**。
- R-T7 **界面先 demo**：所有新增界面先在 `src/ui/ui-demo.html` 呈现（模拟数据），
  确认后再接真实通道。

## 约束

- 宿主差异只许进 `src/ui/host-bridge.js`（L0-9）；通道判定抽成纯逻辑模块可单测。
- 纯前端主路径不得依赖宿主原生能力（L0-11）：原生通道缺失时 WebRTC 必须可用。
- 不写宿主源码、不写穿 junction（L0-1）；实例数据写入前留清单（原生路径仅写 `user/files/`）。

## Acceptance Criteria

- [ ] AC-T1 互传面板逐条列出可用通道与不可用原因（宿主/未配对/版本不支持）。
- [ ] AC-T2 Luker 原生通道：调 `peers/:id/sync` 能把对端 `user/files/` 拉到本机；
  「发送」路径如实提示需对端同步；失败显式降级。
- [ ] AC-T3 TauriTavern：如实提示「需在原生 Sync 面板完成」，并给出包在可同步目录中的位置。
- [ ] AC-T4 「交换收发」在 WebRTC 与原生通道上都可用；交换后旧会话/旧码失效。
- [ ] AC-T5 独立 Web ↔ 插件互传跑通（取件码）；同源多标签用 BroadcastChannel 免码配对。
- [ ] AC-T6 公网穿透失败有明确提示，不引入中继。
- [ ] AC-T7 demo 里能完整走通上述界面的模拟流程。
- [ ] AC-T8 单测覆盖通道选择、角色交换、原生可用性判定（纯函数）。
