#!/usr/bin/env node
/**
 * 身份徽标守卫（铁律 39）：顶部徽标必须显示当前用户名，不允许出现「未登录 / 游客」态。
 *
 * 范围严格限定：**只管顶部身份徽标**。酒馆运行时一定有用户，徽标不存在「未登录」这种情况。
 * 明确**不在管辖范围**（用户裁定）：Git / 云盘 / S3 / WebDAV 等外部服务的凭据与登录措辞
 * —— 那类是服务侧认证，与「宿主里有没有用户」是两码事，改动会被视为扩大化。
 *
 * 用法：node scripts/login-state-guard.js [--json]
 * 退出码：命中即 1，全清 0。
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** 只扫身份徽标相关源码，不扫整个 src/，避免把外部服务凭据文案算进来。 */
const SCAN_DIRS = ['src/ui', 'src/i18n'];
const SCAN_FILES = ['index.js'];

/** 直白违规词（徽标语境专用）。 */
const DIRECT_PATTERNS = [
  { re: /未登录/g, label: '未登录' },
  { re: /游客/g, label: '游客' },
  { re: /Not\s+signed\s+in/gi, label: 'Not signed in' },
  { re: /\bnoUser\b/g, label: 'noUser' },
  { re: /\bguest\b/gi, label: 'guest' },
];

/**
 * 近义词绕过：把「未登录」改写成近义词属于同一违规（用户明令）。
 * 只收徽标可能出现的写法；外部服务凭据类措辞不在此列。
 */
const SYNONYM_PATTERNS = [
  { re: /账号未授权/g, label: '账号未授权' },
  { re: /尚未登录/g, label: '尚未登录' },
  { re: /未认证用户/g, label: '未认证用户' },
  { re: /未授权用户/g, label: '未授权用户' },
  { re: /匿名用户/g, label: '匿名用户' },
  { re: /匿名态/g, label: '匿名态' },
  { re: /未登录态/g, label: '未登录态' },
  { re: /\bnot\s+logged\s+in\b/gi, label: 'not logged in' },
  { re: /\bsigned\s+out\b/gi, label: 'signed out' },
  { re: /\bno\s+active\s+user\b/gi, label: 'no active user' },
];

/**
 * 徽标相关行判定：只有命中的行**同时**属于身份徽标语境才算违规，
 * 避免把外部服务凭据文案（如「私有仓库需要登录」）误判。判据：
 * 行内出现徽标语境词（徽标 / badge / header / 身份 / 用户名 / identity / user），
 * 或该行位于 identity/header 相关的 i18n key 上。
 */
const BADGE_CONTEXT = /徽标|身份|用户名|头像|badge|header|identity|userName|user-name|currentUser|header\./i;

/** i18n 键属于徽标命名空间（header.* / identity.*）。 */
const BADGE_KEY = /['"](header|identity)\.[A-Za-z0-9_]+['"]/;

/**
 * 自豁免：只放行**注释行里明确否定该概念**的语句（例如「不存在未登录」「禁止游客」）。
 * 判据必须同时满足：① 是注释行 ② 含否定词 ③ 否定的宾语紧跟违规词。
 * 此前用「含守卫/铁律/语义任一关键词就整行放行」过宽——注释里写「游客模式，未登录时
 * 显示提示」也会被放过（GUI 复审发现的真实漏洞）。现在必须是否定句式才算豁免。
 */
const NEGATION_HINT = /(不存在|禁止|不得|不算|不算作|拒绝|无此概念|没有这种|不允许|同一违规|不退化成|不回退成|不显示|不会出现|绝不).{0,24}(未登录|游客|访客|匿名|登录|授权)/;

const ALL = [...DIRECT_PATTERNS, ...SYNONYM_PATTERNS];

function walk(dir, out = []) {
  const abs = path.join(ROOT, dir);
  if (!existsSync(abs)) return out;
  for (const name of readdirSync(abs)) {
    if (name === 'node_modules' || name === 'vendor' || name.startsWith('.')) continue;
    const rel = path.join(dir, name);
    const st = statSync(path.join(ROOT, rel));
    if (st.isDirectory()) walk(rel, out);
    else if (/\.(js|mjs|cjs|json|ts|md|html)$/.test(name)) out.push(rel);
  }
  return out;
}

function collectFiles() {
  const files = [];
  for (const dir of SCAN_DIRS) walk(dir, files);
  for (const f of SCAN_FILES) if (existsSync(path.join(ROOT, f))) files.push(f);
  /* 出货产物也必须扫：download/ 里的单文件 html 是从 src/ 内联打出来的，
     源码文案改了但产物没重建时，用户拿到的仍是旧文案（GUI 复审指出的漏网）。 */
  for (const f of ['download/ST-pack-transfer-offline.html']) {
    if (existsSync(path.join(ROOT, f))) files.push(f);
  }
  return files;
}

function scan() {
  const hits = [];
  for (const rel of collectFiles()) {
    const text = readFileSync(path.join(ROOT, rel), 'utf8');
    if (text.includes('\u0000')) continue;
    const lines = text.split(/\r?\n/);
    lines.forEach((line, i) => {
      // 本守卫自身跳过（它必须能写出被禁的词）
      if (/login-state-guard/.test(rel)) return;
      /* 铁律 39 只管顶部身份徽标：命中的行必须是徽标语境（徽标/身份/用户名/header.*），
         否则视为外部服务凭据文案，不在管辖范围（用户裁定：Git 凭据另算，不得扩大化）。 */
      if (!BADGE_CONTEXT.test(line) && !BADGE_KEY.test(line)) return;
      const isComment = /^\s*(\/\/|\*|\/\*|<!--)/.test(line);
      // 注释里明确否定该概念时放行（必须是否定句式，不能只含关键词）
      const negatedComment = isComment && NEGATION_HINT.test(line);
      for (const { re, label } of ALL) {
        re.lastIndex = 0;
        if (!re.test(line)) continue;
        if (negatedComment) continue;
        hits.push({ file: rel, line: i + 1, label, text: line.trim().slice(0, 160) });
      }
    });
  }
  return hits;
}

const hits = scan();
const useJson = process.argv.includes('--json');

if (useJson) {
  console.log(JSON.stringify({ ok: hits.length === 0, hits }, null, 2));
} else if (hits.length === 0) {
  console.log(`登录态文案守卫通过：${collectFiles().length} 个文件无「未登录 / 游客」及其近义词。`);
} else {
  console.error(`登录态文案守卫失败：${hits.length} 处违反铁律 39（酒馆运行时一定有用户，不存在登录态缺失）。`);
  for (const h of hits.slice(0, 40)) {
    console.error(`  ${h.file}:${h.line}  [${h.label}]  ${h.text}`);
  }
  if (hits.length > 40) console.error(`  … 另有 ${hits.length - 40} 处`);
  console.error('');
  console.error('远程读取失败只允许陈述技术事实（URL 无效 / 仓库私有 / 凭据未登记 / 401-403-404），');
  console.error('并给出「去开发者页登记访问凭据」的动作指引；禁止推断用户身份状态。');
}

process.exit(hits.length === 0 ? 0 : 1);
