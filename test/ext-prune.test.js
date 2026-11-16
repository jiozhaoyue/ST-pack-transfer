import { describe, expect, it } from 'vitest';
import { zipIo } from '../src/core/zip-io.js';
import { prunePackageExtensions } from '../src/core/ext-prune.js';

/**
 * 包内扩展清理（只做减法）单测 —— 2026-11-15 用户裁定。
 *
 * 判据核心：
 * ① 只删不增不改 —— 未命中条目字节级保持；
 * ② 实体条目（extensions/<name>/**，含 third-party 落位）被删；
 * ③ 私有清单条目被重写：被移除扩展的条目消失、total 同步、其余条目保留；
 * ④ 无命中 ⇒ 原样返回（removedFiles=0）。
 */

const MANIFEST = {
  converter: 'ST-pack-transfer',
  schemaVersion: 2,
  generatedAt: '2026-11-15T00:00:00Z',
  mode: 'full',
  total: 3,
  extensions: [
    { name: 'ext-keep', url: 'https://github.com/a/keep', availability: 'installable' },
    { name: 'ext-drop', url: 'https://github.com/a/drop', availability: 'installable' },
    { name: 'Ext-Drop', url: 'https://github.com/a/drop2', availability: 'installable' },
  ],
};

async function makePack() {
  const writer = await zipIo.createWriter();
  await writer.add('chats/0001.jsonl', new TextEncoder().encode('{"a":1}\n'));
  await writer.add('extensions/ext-keep/index.js', new TextEncoder().encode('export {};'));
  await writer.add('extensions/ext-drop/index.js', new TextEncoder().encode('export 1;'));
  await writer.add('extensions/third-party/Ext-Drop/style.css', new TextEncoder().encode('.x{}'));
  await writer.add('_convert/extensions-manifest.json', new TextEncoder().encode(JSON.stringify(MANIFEST)));
  const dest = await writer.close();
  return await dest.getData();
}

async function readZip(blob) {
  const reader = await zipIo.openReader(blob);
  const out = new Map();
  try {
    for await (const entry of reader.entries()) {
      out.set(entry.fileName, Buffer.from(await entry.read()).toString('utf8'));
    }
  } finally {
    await reader.close();
  }
  return out;
}

describe('prunePackageExtensions（包内清理 · 只做减法）', () => {
  it('删除实体条目（含 third-party 落位）并重写清单', async () => {
    const blob = await makePack();
    const res = await prunePackageExtensions(blob, ['ext-drop', 'Ext-Drop']);
    expect(res.removedFiles).toBe(2); // ext-drop/index.js + third-party/Ext-Drop/style.css
    expect(res.removedManifest).toBe(2); // 大小写不敏感命中两条清单条目
    const entries = await readZip(res.blob);
    expect(entries.has('extensions/ext-drop/index.js')).toBe(false);
    expect(entries.has('extensions/third-party/Ext-Drop/style.css')).toBe(false);
    expect(entries.has('extensions/ext-keep/index.js')).toBe(true);
    expect(entries.get('chats/0001.jsonl')).toBe('{"a":1}\n');
    const manifest = JSON.parse(entries.get('_convert/extensions-manifest.json'));
    expect(manifest.extensions.map((m) => m.name)).toEqual(['ext-keep']);
    expect(manifest.total).toBe(1);
  });

  it('无命中 ⇒ 原样返回、零改写', async () => {
    const blob = await makePack();
    const res = await prunePackageExtensions(blob, ['not-exist']);
    expect(res.blob).toBe(blob);
    expect(res.removedFiles).toBe(0);
    expect(res.removedManifest).toBe(0);
  });

  it('空名单 ⇒ 原样返回', async () => {
    const blob = await makePack();
    const res = await prunePackageExtensions(blob, []);
    expect(res.blob).toBe(blob);
  });

  it('无清单的包：只删实体、其余条目保持', async () => {
    const writer = await zipIo.createWriter();
    await writer.add('extensions/doomed/index.js', new TextEncoder().encode('x'));
    await writer.add('settings.json', new TextEncoder().encode('{}'));
    const dest = await writer.close();
    const blob = await dest.getData();
    const res = await prunePackageExtensions(blob, ['doomed']);
    expect(res.removedFiles).toBe(1);
    expect(res.manifest).toBeNull();
    const entries = await readZip(res.blob);
    expect(entries.has('extensions/doomed/index.js')).toBe(false);
    expect(entries.get('settings.json')).toBe('{}');
    expect(entries.has('_convert/extensions-manifest.json')).toBe(false);
  });

  it('keepManifest（转成清单）：删实体、留清单条目', async () => {
    const blob = await makePack();
    const res = await prunePackageExtensions(blob, ['ext-drop'], { keepManifest: true });
    expect(res.removedFiles).toBe(2);
    expect(res.removedManifest).toBe(0);
    const entries = await readZip(res.blob);
    expect(entries.has('extensions/ext-drop/index.js')).toBe(false);
    expect(entries.has('extensions/third-party/Ext-Drop/style.css')).toBe(false);
    expect(entries.has('extensions/ext-keep/index.js')).toBe(true);
    const manifest = JSON.parse(entries.get('_convert/extensions-manifest.json'));
    expect(manifest.extensions.map((m) => m.name).sort()).toEqual(['Ext-Drop', 'ext-drop', 'ext-keep']);
    expect(manifest.total).toBe(3);
  });

  it('keepManifest 且包内无清单文件：用种子补建清单', async () => {
    const writer = await zipIo.createWriter();
    await writer.add('extensions/solo/index.js', new TextEncoder().encode('x'));
    const dest = await writer.close();
    const blob = await dest.getData();
    const res = await prunePackageExtensions(blob, ['solo'], {
      keepManifest: true,
      manifestSeed: [{ name: 'solo', url: 'https://github.com/a/solo' }],
    });
    expect(res.removedFiles).toBe(1);
    const entries = await readZip(res.blob);
    const manifest = JSON.parse(entries.get('_convert/extensions-manifest.json'));
    expect(manifest.extensions).toEqual([{ name: 'solo', url: 'https://github.com/a/solo' }]);
    expect(manifest.mode).toBe('manifest');
  });
});
