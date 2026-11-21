/**
 * 个人酒馆数据包脱敏分发与本地上传门禁 (Sanitized Share & Pre-upload Guard)
 *
 * 依据用户裁定与规范设计：
 * 1. 绝对不分发角色卡（物理排除 characters/*，防侵权），但允许分发聊天记录（chats/*.jsonl）；
 * 2. 针对酒馆原生配置文件（settings.json），采用 AST 树形白名单清洗，清空所有 api_key / token / password / proxy / endpoint；
 * 3. 全量保留文本过 core/logger.js 的 redact() 管道；
 * 4. 允许压缩包嵌入 _watermark.json 轻量水印；
 * 5. 上传服务器前强制执行本地脱敏检查（preUploadGuard），检测不通过直接硬阻断。
 */

import { redact } from './logger.js';
import { containsPemPrivateKey } from './credential-patterns.js';

/** settings.json 允许保留的白名单根键（仅限通用 UI/排版/无密钥常规采样预设） */
export const SETTINGS_SAFE_WHITE_LIST = Object.freeze(new Set([
  'theme',
  'theme_color',
  'font_size',
  'waifuMode',
  'compact_mode',
  'sort_by',
  'sort_order',
  'chat_display',
  'custom_css',
  'preset',
  'context_template',
  'instruct_template',
  'streaming',
  'auto_scroll',
  'enable_markdown',
  'show_tokens',
  'fast_ui',
  'main_text_color',
  'italics_text_color',
  'quote_text_color',
]));

/** 敏感键名正则：命中一律置空或删除（添加词边界防止误伤 author 等正常字段） */
const SENSITIVE_KEY_REGEX = /(api[_-]?key|secret|token|password|passwd|\bauth\b|credential|endpoint|reverse_proxy|custom_url|webhook|user_name|your_name)/i;

/**
 * 递归清洗 JSON 对象中的敏感信息
 * @param {any} obj
 * @returns {any}
 */
function sanitizeObjectTree(obj) {
  if (obj === null || typeof obj !== 'object') {
    if (typeof obj === 'string') {
      return redact(obj);
    }
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObjectTree(item));
  }

  const cleaned = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEY_REGEX.test(key)) {
      // 敏感键一律置为空字符串，不留任何真实密钥残骸
      cleaned[key] = '';
    } else {
      cleaned[key] = sanitizeObjectTree(value);
    }
  }
  return cleaned;
}

/**
 * 对酒馆原生 settings.json 文本进行 AST 树形白名单与深度脱敏
 * @param {string} jsonText 原始 settings.json 文本
 * @returns {string} 脱敏后的 JSON 文本
 */
export function sanitizeSettingsJson(jsonText) {
  if (!jsonText || typeof jsonText !== 'string') return '{}';
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    // 无法解析时降级返回空对象，绝不放行未脱敏原始文本
    return '{}';
  }

  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return '{}';
  }

  const safeRoot = {};
  for (const [key, value] of Object.entries(parsed)) {
    if (SETTINGS_SAFE_WHITE_LIST.has(key)) {
      safeRoot[key] = sanitizeObjectTree(value);
    }
  }

  return JSON.stringify(safeRoot, null, 2);
}

/** 脱敏排除原因码（唯一真源，判定与门禁共用，避免两份文案漂移） */
export const SHARE_DROP_REASON = Object.freeze({
  CHARACTER: 'character-excluded-for-share',
  CREDENTIAL: 'credential-file-excluded',
});

/** 凭据类文件名（basename 精确匹配） */
const CREDENTIAL_BASENAMES = Object.freeze(new Set([
  'credentials.json',
  'api_keys.json',
  'secrets.json',
]));

/** 凭据类目录名（任意层级整段精确匹配，根级与嵌套一并覆盖） */
const CREDENTIAL_DIR_SEGMENTS = Object.freeze(new Set(['secrets', '.secrets']));

/**
 * 内容级凭据检测：复用 logger.js 的 redact()（凭据打码模式的唯一真源）。
 * redact() 命中任何凭据/秘密载体都会改写文本；输出与输入不同即证明含敏感信息。
 * 这样门禁与日志脱敏共用同一套模式，不再在门禁里另抄一份正则（避免漂移）。
 * PEM 私钥载体检测同样走共享模块 credential-patterns.js 的 containsPemPrivateKey，
 * 与 logger.redact 的 PEM 正则严格同源（消除历史上两处正则不一致的漂移）。
 */
function containsCredential(content) {
  if (typeof content !== 'string' || !content) return false;
  return redact(content) !== content || containsPemPrivateKey(content);
}

/**
 * .env 族文件名判据：`.env` 后要么结束、要么接 `.` + 任意后缀。
 * 覆盖 .env / .env.local / x.env.local / app.env.production（构建工具真实会加载的形态），
 * 同时不命中 .environment.md / .env-example 这类仅前缀相似的普通文档/模板。
 */
const ENV_FAMILY_BASENAME_REGEX = /^.*\.env(\..+)?$|^.*\.envrc$/;

/**
 * 归一化包内路径：反斜杠转 POSIX、小写、去除首尾斜杠与冗余 `./` / 重复斜杠。
 * 非字符串与空值一律归为空串，交由调用方决定策略（门禁侧必须 fail-closed）。
 * @param {unknown} hubPath
 * @returns {string}
 */
export function normalizeSharePath(hubPath) {
  if (typeof hubPath !== 'string') return '';
  let p = hubPath.replace(/\\/g, '/').trim().toLowerCase();
  while (p.startsWith('./')) p = p.slice(2);
  p = p.replace(/^\/+/, '').replace(/\/+$/, '');
  return p.replace(/\/{2,}/g, '/');
}

/**
 * 脱敏分发路径判据（唯一真源）：`shouldDropForSanitizedShare` 与 `preUploadGuard` 共用。
 * 采用「整段精确匹配」而非子串匹配，根级 `secrets/*`、根级 `.env.*` 与任意深度的同名项
 * 都会被拦截，同时不会把 `secretsX/` 之类的近似名误判为凭据目录。
 * @param {string} hubPath 包内路径
 * @returns {{ drop: boolean, reason?: string }}
 */
export function classifySanitizedSharePath(hubPath) {
  const p = normalizeSharePath(hubPath);
  if (!p) return { drop: false };

  const segments = p.split('/').filter(Boolean);
  const base = segments.length ? segments[segments.length - 1] : '';

  // 1. 绝对剔除角色卡（PNG tEXt/JSON 均不放行，防侵权二传）：任意层级的 characters 整段
  if (segments.includes('characters')) {
    return { drop: true, reason: SHARE_DROP_REASON.CHARACTER };
  }

  // 2. 凭据目录：任意层级的 secrets / .secrets 整段（含 `secrets` 目录条目本身）
  if (segments.some((seg) => CREDENTIAL_DIR_SEGMENTS.has(seg))) {
    return { drop: true, reason: SHARE_DROP_REASON.CREDENTIAL };
  }

  // 3. 凭据文件名：.env 族（.env / .env.local / x.env.local / app.env.production / .envrc）、*.env、固定名单
  if (ENV_FAMILY_BASENAME_REGEX.test(base) || CREDENTIAL_BASENAMES.has(base)) {
    return { drop: true, reason: SHARE_DROP_REASON.CREDENTIAL };
  }

  // 4. 聊天记录 chats/*.jsonl 明确允许分发（用户裁定）
  if (segments.includes('chats')) {
    return { drop: false };
  }

  return { drop: false };
}

/**
 * 检查该 hub 路径在脱敏分发模式下是否应该被物理剔除
 * @param {string} hubPath 标准化的 hub 路径
 * @returns {{ drop: boolean, reason?: string }}
 */
export function shouldDropForSanitizedShare(hubPath) {
  if (typeof hubPath !== 'string') return { drop: false };
  return classifySanitizedSharePath(hubPath);
}

/**
 * 结构化排除清单（铁律 42：脱敏绝不静默丢弃）
 * 把「哪些条目被剔除、为什么、哪些条目元数据无法判定」全部落成结构化数据，
 * 供报告 / 水印 / 完成通知逐项明示。
 * @param {Array<{path?: string}>} fileEntries 待扫描条目
 * @returns {{ total: number, byReason: Record<string, number>, items: Array<{path: string, reason: string}>, invalidEntries: Array<{index: number, value: unknown}> }}
 */
export function buildSanitizeExclusionList(fileEntries) {
  const items = [];
  const invalidEntries = [];
  const byReason = {};

  const list = Array.isArray(fileEntries) ? fileEntries : [];
  list.forEach((entry, index) => {
    const rawPath = entry && typeof entry === 'object' ? entry.path : undefined;
    if (typeof rawPath !== 'string' || rawPath.trim() === '') {
      // 不可判定条目单独成列，不混入排除项，也不静默吞掉
      invalidEntries.push({ index, value: rawPath });
      return;
    }
    const verdict = classifySanitizedSharePath(rawPath);
    if (!verdict.drop) return;
    items.push({ path: rawPath, reason: verdict.reason });
    byReason[verdict.reason] = (byReason[verdict.reason] || 0) + 1;
  });

  return { total: items.length, byReason, items, invalidEntries };
}

/**
 * 生成轻量压缩包水印元数据
 * @param {string} sourceLayout 源宿主布局代码
 * @returns {object}
 */
export function generateWatermarkData(sourceLayout = 'unknown') {
  return {
    schema_version: 1,
    kind: 'sanitized_share_watermark',
    generator: 'ST-pack-transfer',
    timestamp: new Date().toISOString(),
    sanitized: true,
    rules: {
      characters_excluded: true,
      chats_included: true,
      settings_ast_whitelisted: true,
    },
    source_layout: sourceLayout,
  };
}

/**
 * 本地上传脱敏检测门禁 (Pre-upload Gatekeeper)
 * 纯内容级判定：不读取任何外挂水印文件，只看实际条目路径与文本内容（铁律 43）。
 * 与 `shouldDropForSanitizedShare` 共用 `classifySanitizedSharePath`，同一输入结论严格一致。
 * 不可判定条目（null / 非对象 / path 缺失或非字符串）一律 fail-closed 硬阻断：
 * 无法证明其安全，就不得向外网发送一个字节。
 * @param {Array<{path?: string, content?: string}>} fileEntries 待上传包中的条目列表
 * @returns {{ ok: boolean, reason?: string }}
 */
export function preUploadGuard(fileEntries) {
  if (!Array.isArray(fileEntries)) {
    throw new Error('PreUploadGuardError: 待检测条目列表无效');
  }

  for (let index = 0; index < fileEntries.length; index += 1) {
    const entry = fileEntries[index];

    // 空 / 非对象条目：无法判定 → 硬阻断（绝不 fail-open 放行）
    if (entry === null || entry === undefined || typeof entry !== 'object') {
      throw new Error(`PreUploadGuardError: 本地脱敏检测未通过！第 ${index} 个条目无法判定（非对象），禁止上传至服务器`);
    }

    const rawPath = entry.path;
    if (typeof rawPath !== 'string' || rawPath.trim() === '') {
      throw new Error(`PreUploadGuardError: 本地脱敏检测未通过！第 ${index} 个条目缺少有效路径，禁止上传至服务器`);
    }

    const p = rawPath.replace(/\\/g, '/');
    const verdict = classifySanitizedSharePath(rawPath);

    // 1. 绝不允许包含角色卡
    if (verdict.drop && verdict.reason === SHARE_DROP_REASON.CHARACTER) {
      throw new Error(`PreUploadGuardError: 本地脱敏检测未通过！发现角色卡条目 [${p}]，禁止上传至服务器`);
    }

    // 2. 绝不允许包含凭据文件（根级 secrets/* 与根级 .env.* 一并覆盖）
    if (verdict.drop && verdict.reason === SHARE_DROP_REASON.CREDENTIAL) {
      throw new Error(`PreUploadGuardError: 本地脱敏检测未通过！发现凭据文件 [${p}]，禁止上传至服务器`);
    }

    // 3. 文本内容深度扫描：复用 logger.redact 的统一凭据模式（含 AWS/Slack/GitLab/
    //    GitHub/Bearer/数据库连接串等），并补齐 PEM 私钥头检测。
    if (containsCredential(entry.content)) {
      throw new Error(`PreUploadGuardError: 本地脱敏检测未通过！在 [${p}] 中发现明文 API 密钥/凭据（Token/私钥/连接串等），已硬阻断上传`);
    }
  }

  return { ok: true, reason: 'passed-sanitized-gate' };
}
