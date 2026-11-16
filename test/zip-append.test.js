import { describe, it, expect } from 'vitest';
import * as zip from '../src/vendor/zip.js';
import {
  appendStoredEntryToBlob,
  crc32,
  planZipAppend,
} from '../src/core/zip-append.js';

async function makeZip(entries) {
  const writer = new zip.ZipWriter(new zip.BlobWriter('application/zip'));
  for (const [name, text] of entries) {
    await writer.add(name, new zip.TextReader(text));
  }
  return new Blob([await writer.close()], { type: 'application/zip' });
}

async function readZip(blob) {
  const reader = new zip.ZipReader(new zip.BlobReader(blob));
  const entries = await reader.getEntries();
  const out = [];
  for (const e of entries) {
    out.push({
      name: e.filename,
      text: await e.getData(new zip.TextWriter()),
      method: e.compressionMethod,
      compressedSize: e.compressedSize,
    });
  }
  await reader.close();
  return out;
}

describe('zip-append：不重写旧字节追加 Store 条目', () => {
  it('CRC-32 标准向量', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('追加 settings.json 后旧条目字节不变、可被 zip.js 读取', async () => {
    const base = await makeZip([
      ['characters/a.json', '{"a":1}'],
      ['chats/b.jsonl', 'hello\n'.repeat(200)],
    ]);
    const before = await readZip(base);
    const settings = new TextEncoder().encode('{"settings":true}');
    const out = await appendStoredEntryToBlob(base, 'settings.json', settings);
    const after = await readZip(out);

    expect(after.map((e) => e.name)).toEqual([
      'characters/a.json',
      'chats/b.jsonl',
      'settings.json',
    ]);
    for (const old of before) {
      const now = after.find((e) => e.name === old.name);
      expect(now.text).toBe(old.text);
      expect(now.method).toBe(old.method);
      expect(now.compressedSize).toBe(old.compressedSize);
    }
    const added = after.find((e) => e.name === 'settings.json');
    expect(added.text).toBe('{"settings":true}');
    expect(added.method).toBe(0); // Store：不压缩
  });

  it('计划对象给出连续的新中央目录与 EOCD', async () => {
    const base = await makeZip([['x.txt', 'x'.repeat(64)]]);
    const tailLen = Math.min(base.size, 131072);
    const tail = new Uint8Array(await base.slice(base.size - tailLen).arrayBuffer());
    const data = new TextEncoder().encode('{}');
    const plan = planZipAppend(tail, base.size, { name: 'settings.json', data });

    expect(plan.appendAt).toBe(base.size);
    expect(plan.newCdOffset).toBe(plan.appendAt + plan.localRecord.length);
    expect(plan.newCdSize).toBe(plan.cdSize + plan.centralEntry.length);
    expect(plan.newSize).toBe(plan.newCdOffset + plan.newCdSize + plan.trailer.length);
  });

  it('非 ZIP 输入抛错而不是写出坏包', async () => {
    const bad = new Blob([new TextEncoder().encode('not a zip')]);
    await expect(
      appendStoredEntryToBlob(bad, 'settings.json', new TextEncoder().encode('{}')),
    ).rejects.toThrow(/EOCD/);
  });
});
