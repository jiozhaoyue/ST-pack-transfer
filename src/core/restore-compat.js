/**
 * 回传兼容判据（纯逻辑，无 DOM，供 UI 与控制器共用）。
 *
 * 本判据只回答一个问题：**该布局的包，其目录结构能否直接落到宿主用户目录**，
 * 即无需先转换就能回传。它不判断宿主是否提供整包恢复端点——那是
 * hostRestoreCapability() 的职责（当前仅 Luker 支持整包恢复，见
 * src/ui/host-bridge.js:344-352）。
 *
 * 代码事实依据：
 * - src/core/transform.js 的 targetEntryPath()：ST / Luker 目标把条目摊平写到 zip 根
 *   （return hubPath，无前缀，见 :1107 / :1112）；TT / PT 目标写 data/default-user/ 前缀
 *   （见 :1109-1111）。
 * - src/core/detect.js 的 LAYOUTS（:3-9）：st=zip 根摊平、l=同 ST 摊平加 manifest、
 *   tt=data/ 根（PT 的 TT 迁移包同形）、pt-native=v1 不支持、unknown。
 * - docs/restore.md:14：不存在增量恢复——结构不匹配时唯一出路是先整体转换，
 *   没有「只回传一部分」的中间态。
 *
 * 因此按目录结构分两族：
 * - flat（摊平，无前缀）：st、l（=luker）
 * - prefixed（data/default-user/ 前缀）：tt、pt
 * 同族可直接回传；跨族或布局未知则必须先转换。
 */

/** 不支持原因的统一 i18n key（ok=false 时恒定，ok=true 时为空串）。 */
export const NEED_CONVERT_REASON = 'restore.incompatible.needConvert';

/** 宿主平台码 → 用户目录结构族。'l' 与 'luker' 等价。 */
// 用 null 原型字典：普通对象字面量的 'constructor' / 'toString' 等原型链键会被
// `foo[key]` 命中（返回函数），导致 canRestoreLayout('constructor', 'constructor') 误判 ok:true。
const HOST_DIR_FAMILY = Object.freeze(Object.assign(Object.create(null), {
  st: 'flat',
  luker: 'flat',
  l: 'flat',
  tt: 'prefixed',
  pt: 'prefixed',
}));

/** 布局码 → 目录结构族。空串 / unknown 不入表，一律拒绝。'l' 与 'luker' 等价。 */
const LAYOUT_FAMILY = Object.freeze(Object.assign(Object.create(null), {
  st: 'flat',
  l: 'flat',
  luker: 'flat',
  tt: 'prefixed',
  pt: 'prefixed',
}));

/**
 * 布局能否直接回传到宿主（按目录结构族判定）。
 *
 * @param {'st'|'luker'|'tt'|'pt'|string} hostPlatform 宿主平台码
 * @param {'st'|'l'|'tt'|'pt'|''|'unknown'|string} layout 包布局码
 * @returns {{ok: boolean, reasonKey: string}} ok=true 时 reasonKey 为空串；
 *   ok=false 时 reasonKey 为统一 i18n key
 */
export function canRestoreLayout(hostPlatform, layout) {
  const hostFamily = HOST_DIR_FAMILY[String(hostPlatform).toLowerCase()];
  const layoutFamily = LAYOUT_FAMILY[String(layout).toLowerCase()];
  const ok = Boolean(hostFamily) && Boolean(layoutFamily) && hostFamily === layoutFamily;
  return ok
    ? { ok: true, reasonKey: '' }
    : { ok: false, reasonKey: NEED_CONVERT_REASON };
}

/**
 * 布局码 → 文案用名称。'l' 归一为 'luker'，其余原样返回（幂等）。
 *
 * @param {string} layout 布局码
 * @returns {string} 文案用名称
 */
export function describeLayout(layout) {
  const LABEL_OVERRIDE = Object.freeze(Object.assign(Object.create(null), { l: 'luker' }));
  const key = String(layout);
  return LABEL_OVERRIDE[key] || key;
}
