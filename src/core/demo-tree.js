/**
 * 教程占位包树（纯逻辑，无 DOM / 无真实包读取）。
 *
 * 设计铁律（2026-11-17 用户裁定）：
 * - 教程只保存**扁平文件清单**（路径 + 类目 + 相对体积），不手写分组树；
 * - 树必须由真实的 `buildChartTree()` 生成，分组顺序、组键、建议保留度、目录层级
 *   全部与真实数据包共用同一套规则——真实结构变化时教程被动跟随，不靠人工同步；
 * - 仍然完全是伪造数据：不读真实包、不塞实例包、不碰宿主。
 */

import { buildChartTree } from './chart-model.js';

/** 把总「十分之一 MB」按权重切成整数份；最后一份吃掉余数，保证总和精确。 */
function splitTenths(totalTenths, weights) {
  const list = weights.map((w) => Math.max(0, Number(w) || 0));
  const sum = list.reduce((a, b) => a + b, 0) || 1;
  let used = 0;
  return list.map((w, i) => {
    if (i === list.length - 1) return Math.max(0, totalTenths - used);
    const value = Math.round(totalTenths * w / sum);
    used += value;
    return value;
  });
}

/** 真实宿主的目录习惯；仍是伪造路径。 */
export function demoPath(host, rel) {
  if (host === 'pt') {
    const map = [
      ['chats/', 'modules/chats/records/messages/'],
      ['characters/', 'modules/characters/records/cards/'],
      ['worlds/', 'modules/world-books/records/books/'],
      ['User Avatars/', 'modules/assets/blobs/user-avatars/'],
      ['thumbnails/', 'modules/assets/blobs/thumbnails/'],
      ['backgrounds/', 'modules/assets/blobs/backgrounds/'],
      ['OpenAI Settings/', 'modules/presets/records/documents/'],
      ['Themes/', 'modules/presets/records/documents/'],
      ['extensions/third-party/', 'modules/extensions/blobs/'],
      ['backups/', 'modules/backups/blobs/'],
      ['_cache/', 'modules/cache/blobs/'],
      ['vectors/', 'modules/vectors/blobs/'],
    ];
    for (const [from, to] of map) {
      if (rel === from) return to.replace(/\/$/, '');
      if (rel.startsWith(from)) return to + rel.slice(from.length);
    }
    if (rel === 'settings.json') return 'modules/settings/records/documents/current.json';
    if (rel === 'secrets.json') return 'modules/secrets/records/store/current.json';
    return 'modules/' + rel;
  }
  if (host === 'tt') {
    if (rel.startsWith('extensions/third-party/')) return 'data/extensions/third-party/' + rel.slice('extensions/third-party/'.length);
    if (rel.startsWith('_cache/')) return 'data/_cache/' + rel.slice('_cache/'.length);
    return 'data/default-user/' + rel;
  }
  return rel;
}

/**
 * 扁平文件清单。`category` 用真实 `plan-preview` 的类目键；
 * 私有/原生/缓存等特殊归类由 `chart-model.groupKeyOf()` 再判一次。
 * 权重相对同一组内部；组权重见 `GROUP_WEIGHTS`。
 */
const DEMO_GROUPS = Object.freeze([
  {
    key: 'chats',
    files: [
      { path: 'chats/Seraphina/2026-11-14.jsonl', category: 'chats', w: 0.55 },
      { path: 'chats/Kirin/2026-11-13.jsonl', category: 'chats', w: 0.30 },
      { path: 'chats/Group RP/2026-11-12.jsonl', category: 'chats', w: 0.15 },
    ],
  },
  {
    key: 'characters',
    files: [
      { path: 'characters/Seraphina.png', category: 'characters', w: 0.6 },
      { path: 'characters/Kirin.png', category: 'characters', w: 0.4 },
    ],
  },
  {
    key: 'attachments',
    files: [
      { path: 'User Avatars/seraphina.png', category: 'assets', w: 0.35 },
      { path: 'thumbnails/seraphina.png', category: 'assets', w: 0.15 },
      { path: 'backgrounds/azure-archive.jpg', category: 'assets', w: 0.5 },
    ],
  },
  {
    key: 'lorebooks',
    files: [
      { path: 'worlds/azure-archive.json', category: 'lorebooks', w: 0.6 },
      { path: 'worlds/kirin-lore.json', category: 'lorebooks', w: 0.4 },
    ],
  },
  {
    key: 'presets',
    files: [
      { path: 'settings.json', category: 'settings', w: 0.4 },
      { path: 'OpenAI Settings/default.json', category: 'presets', w: 0.35 },
      { path: 'Themes/dark.json', category: 'presets', w: 0.25 },
    ],
  },
  {
    key: 'extensions',
    files: [
      { path: 'extensions/third-party/ST-pack-transfer/manifest.json', category: 'extensions', w: 0.04 },
      { path: 'extensions/third-party/ST-pack-transfer/index.js', category: 'extensions', w: 0.36 },
      { path: 'extensions/third-party/ST-BgLoader/manifest.json', category: 'extensions', w: 0.04 },
      { path: 'extensions/third-party/ST-BgLoader/index.js', category: 'extensions', w: 0.26 },
      { path: 'extensions/third-party/ST-chatfile-improve/manifest.json', category: 'extensions', w: 0.03 },
      { path: 'extensions/third-party/ST-chatfile-improve/index.js', category: 'extensions', w: 0.12 },
      { path: 'extensions/third-party/ST-msg-btn-mgr/manifest.json', category: 'extensions', w: 0.03 },
      { path: 'extensions/third-party/ST-msg-btn-mgr/index.js', category: 'extensions', w: 0.06 },
      { path: 'extensions/third-party/ST-PanelReset/manifest.json', category: 'extensions', w: 0.02 },
      { path: 'extensions/third-party/ST-PanelReset/index.js', category: 'extensions', w: 0.04 },
    ],
  },
  {
    key: 'private',
    files: [
      { path: 'secrets.json', category: 'secrets', w: 0.6 },
      { path: 'HOST_PRIVATE', category: 'appPrivate', w: 0.4 },
    ],
  },
  {
    key: 'backups',
    files: [
      { path: 'backups/auto-2026-11-14.json', category: 'backups', w: 0.6 },
      { path: 'backups/manual-2026-11-10.zip', category: 'backups', w: 0.4 },
    ],
  },
  {
    key: 'cache',
    files: [
      { path: '_cache/derived.bin', category: 'cache', w: 1 },
    ],
  },
  {
    key: 'vectors',
    files: [
      { path: 'vectors/index.bin', category: 'vectors', w: 1 },
    ],
  },
  {
    key: 'native',
    files: [
      { path: 'backgrounds/default.png', category: 'assets', w: 1 },
    ],
  },
]);

/* 组权重：合计 1；有引擎载体时从 chats 让出 0.02。 */
const GROUP_WEIGHTS = Object.freeze([0.415, 0.20, 0.16, 0.08, 0.05, 0.04, 0.02, 0.02, 0.01, 0, 0.005]);
const ENGINE_WEIGHT = 0.02;

/** 私有配置的真实路径（按宿主）。 */
function privatePathOf(host) {
  if (host === 'luker') return '.luker-state.json';
  if (host === 'tt') return '_tauritavern/settings.json';
  if (host === 'pt') return 'modules/secrets/records/store/current.json';
  return 'secrets.json';
}

/**
 * 由扁平清单生成真实 `plan-preview` 形状的合成计划。
 * @param {number} totalMb 解压后总 MB
 * @param {'st'|'luker'|'tt'|'pt'} host
 * @param {''|'fs'|'postgres'|'mysql'|'sqlite'} engine
 */
export function demoSyntheticPlan(totalMb, host = 'st', engine = 'fs') {
  const totalTenths = Math.max(0, Math.round((Number(totalMb) || 0) * 10));
  /* 引擎载体是 Luker 独有结构；TT/PT/ST 包不得凭空长出 _engine_dump.bin。 */
  const hasEngine = host === 'luker' && ['postgres', 'mysql', 'sqlite'].includes(engine);
  const weights = GROUP_WEIGHTS.map((w, i) => (hasEngine && i === 0 ? w - ENGINE_WEIGHT : w));
  if (hasEngine) weights.push(ENGINE_WEIGHT);
  const top = splitTenths(totalTenths, weights);
  const categories = {};
  const push = (category, path, tenths) => {
    const bucket = categories[category] || (categories[category] = { items: [] });
    bucket.items.push({
      hubPath: path,
      category,
      sizeBytes: Math.round((tenths / 10) * 1024 * 1024),
      selected: true,
    });
  };

  DEMO_GROUPS.forEach((group, i) => {
    const files = group.key === 'private' && host === 'st'
      ? [group.files[0]]
      : group.files;
    const parts = splitTenths(top[i], files.map((f) => f.w));
    files.forEach((file, j) => {
      const rel = file.path === 'HOST_PRIVATE' ? privatePathOf(host) : file.path;
      push(file.category, demoPath(host, rel), parts[j]);
    });
  });

  if (hasEngine) {
    const engineTenths = top[top.length - 1];
    const files = engine === 'sqlite'
      ? [{ path: 'luker-storage.sqlite', w: 1 }]
      : [
        { path: '_engine_meta.json', w: 0.02 },
        { path: '_engine_dump.bin', w: 0.98 },
      ];
    const parts = splitTenths(engineTenths, files.map((f) => f.w));
    files.forEach((file, i) => push('other', file.path, parts[i]));
  }

  return { categories };
}

/** 教程占位包树：真实建树函数 + 合成扁平清单。 */
export function demoTree(totalMb, host = 'st', engine = 'fs') {
  return buildChartTree(demoSyntheticPlan(totalMb, host, engine));
}

/** 未识别教程包：仍然走真实建树函数，只是类目归到 other/unknown。 */
export function demoUnknownTree(totalMb) {
  return buildChartTree({
    categories: {
      other: {
        items: [{
          hubPath: 'unknown_layout.bin',
          category: 'other',
          sizeBytes: Math.max(0, Math.round((Number(totalMb) || 0) * 1024 * 1024)),
          selected: true,
        }],
      },
    },
  });
}
