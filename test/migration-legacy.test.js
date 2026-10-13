/**
 * 强制不兼容（U-1 · 2026-10-13 用户裁定）。
 *
 * **本文件替代原「旧会话兼容」用例**——原用例断言 v1 记录可归一、可续跑；
 * 现契约**反过来**：任何非 v2 记录一律 `reject-incompatible`，
 * **即使字段结构完全相同**也不放行（用户原话：「任何即使没改也要强制不兼容」）。
 *
 * 相关：`.trellis/spec/frontend/migration-compatibility-and-release.md` §3.1 / §4。
 */
import { describe, expect, it } from 'vitest';
import {
  SESSION_SCHEMA_VERSION,
  classifySessionCompatibility,
  readSessionRecord,
  isResumableSession,
} from '../src/core/migration-session.js';
import { createMigrationSession } from '../src/ui/migration-controller.js';
import { buildWorkspaceRecord } from '../src/storage/db.js';

describe('SESSION_SCHEMA_VERSION', () => {
  it('当前会话 schema 为 2（破坏性升级：v1 一律作废）', () => {
    expect(SESSION_SCHEMA_VERSION).toBe(2);
  });
});

describe('classifySessionCompatibility（U-1 硬拒绝）', () => {
  it('v2 记录 ⇒ continue-supported', () => {
    const r = classifySessionCompatibility({ schemaVersion: 2, sourceName: 'a.zip' });
    expect(r.compatible).toBe(true);
    expect(r.action).toBe('continue-supported');
    expect(r.reason).toBe('');
  });

  it('缺 schemaVersion ⇒ reject-incompatible（不猜着当新版）', () => {
    const r = classifySessionCompatibility({ sourceName: 'a.zip', selection: { chats: true } });
    expect(r.compatible).toBe(false);
    expect(r.action).toBe('reject-incompatible');
    expect(r.reason).toContain('版本签名');
  });

  it('v1 记录 ⇒ reject-incompatible（旧版已作废）', () => {
    const r = classifySessionCompatibility({ schemaVersion: 1, checkpoint: { opfsName: 'p.zip' } });
    expect(r.compatible).toBe(false);
    expect(r.action).toBe('reject-incompatible');
    expect(r.reason).toContain('1');
  });

  it('**结构完全相同的 v1 仍被拒**（本次破坏性变更的核心判据）', () => {
    const body = {
      sourceName: 'a.zip',
      target: 'l',
      selection: { chats: true },
      checkpoint: { opfsName: 'p.zip', receivedBytes: 100 },
    };
    const v1 = { schemaVersion: 1, ...body };
    const v2 = { schemaVersion: 2, ...body };

    expect(classifySessionCompatibility(v2).compatible).toBe(true);
    expect(classifySessionCompatibility(v1).compatible).toBe(false);
  });

  it('未知数字版本 ⇒ reject-incompatible', () => {
    const r = classifySessionCompatibility({ schemaVersion: 99 });
    expect(r.compatible).toBe(false);
    expect(r.reason).toContain('99');
  });

  it('非对象（null / 字符串 / 数组 / 数字）⇒ reject-incompatible，不抛错', () => {
    for (const bad of [null, undefined, 'x', 42, []]) {
      const r = classifySessionCompatibility(bad);
      expect(r.compatible).toBe(false);
      expect(r.action).toBe('reject-incompatible');
      expect(r.reason).toBeTruthy();
    }
  });

  it('字符串 "2" 不算 v2（严格数字比较，不做类型宽松）', () => {
    expect(classifySessionCompatibility({ schemaVersion: '2' }).compatible).toBe(false);
  });
});

describe('readSessionRecord（只读解释，不写回不补默认）', () => {
  it('原字段原样带出，且不新增 schemaVersion', () => {
    const raw = { sourceName: 'a.zip', selection: { chats: true } };
    const r = readSessionRecord(raw);
    expect(r.record).toBe(raw);
    expect(r.compatible).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(r.record, 'schemaVersion')).toBe(false);
  });

  it('非对象 ⇒ record 为 null 且不兼容', () => {
    const r = readSessionRecord(null);
    expect(r.record).toBeNull();
    expect(r.compatible).toBe(false);
  });
});

describe('isResumableSession（先过兼容门，再看断点）', () => {
  it('v2 完整记录 ⇒ 可续跑', () => {
    const full = { schemaVersion: 2, checkpoint: { opfsName: 'p.zip', receivedBytes: 100 } };
    expect(isResumableSession(full)).toEqual({ resumable: true, reason: '' });
  });

  it('v1 记录**断点齐全也拒**（隐式兼容已被禁止）', () => {
    const legacy = { schemaVersion: 1, checkpoint: { opfsName: 'p.zip', receivedBytes: 100 } };
    const r = isResumableSession(legacy);
    expect(r.resumable).toBe(false);
    expect(r.reason).toBeTruthy();
  });

  it('缺版本签名的记录即使断点齐全也拒', () => {
    const r = isResumableSession({ checkpoint: { opfsName: 'p.zip', receivedBytes: 100 } });
    expect(r.resumable).toBe(false);
    expect(r.reason).toBeTruthy();
  });

  it('v2 缺断点 ⇒ 不可续跑（有原因）', () => {
    const r = isResumableSession({ schemaVersion: 2 });
    expect(r.resumable).toBe(false);
    expect(r.reason).toBeTruthy();
  });

  it('v2 有断点但无半成品线索 ⇒ 不可续跑', () => {
    const r = isResumableSession({ schemaVersion: 2, checkpoint: {} });
    expect(r.resumable).toBe(false);
  });

  it('v2 空断点对象 ⇒ 不可续跑', () => {
    const r = isResumableSession({ schemaVersion: 2, checkpoint: [] });
    expect(r.resumable).toBe(false);
  });
});

describe('buildWorkspaceRecord（落盘记录强制带版本签名）', () => {
  it('写入的 schemaVersion 恒为当前值', () => {
    const rec = buildWorkspaceRecord({ sourceName: 'a.zip' }, 123);
    expect(rec.schemaVersion).toBe(SESSION_SCHEMA_VERSION);
    expect(rec.key).toBe('active_session');
    expect(rec.sourceName).toBe('a.zip');
    expect(rec.updatedAt).toBe(123);
  });

  it('调用方传入的 schemaVersion 不能覆盖（旧对象原样存回被挡）', () => {
    const rec = buildWorkspaceRecord({ schemaVersion: 1, sourceName: 'a.zip' }, 1);
    expect(rec.schemaVersion).toBe(SESSION_SCHEMA_VERSION);
  });

  it('落盘记录必被判为 compatible（与读取侧闭环）', () => {
    expect(classifySessionCompatibility(buildWorkspaceRecord({})).compatible).toBe(true);
  });
});

describe('createMigrationSession（S5 共享状态接缝）', () => {
  it('AC5 getState 返回拷贝：外部改动不影响内部', () => {
    const s = createMigrationSession();
    s.setSelection({ chats: true });
    const snap = s.getState();
    snap.selection.chats = false;
    expect(s.getState().selection.chats).toBe(true);
  });

  it('AC5 选择与任务共享同一实例', () => {
    const s = createMigrationSession();
    s.setSelection({ a: 1 });
    s.setTask('t1');
    s.setPlan({ revision: 9 });
    expect(s.getState().selection).toEqual({ a: 1 });
    expect(s.getState().taskId).toBe('t1');
    expect(s.getState().plan).toEqual({ revision: 9 });
  });
});
