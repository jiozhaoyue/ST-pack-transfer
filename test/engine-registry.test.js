/**
 * 零覆盖模块补测 · engine-registry（src/core/engine-registry.js）
 *
 * 依据：docs/HANDOFF-2026-11-21-quality-pass.md:85 列为「零测试模块」次之项。
 * 本模块全为纯函数，重点锁定三条契约：
 *   ① UI 下拉目标表只含四种引擎且顺序固定（顺序即下拉顺序）；
 *   ② detectSourceEngine 的判定优先级：转储/元数据 > SQLite > FS；
 *   ③ 读不到就如实返回空 kind + reason，不猜、不降级（模块头注释纪律）。
 */
import { describe, it, expect } from 'vitest';
import {
  TARGET_ENGINES,
  isTargetEngine,
  targetEngineLabel,
  engineRequiresHandle,
  detectSourceEngine,
  isCarrierEntryName,
} from '../src/core/engine-registry.js';
import {
  ENGINE_META_ENTRY,
  ENGINE_DUMP_ENTRY,
  SQLITE_DB_ENTRY,
} from '../src/core/engine-model.js';

describe('engine-registry · 目标引擎表', () => {
  it('① TARGET_ENGINES 只含四种引擎，顺序固定为 fs/postgres/mysql/sqlite', () => {
    expect(TARGET_ENGINES.map((item) => item.kind)).toEqual(['fs', 'postgres', 'mysql', 'sqlite']);
    expect(Object.isFrozen(TARGET_ENGINES)).toBe(true);
  });

  it('① 只有 fs 不需要 handle，其余三种都需要', () => {
    expect(TARGET_ENGINES.find((item) => item.kind === 'fs').requiresHandle).toBe(false);
    for (const kind of ['postgres', 'mysql', 'sqlite']) {
      expect(TARGET_ENGINES.find((item) => item.kind === kind).requiresHandle).toBe(true);
      expect(engineRequiresHandle(kind)).toBe(true);
    }
    expect(engineRequiresHandle('fs')).toBe(false);
  });

  it('② isTargetEngine 只认表内 kind，未知与空值返回 false', () => {
    for (const kind of ['fs', 'postgres', 'mysql', 'sqlite']) expect(isTargetEngine(kind)).toBe(true);
    for (const bad of ['oracle', '', null, undefined, 'PG']) expect(isTargetEngine(bad)).toBe(false);
  });

  it('③ targetEngineLabel 返回中文标签，未知值回退为字符串', () => {
    expect(targetEngineLabel('fs')).toBe('文件系统');
    expect(targetEngineLabel('postgres')).toBe('PostgreSQL');
    expect(targetEngineLabel('mysql')).toBe('MySQL');
    expect(targetEngineLabel('sqlite')).toBe('SQLite');
    expect(targetEngineLabel('oracle')).toBe('oracle');
    expect(targetEngineLabel(null)).toBe('');
  });

  it('③ engineRequiresHandle 对未知 kind 返回 false（不猜）', () => {
    expect(engineRequiresHandle('oracle')).toBe(false);
  });
});

describe('engine-registry · detectSourceEngine 源引擎判定', () => {
  it('无任何承载物 ⇒ fs，handledBy 为 fs', () => {
    expect(detectSourceEngine({ names: ['settings.json', 'chats/a.jsonl'] }))
      .toEqual({ kind: 'fs', handledBy: 'fs' });
  });

  it('仅有 SQLite 库文件 ⇒ sqlite，handledBy 为 sqlite', () => {
    expect(detectSourceEngine({ names: [`data/${SQLITE_DB_ENTRY}`] }))
      .toEqual({ kind: 'sqlite', handledBy: 'sqlite' });
  });

  it('有 _engine_dump.bin + 可识别 meta ⇒ 取 meta 的 kind，handledBy 为 dump', () => {
    expect(detectSourceEngine({
      names: ['x/' + ENGINE_DUMP_ENTRY],
      meta: { engineKind: 'mysql' },
    })).toEqual({ kind: 'mysql', handledBy: 'dump' });
  });

  it('有 _engine_meta.json + pg 别名 ⇒ 归一为 postgres', () => {
    expect(detectSourceEngine({
      names: [ENGINE_META_ENTRY],
      meta: { engineKind: 'pg' },
    })).toEqual({ kind: 'postgres', handledBy: 'dump' });
  });

  it('meta 的 kind / engine 备选字段同样生效（兼容三种字段名）', () => {
    expect(detectSourceEngine({ names: [ENGINE_META_ENTRY], meta: { kind: 'sqlite' } }).kind)
      .toBe('sqlite');
    expect(detectSourceEngine({ names: [ENGINE_META_ENTRY], meta: { engine: 'POSTGRESQL' } }).kind)
      .toBe('postgres');
  });

  it('转储/元数据优先级高于 SQLite：两者同在时以 dump 为准', () => {
    expect(detectSourceEngine({
      names: [ENGINE_DUMP_ENTRY, SQLITE_DB_ENTRY],
      meta: { engineKind: 'postgres' },
    })).toEqual({ kind: 'postgres', handledBy: 'dump' });
  });

  it('③ 有转储但 meta 缺失或 kind 无法识别 ⇒ 空 kind + 非空 reason（如实报告）', () => {
    const missing = detectSourceEngine({ names: [ENGINE_DUMP_ENTRY] });
    expect(missing.kind).toBe('');
    expect(missing.reason.length).toBeGreaterThan(0);

    const bad = detectSourceEngine({ names: [ENGINE_META_ENTRY], meta: { engineKind: 'oracle' } });
    expect(bad.kind).toBe('');
    expect(bad.reason.length).toBeGreaterThan(0);
  });

  it('任意目录层级都能识别承载物（按 basename 判定）', () => {
    expect(isCarrierEntryName(`a/b/c/${ENGINE_META_ENTRY}`)).toBe(true);
    expect(isCarrierEntryName(`a/${ENGINE_DUMP_ENTRY}`)).toBe(true);
    expect(isCarrierEntryName(SQLITE_DB_ENTRY)).toBe(true);
    expect(isCarrierEntryName('settings.json')).toBe(false);
    expect(isCarrierEntryName(null)).toBe(false);
  });

  it('缺省参数（无 names/meta）返回 fs，不抛错', () => {
    expect(detectSourceEngine()).toEqual({ kind: 'fs', handledBy: 'fs' });
  });
});
