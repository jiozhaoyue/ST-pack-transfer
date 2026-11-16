import { describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { zipIo } from '../src/core/zip-io.js';
import { convert, TARGETS } from '../src/core/transform.js';

async function run(entries, options = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'stpt-mixed-'));
  const source = path.join(dir, 'in.zip');
  const writer = await zipIo.createWriter(source);
  for (const [name, data] of entries) await writer.add(name, data);
  await writer.close();
  const outPath = path.join(dir, 'out.zip');
  await convert(source, outPath, { target: TARGETS.ST, io: zipIo, ...options });
  const reader = await zipIo.openReader(outPath);
  const files = new Map();
  try {
    for await (const entry of reader.entries()) files.set(entry.fileName, Buffer.from(await entry.read()));
  } finally {
    await reader.close();
  }
  return files;
}

function entries() {
  const remote = (name) => Buffer.from(
    `[remote "origin"]\n\turl = https://github.com/example/${name}\n`,
  );
  return [
    ['characters/demo.json', Buffer.from(JSON.stringify({ name: 'Demo' }))],
    ['manifest.json', Buffer.from(JSON.stringify({ version: '1.0.0' }))],
    ['extensions/full-ext/manifest.json', Buffer.from(JSON.stringify({ display_name: 'Full', version: '1.0.0' }))],
    ['extensions/full-ext/index.js', Buffer.from('export const full = 1;\n')],
    ['extensions/full-ext/.git/config', remote('full-ext')],
    ['extensions/full-ext/.git/HEAD', Buffer.from('ref: refs/heads/main\n')],
    ['extensions/manifest-ext/manifest.json', Buffer.from(JSON.stringify({ display_name: 'Manifest', version: '1.0.0' }))],
    ['extensions/manifest-ext/index.js', Buffer.from('export const manifest = 1;\n')],
    ['extensions/manifest-ext/.git/config', remote('manifest-ext')],
    ['extensions/manifest-ext/.git/HEAD', Buffer.from('ref: refs/heads/main\n')],
  ];
}

describe('逐扩展双模式 · 同一个数据包内完整与清单并存', () => {
  it('只丢弃清单扩展实体，完整扩展照常写出', async () => {
    const files = await run(entries(), {
      extensionMode: 'full',
      extensionManifestNames: ['manifest-ext'],
    });
    expect(files.has('extensions/full-ext/index.js')).toBe(true);
    expect(files.has('extensions/full-ext/manifest.json')).toBe(true);
    expect(files.has('extensions/manifest-ext/index.js')).toBe(false);
    expect(files.has('extensions/manifest-ext/manifest.json')).toBe(false);
    const manifest = JSON.parse(files.get('_convert/extensions-manifest.json').toString('utf8'));
    expect(manifest.mode).toBe('mixed');
    const full = manifest.extensions.find((e) => e.name === 'full-ext');
    const only = manifest.extensions.find((e) => e.name === 'manifest-ext');
    expect(full.packMode).toBe('full');
    expect(only.packMode).toBe('manifest');
    expect(only.availability).toBe('installable');
    const index = JSON.parse(files.get('extensions-index.json').toString('utf8'));
    expect(index.map((e) => e.id)).toEqual(['manifest-ext']);
  });

  it('双选：实体与官方索引同时存在，packMode=both', async () => {
    const files = await run(entries(), {
      extensionMode: 'full',
      extensionManifestNames: ['manifest-ext'],
      extensionFullNames: ['manifest-ext'],
    });
    expect(files.has('extensions/manifest-ext/index.js')).toBe(true);
    expect(files.has('extensions/manifest-ext/manifest.json')).toBe(true);
    const manifest = JSON.parse(files.get('_convert/extensions-manifest.json').toString('utf8'));
    const both = manifest.extensions.find((e) => e.name === 'manifest-ext');
    expect(both.packMode).toBe('both');
    expect(both.manifestListed).toBe(true);
    expect(both.availability).toBe('embedded');
    const index = JSON.parse(files.get('extensions-index.json').toString('utf8'));
    expect(index.map((e) => e.id)).toEqual(['manifest-ext']);
  });

  it('全双选：顶层 mode=both，所有实体保留', async () => {
    const files = await run(entries(), {
      extensionMode: 'full',
      extensionManifestNames: ['full-ext', 'manifest-ext'],
      extensionFullNames: ['full-ext', 'manifest-ext'],
    });
    expect(files.has('extensions/full-ext/index.js')).toBe(true);
    expect(files.has('extensions/manifest-ext/index.js')).toBe(true);
    const manifest = JSON.parse(files.get('_convert/extensions-manifest.json').toString('utf8'));
    expect(manifest.mode).toBe('both');
    const index = JSON.parse(files.get('extensions-index.json').toString('utf8'));
    expect(index.map((e) => e.id).sort()).toEqual(['full-ext', 'manifest-ext']);
  });
});
