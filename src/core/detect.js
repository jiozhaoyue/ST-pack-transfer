import { zipIo } from './zip-io.js';

export const LAYOUTS = Object.freeze({
  ST: 'st',            // zip 根摊平 ST 用户目录,无 manifest
  L: 'l',              // 同 ST 摊平 + manifest.json{schemaVersion,handle,selection}
  TT: 'tt',            // data/ 根(TT 导出,PT 的 TT 迁移包同形)
  PT_NATIVE: 'pt-native', // PT 原生归档(manifest 带 per-file moduleId/sha256),v1 不支持
  UNKNOWN: 'unknown',
});

/**
 * 识别源布局。判定顺序按 design.md §3:
 * 1) data/default-user/ 或 data/_tauritavern/ 前缀 → tt
 * 2) 根 manifest.json 解析:format/files[].moduleId → pt-native;schemaVersion/Luker标志 → l
 * 3) _convert/split-manifest.json 分卷清单识别
 * 4) 根 characters/ 或 settings.json 或其它酒馆用户目录（chats/worlds/groups/user/extensions） → st 或结合文件名判定 l
 * 5) 其余 unknown
 */
export async function detectFromReader(reader, { filename = '' } = {}) {
  let hasDataRoot = false;
  let hasCharactersRoot = false;
  let hasSettingsRoot = false;
  let hasFlatTavernRoot = false;
  let manifestBuffer = null;
  let splitManifestBuffer = null;
  let detectedHandle = null;

  for await (const entry of reader.entries()) {
    const name = entry.fileName;
    if (name === 'manifest.json') {
      manifestBuffer = await entry.read();
      continue;
    }
    if (name === '_convert/split-manifest.json') {
      splitManifestBuffer = await entry.read();
      continue;
    }
    if (name.startsWith('data/default-user/') || name.startsWith('data/_tauritavern/')) {
      hasDataRoot = true;
      if (!detectedHandle) detectedHandle = 'default-user';
    } else if (name.startsWith('data/')) {
      const match = name.match(/^data\/([^/]+)\//);
      if (match && match[1] && match[1] !== '_tauritavern' && match[1] !== 'extensions') {
        hasDataRoot = true;
        if (!detectedHandle) detectedHandle = match[1];
      }
    } else if (name.startsWith('characters/') || name === 'characters') {
      hasCharactersRoot = true;
      hasFlatTavernRoot = true;
    } else if (name === 'settings.json') {
      hasSettingsRoot = true;
      hasFlatTavernRoot = true;
    } else if (
      name.startsWith('chats/')
      || name.startsWith('worlds/')
      || name.startsWith('groups/')
      || name.startsWith('user/')
      || name.startsWith('backgrounds/')
      || name.startsWith('extensions/')
      || name === 'secrets.json'
    ) {
      hasFlatTavernRoot = true;
    }
    entry.skip();
  }

  // 1. 根 manifest.json 判定
  const manifest = manifestBuffer ? parseJson(manifestBuffer) : null;
  if (manifest && typeof manifest === 'object') {
    if (manifest.handle) {
      detectedHandle = manifest.handle;
    }
    const perFileManifest = Array.isArray(manifest.files)
      && manifest.files.some((file) => file && typeof file === 'object' && 'moduleId' in file);
    if (manifest.format || perFileManifest) {
      return { layout: LAYOUTS.PT_NATIVE, evidence: 'manifest carries per-file moduleId list', handle: detectedHandle };
    }
    if (
      'schemaVersion' in manifest
      || 'selection' in manifest
      || manifest.generator === 'Luker'
      || manifest.platform === 'luker'
      || manifest.target === 'l'
      || manifest.source === 'luker'
    ) {
      return { layout: LAYOUTS.L, evidence: 'manifest.json indicates Luker layout', handle: detectedHandle };
    }
  }

  // 2. 分卷包专属 _convert/split-manifest.json 判定
  //   target = 分卷时的目标布局代码(st|l|tt|pt)，即本分卷包的实际布局；
  //   source = 旧包遗留的源布局/平台标记，仅在 target 缺失时回退读取。
  //   两者都取不到（或 target=pt 等无法映射）时**不得**在此返回布局，
  //   必须落到后面的文件名启发/目录特征回退，绝不假装识别成功。
  const splitManifest = splitManifestBuffer ? parseJson(splitManifestBuffer) : null;
  if (splitManifest && typeof splitManifest === 'object') {
    if (splitManifest.handle) detectedHandle = splitManifest.handle;
    const rawTarget = (typeof splitManifest.target === 'string' && splitManifest.target.trim())
      ? splitManifest.target
      : splitManifest.source;
    const tgt = (typeof rawTarget === 'string' ? rawTarget : '').trim().toLowerCase();
    if (tgt === 'l' || tgt === 'luker') {
      return { layout: LAYOUTS.L, evidence: 'split-manifest indicates Luker part', handle: detectedHandle };
    }
    if (tgt === 'tt' || tgt === 'tauritavern') {
      return { layout: LAYOUTS.TT, evidence: 'split-manifest indicates TauriTavern part', handle: detectedHandle };
    }
    if (tgt === 'st' || tgt === 'sillytavern') {
      return { layout: LAYOUTS.ST, evidence: 'split-manifest indicates SillyTavern part', handle: detectedHandle };
    }
    // target=pt 或无法识别：不在此假装成功，落到下面的回退路径。
  }

  // 3. 文件名强特征启发（例如分卷包 Luker_default-user_part1_...）
  const lowerName = String(filename || '').toLowerCase();
  if (lowerName.startsWith('luker_') || lowerName.startsWith('luker-')) {
    return { layout: LAYOUTS.L, evidence: 'filename indicates Luker package', handle: detectedHandle || 'default-user' };
  }
  if (lowerName.startsWith('sillytavern_') || lowerName.startsWith('st_')) {
    return { layout: LAYOUTS.ST, evidence: 'filename indicates SillyTavern package', handle: detectedHandle || 'default-user' };
  }
  if (lowerName.startsWith('tauritavern_') || lowerName.startsWith('tt_')) {
    return { layout: LAYOUTS.TT, evidence: 'filename indicates TauriTavern package', handle: detectedHandle || 'default-user' };
  }

  if (hasDataRoot) {
    return { layout: LAYOUTS.TT, evidence: 'entries under data/default-user or data/_tauritavern', handle: detectedHandle };
  }

  if (hasCharactersRoot || hasSettingsRoot || hasFlatTavernRoot) {
    return { layout: LAYOUTS.ST, evidence: 'flat user directory entries', handle: detectedHandle };
  }

  return { layout: LAYOUTS.UNKNOWN, evidence: 'no recognizable layout marker', handle: detectedHandle };
}

const JSON_DECODER = new TextDecoder();

function parseJson(data) {
  try {
    return JSON.parse(JSON_DECODER.decode(data));
  } catch {
    return null;
  }
}

/**
 * 识别指定 zip 源（Blob/File 或路径）的布局
 * @param {Blob|File|string} source
 * @param {{ filename?: string }} [opts]
 */
export async function detectLayout(source, opts = {}) {
  const filename = opts.filename
    || (typeof source === 'string' ? source.split(/[\\/]/).pop() : (source?.name || ''));
  const reader = await zipIo.openReader(source);
  try {
    return await detectFromReader(reader, { filename });
  } finally {
    await reader.close();
  }
}

