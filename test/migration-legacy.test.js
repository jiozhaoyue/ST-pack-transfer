import { describe, expect, it } from 'vitest';
import { normalizeLegacySession, isResumableSession } from '../src/core/migration-session.js';
import { createMigrationSession } from '../src/ui/migration-controller.js';

describe('normalizeLegacySession（S5 旧会话归一）', () => {
  it('AC1 原字段不丢 + 缺 schemaVersion 补 1 并标 legacy', () => {
    const legacy = { sourceName: 'a.zip', target: 'l', selection: { chats: true } };
    const norm = normalizeLegacySession(legacy);

    expect(norm.sourceName).toBe('a.zip');
    expect(norm.target).toBe('l');
    expect(norm.selection).toEqual({ chats: true });
    expect(norm.schemaVersion).toBe(1);
    expect(norm.legacy).toBe(true);
  });

  it('已有 schemaVersion ⇒ legacy=false（不误标）', () => {
    const norm = normalizeLegacySession({ schemaVersion: 1, x: 1 });
    expect(norm.schemaVersion).toBe(1);
    expect(norm.legacy).toBe(false);
    expect(norm.x).toBe(1);
  });

  it('非对象 ⇒ null（不抛错）', () => {
    expect(normalizeLegacySession(null)).toBeNull();
    expect(normalizeLegacySession('x')).toBeNull();
    expect(normalizeLegacySession(42)).toBeNull();
  });
});

describe('isResumableSession（S5 可续跑判别）', () => {
  it('AC2 完整记录 ⇒ 可续跑', () => {
    const full = { schemaVersion: 1, checkpoint: { opfsName: 'p.zip', receivedBytes: 100 } };
    expect(isResumableSession(full)).toEqual({ resumable: true, reason: '' });
  });

  it('AC2 缺断点 ⇒ 不可续跑（有原因）', () => {
    const r = isResumableSession({ schemaVersion: 1 });
    expect(r.resumable).toBe(false);
    expect(r.reason).toBeTruthy();
  });

  it('AC2 有断点但无半成品线索 ⇒ 不可续跑', () => {
    const r = isResumableSession({ schemaVersion: 1, checkpoint: {} });
    expect(r.resumable).toBe(false);
  });

  it('AC2 版本不可识别 ⇒ 不可续跑（不猜着续跑）', () => {
    const r = isResumableSession({ schemaVersion: 99, checkpoint: { opfsName: 'p.zip', receivedBytes: 1 } });
    expect(r.resumable).toBe(false);
    expect(r.reason).toContain('未知会话版本');
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
