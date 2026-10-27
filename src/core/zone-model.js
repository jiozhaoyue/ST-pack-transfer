/**
 * 分区状态机（纯逻辑）：导入区 / 导出区各自的可用动作与流转语义。
 *
 * 视图只负责按这里的结果渲染；测试锁这里。**禁止**在视图里另写一套判断规则。
 */

export const ZONES = Object.freeze({ IMPORT: 'import', EXPORT: 'export' });

/** 每个分区的动作全集（声明序即渲染序）。 */
export const ZONE_ACTIONS = Object.freeze({
  import: Object.freeze(['fetch', 'generate', 'merge', 'libraryExport', 'lan']),
  export: Object.freeze(['download', 'restore', 'copyBack']),
});

export function actionsForZone(zone) {
  return zone === ZONES.EXPORT ? ZONE_ACTIONS.export : ZONE_ACTIONS.import;
}

/**
 * 动作在当前选择下是否可用。
 * @param {'import'|'export'} zone
 * @param {string} action
 * @param {{selectedCount?:number}} [ctx]
 */
export function actionEnabled(zone, action, { selectedCount = 0 } = {}) {
  const count = Number(selectedCount) || 0;
  if (zone === ZONES.EXPORT) {
    return (action === 'download' || action === 'restore' || action === 'copyBack') && count > 0;
  }
  if (action === 'generate' || action === 'lan') return count > 0;
  if (action === 'merge') return count > 1;
  if (action === 'fetch' || action === 'libraryExport') return true;
  return false;
}

/** 存储 origin → 分区。新增 origin 必须在这里登记，否则包会没有归属。 */
export const ORIGIN_ZONE = Object.freeze({
  'upload': ZONES.IMPORT,
  'host-export': ZONES.IMPORT,
  'lan': ZONES.IMPORT,
  'export-copy': ZONES.IMPORT,
  'source-backup': ZONES.IMPORT,
  'converted': ZONES.EXPORT,
  'delta': ZONES.EXPORT,
  'split-part': ZONES.EXPORT,
  'report': ZONES.EXPORT,
  'target-backup': ZONES.EXPORT,
  'vault': ZONES.IMPORT,
});

export function zoneOfOrigin(origin) {
  return ORIGIN_ZONE[origin] || ZONES.IMPORT;
}

/**
 * 「复制回导入区」写入记录的纯计划：必须是**独立**记录（新 id + `export-copy` 来源），
 * 删除任一侧都不联动（R3.4）。
 */
export function copyBackRecord(pkg, { now = Date.now(), random = Math.random } = {}) {
  const id = `pkg-${now}-${String(random()).slice(2, 7)}`;
  return {
    id,
    name: pkg?.name || '',
    role: 'source',
    origin: 'export-copy',
    metadata: { copiedFrom: pkg?.id || null },
  };
}
