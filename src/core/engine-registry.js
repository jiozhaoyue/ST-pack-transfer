/**
 * 存储引擎注册表：探测源引擎、枚举可作为目标的引擎。
 *
 * 扩展点纪律：**新增数据库只加一个 adapter + 这里登记一项**，UI 下拉从本表生成，
 * 不在界面里硬编码三四个选项。
 *
 * 未知引擎一律如实返回「不支持」，不猜、不降级（用户要求：读不到就报告，不假成功）。
 */

import {
  ENGINE_KINDS,
  ENGINE_LABELS,
  ENGINE_DUMP_ENTRY,
  ENGINE_META_ENTRY,
  SQLITE_DB_ENTRY,
  normalizeEngineKind,
} from './engine-model.js';

/** 可作为转换**目标**的引擎（顺序即 UI 下拉顺序）。 */
export const TARGET_ENGINES = Object.freeze([
  { kind: ENGINE_KINDS.FS, label: ENGINE_LABELS.fs, requiresHandle: false },
  { kind: ENGINE_KINDS.POSTGRES, label: ENGINE_LABELS.postgres, requiresHandle: true },
  { kind: ENGINE_KINDS.MYSQL, label: ENGINE_LABELS.mysql, requiresHandle: true },
  { kind: ENGINE_KINDS.SQLITE, label: ENGINE_LABELS.sqlite, requiresHandle: true },
]);

export function isTargetEngine(value) {
  return TARGET_ENGINES.some((item) => item.kind === value);
}

export function targetEngineLabel(kind) {
  return TARGET_ENGINES.find((item) => item.kind === kind)?.label || String(kind || '');
}

export function engineRequiresHandle(kind) {
  return Boolean(TARGET_ENGINES.find((item) => item.kind === kind)?.requiresHandle);
}

/**
 * 由包内条目名与 `_engine_meta.json` 判定源引擎。
 *
 * @param {{ names: string[], meta?: object|null }} args
 * @returns {{ kind: string, reason?: string, handledBy?: 'dump'|'sqlite'|'fs' }}
 *   `kind` 为空串表示无法判定（调用方应如实提示，不假设）。
 */
export function detectSourceEngine({ names = [], meta = null } = {}) {
  const bases = names.map((name) => String(name || '').split('/').pop());
  const metaKind = normalizeEngineKind(meta?.engineKind || meta?.kind || meta?.engine);
  const hasDump = bases.includes(ENGINE_DUMP_ENTRY);
  const hasMeta = bases.includes(ENGINE_META_ENTRY);
  const hasSqlite = bases.includes(SQLITE_DB_ENTRY);

  if (hasMeta || hasDump) {
    if (!metaKind) {
      return { kind: '', reason: '包内存在引擎转储，但 _engine_meta.json 缺失或 engineKind 无法识别' };
    }
    return { kind: metaKind, handledBy: 'dump' };
  }
  if (hasSqlite) return { kind: ENGINE_KINDS.SQLITE, handledBy: 'sqlite' };
  return { kind: ENGINE_KINDS.FS, handledBy: 'fs' };
}

/** 引擎承载物条目（任何一层目录）。 */
export function isCarrierEntryName(name) {
  const base = String(name || '').split('/').pop();
  return base === ENGINE_DUMP_ENTRY || base === ENGINE_META_ENTRY || base === SQLITE_DB_ENTRY;
}
