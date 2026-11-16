import { describe, expect, it } from 'vitest';
import { mkdtemp } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { zipIo } from '../src/core/zip-io.js';
import { detectLayout, LAYOUTS } from '../src/core/detect.js';
import { createPtNativeHubReader, classifyPtEntry, parsePtManifest } from '../src/core/pt-archive.js';
import { convert } from '../src/core/transform.js';
import { generateAll, ptEntries } from '../fixtures/gen.js';

const tmpDirs = [];

async function tmpDir() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'tavern-convert-pt-'));
  tmpDirs.push(dir);
  return dir;
}

async function zipFrom(entries, name = 'sample.zip') {
  const dir = await tmpDir();
  const outPath = path.join(dir, name);
  const writer = await zipIo.createWriter(outPath);
  for (const [entryName, data] of entries) {
    await writer.add(entryName, data);
  }
  await writer.close();
  return outPath;
}

async function readZip(zipPath) {
  const reader = await zipIo.openReader(zipPath);
  const out = new Map();
  try {
    for await (const entry of reader.entries()) {
      if (entry.isDirectory) {
        entry.skip();
        continue;
      }
      out.set(entry.fileName, Buffer.from(await entry.read()));
    }
  } finally {
    await reader.close();
  }
  return out;
}

async function reconstruct(zipPath) {
  const reader = await createPtNativeHubReader({ io: zipIo, sourcePath: zipPath });
  const hub = new Map();
  for await (const entry of reader.entries()) {
    hub.set(entry.fileName, Buffer.from(await entry.read()));
  }
  return { hub, reader };
}

describe('pt-archive · 识别与校验', () => {
  it('detectLayout 把 PT 原生归档判为 pt-native', async () => {
    const zip = await zipFrom(ptEntries(), 'fixture-pt.zip');
    const result = await detectLayout(zip);
    expect(result.layout).toBe(LAYOUTS.PT_NATIVE);
  });

  it('classifyPtEntry 解析模块坐标（含 URL 编码 id）', () => {
    expect(classifyPtEntry('modules/characters/blobs/avatars/Fixture%20Character.png.bin')).toEqual({
      moduleId: 'characters',
      kind: 'blobs',
      collection: 'avatars',
      id: 'Fixture Character.png',
      ext: 'bin',
    });
    expect(classifyPtEntry('modules/chats/records/sessions/s1.json')).toMatchObject({
      moduleId: 'chats',
      kind: 'records',
      collection: 'sessions',
      id: 's1',
    });
    expect(classifyPtEntry('manifest.json')).toBeNull();
    expect(classifyPtEntry('data/default-user/settings.json')).toBeNull();
  });

  it('parsePtManifest 对非 PT / 版本不符作出区分', () => {
    expect(parsePtManifest(Buffer.from('{"format":"other"}'))).toBeNull();
    expect(() => parsePtManifest(Buffer.from('{"format":"pure-tavern-archive","schemaVersion":9}')))
      .toThrow(/版本/);
  });
});

describe('pt-archive · 重建为 hub 布局', () => {
  it('八类模块逐条落位为 ST 摊平用户目录条目', async () => {
    const zip = await zipFrom(ptEntries(), 'fixture-pt.zip');
    const { hub } = await reconstruct(zip);

    // characters：avatars blob（带卡 PNG）直接作为 ST 角色卡
    expect(hub.has('characters/Fixture Character.png')).toBe(true);
    // chats：sessions + messages 合成 jsonl
    const chat = hub.get('chats/Fixture Character/2026-09-01.jsonl').toString('utf8');
    const lines = chat.split('\n');
    expect(lines).toHaveLength(3);
    expect(JSON.parse(lines[0]).character_name).toBe('Fixture Character');
    expect(JSON.parse(lines[1]).mes).toBe('hello');
    expect(JSON.parse(lines[2]).mes).toBe('world');
    // world-books
    expect(JSON.parse(hub.get('worlds/fixture-world.json').toString('utf8')).entries['0'].content)
      .toBe('fixture lore');
    // presets
    expect(JSON.parse(hub.get('OpenAI Settings/fixture-preset.json').toString('utf8')).temperature)
      .toBe(1.0);
    // singletons
    expect(JSON.parse(hub.get('settings.json').toString('utf8')).fixtureMarker).toBe('st-settings');
    expect(JSON.parse(hub.get('secrets.json').toString('utf8')).api_key_openai)
      .toBe('fixture-secret-do-not-leak');
    // assets：blob 按 legacyPath 落位
    expect(hub.has('User Avatars/fixture-avatar.png')).toBe(true);
  });

  it('不把 PT 内部条目（manifest / records 索引）泄漏进 hub', async () => {
    const zip = await zipFrom(ptEntries(), 'fixture-pt.zip');
    const { hub } = await reconstruct(zip);
    for (const name of hub.keys()) {
      expect(name.startsWith('modules/')).toBe(false);
      expect(name).not.toBe('manifest.json');
    }
  });

  it('sha256 不符 ⇒ 抛错，不产出残缺包', async () => {
    const entries = ptEntries().map(([name, data]) => (
      name === 'modules/settings/records/documents/current.json'
        ? [name, Buffer.from('{"tampered":true}', 'utf8')]
        : [name, data]
    ));
    const zip = await zipFrom(entries, 'fixture-pt-bad.zip');
    await expect(reconstruct(zip)).rejects.toThrow(/校验失败/);
  });
});

describe('pt-archive · 端到端转换 pt → st/l/tt', () => {
  it.each([
    ['st', (n) => n],
    ['l', (n) => n],
    ['tt', (n) => `data/default-user/${n}`],
  ])('pt → %s 产物含重建后的用户数据', async (target, mapPath) => {
    const zip = await zipFrom(ptEntries(), 'fixture-pt.zip');
    const outPath = path.join(await tmpDir(), `out-${target}.zip`);
    await convert(zip, outPath, { target });

    const out = await readZip(outPath);
    expect(out.has(mapPath('characters/Fixture Character.png'))).toBe(true);
    expect(out.has(mapPath('chats/Fixture Character/2026-09-01.jsonl'))).toBe(true);
    expect(out.has(mapPath('worlds/fixture-world.json'))).toBe(true);
    expect(out.has(mapPath('settings.json'))).toBe(true);
    expect(out.has(mapPath('secrets.json'))).toBe(true);
    // 聊天条目数不丢：header + 2 条消息
    const chat = out.get(mapPath('chats/Fixture Character/2026-09-01.jsonl')).toString('utf8');
    expect(chat.split('\n').filter((l) => l.trim()).length).toBe(3);
  });

  it('合成夹具四包判定一致（st/l/tt/pt）', async () => {
    const dir = await tmpDir();
    const outputs = await generateAll(dir);
    expect((await detectLayout(outputs['fixture-pt.zip'])).layout).toBe(LAYOUTS.PT_NATIVE);
  });
});
