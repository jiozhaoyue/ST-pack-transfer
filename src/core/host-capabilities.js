/**
 * 宿主能力显式声明表（通用化，禁止按平台名推导）
 *
 * 语义：
 * - `true`  = 已确认具备；
 * - `false` = 已确认不具备（不发起探测、不产生 404 噪音）；
 * - 未列出  = 未取证 → 探测一次（fail-open），失败再如实降级。
 *
 * 新增宿主或能力时只改这里，不在 `host-bridge.js` 里散落 `platform === 'luker'`。
 */

export const HOST_CAPABILITIES = Object.freeze({
  /** `/api/extensions/discover` + 静态 manifest */
  assetList: Object.freeze({ st: true, luker: true, pt: false }),
  /** 2.9+ 自绘账户窗口 */
  accountWindow: Object.freeze({ st: false, luker: true, tt: false, pt: false }),
  /** 账户窗口内的图形化存储页 */
  storagePage: Object.freeze({ st: false, luker: true, tt: false, pt: false }),
  /** 服务端直传（本插件禁止后台插件，故全部 false） */
  serverTransfer: Object.freeze({ st: false, luker: false, tt: false, pt: false }),
});

/**
 * @param {'assetList'|'accountWindow'|'storagePage'|'serverTransfer'} kind
 * @param {string} platform
 * @returns {{supported:boolean, known:boolean}}
 */
export function capabilityState(kind, platform) {
  const table = HOST_CAPABILITIES[kind];
  if (!table || !platform) return { supported: false, known: false };
  const declared = table[platform];
  return { supported: declared === true, known: declared !== undefined };
}
