import { describe, expect, it } from 'vitest';
import * as zip from '@zip.js/zip.js';
import {
  CONTAINER_DIR,
  CONTAINER_MANIFEST,
  CONTAINER_SCHEMA,
  buildManifest,
  canNativeRestore,
  classifyPrivateFile,
  packPrivateContainer,
  readPrivateContainer,
} from '../src/core/private-container.js';

async function plainZip(entries) {
  const target = new zip.BlobWriter('application/zip');
  const writer = new zip.ZipWriter(target);
  for (const [name, bytes] of entries) {
    await writer.add(name, new zip.Uint8ArrayReader(new Uint8Array(bytes)));
  }
  await writer.close();
  return target.getData();
}

describe('私有配置容器：类型判定', () => {
  it('按路径判定私有件类型', () => {
    expect(classifyPrivateFile('secrets.json')).toBe('secrets');
    expect(classifyPrivateFile('chats/a.luker-state.chat_sync.json')).toBe('luker-state');
    expect(classifyPrivateFile('settings.json')).toBe('settings');
    expect(classifyPrivateFile('user/files/plugin.json')).toBe('plugin-data');
    expect(classifyPrivateFile('something.bin')).toBe('private');
  });
});

describe('私有配置容器：清单', () => {
  it('目标与来源一致才标记可原生还原', () => {
    const same = buildManifest([{ path: 'secrets.json' }], { sourceLayout: 'l', targetLayout: 'l' });
    expect(same.nativeRestore).toBe(true);
    expect(same.files[0]).toMatchObject({ path: 'secrets.json', type: 'secrets' });

    const cross = buildManifest([{ path: 'secrets.json' }], { sourceLayout: 'l', targetLayout: 'st' });
    expect(cross.nativeRestore).toBe(false);
  });

  it('canNativeRestore 同时要求 nativeRestore 与目标一致', () => {
    const manifest = buildManifest([], { sourceLayout: 'l', targetLayout: 'l' });
    expect(canNativeRestore(manifest, 'l')).toBe(true);
    expect(canNativeRestore(manifest, 'st')).toBe(false);
    expect(canNativeRestore(null, 'l')).toBe(false);
  });
});

describe('私有配置容器：读写往返', () => {
  it('打包后能读回清单与成员字节，目录为 _private/', async () => {
    const payload = new Uint8Array([7, 8, 9]);
    const { blob, manifest } = await packPrivateContainer(
      [{ path: 'secrets.json', blob: payload }],
      { sourceLayout: 'l', targetLayout: 'st' },
    );
    expect(manifest.schemaVersion).toBe(CONTAINER_SCHEMA);

    const read = await readPrivateContainer(blob);
    expect(read.ok).toBe(true);
    expect(read.manifest.targetLayout).toBe('st');
    expect(read.files).toHaveLength(1);
    expect(read.files[0].path).toBe('secrets.json');
    expect([...read.files[0].bytes]).toEqual([7, 8, 9]);
  });

  it('容器内条目前缀是 _private/', async () => {
    const { blob } = await packPrivateContainer(
      [{ path: 'settings.json', blob: new Uint8Array([1]) }],
      { sourceLayout: 'l', targetLayout: 'l' },
    );
    const reader = new zip.ZipReader(new zip.BlobReader(blob));
    const names = (await reader.getEntries()).map((entry) => entry.filename);
    await reader.close();
    expect(names).toContain(CONTAINER_MANIFEST);
    expect(names).toContain(`${CONTAINER_DIR}settings.json`);
  });

  it('缺清单的普通 zip ⇒ invalid-manifest，不抛', async () => {
    const blob = await plainZip([['a.txt', [1, 2]]]);
    const read = await readPrivateContainer(blob);
    expect(read).toEqual({ ok: false, reason: 'invalid-manifest' });
  });
});
