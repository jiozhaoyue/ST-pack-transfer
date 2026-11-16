import { describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { zipIo } from '../src/core/zip-io.js';
import { convert, TARGETS } from '../src/core/transform.js';
import { lEntries, ttEntries } from '../fixtures/gen.js';
import { pruneFullSnapshots } from '../src/core/transfer-prune.js';
import { chunkKey, manifestKey } from '../src/core/transfer-plan.js';

const tmpDirs = [];
async function tmpDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tavern-retention-test-'));
  tmpDirs.push(dir);
  return dir;
}

async function zipFrom(entries) {
  const dir = await tmpDir();
  const outPath = path.join(dir, 'in.zip');
  const writer = await zipIo.createWriter(outPath);
  for (const [name, data] of entries) {
    await writer.add(name, data);
  }
  await writer.close();
  return outPath;
}

async function readZipMap(outPath) {
  const reader = await zipIo.openReader(outPath);
  const map = new Map();
  for await (const entry of reader.entries()) {
    map.set(entry.fileName, Buffer.from(await entry.read()));
  }
  await reader.close();
  return map;
}

async function runConvert(entries, target, options = {}) {
  const dir = await tmpDir();
  const source = await zipFrom(entries);
  const outPath = path.join(dir, `out-${target}.zip`);
  const report = await convert(source, outPath, { target, io: zipIo, ...options });
  return { report, outPath, files: await readZipMap(outPath) };
}

describe('Luker 与 TauriTavern (TT) 双向私有件留存与完整闭环测试', () => {
  const originalLukerStats = JSON.stringify({ version: '2.7.0', totalChats: 42, customSetting: 'luker-val' });
  const originalLukerMacros = JSON.stringify({ custom_macro: '{{user}} say hi' });

  it('1. Luker → TT：标准数据正确落入 data/default-user/，Luker 私有件透明隔离保留在 data/default-user/_compat/luker/ 下', async () => {
    // 构造带私有件的 Luker 数据包条目
    const sourceEntries = [
      ...lEntries(),
      ['stats.json', Buffer.from(originalLukerStats)],
      ['macros.json', Buffer.from(originalLukerMacros)],
    ];

    const { files } = await runConvert(sourceEntries, TARGETS.TT, { keepAll: true });

    // 验证 TT 标准结构
    expect(files.has('data/default-user/characters/Fixture Character.png')).toBe(true);
    expect(files.has('data/default-user/chats/Fixture Character/2026-09-01.jsonl')).toBe(true);

    // 核心断言：Luker 私有文件不得丢失，必须透明封箱至 data/default-user/_compat/luker/
    expect(files.has('data/default-user/_compat/luker/stats.json')).toBe(true);
    expect(files.has('data/default-user/_compat/luker/macros.json')).toBe(true);
    expect(files.get('data/default-user/_compat/luker/stats.json').toString('utf8')).toBe(originalLukerStats);
    expect(files.get('data/default-user/_compat/luker/macros.json').toString('utf8')).toBe(originalLukerMacros);

    // 确保没有条目泄露到 data/ 之外（TT 规范严禁根级散落）
    for (const filename of files.keys()) {
      expect(filename.startsWith('data/')).toBe(true);
    }
  });

  it('2. TT → Luker：逆向解构转换，_compat/luker/ 下的私有件自动拆封还原回根目录，数据 100% 完整', async () => {
    // 构造带 TT 结构和 _compat/luker/ 私有件的数据包条目
    const ttSourceEntries = [
      ...ttEntries(),
      ['data/default-user/_compat/luker/stats.json', Buffer.from(originalLukerStats)],
      ['data/default-user/_compat/luker/macros.json', Buffer.from(originalLukerMacros)],
    ];

    const { files } = await runConvert(ttSourceEntries, TARGETS.L, { keepAll: true });

    // 验证 Luker 根目录恢复
    expect(files.has('characters/Fixture Character.png')).toBe(true);
    expect(files.has('chats/Fixture Character/2026-09-01.jsonl')).toBe(true);
    expect(files.has('manifest.json')).toBe(true);

    // 核心断言：私有件从 _compat/ 逆向拆解还原回根目录，字节与原件严格一致
    expect(files.has('stats.json')).toBe(true);
    expect(files.has('macros.json')).toBe(true);
    expect(files.get('stats.json').toString('utf8')).toBe(originalLukerStats);
    expect(files.get('macros.json').toString('utf8')).toBe(originalLukerMacros);

    // 确保不再残留 _compat/ 前缀
    for (const filename of files.keys()) {
      expect(filename.includes('_compat/')).toBe(false);
    }
  });
});

describe('自动备份与定时裁剪测试（严格按照用户偏好）', () => {
  function fakeTarget(seed = new Map()) {
    const store = new Map(seed);
    return {
      store,
      async list(prefix) {
        const items = [...store.keys()]
          .filter((k) => k.startsWith(prefix))
          .map((k) => ({ key: k, lastModified: store.get(k).lastModified || '' }));
        return { ok: true, items };
      },
      async get(key) {
        const hit = store.get(key);
        return hit ? { ok: true, bytes: hit.bytes } : { ok: false };
      },
      async remove(key) {
        return { ok: store.delete(key) };
      },
      async put(key, bytes) {
        store.set(key, { bytes, lastModified: '' });
        return { ok: true };
      },
    };
  }

  it('用户设定保留 3 份历史时，产生第 4、5 份备份后，自动修剪淘汰最旧版本，严格保留最近 3 份', async () => {
    const target = fakeTarget();

    // 模拟定时任务按用户偏好自动备份产生的 5 次历史快照
    const snapshots = ['snap-2026-11-10.zip', 'snap-2026-11-11.zip', 'snap-2026-11-12.zip', 'snap-2026-11-13.zip', 'snap-2026-11-14.zip'];
    for (const snap of snapshots) {
      const base = `snapshots/${snap}`;
      const manifest = {
        schema: 1,
        name: snap,
        size: 1024,
        createdAt: snap.replace('snap-', '').replace('.zip', ''),
        chunks: [{ index: 0, size: 1024 }],
      };
      target.store.set(manifestKey(base), {
        bytes: new TextEncoder().encode(JSON.stringify(manifest)),
        lastModified: manifest.createdAt,
      });
      target.store.set(chunkKey(base, 0), { bytes: new Uint8Array([1, 2, 3]), lastModified: '' });
      target.store.set(base, { bytes: new Uint8Array([1, 2, 3]), lastModified: '' });
    }

    expect(target.store.size).toBe(15); // 5 份 * (manifest + chunk + raw)

    // 用户在设置中偏好保留份数为 3 (keep: 3)，总共 5 份，因此修剪删除最旧的 2 份
    const pruneRes = await pruneFullSnapshots({ target, keep: 3 });
    expect(pruneRes.ok).toBe(true);
    expect(pruneRes.removed).toEqual(['snapshots/snap-2026-11-11.zip', 'snapshots/snap-2026-11-10.zip']);

    // 验证最旧的 11-10 和 11-11 已被裁剪清理
    expect(target.store.has(manifestKey('snapshots/snap-2026-11-10.zip'))).toBe(false);
    expect(target.store.has(manifestKey('snapshots/snap-2026-11-11.zip'))).toBe(false);

    // 验证最新的 3 份 (11-12, 11-13, 11-14) 完好保留
    expect(target.store.has(manifestKey('snapshots/snap-2026-11-12.zip'))).toBe(true);
    expect(target.store.has(manifestKey('snapshots/snap-2026-11-13.zip'))).toBe(true);
    expect(target.store.has(manifestKey('snapshots/snap-2026-11-14.zip'))).toBe(true);
  });
});
