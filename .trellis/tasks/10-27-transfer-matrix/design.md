# 设计：跨宿主互传矩阵

## 1. 通道模型（纯逻辑，可单测）

`src/core/transfer-matrix.js`

```js
/**
 * @typedef {{id:'luker-native'|'tt-native'|'webrtc', kind:'native'|'webrtc',
 *            available:boolean, reason?:string}} Channel
 */
export function channelsFor({
  senderHost,        // 'st'|'luker'|'tt'|'pt'|'web'
  nativePeers = [],  // [{id,label}] 已配对设备（Luker / TT）
  webRtcAvailable = true,
  ttInvokeSupported = false,
}) => Channel[];

/** 收发互换：'send' → 'recv'，'recv' → 'send' */
export function swapDirection(direction) { return direction === 'send' ? 'recv' : 'send'; }
```

规则：
- `luker-native`：仅 `senderHost==='luker' && nativePeers.length>0` 可用；否则原因 `未配对/宿主不支持`。
- `tt-native`：仅 `senderHost==='tt'`；`ttInvokeSupported===false` 时 `available:false`，
  原因 `需在原生 Sync 面板完成`（R-T3 不伪称直连）。
- `webrtc`：`webRtcAvailable` 决定；不可用时原因 `浏览器不支持 WebRTC`。

## 2. 原生通道（Luker）适配器

`src/ui/host-bridge.js` 新增：

- `listLanSyncPeers()` → `GET /api/sync/v1/peers`，归一为 `[{id,label}]`；非 Luker / 失败返回 `[]`。
- `triggerLanSync(peerId, { direction = 'pull' } = {})` → `POST /api/sync/v1/peers/:id/sync`，
  body `{ direction }`（与宿主面板同源调用，带 CSRF）；返回 `{ok, reason?, detail?}`。
- `isLanSyncAvailable()` → 先 `GET /api/sync/v1/health`（短超时），失败即不可用。

写包：沿用现有 `uploadUserFile`（`/api/files/upload`，写入 `user/files/`），
因为 Luker 的 `user-files` 类别默认同步。

降级链（L0-11）：健康检查失败 → 通道标不可用 → 用户点「原生发送」时提示原因并保留 WebRTC 入口。

## 3. 接收侧发现

对端插件在 `syncPackages`/启动时扫描 `user/files/` 里的 `*.zip`（Luker 有 `/api/files` 但无列表端点 →
用宿主目录约定 `user/files/<name>`；无法列目录时提示用户用导入按钮选择，不假装自动发现）。

> 结论：**自动发现仅在能列出目录的宿主上做**；不能列就不做，避免"看起来自动、实际没有"。

## 4. WebRTC 侧改造

- `lan-transfer-panel.js` 增加 `swap()`：关闭当前会话 → `sendState/recvState` 归位 →
  视图层交换两侧卡片位置与当前方向；旧取件码作废（`machine = createTransferMachine()`）。
- 同源自动配对（R-T5）：
  - `BroadcastChannel('st-pack-transfer-lan')` 广播 `{type:'offer'|'accept', payload}`；
  - 仅同源标签之间有效，跨设备仍用取件码；
  - 通道不可用（浏览器不支持）时静默回退手动码。

## 5. 视图

- 执行区新增「互传矩阵」按钮 → 弹窗：
  - 顶部：当前宿主、WebRTC 能力；
  - 列表：每个通道一行（名称、可用性、原因、动作按钮）；
  - 底部：「交换收发」。
- demo：内置两条模拟已配对设备（Luker / TT）+ WebRTC 行，可点交换看方向变化。

## 6. 失败与提示

- 原生不可用：行内原因，不弹错误。
- 公网 WebRTC 失败：沿用现有失败态，追加「当前网络需要中继」提示（R-T6）。
- 所有降级都写日志（事实，不写说明文字）。

## 7. 测试

- `test/transfer-matrix.test.js`：通道选择（各宿主 × 有无 peer × WebRTC 能力）、方向交换幂等。
- `test/lan-sync-bridge.test.js`：归一化 peers、失败返回 `[]`、非 Luker 直接空。
- 视图层不写单测（与既有 UI 一致），由 demo 走查。
