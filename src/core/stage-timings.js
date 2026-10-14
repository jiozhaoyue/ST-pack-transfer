/**
 * 异步阶段分段计时（S0 收尾 · 纯逻辑）。
 *
 * 存在原因：本仓的异步阶段阈值（10s / 30s / 120s / 0）**没有一处来自实测**——
 * 既没有读数，也没有取得读数的手段，于是「阈值该定多少」只能靠经验。本模块是
 * 「阈值来自实测」的**唯一**落地手段：把宿主导出链路的每一段真实耗时记下来。
 *
 * 设计约束：
 * - **纯逻辑**：无 DOM、无 IO、无全局状态；时钟由调用方注入 ⇒ Node 可精确断言（`L1-MR-6`）。
 * - **读数是读数**：`snapshot()` 只含**已闭合**的段。进行中的段不出现在读数里——
 *   否则「耗时」会变成一个随查询时刻漂移的值，无法用于校准阈值。
 * - **不猜**：未 `begin` 就 `end` 一律 no-op（宁可少记，不可记错）。
 */

/** 阶段标签（声明顺序 = `summary()` 的输出顺序 = 用户旅程顺序）。 */
export const STAGE_LABELS = Object.freeze({
  /** 取凭证 / 当前用户（`/csrf-token`、`/api/users/me`）。 */
  CREDENTIALS: 'credentials',
  /** 宿主打包数据（首字节之前，即 TTFB）。 */
  HOST_GENERATE: 'host-generate',
  /** 包体传输（首字节之后）。 */
  TRANSFER: 'transfer',
  /** 格式转换。 */
  CONVERT: 'convert',
});

const STAGE_ORDER = Object.freeze(Object.values(STAGE_LABELS));

/** 毫秒 → 人类可读（`<1s` 用 ms，否则用两位小数的秒）。 */
function formatDuration(ms) {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(2)}s`;
}

/**
 * 建一个分段计时记录器。
 *
 * @param {{now?: () => number}} [opts]
 * @returns {{
 *   begin: (label: string) => void,
 *   end: (label: string) => void,
 *   snapshot: () => Record<string, {ms: number, count: number}>,
 *   summary: () => string,
 *   reset: () => void,
 * }}
 */
export function createStageRecorder({ now = () => Date.now() } = {}) {
  /** 进行中的段：label → 起点时间戳 */
  let open = new Map();
  /** 已闭合的段：label → {ms, count} */
  let closed = new Map();

  const begin = (label) => {
    // 重复 begin 不重入：保留首次起点。否则嵌套调用会把外层起点静默推后，
    // 读数偏小且无人察觉。
    if (open.has(label)) return;
    open.set(label, now());
  };

  const end = (label) => {
    if (!open.has(label)) return; // 未 begin：no-op，宁可少记不可记错
    const started = open.get(label);
    open.delete(label);
    const elapsed = Math.max(0, now() - started);
    const prev = closed.get(label) || { ms: 0, count: 0 };
    closed.set(label, { ms: prev.ms + elapsed, count: prev.count + 1 });
  };

  const snapshot = () => {
    const out = {};
    for (const label of STAGE_ORDER) {
      const entry = closed.get(label);
      if (entry) out[label] = { ms: entry.ms, count: entry.count };
    }
    // 非标准标签也一并给出（调用方可自定义段），但排在标准段之后
    for (const [label, entry] of closed) {
      if (!(label in out)) out[label] = { ms: entry.ms, count: entry.count };
    }
    return out;
  };

  const summary = () => {
    const snap = snapshot();
    const parts = [];
    for (const label of Object.keys(snap)) {
      const { ms, count } = snap[label];
      parts.push(count > 1 ? `${label} ${formatDuration(ms)}×${count}` : `${label} ${formatDuration(ms)}`);
    }
    return parts.join(' · ');
  };

  const reset = () => {
    open = new Map();
    closed = new Map();
  };

  return { begin, end, snapshot, summary, reset };
}
