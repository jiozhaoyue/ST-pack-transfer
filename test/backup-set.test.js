import { describe, expect, it } from 'vitest';
import { zipIo } from '../src/core/zip-io.js';
import {
  buildIndex,
  buildSnapshot,
  objectName,
  openEntrySession,
  parseIndex,
  parseSnapshot,
  safeSegment,
  shouldReuseEntry,
  snapshotFileName,
  timestampName,
} from '../src/core/backup-set.js';
import {
  removeSnapshotFromSet,
  restoreBackupSet,
  uploadBackupSet,
} from '../src/app/backup-set-runner.js';

function fakeTarget() {
  const store = new Map();
  return {
    ready: true,
    store,
    async head(key) {
      if (!store.has(key)) return { ok: false, status: 404 };
      return { ok: true, size: store.get(key).length };
    },
    async put(key, bytes) {
      store.set(key, new Uint8Array(bytes));
      return { ok: true, status: 200 };
    },
    async get(key) {
      if (!store.has(key)) return { ok: false, status: 404 };
      return { ok: true, bytes: store.get(key) };
    },
    async remove(key) {
      store.delete(key);
      return { ok: true, status: 204 };
    },
  };
}

async function makeZip(entries) {
  const writer = await zipIo.createWriter();
  for (const [name, text] of Object.entries(entries)) {
    await writer.add(name, new TextEncoder().encode(text));
  }
  const dest = await writer.close();
  return dest && typeof dest.getData === 'function' ? dest.getData() : dest;
}

async function readZip(blob) {
  const reader = await zipIo.openReader(blob);
  const out = {};
  try {
    for await (const entry of reader.entries()) {
      out[entry.fileName] = new TextDecoder().decode(await entry.read());
    }
  } finally {
    await reader.close();
  }
  return out;
}

async function backup({ target, blob, passphrase = '', retention = 10 }) {
  const session = await openEntrySession(blob);
  try {
    return await uploadBackupSet({
      target,
      setBase: 'sets/default',
      setName: 'default',
      entries: session.entries,
      sourceName: 'sample.zip',
      passphrase,
      retention,
    });
  } finally {
    await session.close();
  }
}

const indexOf = (target) => JSON.parse(new TextDecoder().decode(target.store.get('sets/default/index.json')));

describe('backup-set 纯逻辑', () => {
  it('时间戳与路径段可安全用于对象名', () => {
    expect(timestampName(new Date(2026, 10, 9, 18, 30, 5))).toBe('20261109-183005');
    expect(safeSegment('a/b:c*d?.zip')).toBe('a_b_c_d_.zip');
    expect(safeSegment('   ')).toBe('pack');
  });

  it('索引领取与快照往返', () => {
    const index = buildIndex({
      set: 's',
      encrypted: true,
      salt: 'ab',
      objects: { ['a'.repeat(64)]: { size: 3 } },
      snapshots: [{ ts: '20261109-183005', key: snapshotFileName('20261109-183005', true), entries: 2, size: 10 }],
      latest: snapshotFileName('20261109-183005', true),
    });
    const parsed = parseIndex(JSON.stringify(index));
    expect(parsed.encrypted).toBe(true);
    expect(Object.keys(parsed.objects)).toEqual(['a'.repeat(64)]);
    expect(parsed.snapshots[0].key).toBe('snapshots/20261109-183005.json.spt');

    const snapshot = buildSnapshot({
      set: 's',
      ts: '20261109-183005',
      entries: [{ path: 'x.txt', sha256: 'b'.repeat(64), size: 3, crc32: 1 }],
    });
    expect(parseSnapshot(JSON.stringify(snapshot)).entries[0].path).toBe('x.txt');
  });

  it('指纹三缺一不复用', () => {
    const prev = { sha256: 'c'.repeat(64), size: 3, crc32: 1 };
    expect(shouldReuseEntry(prev, { size: 3, crc32: 1 })).toBe(true);
    expect(shouldReuseEntry(prev, { size: 4, crc32: 1 })).toBe(false);
    expect(shouldReuseEntry(prev, { size: 3, crc32: 2 })).toBe(false);
    expect(shouldReuseEntry(prev, { size: 3, crc32: null })).toBe(false);
  });
});

describe('backup-set 执行器', () => {
  it('首次全传、第二次零新增，并能独立恢复', async () => {
    const target = fakeTarget();
    const blob = await makeZip({ 'a.txt': 'hello', 'b.txt': 'world' });

    const first = await backup({ target, blob });
    expect(first).toMatchObject({ ok: true, uploaded: 2, reused: 0, entries: 2 });
    expect(target.store.has('sets/default/index.json')).toBe(true);

    const second = await backup({ target, blob });
    expect(second).toMatchObject({ ok: true, uploaded: 0, reused: 2, entries: 2 });
    expect(indexOf(target).snapshots.length).toBe(2);

    const restored = await restoreBackupSet({
      target,
      setBase: 'sets/default',
      snapshotKey: indexOf(target).latest,
    });
    expect(restored.ok).toBe(true);
    expect(await readZip(restored.blob)).toEqual({ 'a.txt': 'hello', 'b.txt': 'world' });
  });

  it('只改了 b.txt：只新增一个对象，a.txt 复用', async () => {
    const target = fakeTarget();
    await backup({ target, blob: await makeZip({ 'a.txt': 'hello', 'b.txt': 'world' }) });
    const second = await backup({ target, blob: await makeZip({ 'a.txt': 'hello', 'b.txt': 'changed' }) });
    expect(second).toMatchObject({ ok: true, uploaded: 1, reused: 1 });
  });

  it('加密可选：无口令被拒、错口令失败、对口令可恢复', async () => {
    const target = fakeTarget();
    const blob = await makeZip({ 'secret.txt': 'top-secret' });
    const uploaded = await backup({ target, blob, passphrase: 'pw' });
    expect(uploaded).toMatchObject({ ok: true, encrypted: true });

    const need = await restoreBackupSet({ target, setBase: 'sets/default', snapshotKey: indexOf(target).latest });
    expect(need).toMatchObject({ ok: false, code: 'passphrase-required' });

    const wrong = await restoreBackupSet({
      target, setBase: 'sets/default', snapshotKey: indexOf(target).latest, passphrase: 'bad',
    });
    expect(wrong).toMatchObject({ ok: false, code: 'bad-passphrase' });

    const ok = await restoreBackupSet({
      target, setBase: 'sets/default', snapshotKey: indexOf(target).latest, passphrase: 'pw',
    });
    expect(ok.ok).toBe(true);
    expect(await readZip(ok.blob)).toEqual({ 'secret.txt': 'top-secret' });
  });

  it('保留策略只删旧快照，不删共享对象', async () => {
    const target = fakeTarget();
    const blob = await makeZip({ 'a.txt': 'hello' });
    await backup({ target, blob, retention: 2 });
    await backup({ target, blob, retention: 2 });
    await backup({ target, blob, retention: 2 });
    const index = indexOf(target);
    expect(index.snapshots.length).toBe(2);
    const objectKeys = [...target.store.keys()].filter((key) => key.startsWith('sets/default/objects/'));
    expect(objectKeys.length).toBe(1);
  });

  it('删除一张快照不影响另一张恢复', async () => {
    const target = fakeTarget();
    const blob = await makeZip({ 'a.txt': 'hello' });
    await backup({ target, blob });
    await backup({ target, blob });
    const index = indexOf(target);
    const older = index.snapshots[0].key;
    const removed = await removeSnapshotFromSet({ target, setBase: 'sets/default', snapshotKey: older });
    expect(removed.ok).toBe(true);
    expect(target.store.has(`sets/default/${older}`)).toBe(false);

    const restored = await restoreBackupSet({
      target, setBase: 'sets/default', snapshotKey: indexOf(target).latest,
    });
    expect(restored.ok).toBe(true);
    expect(await readZip(restored.blob)).toEqual({ 'a.txt': 'hello' });
  });

  it('对象缺失时如实失败，不返回半个包', async () => {
    const target = fakeTarget();
    const blob = await makeZip({ 'a.txt': 'hello' });
    await backup({ target, blob });
    const index = indexOf(target);
    const sha = Object.keys(index.objects)[0];
    target.store.delete(`sets/default/${objectName(sha)}`);
    const restored = await restoreBackupSet({
      target, setBase: 'sets/default', snapshotKey: index.latest,
    });
    expect(restored).toMatchObject({ ok: false, code: 'object-missing' });
  });
});
