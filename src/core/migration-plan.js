/**
 * 统一迁移计划（S1 · 纯数据层）。
 *
 * 职责：把「用户请求的类目意图」冻结成不可变快照 `MigrationPlan`，并映射既有
 * `generatePlan`（src/core/plan-preview.js）算出的 **effective** 结果。
 *
 * 硬约束（`10-01/design.md` §1、`L1-MR-6`）：本模块**不得**依赖 DOM / `window` /
 * `fetch` / `src/ui/**`，须能在 Node/Vitest 直接运行。
 *
 * 关键纪律（`research/selection-semantics.md` §3）：`requested` **一律**来自显式传入的
 * `requestedSelection` 快照，**绝不**读取 `src/ui/category-filter.js` 的模块级
 * `currentSelection` —— 后者会被 `renderCategoryStats` 按「类目是否可用」写回改写，
 * 是「换包后旧勾选残留」污染的真实来源。
 */

/** 10 个标准类目（与 `src/core/inspect.js` CATEGORIES 对齐；此处冻结为独立常量，避免引入 UI 依赖）。 */
export const STANDARD_CATEGORIES = Object.freeze([
  'characters',
  'chats',
  'lorebooks',
  'presets',
  'settings',
  'secrets',
  'assets',
  'extensions',
  'globalExtensions',
  'vectors',
]);

/** 三个特殊类目（走独立 include 标志，不进 selection 布尔；见 selection-semantics.md §4）。 */
export const SPECIAL_CATEGORY_KEYS = Object.freeze(['backups', 'cache', 'appPrivate']);

/** 能力四维（`design.md` §4）。 */
export const CAPABILITY_DIMENSIONS = Object.freeze([
  'sourceRead',
  'formatConvert',
  'targetWrite',
  'targetVerify',
]);

/** 能力三态：未知不是「可用」，也不是「不可用」。 */
export const CAPABILITY_STATES = Object.freeze(['available', 'unavailable', 'unknown']);

const VALID_LAYOUTS = Object.freeze(['st', 'l', 'tt', 'pt']);

/** 递归冻结（对象/数组）；原始值原样返回。 */
function deepFreeze(value) {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }
  for (const key of Object.keys(value)) {
    deepFreeze(value[key]);
  }
  return Object.freeze(value);
}

/** 计划 revision 单调递增计数器（同一会话内保证「任一计划唯一」）。 */
let revisionCounter = 0;

/** 归一一个能力格：缺字段一律回落 `unknown`，`unknown` 不等于任何默认可用。 */
function normalizeCapabilityCell(cell) {
  const src = cell && typeof cell === 'object' ? cell : {};
  const out = {};
  for (const dim of CAPABILITY_DIMENSIONS) {
    const v = src[dim];
    out[dim] = CAPABILITY_STATES.includes(v) ? v : 'unknown';
  }
  out.permission = ['granted', 'denied'].includes(src.permission) ? src.permission : 'unknown';
  out.reason = typeof src.reason === 'string' ? src.reason : '';
  out.evidence = typeof src.evidence === 'string' ? src.evidence : '';
  return out;
}

/**
 * 归一能力矩阵：按**宿主布局**（`st|l|tt|pt`）分组；未提供的布局整体为全 `unknown`。
 *
 * 四维描述的是「该宿主作为源/目标的能力」，与 `research/host-capability-matrix.md` 的矩阵同构；
 * 故按**布局**而非业务类目分组（`evaluateWriteGate` 按 `target.layout` 取格）。
 */
function normalizeCapabilities(capabilities) {
  const src = capabilities && typeof capabilities === 'object' ? capabilities : {};
  const keys = new Set([...VALID_LAYOUTS, ...Object.keys(src)]);
  const out = {};
  for (const key of keys) {
    out[key] = normalizeCapabilityCell(src[key]);
  }
  return out;
}

/** 从 `basePlan` 映射 effective；无 basePlan 时给 0 值并诚实标记来源缺失。 */
function mapEffective(basePlan) {
  if (!basePlan || typeof basePlan !== 'object') {
    return {
      selectedCount: 0,
      selectedBytes: 0,
      byCategory: {},
      exclusions: [],
      source: 'none',
    };
  }

  const byCategory = {};
  const exclusions = [];
  const categories = basePlan.categories && typeof basePlan.categories === 'object'
    ? basePlan.categories
    : {};

  for (const [catKey, catData] of Object.entries(categories)) {
    const items = Array.isArray(catData?.items) ? catData.items : [];
    byCategory[catKey] = {
      count: catData?.count ?? 0,
      sizeBytes: catData?.sizeBytes ?? 0,
      selectedCount: catData?.selectedCount ?? 0,
      selectedSizeBytes: catData?.selectedSizeBytes ?? 0,
    };
    for (const item of items) {
      if (item && item.selected === false) {
        exclusions.push({
          path: item.sourcePath ?? item.hubPath ?? '',
          category: catKey,
          reason: item.reason || 'excluded',
        });
      }
    }
  }

  return {
    selectedCount: basePlan.expectedOutputFiles ?? 0,
    selectedBytes: basePlan.expectedOutputBytes ?? 0,
    byCategory,
    exclusions,
    source: 'base-plan',
  };
}

/**
 * 生成不可变迁移计划快照。
 *
 * @param {object} input
 * @param {{layout: string, handle?: string}} input.source 源布局（`st|l|tt`；PT_NATIVE/UNKNOWN 不进入）
 * @param {{layout: string}} input.target 目标布局（`st|l|tt|pt`）
 * @param {Record<string, boolean>} [input.requestedSelection] 10 标准类目请求意图（**显式快照**）
 * @param {string[]|Set<string>} [input.excludedPaths] 单项穿透排除
 * @param {{backups?: boolean, cache?: boolean, appPrivate?: boolean}} [input.specials] 特殊类目独立标志
 * @param {Record<string, object>} [input.capabilities] 按 category 分组的能力矩阵
 * @param {object|null} [input.basePlan] 既有 `generatePlan` 输出（用于映射 effective）
 * @param {object} [input.options] 其余选项透传
 * @returns {object} 深度冻结的 `MigrationPlan`
 */
export function createMigrationPlan(input = {}) {
  if (!input || typeof input !== 'object') {
    throw new TypeError('createMigrationPlan: input 必须是对象');
  }
  const sourceLayout = input.source?.layout;
  const targetLayout = input.target?.layout;
  if (!VALID_LAYOUTS.includes(sourceLayout)) {
    throw new Error(`createMigrationPlan: source.layout 必须是 ${VALID_LAYOUTS.join('|')} 之一（收到 ${sourceLayout}）`);
  }
  if (!VALID_LAYOUTS.includes(targetLayout)) {
    throw new Error(`createMigrationPlan: target.layout 必须是 ${VALID_LAYOUTS.join('|')} 之一（收到 ${targetLayout}）`);
  }

  // requested：只取标准类目布尔 + 显式穿透 + 特殊标志；不读任何 UI 模块级状态。
  const requestedSelection = {};
  const rawSelection = input.requestedSelection && typeof input.requestedSelection === 'object'
    ? input.requestedSelection
    : {};
  for (const cat of STANDARD_CATEGORIES) {
    requestedSelection[cat] = rawSelection[cat] === true;
  }

  const excludedPaths = input.excludedPaths
    ? [...input.excludedPaths]
    : [];

  const rawSpecials = input.specials && typeof input.specials === 'object' ? input.specials : {};
  const specials = {};
  for (const key of SPECIAL_CATEGORY_KEYS) {
    specials[key] = rawSpecials[key] === true;
  }

  revisionCounter += 1;

  const plan = {
    revision: revisionCounter,
    createdAt: Date.now(),
    source: { layout: sourceLayout, handle: input.source?.handle ?? null },
    target: { layout: targetLayout },
    requested: {
      selection: requestedSelection,
      excludedPaths,
      specials,
    },
    effective: mapEffective(input.basePlan ?? null),
    capabilities: normalizeCapabilities(input.capabilities),
    options: input.options && typeof input.options === 'object' ? { ...input.options } : {},
    basePlanProvided: Boolean(input.basePlan),
  };

  return deepFreeze(plan);
}

/** 计划是否为本模块产出的冻结快照（供 `evaluateWriteGate` 的 `no-plan` 判定复用）。 */
export function isMigrationPlan(value) {
  return Boolean(
    value
    && typeof value === 'object'
    && Object.isFrozen(value)
    && typeof value.revision === 'number'
    && value.requested
    && value.effective
    && value.capabilities,
  );
}

/** 测试辅助：重置 revision 计数器（生产代码不应调用）。 */
export function __resetRevisionCounter() {
  revisionCounter = 0;
}
