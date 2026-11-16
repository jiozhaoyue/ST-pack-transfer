import { describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { zipIo } from '../src/core/zip-io.js';
import {
  sanitizeEngineDumpForRestore, isEngineDumpEntry, isPortableEntry,
} from '../src/core/engine-sanitize.js';

async function makeZip(entries) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tavern-engine-'));
  const file = path.join(dir, 'pack.zip');
  const writer = await zipIo.createWriter(file, { level: 0 });
  for (const [name, data] of entries) await writer.add(name, data);
  await writer.close();
  return file;
}

async function namesOf(source) {
  const reader = await zipIo.openReader(source);
  const names = [];
  try {
    for await (const entry of reader.entries()) names.push(entry.fileName);
  } finally {
    await reader.close();
  }
  return names;
}

describe('engine-sanitize', () => {
  it('判定引擎转储与便携条目', () => {
    expect(isEngineDumpEntry('_engine_dump.bin')).toBe(true);
    expect(isEngineDumpEntry('nested/_engine_meta.json')).toBe(true);
    expect(isEngineDumpEntry('settings.json')).toBe(false);
    expect(isPortableEntry('data/default-user/settings.json')).toBe(true);
    expect(isPortableEntry('settings.json')).toBe(true);
    expect(isPortableEntry('_engine_dump.bin')).toBe(false);
  });

  it('有便携文件时剔除引擎转储，其余条目保留', async () => {
    const src = await makeZip([
      ['_engine_meta.json', new TextEncoder().encode('{"kind":"postgres"}')],
      ['_engine_dump.bin', new Uint8Array([1, 2, 3, 4])],
      ['data/default-user/settings.json', new TextEncoder().encode('{"a":1}')],
      ['data/default-user/chats/c.jsonl', new TextEncoder().encode('{"m":1}')],
    ]);
    const out = await sanitizeEngineDumpForRestore(src);
    expect(out.changed).toBe(true);
    expect(out.sourceEngine).toBe('postgres');
    expect(out.stripped.sort()).toEqual(['_engine_dump.bin', '_engine_meta.json'].sort());
    const names = await namesOf(out.blob);
    expect(names).not.toContain('_engine_dump.bin');
    expect(names).not.toContain('_engine_meta.json');
    expect(names).toContain('data/default-user/settings.json');
    expect(names).toContain('data/default-user/chats/c.jsonl');
  });

  it('纯引擎转储不静默剔除，交给调用方提示', async () => {
    const src = await makeZip([
      ['_engine_meta.json', new TextEncoder().encode('{"kind":"mysql"}')],
      ['_engine_dump.bin', new Uint8Array([9, 9])],
    ]);
    const out = await sanitizeEngineDumpForRestore(src);
    expect(out.changed).toBe(false);
    expect(out.reason).toBe('engine-only');
    expect(out.portable).toBe(false);
  });

  it('没有引擎转储时原样返回', async () => {
    const src = await makeZip([
      ['data/default-user/settings.json', new TextEncoder().encode('{}')],
    ]);
    const out = await sanitizeEngineDumpForRestore(src);
    expect(out.changed).toBe(false);
    expect(out.blob).toBe(src);
  });
});
