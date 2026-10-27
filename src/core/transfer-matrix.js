/**
 * 互传通道矩阵（纯逻辑）。
 *
 * 事实依据（2026-10-27 读实例源码）：
 *   · Luker：有原生局域网同步；`POST /api/sync/v1/peers/:id/sync` 只有**本机拉取**语义，
 *     没有远端直推端点（`src/endpoints/sync.js:889`）。
 *   · TauriTavern：有 LAN Sync v2，但扩展不能 invoke Tauri 命令 → 插件只能提示走原生面板。
 *   · SillyTavern / PureTavern：无原生存量传输。
 *   · 独立 Web：只能走自研 WebRTC。
 *
 * 本模块只产出「有哪些通道、能不能用、为什么不能」，不发起任何 IO。
 */

export const CHANNEL = Object.freeze({
  LUKER_NATIVE: 'luker-native',
  TT_NATIVE: 'tt-native',
  WEBRTC: 'webrtc',
});

/** 原生通道的收发能力：拉取可直连；推送需要对端自己发起。 */
export const NATIVE_PULL = 'pull';
export const NATIVE_PUSH = 'peer-action';

/**
 * @param {{
 *   senderHost?: 'st'|'luker'|'tt'|'pt'|'web',
 *   nativePeers?: Array<{id:string,label?:string}>,
 *   webRtcAvailable?: boolean,
 * }} [ctx]
 * @returns {Array<{id:string,kind:'native'|'webrtc',available:boolean,reasonKey:string,
 *   peers?:Array<object>, pull?:boolean, push?:string}>}
 */
export function channelsFor({
  senderHost = 'st',
  nativePeers = [],
  webRtcAvailable = true,
} = {}) {
  const peers = (Array.isArray(nativePeers) ? nativePeers : []).filter((peer) => peer && peer.id);
  const rows = [];

  if (senderHost === 'luker') {
    rows.push({
      id: CHANNEL.LUKER_NATIVE,
      kind: 'native',
      available: peers.length > 0,
      reasonKey: peers.length > 0 ? '' : 'transfer.reason.unpaired',
      peers,
      pull: true,
      push: NATIVE_PUSH,
    });
  }

  if (senderHost === 'tt') {
    rows.push({
      id: CHANNEL.TT_NATIVE,
      kind: 'native',
      available: false,
      reasonKey: 'transfer.reason.hostPanel',
      peers,
      pull: false,
      push: NATIVE_PUSH,
    });
  }

  rows.push({
    id: CHANNEL.WEBRTC,
    kind: 'webrtc',
    available: !!webRtcAvailable,
    reasonKey: webRtcAvailable ? '' : 'transfer.reason.noWebrtc',
  });

  return rows;
}

/** 收发方向互换（幂等：换两次回到原样）。 */
export function swapDirection(direction) {
  return direction === 'send' ? 'recv' : 'send';
}
