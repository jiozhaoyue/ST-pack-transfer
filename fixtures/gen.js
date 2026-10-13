import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { zipIo } from '../src/core/zip-io.js';

/**
 * 生成四个平台的迷你合成包,覆盖 R2 内容集:
 * 角色卡 / 聊天 / 世界书 / 预设 / settings / secrets / 头像 / 第三方扩展(含来源记录)。
 * 全部确定性内容,供单测与往返断言;运行 `node fixtures/gen.js [outDir]` 落盘,
 * 单测里也会调用 generateAll 直接生成到 tmp。
 */

const SELECTION = Object.freeze({
  settings: true,
  secrets: true,
  characters: true,
  chats: true,
  lorebooks: true,
  presets: true,
  assets: true,
  extensions: true,
  globalExtensions: true,
  vectors: true,
});

const MANIFEST = {
  display_name: 'Test Extension',
  loading_order: 1,
  requires: [],
  optional: [],
  js: 'index.js',
  css: '',
  author: 'fixture',
  version: '1.0.0',
  homePage: 'https://github.com/example/test-extension',
};

const EXT_SOURCE = {
  host: 'github.com',
  repo_path: 'example/test-extension',
  reference: 'main',
  remote_url: 'https://github.com/example/test-extension',
  installed_commit: '0123456789abcdef0123456789abcdef01234567',
};

function pngBytes(name) {
  // 合法 PNG 头 + 名字填充,内容确定性即可,单测不解析图像。
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([header, Buffer.from(`fixture:${name}`, 'utf8')]);
}

function json(value) {
  return Buffer.from(JSON.stringify(value, null, 2), 'utf8');
}

const CHARACTER_CARD = json({
  spec: 'chara_card_v2',
  spec_version: '2.0',
  data: { name: 'Fixture Character', description: 'fixture only', first_mes: 'hi' },
});
const CHAT = Buffer.from(
  [
    JSON.stringify({ user_name: 'You', character_name: 'Fixture Character', create_date: '2026-09-01' }),
    JSON.stringify({ name: 'You', is_user: true, mes: 'hello' }),
    JSON.stringify({ name: 'Fixture Character', is_user: false, mes: 'world' }),
    '',
  ].join('\n'),
  'utf8',
);
const WORLD = json({ entries: { '0': { uid: 0, key: ['fixture'], content: 'fixture lore' } } });
const SETTINGS = json({ firstRun: false, font_scale: 1, fixtureMarker: 'st-settings' });
const SECRETS = json({ api_key_openai: 'fixture-secret-do-not-leak', api_key_anthropic: 'fixture-secret-2' });
const PRESET = json({ temperature: 1.0, fixture: true });
const EXT_INDEX = Buffer.from('// fixture extension entrypoint\n', 'utf8');

/** 平台无关的 ST 用户目录条目(摊平布局)。 */
function flatUserEntries() {
  return [
    ['characters/Fixture Character.png', pngBytes('card')],
    ['chats/Fixture Character/2026-09-01.jsonl', CHAT],
    ['worlds/fixture-world.json', WORLD],
    ['OpenAI Settings/fixture-preset.json', PRESET],
    ['settings.json', SETTINGS],
    ['secrets.json', SECRETS],
    ['User Avatars/fixture-avatar.png', pngBytes('avatar')],
    ['extensions/test-extension/manifest.json', json(MANIFEST)],
    ['extensions/test-extension/index.js', EXT_INDEX],
    // 派生缓存:默认应被丢弃(--keep-all 保留)
    ['thumbnails/fixture-avatar.png', pngBytes('thumb')],
    ['backups/auto-2026.json', Buffer.from('[]', 'utf8')],
  ];
}

export function stEntries() {
  return flatUserEntries();
}

export function lEntries() {
  return [
    ['manifest.json', json({
      schemaVersion: 1,
      createdAt: '2026-09-01T00:00:00.000Z',
      handle: 'default-user',
      selection: { ...SELECTION },
    })],
    ...flatUserEntries(),
  ];
}

export function ttEntries() {
  const prefix = (name) => `data/default-user/${name}`;
  return [
    // 用户目录整体套 data/default-user 前缀 (TT 的扩展放在 data/extensions/third-party)
    ...flatUserEntries().filter(([name]) => !name.startsWith('extensions/')).map(([name, data]) => [prefix(name), data]),
    // TT 私有:扩展包文件在 data 根的 extensions/third-party,来源记录在 _tauritavern
    ['data/extensions/third-party/test-extension/manifest.json', json(MANIFEST)],
    ['data/extensions/third-party/test-extension/index.js', EXT_INDEX],
    ['data/_tauritavern/extension-sources/global/test-extension.json', json(EXT_SOURCE)],
    // TT 私有杂项(转换器默认应丢弃并在报告列明)
    ['data/_cache/derived.bin', Buffer.from('derived-cache', 'utf8')],
    ['data/content.log', Buffer.from('log\n', 'utf8')],
  ];
}

/**
 * PureTavern 官方原生归档夹具：条目是 PT 内部模块模型
 * `modules/<moduleId>/{records,blobs}/<collection>/<id>.{json,bin}`（非用户目录路径），
 * 供「PT 原生归档 → hub 重建」的往返断言。逐条映射证据见
 * `.trellis/spec/guides/tavern-datapack-formats.md`。
 */
export function ptEntries() {
  const CARD = {
    spec: 'chara_card_v2',
    spec_version: '2.0',
    data: { name: 'Fixture Character', description: 'fixture only', first_mes: 'hi' },
  };
  const SESSION_HEADER = {
    user_name: 'You',
    character_name: 'Fixture Character',
    create_date: '2026-09-01',
  };
  const MESSAGES = [
    { name: 'You', is_user: true, mes: 'hello' },
    { name: 'Fixture Character', is_user: false, mes: 'world' },
  ];

  const files = [
    ['modules/characters/records/cards/c1.json', json({
      id: 'c1',
      avatarFile: 'Fixture Character.png',
      card: CARD,
      createdAt: '2026-09-01T00:00:00.000Z',
      updatedAt: '2026-09-01T00:00:00.000Z',
    })],
    ['modules/characters/blobs/avatars/Fixture%20Character.png.bin', pngBytes('card')],
    ['modules/chats/records/sessions/s1.json', json({
      id: 's1',
      ownerId: 'c1',
      ownerAlias: 'Fixture Character.png',
      characterName: 'Fixture Character',
      legacyFileName: '2026-09-01.jsonl',
      header: SESSION_HEADER,
      chatMetadata: {},
      messageCount: MESSAGES.length,
    })],
    ['modules/chats/records/messages/s1.json', json(MESSAGES)],
    ['modules/world-books/records/books/w1.json', json({
      id: 'w1',
      legacyFileId: 'fixture-world',
      name: 'Fixture World',
      document: { entries: { '0': { uid: 0, key: ['fixture'], content: 'fixture lore' } } },
    })],
    ['modules/presets/records/documents/openai%3Ap1.json', json({
      id: 'p1',
      type: 'openai',
      name: 'fixture-preset',
      value: { temperature: 1.0, fixture: true },
    })],
    ['modules/settings/records/documents/current.json', json({
      firstRun: false,
      font_scale: 1,
      fixtureMarker: 'st-settings',
    })],
    ['modules/secrets/records/store/current.json', json({
      secrets: { api_key_openai: 'fixture-secret-do-not-leak', api_key_anthropic: 'fixture-secret-2' },
    })],
    ['modules/assets/records/index/a1.json', json({
      id: 'a1',
      collection: 'user-avatars',
      legacyPath: '/User Avatars/fixture-avatar.png',
      filename: 'fixture-avatar.png',
      mimeType: 'image/png',
    })],
    ['modules/assets/blobs/user-avatars/a1.bin', pngBytes('avatar')],
  ];

  return [['manifest.json', json(ptManifest(files))], ...files];
}

/** 由条目清单构建合法的 PT manifest（含逐条目 sha256）。 */
function ptManifest(files) {
  const modules = new Map();
  const descriptors = files.map(([entryPath, data]) => {
    const match = /^modules\/([^/]+)\/(records|blobs)\/([^/]+)\/([^/]+)\.(json|bin)$/.exec(entryPath);
    const moduleId = decodeURIComponent(match[1]);
    const collection = decodeURIComponent(match[3]);
    const id = decodeURIComponent(match[4]);
    const entry = modules.get(moduleId) || { moduleId, records: 0, blobs: 0 };
    if (match[2] === 'blobs') entry.blobs += 1; else entry.records += 1;
    modules.set(moduleId, entry);
    return {
      path: entryPath,
      moduleId,
      kind: match[2] === 'blobs' ? 'blob' : 'record',
      collection,
      id,
      size: data.byteLength,
      sha256: sha256Hex(data),
      updatedAt: '2026-09-01T00:00:00.000Z',
    };
  });
  return {
    format: 'pure-tavern-archive',
    schemaVersion: 1,
    archiveId: 'fixture-pt-archive',
    createdAt: '2026-09-01T00:00:00.000Z',
    appVersion: '0.1.0',
    upstreamVersion: '1.12.0',
    includeSecrets: true,
    modules: [...modules.values()].map((m) => ({
      moduleId: m.moduleId,
      displayName: m.moduleId,
      dataVersion: 1,
      sensitive: false,
      recordCount: m.records,
      blobCount: m.blobs,
      totalBytes: 0,
    })),
    files: descriptors,
  };
}

function sha256Hex(data) {
  // fixtures 只在 Node 下生成（gen-fixtures CLI / 单测）。
  return createHash('sha256').update(data).digest('hex');
}

export async function generateAll(outDir) {
  const { mkdirSync } = await import('node:fs');
  mkdirSync(outDir, { recursive: true });
  const outputs = {};
  const packs = [
    ['fixture-st.zip', stEntries()],
    ['fixture-l.zip', lEntries()],
    ['fixture-tt.zip', ttEntries()],
    ['fixture-pt.zip', ptEntries()],
  ];
  for (const [fileName, entries] of packs) {
    const outPath = path.join(outDir, fileName);
    const writer = await zipIo.createWriter(outPath);
    for (const [name, data] of entries) {
      await writer.add(name, data);
    }
    await writer.close();
    outputs[fileName] = outPath;
  }
  return outputs;
}

/**
 * 入口守卫：仅当本文件被**作为 CLI 直跑**时落盘；被 `import` 时**零副作用**。
 *
 * ⚠️ 2026-09-27 修复（R-17）：原实现用模板字符串手拼
 * `file://${process.argv[1].replace(/\\/g, '/')}`，而 Windows 上 `import.meta.url` 是
 * `file:///D:/…`（**三个**斜杠），模板拼出的是 `file://D:/…`（**两个**）⇒ **永不相等** ⇒
 * `npm run gen-fixtures` 自存在起**从未产出过任何夹具**（退出码 0、零输出、零产物 —— **静默空操作**）。
 * 改用 `node:url` 的 `pathToFileURL`（**不引新依赖**，L1-MR-11）。
 * 回归守护：`test/gen-fixtures-cli.test.js` 的**双向负例**（直跑确实产出 / import 零副作用）。
 */
const isCliEntry = (() => {
  const entry = process.argv[1];
  if (!entry) return false; // 存在性守卫：pathToFileURL(undefined) 会抛
  const entryUrl = pathToFileURL(entry).href;
  if (entryUrl === import.meta.url) return true;
  // Windows 路径大小写不敏感：`node FIXTURES/gen.js` 这类调用不应被误判成「非 CLI」
  return process.platform === 'win32' && entryUrl.toLowerCase() === import.meta.url.toLowerCase();
})();

if (isCliEntry) {
  const outDir = process.argv[2] ?? 'fixtures';
  generateAll(outDir)
    .then((outputs) => {
      for (const [name, outPath] of Object.entries(outputs)) {
        console.log(`generated ${name} -> ${outPath}`);
      }
    })
    // 显式收口失败：「静默空操作」与「失败却看不出原因」是同一类问题的两面
    .catch((err) => {
      console.error(`[fixtures/gen] 生成失败: ${err?.message || err}`);
      process.exitCode = 1;
    });
}
