/**
 * 迁移范围的**默认选择**（单一源）。
 *
 * 存在原因：`research/selection-semantics.md` §2/§4 实测暴露「三张默认表各写各的」——
 * `category-filter.js` 的 `currentSelection`（13 键）、`host-bridge.js` 的 `FULL_SELECTION`（10 键）、
 * 模板里三个特殊类目复选框（均无 `checked`）**互不引用**。后果是**双轨陷阱**：
 * `currentSelection.backups === true`（面板显示已勾选）而 `includeBackups` 默认 `false`
 * （产物里没有备份条目）——用户看到「已勾选」却拿不到数据。
 *
 * 用户 **2026-10-14** 裁定（OQ-1）：**默认「完整迁移」以 13 键表为准**。本模块是该裁决的唯一落点：
 * 三处默认值全部由 `DEFAULT_SELECTION` 派生，改一处即三处同步。
 *
 * 分层：`src/core/` 纯常量与纯函数，无 DOM、无 IO（`L1-MR-6`）。
 */

/** 10 个**标准类目**：走 `selection` 布尔，宿主端点的 `selection` 体也只认这些。 */
export const STANDARD_SELECTION_KEYS = Object.freeze([
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

/**
 * 3 个**特殊类目**：不走 `selection` 布尔，而走 `generatePlan` / `convert` 的独立 `include*` 参数
 * （见 `plan-preview.js` 的 SPECIAL_CATEGORIES 分支）。
 */
export const SPECIAL_SELECTION_KEYS = Object.freeze(['backups', 'cache', 'appPrivate']);

/**
 * 特殊类目键 → **真正决定产物的参数名**。
 *
 * 这张映射是「双轨」的显式化：面板上的 `selection.backups` 只是意图，产物由 `includeBackups` 决定。
 * `test/selection-defaults.test.js` 会拿它与 `plan-preview.js` 的实际入参名对账，防两边漂移。
 */
export const SPECIAL_SELECTION_FLAGS = Object.freeze({
  backups: 'includeBackups',
  cache: 'includeCache',
  appPrivate: 'includeAppPrivate',
});

/** 特殊类目「默认不含」时的理由（与 `plan-preview.js` 的 DROP 理由同源，供界面汇总用）。 */
const SPECIAL_EXCLUSION_REASONS = Object.freeze({
  cache: '派生缩略图与缓存，目标平台导入后会自动重建',
  backups: '历史备份与聊天备份快照',
  appPrivate: '应用级私有配置，目标平台不消费',
});

/**
 * **默认选择表**（13 键）。值即 `category-filter.js` 的既有默认，未作任何改动——
 * 用户裁决的是「以哪张表为准」，不是「改表里的值」。
 *
 * ⚠ 改这里的任何一个 `true/false`，会同时改变：① 类目面板初值；② 端点缺省体（仅标准 10 键）；
 * ③ 三个特殊类目复选框的默认勾选。这正是本模块存在的目的。
 */
export const DEFAULT_SELECTION = Object.freeze({
  characters: true,
  chats: true,
  lorebooks: true,
  presets: true,
  settings: true,
  secrets: true,
  assets: true,
  extensions: true,
  globalExtensions: true,
  vectors: true,
  backups: true,
  cache: false,
  appPrivate: false,
});

/**
 * 由默认表派生**端点缺省体**（`FULL_SELECTION` 的形状）：只含 10 个标准键、全 `true`。
 *
 * 为什么特殊类目不在里面：宿主的 `/api/users/backup` 端点只认标准类目的 `selection` 布尔，
 * 备份/缓存/私有配置由插件侧的 `include*` 参数在**导出后**过滤（既成事实，本片不改）。
 *
 * @returns {Readonly<Record<string, boolean>>}
 */
export function buildEndpointSelection() {
  return Object.freeze(
    Object.fromEntries(STANDARD_SELECTION_KEYS.map((key) => [key, true])),
  );
}

/**
 * 列出**默认不含**的特殊类目及其载体参数名与理由（供检查页「本次不含」汇总）。
 *
 * 只覆盖**特殊类目**：标准类目的排除是**逐条**的（用户反选/平台 DROP），
 * 已由 `plan.categories[*].items` 逐项呈现，不在这里重复。
 *
 * @param {Record<string, boolean>} [selection] 当前选择（缺省用 `DEFAULT_SELECTION`）
 * @returns {Array<{key: string, flag: string, reason: string}>}
 */
export function describeSpecialExclusions(selection = DEFAULT_SELECTION) {
  const sel = selection && typeof selection === 'object' ? selection : DEFAULT_SELECTION;
  return SPECIAL_SELECTION_KEYS
    .filter((key) => sel[key] !== true)
    .map((key) => ({
      key,
      flag: SPECIAL_SELECTION_FLAGS[key],
      reason: SPECIAL_EXCLUSION_REASONS[key] || '',
    }));
}
