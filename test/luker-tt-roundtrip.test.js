// Luker ↔ TauriTavern 往返保真测试（固定夹具，不依赖网络/宿主）。
// 用 fixtures/fixture-l.zip 与 fixtures/fixture-tt.zip 做 detect → convert 到对端 → convert 回来，
// 独立校验：关键条目存在、条目集合无关键丢失、计数不减少、角色卡字节恒等、对端产物清单确定。
// 运行：npx vitest run test/luker-tt-roundtrip.test.js
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdirSync, statSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipIo } from '../src/core/zip-io.js';
import { convert } from '../src/core/transform.js';
import { detectLayout } from '../src/core/detect.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURES = path.join(ROOT, 'fixtures');
const RESULTS = path.join(ROOT, 'test-results');
let tmp;

beforeAll(async () => {
  mkdirSync(RESULTS, { recursive: true });
  tmp = await mkdtemp(path.join(RESULTS, 'luker-tt-vitest-'));
});
afterAll(async () => {
  if (tmp) await rm(tmp, { recursive: true, force: true });
});

function toHub(name) {
  const p = String(name).replace(/\\/g, '/');
  if (p.startsWith('data/default-user/')) return p.slice('data/default-user/'.length);
  if (p.startsWith('data/extensions/third-party/')) return `extensions/${p.slice('data/extensions/third-party/'.length)}`;
  if (p.startsWith('extensions/third-party/')) return `extensions/${p.slice('extensions/third-party/'.length)}`;
  return p;
}

const RE_CHAR = /(?:^|\/)characters\/[^/]+\.(?:png|webp|jpe?g|gif|json)$/i;
const RE_CHAT = /(?:^|\/)chats\/.*\.jsonl$/i;
const RE_WORLD = /(?:^|\/)worlds\/[^/]+\.json$/i;

async function inspect(zipPath, withBytes = false) {
  const reader = await zipIo.openReader(zipPath);
  const byName = new Map();
  const counts = { characters: 0, chats: 0, messages: 0, worlds: 0, worldEntries: 0 };
  try {
    for await (const entry of reader.entries()) {
      const hub = toHub(entry.fileName);
      if (!byName.has(hub)) byName.set(hub, null);
      const data = (withBytes || RE_CHAT.test(hub) || RE_WORLD.test(hub)) ? await entry.read() : null;
      if (withBytes) byName.set(hub, Buffer.from(data));
      if (RE_CHAR.test(hub)) counts.characters += 1;
      if (RE_CHAT.test(hub)) {
        counts.chats += 1;
        counts.messages += new TextDecoder().decode(data).split(/\r?\n/)
          .filter((line) => line.trim() && !/"(?:user_name|character_name|create_date)"/.test(line)).length;
      }
      if (RE_WORLD.test(hub)) {
        counts.worlds += 1;
        const obj = JSON.parse(new TextDecoder().decode(data));
        counts.worldEntries += obj.entries ? (Array.isArray(obj.entries) ? obj.entries.length : Object.keys(obj.entries).length) : 0;
      }
      if (typeof entry.skip === 'function') entry.skip();
    }
  } finally {
    await reader.close();
  }
  const names = [...byName.keys()].sort();
  const set = new Set(names);
  return {
    names,
    bytes: byName,
    counts,
    key: {
      characters: names.some((n) => RE_CHAR.test(n)),
      chats: names.some((n) => RE_CHAT.test(n)),
      worlds: names.some((n) => RE_WORLD.test(n)),
      settings: set.has('settings.json'),
      secrets: set.has('secrets.json'),
      extensions: names.some((n) => n.startsWith('extensions/')),
    },
  };
}

const CASES = [
  { id: 'fixture-l', file: path.join(FIXTURES, 'fixture-l.zip'), expect: 'l', peer: 'tt' },
  { id: 'fixture-tt', file: path.join(FIXTURES, 'fixture-tt.zip'), expect: 'tt', peer: 'l' },
];

describe.each(CASES)('$id 往返保真', (c) => {
  let result;

  it('detect → convert 到对端 → convert 回来，三次 detect 均正确', async () => {
    expect(statSync(c.file).size).toBeGreaterThan(0);
    const d0 = await detectLayout(c.file);
    expect(d0.layout).toBe(c.expect);

    const mid = path.join(tmp, `${c.id}-mid.zip`);
    await convert(c.file, mid, { target: c.peer });
    expect(statSync(mid).size).toBeGreaterThan(0);
    expect((await detectLayout(mid)).layout).toBe(c.peer);

    const back = path.join(tmp, `${c.id}-back.zip`);
    await convert(mid, back, { target: c.expect });
    expect(statSync(back).size).toBeGreaterThan(0);
    expect((await detectLayout(back)).layout).toBe(c.expect);

    result = {
      before: await inspect(c.file, true),
      after: await inspect(back, true),
      back,
    };
  }, 30_000);

  it('回程产物是合法 zip 且条目数 > 0', () => {
    expect(result.after.names.length).toBeGreaterThan(0);
  });

  it('关键条目存在（角色 / 聊天 / 世界书 / 设置 / secrets / 扩展）', () => {
    for (const k of ['characters', 'chats', 'worlds', 'settings', 'secrets', 'extensions']) {
      expect(result.before.key[k], `原始缺 ${k}`).toBe(true);
      expect(result.after.key[k], `回程缺 ${k}`).toBe(true);
    }
  });

  it('聊天消息数 / 角色数 / 世界书条目数往返后不减少', () => {
    for (const k of Object.keys(result.before.counts)) {
      expect(result.after.counts[k], `${k} 减少`).toBeGreaterThanOrEqual(result.before.counts[k]);
    }
    expect(result.after.counts.messages).toBeGreaterThanOrEqual(2);
  });

  it('关键数据无静默丢失（角色 / 聊天 / 世界书 / 设置 / secrets / 扩展）', () => {
    const before = new Set(result.before.names);
    const after = new Set(result.after.names);
    const isKey = (n) => RE_CHAR.test(n) || RE_CHAT.test(n) || RE_WORLD.test(n)
      || n === 'settings.json' || n === 'secrets.json' || n.startsWith('extensions/');
    const keyLost = [...before].filter((n) => !after.has(n) && isKey(n));
    expect(keyLost, `关键丢失: ${keyLost.join(', ')}`).toEqual([]);
  });

  it('角色卡 PNG 字节恒等（数据保真）', () => {
    const pick = (ins) => [...ins.bytes.entries()].find(([n]) => RE_CHAR.test(n) && /\.png$/i.test(n));
    const a = pick(result.before);
    const b = pick(result.after);
    expect(a).toBeTruthy();
    expect(b).toBeTruthy();
    expect(Buffer.compare(a[1], b[1])).toBe(0);
  });

  it('同一输入连转两次，对端产物文件清单一致（确定性）', async () => {
    const mid1 = path.join(tmp, `${c.id}-det1.zip`);
    const mid2 = path.join(tmp, `${c.id}-det2.zip`);
    await convert(c.file, mid1, { target: c.peer });
    await convert(c.file, mid2, { target: c.peer });
    const [a, b] = [await inspect(mid1), await inspect(mid2)];
    expect(a.names).toEqual(b.names);
  }, 30_000);
});
