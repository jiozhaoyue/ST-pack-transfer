/**
 * dom-injection-guard:allow-file 视图以字符串拼装标记；
 * 来自用户 zip 的动态值（文件名 / 节点标签 / 包名）已在渲染处 escapeHtml。
 *
 * 工作台视图（正式实现）
 *
 * 只在两处与外部系统插接：
 *   · 数据：`setPackages` / `setHost` / `setStorage` / `setPackageNodes`
 *   · 动作：`actions.*`（拉取 / 生成 / 恢复 / 复制 / 删除 / 下载 / 设置 / 关闭）
 */

import { chartTreeFor, deriveExportOptions, annotateChatLinks, counterpartsOf, CHART_GROUPS } from '../core/chart-model.js';
import { createS3Client, buildBaseUrl, normalizePrefix, objectKey } from '../core/s3-client.js';
import { createWebdavClient } from '../core/webdav-client.js';
import { createTransferTarget } from '../core/transfer-target.js';
import { DEFAULT_CHUNK_SIZE, chunkKey, manifestKey, parseManifest } from '../core/transfer-plan.js';
import { createTransferRunner } from '../app/transfer-runner.js';
import {
  readBackupSet,
  readSetRegistry,
  removeSnapshotFromSet,
  restoreBackupSet,
} from '../app/backup-set-runner.js';
import { decryptBytes, isEncrypted } from '../core/s3-crypto.js';
import { mergeChartTrees } from '../core/merge-packages.js';
import { EXTENSION_MODES, GIT_MODES } from '../core/export-modes.js';
import { t } from '../i18n/index.js';
import { loadSettings } from './settings-store.js';
import { loadChartPrefs, saveChartPrefs, normalizeChartPrefs } from './chart-prefs.js';

/**
 * 教程锚点纯几何：用 overlay 自身矩形做基准，兼容宿主容器的 transform。
 * 返回 ring / card 的 overlay 局部坐标（clamp 在 overlay 内）。
 */
export function tutorialAnchor(targetRect, overlayRect, cardSize = { width: 330, height: 180 }) {
  const o = overlayRect;
  const t = targetRect;
  const width = Math.min(cardSize.width, Math.max(120, o.width - 24));
  const ring = {
    left: Math.max(0, t.left - o.left - 5),
    top: Math.max(0, t.top - o.top - 5),
    width: Math.max(0, Math.min(t.width + 10, o.width)),
    height: Math.max(0, Math.min(t.height + 10, o.height)),
  };
  let cardLeft = Math.min(Math.max(12, t.left - o.left), o.width - width - 12);
  let cardTop = t.top - o.top + t.height + 10;
  if (cardTop + cardSize.height > o.height) cardTop = t.top - o.top - cardSize.height - 10;
  cardLeft = Math.max(0, Math.min(cardLeft, o.width - width));
  cardTop = Math.max(0, Math.min(cardTop, o.height - cardSize.height));
  return { ring, card: { left: cardLeft, top: cardTop, width } };
}

export function createWorkbenchView({ actions = {}, qr = null } = {}) {

/* ═══════════════════════════════════════════════════════════════
   静态资源：四酒馆 icon（本地内置，无 CDN）
   · ST：public/img/logo.svg（#a11b1b 深红 + 白字）
   · Luker：public/img/apple-icon-512x512.png —— **纯黑剪影圆标**。
     注意 Luker 的 logo.svg 仍是 ST 那份（fork 未换），但提交 d44656a6b
     「chore: replace Luker logos and app icons」已把 app icon 换成自己的黑色圆标。
     所以 Luker 的图标**不能再用 ICON_ST**，且因是纯黑，深色底上必须垫浅底才看得见。
   · TauriTavern：词标（Tauri 青 #00a0b0 / Tavern 黄 #f8c034）
   · PureTavern：词标（紫 #584078）
   ═══════════════════════════════════════════════════════════════ */
const ICON_LUKER = 'data:image/png;base64,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';
const ICON_ST = 'data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0iMS4wIiBlbmNvZGluZz0iVVRGLTgiPz4NCjxzdmcgaWQ9InN2ZzEiIHdpZHRoPSIzMjkuMzUiIGhlaWdodD0iMzA3LjY0IiB2ZXJzaW9uPSIxLjEiIHZpZXdCb3g9IjAgMCAzMjkuMzUgMzA3LjY0IiB4bWw6c3BhY2U9InByZXNlcnZlIiB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciPjxnIGlkPSJsYXllcjEiIHRyYW5zZm9ybT0idHJhbnNsYXRlKC03NzkuNDIgLTcuNTUxOSkiPjxwYXRoIGlkPSJwYXRoOSIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoNDI5LjgzIC0yLjI2ODIpIiBkPSJtNjQ3LjggMTguMi0xLjkgMy41LTQ1IDAuMS0zNi41IDQyLjZjLTIwLjItMTIuMy00My0wLjctNDguNyA5LjgtMSAxLjgtMS40IDEuNS01LjktMy4xLTE0LjItMTUtMzQuMi0xMS4xLTM5LjctOC40LTQuNyAyLjMtNC45IDIuMy02LjYgMC41LTEyLjMtMTMuOC0yNC4zLTI3LjctMzYuNC00MS41bC00NC4zLTAuMS0yLTMuMmMtOC4xLTEyLjktMjguMS05LjItMzAuOSA1LjctMy40IDE4LjEgMjIuNCAyOC4xIDMxLjEgMTEuOGwxLjgtMy4yaDM5LjNsMzQgMzljLTIuNyA1LjQtNiAxMC42LTcuMyAxNi42LTAuNSAzLjItMS40IDQuMy00LjggNi4zLTUgMy05LjIgNy4xLTEzLjUgMTEuMS0xMC42IDAuMS0yMy45IDEuNi0yNS42LTEyLTAuNC0xNC4yLTEzLjktMjAuNC0yNC43LTE0LjctMTEuOSA2LjMtMTEuNyAyNC4zIDAuNCAzMC4xIDQuMiAyIDEwLjggMi4xIDE0LjUgMC4yIDcuNS0zLjkgNC45IDcuNCAyMS41IDcuNCA2LjIgMCA2LjkgMC4yIDYuMiAxLjgtMSAxMy4xLTMuNiAxMC44LTEwLjIgMzguOGwtMjQuNSAwLjYtNC4yLTQuNGMtMTEuOC0xMi42LTI5LjYtNS41LTI5LjYgMTAuNSAwIDE2LjMgMjAuMiAyNC42IDMxLjMgOC4xbDIuOS00LjMgMjQuMiAwLjZjNS43IDI1LjUgMTAuMiAxNy4yIDcuNyAyNy4xLTEuOSAxOC4xLTYuOCAxMy40LTIxLjcgMTMuNGwtMTIgOC45Yy0yNy4yLTguMi0zMy4xIDIxLjYtMTguMyAyOS4xIDExLjcgNiAyNC45LTEuOCAyNC45LTE0LjYgMC01LjEgMC4xLTUuNCA0LjctOC45IDYtNS4xIDE0LjMtMy4zIDIxLjYtMyA1LjMgOS42IDEyLjMgMTguNiAyNCAyMC4xIDkuMSAxLjIgNC40IDUuOSAxNC41IDE4bC0zMS45IDM2LjRoLTMwLjZsLTIuNC0zLjdjLTYuMy05LjUtMjEuOC0xMC43LTI4LjcgMS4zLTggMTQgNy4xIDI5LjkgMjEuMyAyMy41IDMuOC0xLjcgOS41LTcuMiA5LjUtOS4yIDEyLTEuNiAyNC40LTAuOSAzNi41LTAuOWwxNy40LTIwLjFjMTQuMy0xNi41IDE3LjgtMjAgMTkuNS0xOS42IDIwLjQgNS40IDMyLjQgMCA0NS43LTE0LjYgMi45IDMuOCAxNyAyMC4xIDM5IDE0LjggNi45LTEuNyA3LTEuNyA4LjcgMC4zIDExLjIgMTMgMjIuNSAyNiAzMy43IDM5bDM2LjIgMC4xIDIuNCAzLjhjOSAxNCAzMi4yIDguMSAzMC43LTEwLjQtMS41LTE4LjQtMjMuOC0xOS4yLTMwLjgtNy45bC0yLjIgMy41aC0zMC43bC0zMi0zNy4xYzQuMS00LjggNy4yLTEwIDkuMi0xNiAxLjMtNC4xIDE3IDEuNiAyOS42LTIxLjkgMTAuNi0wLjIgMjUuNi0xLjQgMjcuMSAxMi40IDAgMTIuOSAxMy4yIDIwLjYgMjQuOSAxNC42IDE0LjgtNy41IDExLjEtMzkuNy0xOC4zLTI5LjEtMTAuMy04LjItOS42LTguOS0yMS43LTguOS0xNC4zIDEuMi05LjYtNS42LTEyLjEtMTUuMS0yLjUtOC4zIDEuNy0xLjcgNy40LTI1LjloMjUuNmwxLjIgM2M1LjggMTMuOSAzMiAxMy41IDMyLTcuMSAwLTE5LjEtMjMuNi0yMS4zLTMwLjQtOS44bC0xLjcgMi45Yy00LjctMC40LTI2LjUgMS44LTI2LjktMi4zIDAtMTAuMy03LjctMTcuNy05LTM3LjcgNi43IDAgMTIuOSAwLjUgMTguMi00LjcgNS4zLTQgNi4zLTQuNSA4LTMuNCAxMi43IDcuOSAzMy40LTkuNiAyMS4zLTI1LjQtOS41LTEyLjUtMzEuNC01LjctMzAuNCAxMS4yLTAuNCAxMi4zLTE0LjMgMTEuMy0yMy4zIDExLjMtNC44LTQuMy05LjYtOC45LTE1LjItMTIuMS04LjktNC43LTIuNi03LjctMTIuNi0yMS43IDExLjItMTMgMjIuMy0yNi4xIDMzLjUtMzkuMWg0MGwyIDMuMmMxMCAxNS44IDM1LjUgNS40IDMwLjUtMTMuMS00LjgtMTgtMjQtMTUuNS0zMC41LTQuOHptLTg0LjIgNTkuNWM2LjQgNy4xIDguMyAxNS45IDUuNSAyNS4yLTEuNSA1LjEtOC4yIDEyLjYtMTMuMyAxNC45LTE0LjggNi43LTIuNy0xMy4xLTEzLjUtMTMuMS00LjggMC01LjYgMi00LjEgMTAuMSAxLjEgNi40IDAuNCAxMi42LTAuNSAxOSAyLjggMCA4LjcgMS44IDEwLjUtMC4yIDAuMy0wLjUgMS44LTQgNC4xLTQuNCAyMS4zLTMuNCAyNy4xLTI2LjYgMjgtMjYuNiAyLjEgMCAyNC44IDE3LjcgMTMuOCAzNy4yLTYuNS0xLjgtMjEuNi0yMS43LTI0LjgtNy40IDAgMy43IDIyLjMgMTkuMyAyMS41IDI2LjUtMSA5LjMgNS4zIDkuNyA3LjkgNy4xIDEuMy0xLjMgMS42LTMuMyAxLjQtMTAgMS40LTMxLjQgMTAuMyAyOC4zLTEuNiAyMi41LTYuNC01LjYtMjAtOC42LTI0LjgtNS40LTMuOSAyLjUtNC4yIDEwLjYgMy44IDkuMSA3LjUtMS40IDE1LjcgMy4zIDE5LjIgMTEgNi41IDE0LjMgMi40IDMwLjUtOS4xIDM1LjctMTcuNSA3LjktMi42LTQ2LjYtNTQuNi0xMi45LTUuOSA1LjItNy4yIDguMS00LjggMTAuNiAzLjggMi43IDI3LjUtOS45IDMyLjUtMTEuOSAxMi4zIDUuNCAxNC44IDM1LTcuNSA0Mi42LTEyLjQgNC4yLTI1LjQtMS40LTMxLjQtMTMuNC0yLjMtNC41LTIuMy01LTIuNi00OS4zdi04NGMwLjQtMjMuOCAxLTI2LjIgNy42LTMzLjEgOS4zLTkuNyAyNi0xMS44IDM2LjggMC4yem0tNTUuMyAxNjMuM2MtMC4xIDUuOS05LjggMTcuOC0yNC41IDE3LjgtMTYuMiAwLTQxLjktMjEuNy0xMC45LTUzLjUgNi43IDcuMSAxMS43IDE2LjEgMTkuOSAyMS42IDcuNSA0LjcgMTAuNS0xLjkgOC4xLTUuNi0xLTEuNS0xMC40LTEyLjctMTYuNi0xOS4xIDAuMS02LjIgMC0xMy4xIDAtMTkuMy0wLjcgMC04LjctMC4yLTkgMC0wLjMgMC4zLTAuNSA2LjEtMC41IDEwLTAuOSA5LjQtMjEuNyA4LjgtMjUuMiAzNC42LTEuNCA5LjktMTYuNi0xLTE5LjEtOS40LTEuNS01LjItMS41LTE2LjQgMC0yMS42IDMuMy0xMC45IDE3LjMtMTUuMyAyMS4yLTE2LjQtMi4xLTIuNS00LjgtNC45LTUuOS04LjEgMC0zLjgtMTcuMyA5LjgtMTguNiA3LjgtOS40LTE0LjYgMi4xLTUyLjggMS4xLTIyLjItMC4zIDguMiAwLjcgMTAuMiA1IDEwLjIgMy42IDAgNC45LTIuNCA0LjItNy42LTAuNi00LjMgOC43LTI1LjUgMjEuMS0yNS41LTQtMTkuMi0yNCAxNC44LTI3LTAuNy0zLjYtMTguNyAxNS43LTMwLjIgMTYuNS0zMC4yIDAuNSAwIDUuMyAxNS40IDE3LjUgMjIuNSA3LjggNC42IDE2LjIgNy40IDI1LjIgNy40LTMuOC0yNS4xIDQuOS0yOC45LTQuMi0yOC45LTkgMC0xLjggMTcuOS0xMS44IDE0LjUtMTQuMi00LjktMjAuOS0yMi4xLTEzLjgtMzUuNiAxMS42LTIyLjIgNDIuOS0xNC4xIDQ0LjggMC42eiIgZmlsbD0iI2ExMWIxYiIvPjxwYXRoIGlkPSJwYXRoMiIgdHJhbnNmb3JtPSJ0cmFuc2xhdGUoNDI5LjgzIC0yLjI2ODIpIiBkPSJtNDYxLjMgMjE3LjdjLTIwLTEtMTktMC40LTE5LTEwLjEgMC00LjQgMC40LTcuOCAwLjgtNy41czExLjEgMC44IDIzLjggMS4xYzI3LjkgMC44IDI2LjkgMS4xIDI2LjktOS43di03LjNoLTE3LjVjLTI1LjEgMC0zMC40LTIuMS0zMy43LTEzLjQtMi40LTguMS0xLjUtMjQuNSAxLjUtMjkuNCA0LjMtNi45IDcuNy04LjEgMjUuMS04LjkgOS43LTAuNCAxNS43LTAuNiAzOSAwLjV2MTUuN2gtMTguOWMtMTguMyAwLTIzLjYgMC43LTI1LjMgMy4zLTEuMyAyLTAuOSAxMC4yIDAuNiAxMi4yIDMuNSA0LjggMzEuMy0wLjMgNDEuNSA1LjQgNi45IDMuOCA3LjkgOC42IDguMyAyMS40IDAuNCAxMi42LTAuMiAxNy4xLTQuNCAyMS40LTYuMSA2LjItMTIuNyA2LjktNDguOSA1LjF6bTc4LjktMC43YzAuNS0yMi42LTAuMy00NS4yLTAuNC02Ny44bC0yNS41IDAuMnYtMTcuMmg3Mi41bDAuNiAxNi40LTI1LjYgMC42Yy0wLjUgMjIuMiAwLjUgNDUuNS0wLjMgNjcuOC0wLjMgMy4zLTIxLjMgMi4zLTIxLjMgMHoiIGZpbGw9IiNmZmYiLz48L2c+PC9zdmc+DQo=';
const ICON_TT = 'data:image/png;base64,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';
const ICON_PT = 'data:image/png;base64,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';

const HOSTS = {
  luker:{ full:'Luker', icon:ICON_LUKER, readable:true },
  pt:{ full:'PureTavern', icon:ICON_PT, readable:true },
  tt:{ full:'TauriTavern', icon:ICON_TT, readable:true },
  st:{ full:'SillyTavern', icon:ICON_ST, readable:false }
};

/* ── 小型线性图标 ── */
const ICO = {
  chat:'<path d="M4 5h16v11H8l-4 4z"/><path d="M8 9h8M8 12h5"/>',
  user:'<circle cx="12" cy="8" r="3.2"/><path d="M5 20c0-3.5 3.1-5.5 7-5.5s7 2 7 5.5"/>',
  book:'<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3z"/><path d="M8 4v16"/>',
  image:'<rect x="4" y="5" width="16" height="14" rx="2"/><circle cx="9" cy="10" r="1.4"/><path d="M5 17l4-4 3 3 2-2 5 5"/>',
  clip:'<path d="M9 12l5-5a3 3 0 0 1 4 4l-6 6a4 4 0 0 1-6-6l5-5"/>',
  sliders:'<path d="M4 7h10M18 7h2M4 12h4M12 12h8M4 17h12M20 17h0"/><circle cx="16" cy="7" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="17" r="2"/>',
  puzzle:'<path d="M10 5a2 2 0 1 1 4 0v1h3v3h1a2 2 0 1 1 0 4h-1v3h-3v1a2 2 0 1 1-4 0v-1H7v-3H6a2 2 0 1 1 0-4h1V6h3z"/>',
  brain:'<path d="M9 5a3 3 0 0 0-3 3 3 3 0 0 0-1 5 3 3 0 0 0 2 5 3 3 0 0 0 5 1V5z"/><path d="M15 5a3 3 0 0 1 3 3 3 3 0 0 1 1 5 3 3 0 0 1-2 5 3 3 0 0 1-5 1V5z"/>',
  archive:'<rect x="4" y="5" width="16" height="4" rx="1"/><path d="M6 9h12v10H6z"/><path d="M10 13h4"/>',
  bolt:'<path d="M13 3L5 14h6l-1 7 8-11h-6z"/>',
  lock:'<rect x="6" y="10" width="12" height="9" rx="2"/><path d="M9 10V8a3 3 0 0 1 6 0v2"/>',
  shield:'<path d="M12 4l7 3v5c0 4-3 7-7 8-4-1-7-4-7-8V7z"/>',
  folder:'<path d="M4 6h6l2 2h8v11H4z"/>',
  file:'<path d="M7 4h7l4 4v12H7z"/><path d="M14 4v4h4"/>',
  cloud:'<path d="M7 18a4 4 0 0 1 0-8 5 5 0 0 1 9.6-1.4A3.5 3.5 0 0 1 18 18z"/>',
  clock:'<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  db:'<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v12c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12c0 1.7 3.1 3 7 3s7-1.3 7-3"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>',
  unknown:'<circle cx="12" cy="12" r="8"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.2 2.4c-.7.3-1 .8-1 1.6"/><path d="M11.8 16.5h.1"/>'
};
function svg(name, cls){ return '<svg class="'+(cls||'tree-ico')+'" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">'+(ICO[name]||ICO.file)+'</svg>'; }

/* ── 数据模型 ── */
function node(id,label,mb,suggest,opts){
  opts = opts || {};
  return { id, label, mb, suggest, icon:opts.icon||'folder', children:opts.children||[],
    checked: opts.checked!==undefined ? opts.checked : (suggest==='keep'||suggest==='private'),
    expanded: !!opts.expanded, badge:opts.badge||'', note:opts.note||'', privateConfig:!!opts.privateConfig,
    uploadable:!!opts.uploadable };
}
function hostNodes(host){
  return { unavailable: !(HOSTS[host] || {}).readable, nodes: state.hostTree || [] };
}
function packageNodes(pkg){
  const nodes = chartTreeFor(pkg, state.extensionMode);
  /* 角色卡 / 聊天目录按名称配对；配不上的标「未匹配」，不猜。 */
  annotateChatLinks(nodes, t('link.unmatched'));
  /* 私有件「传云」只在 ST/Luker 有原生 files 接口时出现；宿主树没有源包字节，故不标。 */
  const canUpload = state.mode!=='web' && (state.host==='st' || state.host==='luker');
  if(canUpload){
    walk(nodes,(n)=>{ if(n.leaf && n.privateConfig) n.uploadable=true; });
  }
  return { unavailable: false, unrecognized: !!pkg.unrecognized, nodes };
}

const INITIAL_PACKAGES = [];

/* 分卷单个卷容量上下限（MB）。低于下限没有意义，高于上限没必要再拆。 */
const SPLIT_MIN = 32, SPLIT_MAX = 2048;

const LOG_STORAGE_KEY = 'st-pack-transfer:audit-log';
const DEFAULT_LOG_MAX_ENTRIES = 500;
const LOG_MAX_CHARS = 400_000;
let logPersistTimer = 0;

/** 日志上限（设置项，默认 500；夹在 50–5000）。 */
function logLimit(){
  try{
    const n=Number(loadSettings().logMaxEntries);
    if(Number.isFinite(n)) return Math.max(50,Math.min(5000,Math.round(n)));
  }catch{ /* 隐私模式：用默认 */ }
  return DEFAULT_LOG_MAX_ENTRIES;
}

function loadPersistedLog() {
  try {
    if (typeof localStorage === 'undefined') return [];
    // 默认每次加载插件清空；设置里可关闭。
    if (loadSettings().clearLogOnLoad !== false) {
      localStorage.removeItem(LOG_STORAGE_KEY);
      return [];
    }
    const raw = localStorage.getItem(LOG_STORAGE_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    return list
      .filter((e) => e && typeof e.msg === 'string' && typeof e.level === 'string')
      .slice(-logLimit());
  } catch {
    return [];
  }
}

function persistLog() {
  if (typeof localStorage === 'undefined' || logPersistTimer) return;
  logPersistTimer = setTimeout(() => {
    logPersistTimer = 0;
    try {
      let list = state.log.slice(-logLimit());
      let raw = JSON.stringify(list);
      while (raw.length > LOG_MAX_CHARS && list.length > 1) {
        list = list.slice(1);
        raw = JSON.stringify(list);
      }
      localStorage.setItem(LOG_STORAGE_KEY, raw);
    } catch {
      // 配额不足/隐私模式：日志仍在内存中，不影响本次会话
    }
  }, 250);
}

const CHART_LAYOUT_KEY = 'stpt.chartLayout';

function normalizeChartLayout(input){
  const out = { col: 0.5, rows: [] };
  if(input && typeof input === 'object'){
    const col = Number(input.col);
    if(Number.isFinite(col)) out.col = Math.max(0.2, Math.min(0.8, col));
    if(Array.isArray(input.rows)) out.rows = input.rows.map((n)=>Math.max(0.15, Math.min(0.85, Number(n)||0.5)));
  }
  return out;
}
function loadChartLayout(){
  try {
    const raw = localStorage.getItem(CHART_LAYOUT_KEY);
    return normalizeChartLayout(raw ? JSON.parse(raw) : null);
  } catch { return normalizeChartLayout(null); }
}
function persistChartLayout(){
  try { localStorage.setItem(CHART_LAYOUT_KEY, JSON.stringify(state.chartLayout)); } catch { /* 仅本会话 */ }
}

let chartPrefs = typeof localStorage !== 'undefined' ? loadChartPrefs() : normalizeChartPrefs(null);

const state = {
  host:'luker', mode:'plugin', view:'desktop', mainView:'chart', mobileView:'chart', pane:'workbench', zone:'import',
  extTab:'install', extEntries:[], extResults:[], extLog:[], extRunning:false, extInstalled:null, extManifestPrefill:[],
  source:{ type:'host', pkgId:null }, target:'SillyTavern', targetManual:false,
  delta: 'overwrite', splitMb: chartPrefs.splitMb,
  compression: chartPrefs.compression,
  extensionMode: chartPrefs.extensionMode,
  extUncheckedMode: 'none',
  gitMode: chartPrefs.gitMode,
  keepDev: chartPrefs.keepDev,
  packages: INITIAL_PACKAGES.map(p=>({...p})),
  selectedPkgs:new Set(), mergeMode:false, privateFiles:[], expanded:{}, collapsedVol:{}, sel:{}, log:loadPersistedLog(), logLevel:'ALL',
  noTrafficPrompt:false,
  volMaxKey:null, volPath:{},
  task:null, pendingExports:[],
  chartFmt:{}, chartLayout:loadChartLayout(),
  filenameTemplate: chartPrefs.filenameTemplate,
  prefMode:false, prefDraft:null, prefAppliedPkgs:new Set(),
  storage:{ browser:null, host:null, page:null },
  cloud:{ provider:'s3', config:loadCloudConfig(), webdav:loadWebdavConfig(), busy:false, status:'', list:[] },
  sort:'time-desc', filter:'all', tutorialStep:0, tutorialOpen:false, tutorialKind:'basic',
  sourceKey:'host:luker', seq:{}, libraryExport:false,
  transfer:{ open:false, tab:'lan' },
  lan:{
    scanning:null, scanError:'',
    send:{ code:'', answer:'', phase:t('action.ready'), pct:0, detail:'', busy:false, done:false },
    recv:{ code:'', phase:t('action.waiting'), pct:0, detail:'', busy:false, done:false }
  }
};

/* ── 工具 ── */
function fmtMB(mb){
  const n=Number(mb)||0;
  if(n>=1024) return (n/1024).toFixed(1)+' GB';
  if(n>=1) return (Math.round(n*10)/10)+' MB';
  return Math.max(0,Math.round(n*1000))+' KB';
}
function hostIcon(host){ return (HOSTS[host]||{}).icon || HOSTS.luker.icon; }
function hostName(host){ return (HOSTS[host]||{}).full || t('filter.unknown'); }
function nowTime(){
  const d=new Date(); const p=(n,w=2)=>String(n).padStart(w,'0');
  /* 完整时间戳：日期 + 时刻 + 毫秒，审计场景必须可精确排序。 */
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())
    +' '+p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds())+'.'+p(d.getMilliseconds(),3);
}
function dtNow(){
  const d=new Date(); const p=n=>String(n).padStart(2,'0');
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'_'+p(d.getHours())+'-'+p(d.getMinutes())+'-'+p(d.getSeconds());
}
function log(level,msg){
  state.log.push({ level, msg, time:nowTime() });
  const limit=logLimit();
  while(state.log.length>limit) state.log.shift();
  persistLog();
  renderLog();
}
function logText(){
  const ua = typeof navigator !== 'undefined' ? (navigator.userAgent || '') : '';
  const lang = typeof navigator !== 'undefined' ? (navigator.language || '') : '';
  const head = [
    t('log.auditTitle'),
    t('log.auditExportedAt', { time: new Date().toISOString() }),
    t('log.auditContext', { host: state.host || '', mode: state.mode || '' }),
    t('log.auditLocale', { lang }),
    t('log.auditUa', { ua }),
    t('log.auditCount', { n: state.log.length }),
    '---',
  ].join('\n');
  return head + '\n' + state.log.map(l=>'['+l.time+'] ['+l.level+'] '+l.msg).join('\n');
}
function exportLog(){
  if (typeof document === 'undefined' || typeof URL === 'undefined') return;
  const blob = new Blob([logText()], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'ST-pack-transfer-log_' + dtNow() + '.txt';
  document.body.appendChild(a); // dom-scope:allow 下载锚点：临时 <a> 必须挂进文档 click() 才会触发下载
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  toast(t('toast.logExported'));
}
function toast(msg){
  // 宿主原生提示优先（酒馆顶部 toastr）；没有宿主时回退插件内浮层。
  const hostToast = globalThis.toastr;
  if (hostToast && typeof hostToast.info === 'function') {
    try {
      hostToast.info(msg, '', { positionClass: 'toast-top-center', timeOut: 3200 });
      return;
    } catch { /* 宿主 toastr 异常时回退 */ }
  }
  const el=document.getElementById('toast');
  el.textContent=msg; el.classList.add('show');
  clearTimeout(el._t); el._t=setTimeout(()=>el.classList.remove('show'),2400);
}
function findNode(nodes,id){
  for(const n of nodes){
    if(n.id===id) return n;
    const hit=findNode(n.children||[],id); if(hit) return hit;
  }
  return null;
}
function walk(nodes,fn){ for(const n of nodes){ fn(n); walk(n.children||[],fn); } }
/* 勾选与展开状态按「来源作用域」记忆：宿主一个作用域，每个包一个作用域。
   多张图表（多包 / 多卷）各自带自己的 scope，互不串。 */
function treeKey(scope,id){ return scope+'::'+id; }
function isChecked(n,scope){ const k=treeKey(scope,n.id); return state.sel[k]!==undefined ? state.sel[k] : !!n.checked; }
function setChecked(n,scope,val){ state.sel[treeKey(scope,n.id)]=val; walk(n.children||[],c=>{ state.sel[treeKey(scope,c.id)]=val; }); }
function syncAncestors(nodes,scope){
  for(const n of nodes){
    if(n.children && n.children.length){
      syncAncestors(n.children,scope);
      const vals=n.children.map(c=> (c.children && c.children.length) ? !!c._checked : isChecked(c,scope));
      const all=vals.every(Boolean), none=vals.every(v=>!v);
      n._indeterminate = !all && !none;
      n._checked = all;
    } else { n._checked = isChecked(n,scope); n._indeterminate=false; }
  }
}
function sumSelected(nodes,scope){
  let mb=0, count=0;
  for(const n of nodes){
    if(n.children && n.children.length){
      const r=sumSelected(n.children,scope); mb+=r.mb; count+=r.count;
    } else if(isChecked(n,scope)){ mb+=n.mb; count++; }
  }
  return { mb, count };
}
/* 包序号：导入区、导出区**各自独立编号**，按导入时间升序 01..N，
   前缀区分来源，所以两边都叫「包·导入01 / 包·导出01」也不会撞。删除后不重排。 */
function pkgSeq(){
  const map={};
  ['import','export'].forEach(z=>{
    state.packages.filter(p=>p.zone===z).slice()
      .sort((a,b)=>(a.ts||0)-(b.ts||0))
      .forEach((p,i)=>{ map[p.id]=(z==='import'?'I':'E')+String(i+1).padStart(2,'0'); });
  });
  return map;
}
function seqLabel(p){
  const raw=state.seq[p.id]||'--';
  const prefix=raw.startsWith('E')?t('zones.export'):t('zones.import');
  return prefix+seqNum(p);
}
function seqNum(p){ return (state.seq[p.id]||'--').replace(/^[IE]/,''); }
function visiblePackages(zone){
  let list=state.packages.filter(p=>p.zone===zone);
  if(state.filter && state.filter!=='all'){
    list=list.filter(p=> state.filter==='unknown' ? !!p.unrecognized : (!p.unrecognized && p.host===state.filter));
  }
  const key=state.sort;
  if(key==='time-desc') list.sort((a,b)=>(b.ts||0)-(a.ts||0));
  else if(key==='name') list.sort((a,b)=>a.name.localeCompare(b.name));
  else if(key==='size') list.sort((a,b)=>(b.mb||0)-(a.mb||0));
  return list;
}

function hostFilterHtml(){
  const opt=(v,label)=>'<option value="'+v+'"'+(state.filter===v?' selected':'')+'>'+label+'</option>';
  return '<label>'+t('filter.format')+' <select id="host-filter">'
    +opt('all',t('filter.all'))+opt('st','SillyTavern')+opt('luker','Luker')
    +opt('tt','TauriTavern')+opt('pt','PureTavern')+opt('unknown',t('filter.unknown'))
    +'</select></label>';
}

/* ── 视图形态与移动端左右切换 ── */
function detectView(){
  const w = typeof window !== 'undefined' ? window.innerWidth : 1024;
  return w <= 640 ? 'mobile' : 'desktop';
}
function syncView(){
  state.view = detectView();
  const app = document.getElementById('app');
  if(app) app.dataset.view = state.view;
}
/* 视图切换：桌面 = 存储图表 / 扩展管理（数据包列常显）；手机 = 存储图表 / 数据包 / 扩展管理。 */
function renderViewSwitch(){
  const host=document.getElementById('view-switch');
  if(!host) return;
  const mobile=state.view==='mobile';
  const items=[{id:'chart',label:t('view.chart')}];
  if(mobile) items.push({id:'zone',label:t('view.zone')});
  items.push({id:'extension',label:t('view.extension')});
  const active=mobile?state.mobileView:state.mainView;
  host.innerHTML=items.map(it=>'<button type="button" class="view-switch-btn'+(it.id===active?' active':'')+'" data-wbview="'+it.id+'">'+it.label+'</button>').join('');
}
function syncMainView(){
  state.view = detectView();
  const app = document.getElementById('app');
  if(app) app.dataset.view = state.view;
  const mobile = state.view === 'mobile';
  const primary = mobile ? state.mobileView : state.mainView;
  const chartCol=document.querySelector('.col-chart');
  const side=document.querySelector('.col-side');
  if(chartCol) chartCol.hidden = mobile && primary === 'zone';
  if(side) side.hidden = mobile && primary !== 'zone';
  const transferOpen = !!state.transfer.open;
  const chartCard=document.getElementById('chart-card');
  const extView=document.getElementById('extension-view');
  const transferView=document.getElementById('transfer-view');
  const showExt = !transferOpen && primary === 'extension';
  const showChart = !transferOpen && !showExt;
  if(chartCard) chartCard.hidden = !showChart;
  if(extView) extView.hidden = !showExt;
  if(transferView) transferView.hidden = !transferOpen;
  renderViewSwitch();
}

/* ── 渲染：头部 ── */
/* 目标平台固定四项 + 英文全称；图标只在标识处用品牌色环，面板本身不染色。 */
const TARGETS=[
  { value:'SillyTavern', host:'st' },
  { value:'Luker', host:'luker' },
  { value:'TauriTavern', host:'tt' },
  { value:'PureTavern', host:'pt' }
];
/** 宿主平台 → 目标平台默认值（偏好 target=auto 时生效）。 */
const HOST_TO_TARGET = { st:'SillyTavern', luker:'Luker', tt:'TauriTavern', pt:'PureTavern' };
/** 私有配置所属宿主（布局码）：Luker 边车 / TT 应用私有 / PT 兼容区；通用密钥返回空串。 */
function privateHostCode(path){
  const p=String(path||'').toLowerCase();
  if(/\.luker-state\.|(^|\/)(stats|macros)\.json$|_compat\/luker\//.test(p)) return 'l';
  if(/tauritavern-settings\.json|_tauritavern\/|_compat\/tt\//.test(p)) return 'tt';
  if(/_compat\/pt\//.test(p)) return 'pt';
  return '';
}
function targetHostCode(){
  const hit=TARGETS.find(x=>x.value===state.target);
  const code=hit?hit.host:'st';
  return code==='luker'?'l':code;
}
function privateIncompatible(path){
  const code=privateHostCode(path);
  if(!code) return false;
  return code!==targetHostCode();
}
function nodePrivateIncompatible(n){
  if(n.privateConfig && privateIncompatible(n.path)) return true;
  return (n.children||[]).some(nodePrivateIncompatible);
}
function targetForHost(hostKey){
  const pref = chartPrefs.target;
  if (pref && pref !== 'auto') {
    const hit = TARGETS.find(x=>x.host===pref);
    if (hit) return hit.value;
  }
  return HOST_TO_TARGET[hostKey] || 'SillyTavern';
}
function renderHeader(){
  const h=HOSTS[state.host];
  const isWeb=state.mode==='web';
  document.getElementById('app').dataset.host=state.host;
  const icon=document.getElementById('host-badge-icon');
  const gh=document.getElementById('host-badge-gh');
  icon.hidden=isWeb; gh.hidden=!isWeb;
  if(!isWeb){ icon.src=h.icon; icon.dataset.host=state.host; }
  const badge=document.getElementById('host-badge');
  badge.title = isWeb ? t('header.webTitle') : t('header.hostTitle', { host: h.full });
  document.getElementById('host-badge-text').textContent = isWeb ? t('header.web') : t('header.plugin', { host: h.full });
  renderTargetPicker();
}
function renderTargetPicker(){
  const cur=TARGETS.find(t=>t.value===state.target)||TARGETS[0];
  const bi=document.getElementById('target-btn-icon');
  bi.src=hostIcon(cur.host); bi.dataset.host=cur.host;
  document.getElementById('target-btn-text').textContent=cur.value;
  const hostTag=document.getElementById('target-btn-host');
  const isHostNow = state.mode!=='web' && cur.host===state.host;
  if(hostTag){ hostTag.hidden=!isHostNow; hostTag.textContent=isHostNow?t('target.hostSuffix'):''; }
  const app=document.getElementById('app');
  if(app) app.setAttribute('data-target-host', cur.host);
  document.getElementById('target-pop').innerHTML=TARGETS.map(opt=>{
    const isHost = state.mode!=='web' && opt.host===state.host;
    return '<button class="picker-item" role="option" data-target="'+opt.value+'" aria-selected="'+(opt.value===state.target)+'">'
      +'<img class="picker-ico" data-host="'+opt.host+'" src="'+hostIcon(opt.host)+'" alt="">'
      +'<span>'+opt.value+'</span>'
      +(isHost?'<span class="host-tag">'+t('target.hostSuffix')+'</span>':'')
      +'</button>';
  }).join('');
}
/* preview 传入时只算「输入中的草稿值」，不读 state —— 未确认前图表不得重算。 */
function updateSplitSim(preview){
  const sim=document.getElementById('split-sim');
  if(!sim) return;
  const value = preview===undefined ? state.splitMb : preview;
  if(value===''){ sim.textContent=''; sim.style.color=''; return; }
  const raw=Number(value);
  if(!isFinite(raw)||raw<=0){ sim.textContent=t('splitSim.invalid'); sim.style.color='var(--optional)'; return; }
  if(raw<SPLIT_MIN){ sim.textContent=t('splitSim.min',{n:SPLIT_MIN}); sim.style.color='var(--optional)'; return; }
  if(raw>SPLIT_MAX){ sim.textContent=t('splitSim.max',{n:SPLIT_MAX}); sim.style.color='var(--optional)'; return; }
  sim.style.color='';
  const pkgs=chartTargets().filter(t=>t.pkg);
  if(!pkgs.length){ sim.textContent=t('splitSim.estimate'); return; }
  let n=0, over=false;
  pkgs.forEach(item=>{
    const v=volumesOf(item.pkg,packageNodes(item.pkg).nodes);
    n+=v.length; if(v.some(x=>x.over)) over=true;
  });
  sim.textContent=t('splitSim.parts',{n})+(over?' '+t('splitSim.over'):'');
}

/* ── 渲染：图表 ── */
/* 图表目标：勾了包 → 每个勾选的包一组图表；否则看当前来源。
   宿主数据不再作为图表卡出现——它只在配额折叠区里出现一次（禁止重复元素）。 */
function chartTargets(){
  const sel=[...state.selectedPkgs].map(id=>state.packages.find(p=>p.id===id)).filter(Boolean);
  if(sel.length) return mergeActive(sel) ? [{merge:true,pkgs:sel}] : sel.map(p=>({pkg:p}));
  if(state.source.type==='package'){
    const p=state.packages.find(x=>x.id===state.source.pkgId);
    if(p) return [{pkg:p}];
  }
  return [];
}
/* 合并模式：≥2 个包勾选时才生效；只有一个包时没有可合并的对象。 */
function mergeActive(sel){
  return !!state.mergeMode && sel.length>=2;
}
function mergeScope(pkgs){
  return 'merge:'+pkgs.map(p=>p.id).join(',');
}
function mergedTotalMb(pkgs){
  return pkgs.reduce((sum,p)=>sum+(Number(p.mb)||0),0);
}
function mergedNodes(pkgs){
  return mergeChartTrees(pkgs.map(p=>({pkgId:p.id,nodes:packageNodes(p).nodes})));
}
function scopeOf(t){ return t.host ? ('host:'+state.host) : ('pkg:'+t.pkg.id); }

function splitLimit(){
  const raw=Number(state.splitMb);
  if(state.splitMb===''||!isFinite(raw)||raw<=0) return 0;
  return Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, raw));
}
/* 分卷要能下钻：某个分类比单卷上限还大时，继续拆到它的子项，
   否则「聊天记录 837 MB」这种节点会整块撑破一条 300 MB 的卷。 */
function splitChunks(nodes,limit,path){
  const out=[];
  for(const n of nodes){
    if(n.mb>limit && n.children && n.children.length){
      out.push(...splitChunks(n.children,limit,path.concat([n])));
    }else{
      out.push({ path, node:n, mb:n.mb });
    }
  }
  return out;
}
/* 把某一卷的碎片重建成一棵完整的树（祖先按需补出来，体积按卷内实际重算）。 */
function buildVolumeTree(chunks){
  const roots=[], idx=new Map();
  for(const c of chunks){
    let container=roots, keyPath='';
    for(const anc of c.path){
      keyPath+='/'+anc.id;
      let hit=idx.get(keyPath);
      if(!hit){ hit={...anc, children:[], mb:0}; idx.set(keyPath,hit); container.push(hit); }
      container=hit.children;
    }
    container.push({...c.node, children:(c.node.children||[]).map(x=>({...x, children:[]}))});
  }
  const recompute=arr=>{
    for(const n of arr){
      if(n.children && n.children.length){
        recompute(n.children);
        n.mb=n.children.reduce((a,c)=>a+c.mb,0);
      }
    }
  };
  recompute(roots);
  return roots;
}
function volumesOf(pkg,nodes){
  return volumesFor(Number(pkg.mb)||0,nodes);
}
/* 合并模式没有单一 pkg，体积按各包之和传入。 */
function volumesFor(totalMb,nodes){
  const total=totalMb, limit=splitLimit();
  if(!limit || total<=limit) return [{i:1,n:1,mb:total,nodes}];
  const chunks=splitChunks(nodes,limit,[]);
  const buckets=[];
  let cur={mb:0,chunks:[]};
  for(const c of chunks){
    // 0 字节节点不单独开卷（否则会多出一张空图表）
    if(cur.chunks.length && c.mb>0 && cur.mb+c.mb>limit){ buckets.push(cur); cur={mb:0,chunks:[]}; }
    cur.chunks.push(c); cur.mb+=c.mb;
  }
  if(cur.chunks.length) buckets.push(cur);
  return buckets.map((b,i)=>({ i:i+1, n:buckets.length, mb:Math.round(b.mb), nodes:buildVolumeTree(b.chunks),
    over: b.mb>limit+0.5 }));
}
function renderQuota(){
  const head=document.getElementById('quota-head');
  if(!head) return;
  const gb=bytes=>(bytes/1073741824).toFixed(1)+' GB';
  // 宿主存储页能力由控制器探测后经 setStorage 传入；未提供时不伪造入口。
  const page=state.storage.page || { available:false };
  const row=(label,ico,cell,emptyText,kind,showPageHint=true)=>{
    const openable=!!page.available;
    const hasReading=!!cell && typeof cell.used==='number';
    const total=hasReading && typeof cell.total==='number' ? cell.total : 0;
    const pct=hasReading && total>0 ? Math.max(0,Math.min(100,Math.round(cell.used/total*100))) : 0;
    let val;
    if(!hasReading) val=emptyText;
    else if(total<=0) val=gb(cell.used)+' · '+t('quota.unlimited');
    else val=gb(cell.used)+' / '+gb(total)+' · '+pct+'%';
    return '<button type="button" class="quota-row'+(hasReading?'':' is-disabled')+((openable||!showPageHint)?'':' is-nopage')+'"'
      +' data-quota-kind="'+kind+'" title="'+escapeHtml(openable?t('quota.openHostPage'):t('quota.noHostPage'))+'">'
      +'<span class="q-label">'+svg(ico,'tree-ico')+label+'</span>'
      +'<span class="quota-bar"><span class="quota-fill'+(pct>85?' warn':'')+'" style="width:'+pct+'%"></span></span>'
      +'<span class="quota-val">'+val+'</span>'
      +((openable||!showPageHint)?'':'<span class="quota-nopage">'+t('quota.noHostPageShort')+'</span>')
      +'</button>';
  };
  const hostReadable=!!(HOSTS[state.host]||{}).readable;
  const isWeb=state.mode==='web';
  // 独立 Web 态没有宿主，不伪造「Luker 宿主配额」行，也不给浏览器行挂「宿主未提供」尾巴。
  head.innerHTML = row(t('quota.browser'),'db',state.storage.browser,t('quota.browserEmpty'),'browser',!isWeb)
    + (isWeb ? '' : row(t('quota.host'),'shield',hostReadable ? state.storage.host : null,t('quota.hostEmpty'),'server'));
}
function renderTreeRows(nodes,depth,scope,readonly,tools,totalMb,drill,colorMap,rootId,mbMap){
  let out='';
  for(const n of nodes){
    const root = depth===0 ? n.id : rootId;
    const cIdx = colorMap ? (colorMap[root]||0) : 0;
    const colorCls = cIdx ? volColorClass(cIdx) : '';
    if(tools && tools[n.id]) out+=tools[n.id];
    const key=treeKey(scope,n.id);
    const expanded=state.expanded[key]!==undefined ? state.expanded[key] : !!n.expanded;
    const hasKids=n.children && n.children.length;
    const checked = hasKids ? !!n._checked : isChecked(n,scope);
    const indeterminate = hasKids && !!n._indeterminate;
    const ind=Math.min(depth,8)*15;
    const pct = totalMb>0 ? Math.max(0,Math.min(100,Math.round(((mbMap?mbMap.get(n):Number(n.mb))||0)/totalMb*100))) : 0;
    const pillCls=n.suggest==='keep'?'keep':n.suggest==='optional'?'optional':n.suggest==='drop'?'drop':'unknown';
    const pillText=n.suggest==='keep'?t('tree.suggestKeep'):n.suggest==='optional'?t('tree.suggestOptional'):n.suggest==='drop'?t('tree.suggestDrop'):t('tree.suggestUnknown');
    const inMax=!!drill;
    const toggleHtml=hasKids
      ? (inMax
        ? '<button class="tree-toggle vol-drill" data-voldrill="'+n.id+'" aria-label="'+t('chart.drill')+'" title="'+t('chart.drill')+'">'
          +'<svg class="chev" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7"/></svg></button>'
        : '<button class="tree-toggle" data-node="'+n.id+'" aria-label="'+t('chart.expand')+'">'
          +'<svg class="chev" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7"/></svg></button>')
      : '<button class="tree-toggle empty" aria-hidden="true"></button>';
    out+='<div class="tree-row'+(expanded?' expanded':'')+'" data-id="'+n.id+'" style="padding-left:'+(6+ind)+'px">'
      +toggleHtml
      +'<input class="tree-check" type="checkbox" data-check="'+n.id+'"'+(checked?' checked':'')+(indeterminate?' data-ind="1"':'')+(readonly?' disabled':'')+'>'
      +(depth===0 && colorCls ? '<span class="tree-dot '+colorCls+'" aria-hidden="true"></span>' : '')
      +svg(n.icon,'tree-ico')
      +'<span class="tree-label'+(inMax&&hasKids?' is-drill':'')+'"'+(inMax&&hasKids?' data-voldrill="'+n.id+'"':'')+' title="'+n.label+'">'+n.label+(n.badge?'<span class="sub">'+n.badge+'</span>':'')+(n.note?'<span class="sub">'+n.note+'</span>':'')+(nodePrivateIncompatible(n)?'<span class="sub is-incompat" title="'+t('private.incompatibleHint')+'">'+t('private.incompatible')+'</span>':'')+'</span>'
      +'<span class="tree-pill '+pillCls+'">'+pillText+'</span>'
      +(hasKids && !readonly ? '<span class="row-bulk">'
        +'<button data-suball="all" data-subnode="'+n.id+'" title="'+t('chart.selectAll')+'">✓</button>'
        +'<button data-suball="none" data-subnode="'+n.id+'" title="'+t('chart.selectNone')+'">✕</button>'
        +'<button data-suball="invert" data-subnode="'+n.id+'" title="'+t('chart.invert')+'">⇄</button>'
      +'</span>' : '')
      +'<span class="tree-occ" aria-hidden="true"><i class="'+colorCls+'" style="width:'+pct+'%"></i></span>'
      +'<span class="tree-size">'+fmtMB(n.mb)+'</span>'
      +(drill && hasKids ? '<button class="tree-mini vol-drill" data-voldrill="'+n.id+'" title="'+t('chart.drill')+'">›</button>' : '')
      +'</div>';
    if(hasKids && expanded && !inMax){
      out+='<div class="tree-children">'+renderTreeRows(n.children,depth+1,scope,readonly,tools,totalMb,drill,colorMap,root,mbMap)+'</div>';
    }
  }
  return out;
}

/* ── 图表可视化：Luker 式单条多色 + 圆环；颜色说明只在下方列表 ── */
const CHART_FMTS = ['bar','donut'];
const VC_PALETTE_SIZE = 12;
function chartFmtOf(key){
  const fmt = state.chartFmt[key];
  return CHART_FMTS.includes(fmt) ? fmt : 'bar';
}
function volChartData(nodes, mbMap){
  const items = (nodes||[])
    .map(n=>({ id:String(n.id||''), label:String(n.label||''), mb:mbMap?(mbMap.get(n)||0):(Number(n.mb)||0) }))
    .filter(x=>x.mb>0)
    .sort((a,b)=>b.mb-a.mb);
  return { items, total: items.reduce((a,b)=>a+b.mb,0) };
}
/** 当前勾选体积：分支=其已勾选叶子之和，叶子=勾选则计体积。 */
function selectedMbMap(nodes, scope){
  const map=new Map();
  const visit=(n)=>{
    if(n.children && n.children.length){
      const mb=sumSelected(n.children,scope).mb;
      map.set(n,mb);
      return mb;
    }
    const mb=isChecked(n,scope)?(Number(n.mb)||0):0;
    map.set(n,mb);
    return mb;
  };
  (nodes||[]).forEach(visit);
  return map;
}
function volColorClass(index){ return 'vc-c'+((Math.max(1,index)-1)%VC_PALETTE_SIZE+1); }
function volChartHtml(nodes, fmt, mbMap){
  const { items, total } = volChartData(nodes, mbMap);
  if(!items.length) return '<div class="vol-chart is-empty" data-volchart="1"></div>';
  if(fmt==='donut'){
    let offset = 25;
    const arcs = items.map((it,i)=>{
      const p = total ? it.mb/total*100 : 0;
      const shown = Math.max(p, 0.6);
      const arc = '<circle class="vc-arc '+volColorClass(i+1)+'" cx="21" cy="21" r="15.915" fill="none" stroke-width="7"'
        +' stroke-dasharray="'+shown.toFixed(2)+' '+(100-shown).toFixed(2)+'" stroke-dashoffset="'+offset.toFixed(2)+'">'
        +'<title>'+escapeHtml(it.label)+' · '+fmtMB(it.mb)+'</title></circle>';
      offset -= shown;
      return arc;
    }).join('');
    return '<div class="vol-chart is-donut" data-volchart="1"><svg class="vc-donut" viewBox="0 0 42 42" role="img">'+arcs+'</svg></div>';
  }
  const segs = items.map((it,i)=>{
    const p = total ? it.mb/total*100 : 0;
    return '<i class="vc-seg '+volColorClass(i+1)+'" style="flex-grow:'+p.toFixed(2)+'" title="'+escapeHtml(it.label)+' · '+fmtMB(it.mb)+'"></i>';
  }).join('');
  return '<div class="vol-chart is-bar" data-volchart="1"><div class="vc-stack">'+segs+'</div></div>';
}
function volColorMap(nodes, mbMap){
  const map = {};
  volChartData(nodes, mbMap).items.forEach((it,i)=>{ map[it.id] = (i%VC_PALETTE_SIZE)+1; });
  return map;
}

/* 一张标准图表卡：包序号 + 卷号 + 本卷容量 + 全选 + 树 + 勾选摘要。
   导入/导出序号在卡片 DOM 内；每一级（卡/分类/子目录）都可全选/全不选/反选。 */
/** 最大化视图的当前层级节点（按 state.volPath[key] 逐层下钻）。 */
function volScopedNodes(o){
  const path=state.volPath?.[o.key]||[];
  let list=o.nodes||[];
  for(const id of path){
    const node=findNode(list,id);
    if(!node || !node.children || !node.children.length) return list;
    list=node.children;
  }
  return list;
}

/** 最大化视图的面包屑：点任意一级返回该层。 */
function volBreadcrumbHtml(o){
  const path=state.volPath?.[o.key]||[];
  if(!path.length) return '';
  const crumbs=[];
  let list=o.nodes||[];
  for(const id of path){
    const node=findNode(list,id);
    if(!node) break;
    crumbs.push({ id, label: node.label });
    list=node.children||[];
  }
  if(!crumbs.length) return '';
  return '<div class="vol-breadcrumb"><button type="button" data-volcrumb="0">'+t('chart.root')+'</button>'
    + crumbs.map((c,i)=>'<span class="sep">›</span><button type="button" data-volcrumb="'+(i+1)+'">'+escapeHtml(c.label)+'</button>').join('')
    +'</div>';
}

function chartCardHtml(o, place){
  const maxed = state.volMaxKey === o.key;
  const collapsed = !maxed && (state.collapsedVol[o.key]!==undefined ? !!state.collapsedVol[o.key] : !!o.defaultCollapsed);
  syncAncestors(o.nodes,o.scope);
  const sum=sumSelected(o.nodes,o.scope);
  const dis = !!o.disabled;
  const fmt = chartFmtOf(o.key);
  const scopeNodes = maxed ? volScopedNodes(o) : o.nodes;
  const selectedMap = selectedMbMap(scopeNodes, o.scope);
  const colorMap = volColorMap(scopeNodes, selectedMap);
  const selectedTotal = volChartData(scopeNodes, selectedMap).total;
  const placeStyle = (!maxed && place) ? ' style="grid-column:'+place.col+';grid-row:'+place.row+'"' : '';
  return '<div class="vol-card'+(collapsed?' is-collapsed':'')+(maxed?' is-max':'')+(dis?' is-disabled':'')+'" data-scope="'+o.scope+'" data-volkey="'+o.key+'"'+(dis?' aria-disabled="true"':'')+placeStyle+'>'
    +'<div class="vol-head">'
      +'<span class="vol-idx'+(o.merged?' is-merged':'')+'">'+o.idxText+'</span>'
      +(o.volText?'<span class="vol-cap">'+o.volText+'</span>':'')
      +(o.capText?'<span class="vol-cap'+(o.over?' is-over':'')+'">'+o.capText+'</span>':'')
      +(o.pkgId ? privateFilesHtml() : '')
      +(o.manifestCount ? '<button class="vol-priv" type="button" data-extmanifest="'+escapeHtml(o.pkgId)+'" title="'+t('chart.extManifest')+'" aria-label="'+t('chart.extManifest')+'">'
        +svg('puzzle','ico')+'<b>'+o.manifestCount+'</b></button>' : '')
      +(o.over?'<span class="vol-flag">'+t('chart.overLimit')+'</span>':'')
      +'<span class="vol-spacer"></span>'
      +'<button class="vol-fmt" type="button" data-chartfmt-toggle="'+o.key+'" title="'+t('chart.format')+': '+(fmt==='bar'?t('chart.formatBar'):t('chart.formatDonut'))+'" aria-label="'+t('chart.format')+'">'
        +(fmt==='bar'
          ? '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="9" width="16" height="6" rx="2"/><path d="M9 9v6M15 9v6"/></svg>'
          : '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="7"/><path d="M12 5v7h7"/></svg>')
      +'</button>'
      +(o.totalText?'<span class="vol-total">'+o.totalText+'</span>':'')
      +(dis || o.readonly ? '' : '<span class="vol-bulk">'
        +'<button data-treeall="1">'+t('chart.selectAll')+'</button>'
        +'<button data-treenone="1">'+t('chart.selectNone')+'</button>'
        +'<button data-treeinvert="1">'+t('chart.invert')+'</button>'
      +'</span>')
      +(o.pkgId?'<button class="group-close" data-closegroup="'+o.pkgId+'" aria-label="'+t('chart.closeGroup')+'">×</button>':'')
      +'<button class="vol-max" data-volmax="'+o.key+'" title="'+(maxed?t('chart.restore'):t('chart.maximize'))+'" aria-label="'+(maxed?t('chart.restore'):t('chart.maximize'))+'">'+(maxed?'⤡':'⤢')+'</button>'
      +'<button class="vol-collapse" data-voltoggle="'+o.key+'" aria-label="'+t('chart.expand')+'">'
      +'<svg class="chev" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7"/></svg></button>'
    +'</div>'
    +(maxed ? volBreadcrumbHtml(o) : '')
    +'<div class="vol-body">'
      +(o.noticeHtml||'')
      +volChartHtml(scopeNodes, fmt, selectedMap)
      +(o.extToolsHtml||'')
      +'<div class="chart-tree">'+renderTreeRows(scopeNodes,0,o.scope,o.readonly||dis,groupToolsOf(o),selectedTotal,maxed,colorMap,undefined,selectedMap)+'</div>'
      +(dis?'':'<div class="chart-foot"><span>'+t('chart.selected',{count:sum.count,size:fmtMB(sum.mb)})+'</span></div>')
    +'</div>'
  +'</div>';
}

/** 扩展组内的模式/ Git / 构建配置控件（只有完整扩展时才显示 Git）；导出扩展清单也在这一条。 */
function extensionToolsHtml(pkg, assetPkgs, { scope, nodes } = {}){
  const hasExt = (pkg?.extensions && pkg.extensions.length) || !!findNode(pkg?.nodes || [], 'group:extensions');
  const treeNodes = nodes || (pkg ? packageNodes(pkg).nodes : []);
  const extNode = findNode(treeNodes, 'group:extensions');
  const extChecked = extNode ? isChecked(extNode, scope || ('pkg:' + (pkg?.id || ''))) : true;
  const pkgs = Array.isArray(assetPkgs) ? assetPkgs.filter(Boolean) : [];
  const listBtn = pkgs.length
    ? '<button type="button" class="et-list-btn" data-assetlist="1" data-assetpkgs="'+escapeHtml(pkgs.join(','))+'" title="'+t('chart.exportAssetList')+'">'+t('chart.exportAssetList')+'</button>'
    : '';
  if(!hasExt && !listBtn) return '';
  /* 扩展组未勾选：不再直接丢弃，给用户「保持不选 / 仅清单」二选一。
     仅清单会在生成时保留扩展元数据、只产出 _convert/extensions-manifest.json。 */
  if(hasExt && !extChecked){
    return '<div class="extension-tools ext-unchecked" data-exttools="1">'
      +'<span class="et-label">'+t('extension.uncheckedLabel')+'</span>'
      +'<div class="segmented et-mode">'
        +'<button class="seg-btn'+(state.extUncheckedMode!=='manifest'?' active':'')+'" data-extunchecked="none">'+t('extension.uncheckedKeep')+'</button>'
        +'<button class="seg-btn'+(state.extUncheckedMode==='manifest'?' active':'')+'" data-extunchecked="manifest">'+t('extension.manifest')+'</button>'
      +'</div>'
      +listBtn
    +'</div>';
  }
  const full = state.extensionMode !== EXTENSION_MODES.MANIFEST;
  return '<div class="extension-tools" data-exttools="1">'
    +(hasExt
      ? '<span class="et-label">'+t('extension.label')+'</span>'
        +'<div class="segmented et-mode">'
          +'<button class="seg-btn'+(full?' active':'')+'" data-extmode="full">'+t('extension.full')+'</button>'
          +'<button class="seg-btn'+(full?'':' active')+'" data-extmode="manifest">'+t('extension.manifest')+'</button>'
        +'</div>'
        +(full
          ? '<label class="et-git"><span>'+t('extension.git')+'</span><select class="text_pole" data-gitmode>'
              +'<option value="keep"'+(state.gitMode===GIT_MODES.KEEP?' selected':'')+'>'+t('extension.gitKeep')+'</option>'
              +'<option value="minimal"'+(state.gitMode===GIT_MODES.MINIMAL?' selected':'')+'>'+t('extension.gitMinimal')+'</option>'
              +'<option value="strip"'+(state.gitMode===GIT_MODES.STRIP?' selected':'')+'>'+t('extension.gitStrip')+'</option>'
            +'</select></label>'
            +'<label class="check et-keepdev"><input type="checkbox" data-keepdev'+(state.keepDev?' checked':'')+'> '+t('extension.keepDev')+'</label>'
          : '')
      : '')
    + listBtn
    +'</div>';
}

/* ── 云端私有件（user/files）：宿主无列表端点，条目来自本地上传登记 ── */
function userFilesAvailable(){
  return state.mode!=='web' && (state.host==='st' || state.host==='luker');
}
function privateFilesHtml(){
  if(!userFilesAvailable()) return '';
  const n=state.privateFiles.length;
  return '<button type="button" class="vol-priv" data-privfiles="open" title="'+t('priv.open')+'" aria-label="'+t('priv.open')+'">'
    +svg('cloud','ico')+(n?'<b>'+n+'</b>':'')+'</button>';
}
/* 组级工具条：私有件的「云端私有件」入口已上移到卡片头，不再插在类目行里。 */
function groupToolsOf(o){
  return {};
}
function fmtStamp(ms){
  const d=new Date(Number(ms)||0); const p=(n)=>String(n).padStart(2,'0');
  if(!ms) return '';
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes());
}
async function openPrivateFiles(){
  const entries=await actions.privateFiles?.list?.();
  const list=Array.isArray(entries)?entries:[];
  state.privateFiles=list;
  const rows=list.length
    ? list.map((e)=>'<div class="priv-row" data-privrow="'+escapeHtml(e.path)+'">'
        +'<span class="pf-name" title="'+escapeHtml(e.path)+'">'+escapeHtml(e.name)+'</span>'
        +'<span class="pf-meta">'+fmtMB((Number(e.sizeBytes)||0)/1048576)+' · '+fmtStamp(e.uploadedAt)+'</span>'
        +'<span class="pf-state" data-pfstate></span>'
        +'<button class="tree-mini" data-privdel="'+escapeHtml(e.path)+'">'+t('priv.delete')+'</button>'
      +'</div>').join('')
    : '<div class="export-queue-empty">'+t('priv.empty')+'</div>';
  openModal(t('priv.title'),t('priv.desc'),['<div class="priv-files">'+rows+'</div>'],[
    {label:t('modal.close'),onClick:closeModal},
    ...(list.length?[{label:t('priv.verify'),primary:true,onClick:()=>verifyPrivateFiles()}]:[])
  ]);
  document.getElementById('modal-extra').onclick=onPrivateRowClick;
}
async function verifyPrivateFiles(){
  const result=await actions.privateFiles?.verify?.();
  const box=document.getElementById('modal-extra');
  if(!box) return;
  if(!result || !result.ok){ toast(t('priv.verifyFailed')); return; }
  const verified=result.verified||{};
  box.querySelectorAll('[data-privrow]').forEach((row)=>{
    const target=row.querySelector('[data-pfstate]');
    if(!target) return;
    const exists=verified[row.dataset.privrow]!==false;
    target.textContent=exists?t('priv.present'):t('priv.missing');
    target.classList.toggle('is-missing',!exists);
  });
}
async function onPrivateRowClick(event){
  const btn=event.target.closest('[data-privdel]');
  if(!btn) return;
  const path=btn.dataset.privdel;
  btn.disabled=true;
  const result=await actions.privateFiles?.remove?.(path);
  btn.disabled=false;
  if(!result || !result.ok){ toast(t('priv.deleteFailed')); return; }
  btn.closest('[data-privrow]')?.remove();
  state.privateFiles=state.privateFiles.filter((e)=>e.path!==path);
  renderChart();
  toast(t('priv.deleted'));
}

function renderBatchBar(targets){
  const bar=document.getElementById('batch-bar');
  const mergeTarget=targets.find(t=>t.merge);
  const pkgs=mergeTarget ? mergeTarget.pkgs : targets.filter(t=>t.pkg).map(t=>t.pkg);
  if(pkgs.length<2){ bar.hidden=true; bar.innerHTML=''; return; }
  const merged=!!mergeTarget;
  const vols=merged
    ? volumesFor(mergedTotalMb(pkgs),mergedNodes(pkgs)).length
    : pkgs.reduce((a,p)=>a+volumesOf(p,packageNodes(p).nodes).length,0);
  bar.hidden=false;
  bar.innerHTML='<span class="lbl"><span class="scope">'+t(merged?'chart.mergeSelected':'chart.batchSelected',{n:pkgs.length,vols})+'</span></span>'
    +'<button class="merge-toggle'+(merged?' is-merged':'')+'" data-mergetoggle="'+(merged?'off':'on')+'">'
      +(merged?'<i class="fa-solid fa-layer-group"></i> ':'<i class="fa-solid fa-object-group"></i> ')
      +t(merged?'chart.mergeOff':'chart.mergeOn')+'</button>'
    +(merged?'<span class="merge-badge">'+t('chart.mergedBadge',{n:pkgs.length})+'</span>':'')
    +'<button data-batchall="1">'+t('chart.batchAll')+'</button>'
    +'<button data-batchnone="1">'+t('chart.selectNone')+'</button>'
    +'<button data-batchinvert="1">'+t('chart.batchInvert')+'</button>'
    +'<span style="flex:1"></span>'
    +'<span style="color:var(--muted-2)">'+t(merged?'chart.mergeHint':'chart.batchHint')+'</span>';
}

function layoutRowRatios(rows){
  const list = state.chartLayout.rows || [];
  const out = [];
  for(let i=0;i<rows;i++) out.push(Math.max(0.15, Math.min(0.85, Number(list[i]) || (1/rows))));
  const sum = out.reduce((a,b)=>a+b,0) || 1;
  return out.map((v)=>v/sum);
}
function chartCanvasHtml(defs){
  if(!defs.length) return '';
  if(state.volMaxKey){
    const hit = defs.find((d)=>d.key===state.volMaxKey) || defs[0];
    return '<div class="chart-canvas is-max" data-count="1" style="grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr)">'
      + chartCardHtml(hit) + '</div>';
  }
  const n = defs.length;
  if(n===1){
    return '<div class="chart-canvas" data-count="1" data-rows="1" style="grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr);min-height:100%">'
      + chartCardHtml(defs[0], { col:1, row:1 }) + '</div>';
  }
  const rows = n<=2 ? 1 : Math.ceil(n/2);
  const col = Math.max(0.2, Math.min(0.8, state.chartLayout.col || 0.5));
  const ratios = layoutRowRatios(rows);
  const cols = 'minmax(0,'+col+'fr) 6px minmax(0,'+(1-col)+'fr)';
  const rowTpl = rows===1 ? 'minmax(0,1fr)' : ratios.map((r)=>'minmax(0,'+r+'fr)').join(' 6px ');
  const minHeight = rows<=2 ? '100%' : 'calc('+rows+' * 220px)';
  let html = '<div class="chart-canvas" data-count="'+n+'" data-rows="'+rows+'" style="grid-template-columns:'+cols+';grid-template-rows:'+rowTpl+';min-height:'+minHeight+'">';
  if(n>=2) html += '<div class="chart-split-v" data-split="col" role="separator" aria-orientation="vertical" title="'+t('chart.dragCol')+'" style="grid-column:2;grid-row:1 / span '+(2*rows-1)+'"></div>';
  for(let r=0;r<rows-1;r++){
    html += '<div class="chart-split-h" data-split="row" data-gap="'+r+'" role="separator" aria-orientation="horizontal" title="'+t('chart.dragRow')+'" style="grid-column:1;grid-row:'+(2*r+2)+'"></div>';
    if(n > 2*(r+1)+1) {
      html += '<div class="chart-split-h" data-split="row" data-gap="'+r+'" role="separator" aria-orientation="horizontal" title="'+t('chart.dragRow')+'" style="grid-column:3;grid-row:'+(2*r+2)+'"></div>';
    }
  }
  defs.forEach((d,i)=>{
    const r = Math.floor(i/2);
    const c = i%2;
    html += chartCardHtml(d, { col: c===0?1:3, row: 2*r+1 });
  });
  return html + '</div>';
}
function renderChart(){
  state.seq=pkgSeq();
  const targets=chartTargets();
  renderQuota();
  renderBatchBar(targets);
  const stack=document.getElementById('chart-stack');
  if(!stack) return;
  stack.classList.toggle('is-prefs', !!state.prefMode);
  const stackScroll = { top: stack.scrollTop, left: stack.scrollLeft };
  const treeScrolls = {};
  stack.querySelectorAll('.vol-card').forEach(card => {
    const k = card.dataset.volkey;
    const tree = card.querySelector('.chart-tree');
    if(k && tree) treeScrolls[k] = { top: tree.scrollTop, left: tree.scrollLeft };
  });
  const appMain = document.querySelector('.app-main');
  const mainScroll = appMain ? appMain.scrollTop : 0;
  const winScroll = typeof window !== 'undefined' ? (window.scrollY || document.documentElement?.scrollTop || 0) : 0;
  if(state.prefMode){
    const batch=document.getElementById('batch-bar');
    if(batch) batch.hidden=true;
    stack.innerHTML = chartPrefsHtml();
    stack.scrollTop = stackScroll.top;
    stack.scrollLeft = stackScroll.left;
    return;
  }
  const defs = [];
  targets.forEach(target=>{
    if(target.merge){
      const nodes=mergedNodes(target.pkgs);
      const totalMb=mergedTotalMb(target.pkgs);
      const vols=volumesFor(totalMb,nodes);
      const multi=vols.length>1;
      const scope=mergeScope(target.pkgs);
      const extOwner=target.pkgs.find(p=>p.extensions&&p.extensions.length)||target.pkgs[0];
      const assetPkgs=target.pkgs.map(p=>p.id);
      const extTools=extensionToolsHtml(extOwner, assetPkgs, { scope, nodes });
      vols.forEach(v=>defs.push({
        key:'merge-'+v.i, scope, nodes:v.nodes,
        idxText:t('chart.mergedBadge',{n:target.pkgs.length}),
        merged:true,
        volText: multi ? t('chart.volume',{i:v.i,n:v.n}) : t('chart.whole'),
        capText: fmtMB(v.mb),
        totalText: multi ? t('chart.total',{size:fmtMB(totalMb)}) : '',
        noticeHtml: '', readonly: false, over: !!v.over, pkgId: '',
        extToolsHtml: extTools,
        defaultCollapsed: state.view==='mobile' && multi && v.i>1
      }));
      return;
    }
    const pkg=target.pkg;
    const tree=packageNodes(pkg);
    const vols=volumesOf(pkg, tree.nodes);
    const multi=vols.length>1;
    const notice=tree.unrecognized ? '<div class="chart-unavailable"><b>'+t('chart.unrecognizedTitle')+'</b></div>' : '';
    const extTools=extensionToolsHtml(pkg, [pkg.id], { scope:'pkg:'+pkg.id, nodes:tree.nodes });
    vols.forEach(v=>defs.push({
      key:pkg.id+'-'+v.i, scope:'pkg:'+pkg.id, nodes:v.nodes,
      idxText: seqLabel(pkg),
      volText: multi ? t('chart.volume',{i:v.i,n:v.n}) : t('chart.whole'),
      capText: fmtMB(v.mb),
      totalText: multi ? t('chart.total',{size:pkg.size}) : '',
      noticeHtml: notice, readonly: pkg.zone==='export',
      over: !!v.over,
      pkgId: pkg.id,
      manifestCount: (pkg.extManifest||[]).length,
      extToolsHtml: extTools,
      defaultCollapsed: state.view==='mobile' && multi && v.i>1
    }));
  });
  if(state.volMaxKey && !defs.some((d)=>d.key===state.volMaxKey)) state.volMaxKey=null;
  stack.classList.toggle('has-max', !!state.volMaxKey);
  let html = '';
  if(!targets.length){
    html += '<div class="chart-empty-guide">'      + '<div class="empty-guide-card guide-fetch">'
        + '<div class="guide-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M12 12v9"/><path d="m8 17 4 4 4-4"/></svg></div>'
        + '<div class="guide-title">' + t('empty.fetchTitle') + '</div>'
        + '<div class="guide-desc">' + t('empty.fetchDesc') + '</div>'
        + '<button type="button" class="btn accent" id="btn-empty-fetch">' + t('empty.fetchBtn') + '</button>'
        + '<button type="button" class="btn" id="btn-assetlist-host" title="' + t('empty.assetListHint') + '">' + t('empty.assetListBtn') + '</button>'
      + '</div>'
      + '<div class="empty-guide-card guide-import">'
        + '<div class="guide-icon"><svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></div>'
        + '<div class="guide-title">' + t('empty.importTitle') + '</div>'
        + '<div class="guide-desc">' + t('empty.importDesc') + '</div>'
        + '<button type="button" class="btn" id="btn-empty-import">' + t('empty.importBtn') + '</button>'
      + '</div>'
    + '</div>';
  } else {
    html = chartCanvasHtml(defs);
  }
  stack.innerHTML=html;
  stack.querySelectorAll('.tree-check[data-ind="1"]').forEach(el=>{ el.indeterminate=true; });
  stack.scrollTop = stackScroll.top;
  stack.scrollLeft = stackScroll.left;
  stack.querySelectorAll('.vol-card').forEach(card => {
    const k = card.dataset.volkey;
    const tree = card.querySelector('.chart-tree');
    if(k && tree && treeScrolls[k]){
      tree.scrollTop = treeScrolls[k].top;
      tree.scrollLeft = treeScrolls[k].left;
    }
  });
  if(appMain && appMain.scrollTop !== mainScroll) appMain.scrollTop = mainScroll;
  if(typeof window !== 'undefined' && (window.scrollY || document.documentElement?.scrollTop || 0) !== winScroll){
    window.scrollTo(0, winScroll);
  }
  renderFilenamePreview();
  updateSplitSim();
}

/* ── 数据包偏好：占位复选框 + 顶部控件并入保存 ── */
function targetCodeOf(value){
  if(value==='auto') return 'auto';
  const hit=TARGETS.find(x=>x.value===value);
  return hit ? hit.host : 'auto';
}
function targetValueOfCode(code){
  if(!code || code==='auto') return targetForHost(state.host);
  const hit=TARGETS.find(x=>x.host===code);
  return hit ? hit.value : targetForHost(state.host);
}
function syncTopControls(){
  const comp=document.getElementById('compression-select'); if(comp) comp.value=state.compression;
  const split=document.getElementById('split-input'); if(split) split.value=state.splitMb;
  const fn=document.getElementById('filename-template'); if(fn) fn.value=state.filenameTemplate;
  document.querySelectorAll('#delta-toggle button').forEach(b=>b.classList.toggle('active',b.dataset.delta===state.delta));
  renderTargetPicker();
  renderFilenamePreview();
  updateSplitSim();
}
function chartPrefsHtml(){
  const p = state.prefDraft || normalizeChartPrefs(chartPrefs);
  const checked = new Set(p.checkedGroups);
  const rows = CHART_GROUPS.map((g,i)=>
    '<label class="pref-row">'
      +'<input type="checkbox" data-prefgroup="'+g.key+'"'+(checked.has(g.key)?' checked':'')+'>'
      +'<span class="pref-dot '+volColorClass(i+1)+'" aria-hidden="true"></span>'
      +'<span class="pref-label">'+g.label+'</span>'
    +'</label>').join('');
  const full = state.extensionMode !== EXTENSION_MODES.MANIFEST;
  return '<div class="chart-prefs">'
    +'<div class="pref-head"><b>'+t('chart.prefsTitle')+'</b><span>'+t('chart.prefsDesc')+'</span></div>'
    +'<div class="pref-list">'+rows+'</div>'
    +'<div class="pref-extra">'
      +'<div class="segmented et-mode">'
        +'<button type="button" class="seg-btn'+(full?' active':'')+'" data-prefextmode="full">'+t('extension.full')+'</button>'
        +'<button type="button" class="seg-btn'+(full?'':' active')+'" data-prefextmode="manifest">'+t('extension.manifest')+'</button>'
      +'</div>'
      +'<label class="et-git"><span>'+t('chart.prefsGit')+'</span><select class="text_pole" data-prefgitmode>'
        +'<option value="keep"'+(state.gitMode===GIT_MODES.KEEP?' selected':'')+'>'+t('extension.gitKeep')+'</option>'
        +'<option value="minimal"'+(state.gitMode===GIT_MODES.MINIMAL?' selected':'')+'>'+t('extension.gitMinimal')+'</option>'
        +'<option value="strip"'+(state.gitMode===GIT_MODES.STRIP?' selected':'')+'>'+t('extension.gitStrip')+'</option>'
      +'</select></label>'
      +'<label class="check et-keepdev"><input type="checkbox" data-prefkeepdev'+(state.keepDev?' checked':'')+'> '+t('extension.keepDev')+'</label>'
    +'</div>'
    +'<div class="pref-actions">'
      +'<button type="button" class="btn" id="pref-cancel">'+t('chart.prefsCancel')+'</button>'
      +'<button type="button" class="btn accent" id="pref-save">'+t('chart.prefsSave')+'</button>'
    +'</div>'
  +'</div>';
}
function openChartPrefs(){
  if(state.prefMode) return;
  state.prefSnapshot = {
    target: state.target, targetManual: state.targetManual,
    splitMb: state.splitMb, compression: state.compression,
    extensionMode: state.extensionMode, gitMode: state.gitMode, keepDev: state.keepDev,
    filenameTemplate: state.filenameTemplate,
  };
  state.prefDraft = normalizeChartPrefs(chartPrefs);
  state.prefMode = true;
  state.target = targetValueOfCode(chartPrefs.target);
  state.targetManual = chartPrefs.target !== 'auto';
  state.splitMb = chartPrefs.splitMb;
  state.compression = chartPrefs.compression;
  state.filenameTemplate = chartPrefs.filenameTemplate;
  state.extensionMode = chartPrefs.extensionMode;
  state.gitMode = chartPrefs.gitMode;
  state.keepDev = chartPrefs.keepDev;
  syncTopControls();
  renderChart();
}
function cancelChartPrefs(){
  const s = state.prefSnapshot;
  if(s) Object.assign(state, s);
  state.prefMode = false; state.prefDraft = null; state.prefSnapshot = null;
  syncTopControls();
  renderAll();
}
function saveChartPrefsDraft(){
  const checked = [...document.querySelectorAll('[data-prefgroup]:checked')].map((el)=>el.dataset.prefgroup);
  chartPrefs = saveChartPrefs({
    checkedGroups: checked,
    target: targetCodeOf(state.target),
    compression: state.compression,
    splitMb: state.splitMb,
    filenameTemplate: state.filenameTemplate,
    extensionMode: state.extensionMode,
    gitMode: state.gitMode,
    keepDev: state.keepDev,
  });
  state.prefMode = false; state.prefDraft = null; state.prefSnapshot = null;
  toast(t('chart.prefsSaved'));
  renderAll();
}
function applyPrefsToPackage(pkg){
  if(!pkg || !Array.isArray(pkg.nodes) || !pkg.nodes.length) return;
  const checked = new Set(chartPrefs.checkedGroups);
  const scope = 'pkg:'+pkg.id;
  pkg.nodes.forEach((top)=>{
    const key = String(top.id||'').replace(/^group:/,'');
    const val = checked.has(key);
    walk([top],(n)=>{
      const k = treeKey(scope,n.id);
      // 只给「尚无用户选择」的节点上默认值：偏好是初始值，不是每次重渲染都覆盖用户操作。
      if(state.sel[k]===undefined) state.sel[k]=val;
    });
  });
}
function applyTopControlsFromPrefs(){
  state.target = targetValueOfCode(chartPrefs.target);
  state.targetManual = chartPrefs.target !== 'auto';
  state.splitMb = chartPrefs.splitMb;
  state.compression = chartPrefs.compression;
  state.filenameTemplate = chartPrefs.filenameTemplate;
  state.extensionMode = chartPrefs.extensionMode;
  state.gitMode = chartPrefs.gitMode;
  state.keepDev = chartPrefs.keepDev;
  syncTopControls();
}

function renderFilenamePreview(){
  const input=document.getElementById('filename-template');
  const out=document.getElementById('filename-preview');
  if(!input||!out) return;
  const tpl=input.value||'{target}_{user}_{part}_{datetime}.zip';
  const now=new Date(); const p=n=>String(n).padStart(2,'0');
  const dt=now.getFullYear()+'-'+p(now.getMonth()+1)+'-'+p(now.getDate())+'_'+p(now.getHours())+'-'+p(now.getMinutes())+'-'+p(now.getSeconds());
  const map={
    '{host}':HOSTS[state.host].full,
    '{target}':state.target,
    '{user}':'default-user',
    '{part}':'part1',
    '{date}':dt.slice(0,10),
    '{time}':dt.slice(11),
    '{datetime}':dt,
    '{mode}':'full',
    '{category}':'all',
    '{source}':'archive',
    '{count}':'0'
  };
  let name=tpl;
  Object.keys(map).forEach(k=>{ name=name.split(k).join(map[k]); });
  name=name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_');
  if(!/\.zip$/i.test(name)) name+='.zip';
  out.textContent=name;
  out.title=name;
}

/* ── 渲染：包卡 ── */
function pkgCard(p){
  const isActive=state.source.type==='package' && state.source.pkgId===p.id;
  const isMobile=state.view==='mobile';
  const hostKey=p.unrecognized?'unknown':p.host;
  const hostCode=p.unrecognized?'?':({st:'ST',luker:'L',tt:'TT',pt:'PT'}[p.host]||'?');
  const brand=p.unrecognized?null:({st:'--brand-st',luker:'--brand-luker',tt:'--brand-tt',pt:'--brand-pt'}[p.host]||null);
  const tagStyle=brand
    ? 'background:var('+brand+');color:var('+brand+'-ink);border-color:transparent'
    : 'color:var(--unknown);border-color:var(--unknown)';
  const seqStyle=brand
    ? 'color:var('+brand+'-ring);border-color:var('+brand+'-ring)'
    : 'color:var(--unknown);border-color:var(--unknown)';
  const iconInner=p.unrecognized
    ? '<span class="pkg-icon" data-host="unknown" style="display:inline-flex;align-items:center;justify-content:center;color:var(--unknown)">'+svg('unknown','tree-ico')+'</span>'
    : '<img class="pkg-icon" data-host="'+hostKey+'" src="'+hostIcon(p.host)+'" alt="'+hostName(p.host)+'">';
  const icon='<span class="pkg-icon-wrap">'
    +'<span class="pkg-seq" style="'+seqStyle+'">'+seqNum(p)+'</span>'
    +iconInner+'<span class="pkg-host-tag" style="'+tagStyle+'">'+hostCode+'</span></span>';
  const badges=[];
  if(p.unrecognized) badges.push('<span class="pkg-badge unknown">'+t('pkg.unrecognized')+'</span>');
  const limit=splitLimit();
  if(limit && (p.mb||0)>limit) badges.push('<span class="pkg-badge warn">'+t('pkg.split',{n:Math.ceil(p.mb/limit)})+'</span>');
  if(p.zone==='export') badges.push('<span class="pkg-badge lock">'+t('pkg.readonly')+'</span>');
  if(p.origin) badges.push('<span class="pkg-badge">'+p.origin+'</span>');
  return '<div class="pkg-card'+(isActive?' is-active':'')+(p.unrecognized?' unrecognized':'')+(p.zone==='export'?' is-export':'')+'" data-pkg="'+p.id+'" data-mobile="'+(isMobile?'1':'0')+'">'
    +'<input class="pkg-check" type="checkbox" data-pkgcheck="'+p.id+'"'+(state.selectedPkgs.has(p.id)?' checked':'')+'>'
    +icon
    +'<div class="pkg-info">'
    +'<div class="pkg-name"><span class="pkg-name-txt" data-fullname="'+encodeURIComponent(p.name)+'" title="'+p.name+'">'+p.name+'</span></div>'
    +'<div class="pkg-meta">'+badges.join('')+'<span>'+p.size+'</span><span>'+p.time+'</span></div>'
    +'</div>'
    +(p.zone==='export'?'':'<div class="pkg-actions">'
      +'<button data-pkgact="delete" data-id="'+p.id+'" title="'+t('pkg.delete')+'">'+svg('archive','tree-ico')+'</button>'
    +'</div>')
    +'</div>';
}
function renderZones(){
  document.querySelectorAll('#zone-tabs .zone-tab').forEach(b=>{
    b.classList.toggle('active',b.dataset.zone===state.zone);
  });
  const imp=state.packages.filter(p=>p.zone==='import').length;
  const exp=state.packages.filter(p=>p.zone==='export').length;
  document.getElementById('count-import').textContent=imp;
  document.getElementById('count-export').textContent=exp;

  const body=document.getElementById('zone-body');
  const list=visiblePackages(state.zone);
  let html='';
  if(state.zone==='import'){
    html+='<div class="dropzone" id="dropzone"><span class="big">'+t('zones.dropTitle')+'</span>'+t('zones.dropHint')+'</div>';
    html+='<div class="zone-toolbar">'+hostFilterHtml()+'<label>'+t('sort.label')+' <select id="sort-select">'
      +'<option value="time-desc"'+(state.sort==='time-desc'?' selected':'')+'>'+t('sort.timeDesc')+'</option>'
      +'<option value="name"'+(state.sort==='name'?' selected':'')+'>'+t('sort.name')+'</option>'
      +'<option value="size"'+(state.sort==='size'?' selected':'')+'>'+t('sort.size')+'</option>'
      +'</select></label><span class="spacer"></span></div>';
  }else{
    html+='<div class="zone-toolbar">'+hostFilterHtml()+'<label>'+t('sort.label')+' <select id="sort-select">'
      +'<option value="time-desc"'+(state.sort==='time-desc'?' selected':'')+'>'+t('sort.timeDesc')+'</option>'
      +'<option value="name"'+(state.sort==='name'?' selected':'')+'>'+t('sort.name')+'</option>'
      +'<option value="size"'+(state.sort==='size'?' selected':'')+'>'+t('sort.size')+'</option>'
      +'</select></label><span class="spacer"></span></div>';
  }
  if(list.length===0){
    html+='<div class="zone-empty">'+(state.zone==='import'?t('zones.emptyImport'):t('zones.emptyExport'))+'</div>';
  }else{
    html+='<div class="card-list">'+list.map(pkgCard).join('')+'</div>';
  }
  body.innerHTML=html;
  body.querySelector('#sort-select')?.addEventListener('change',e=>{ state.sort=e.target.value; renderZones(); });
  body.querySelector('#host-filter')?.addEventListener('change',e=>{ state.filter=e.target.value; renderZones(); });
  body.querySelector('#dropzone')?.addEventListener('click',()=>{
    actions.uploadRequest?.();
  });
  fitPackageNames();
}

/* 包名换行判定：只有当整名除以可用宽度的小数部分够满（≥45%）才允许折成两行，
   否则宁可单行省略 —— 免得第二行只剩「.zip」这种残句。 */
function fitPackageNames(){
  const cv=fitPackageNames._cv||(fitPackageNames._cv=document.createElement('canvas'));
  const ctx=cv.getContext('2d');
  document.querySelectorAll('.pkg-name-txt').forEach(el=>{
    const full=decodeURIComponent(el.dataset.fullname||'')||el.textContent;
    const cs=getComputedStyle(el);
    ctx.font=cs.fontStyle+' '+cs.fontWeight+' '+cs.fontSize+' '+cs.fontFamily;
    const need=ctx.measureText(full).width;
    const avail=el.clientWidth||1;
    const lines=need/avail;
    el.classList.toggle('two-line', lines>1.05 && (lines%1)>=0.45);
  });
}

/* ── 渲染：顶部全局动作 + 分区底部动作（勾选后才出现） ── */
function renderTopActions(){
  const row=document.getElementById('top-actions');
  if(!row) return;
  const libBtn=state.libraryExport
    ? '<button class="btn" id="btn-library-export">'+svg('db','ico')+t('action.libraryExport')+'</button>'
    : '';
  row.innerHTML='<button class="btn" id="btn-fetch">'+svg('cloud','ico')+t('action.fetch')+'</button>'
    +libBtn
    +'<button class="btn" id="transfer-open-btn">'+svg('bolt','ico')+t('transfer.open')+'</button>'
    +'<button class="btn" id="btn-refresh-page">'+svg('bolt','ico')+t('action.refreshPage')+'</button>';
  row.querySelector('#btn-fetch')?.addEventListener('click',()=>doFetch());
  row.querySelector('#btn-library-export')?.addEventListener('click',()=>actions.libraryExport?.());
  row.querySelector('#btn-refresh-page')?.addEventListener('click',()=>{ if(typeof window!=='undefined') window.location.reload(); });
}
function renderActions(){
  renderTopActions();
  const row=document.getElementById('zone-actions-bottom');
  if(!row) return;
  const hasSel=state.selectedPkgs.size>0;
  const task=state.task;
  const taskBtns=task
    ? (task.state==='running'
      ? '<button class="btn" id="btn-task-pause">'+t('action.pause')+'</button>'
        +'<button class="btn" id="btn-task-abort">'+t('action.abort')+'</button>'
      : '<button class="btn accent" id="btn-task-resume">'+t('action.resume')+'</button>'
        +'<button class="btn" id="btn-task-abort">'+t('action.abort')+'</button>')
    : '';
  const selectedLabel=hasSel
    ? '<span class="lbl">'+t('zones.selected',{n:state.selectedPkgs.size})+'</span>'
    : '<span class="zone-hint">'+t('zones.selectHint')+'</span>';
  if(state.zone==='import'){
    row.innerHTML=taskBtns+selectedLabel
      +(hasSel?'<button class="btn accent" id="btn-generate">'+svg('archive','ico')+t('action.generatePack')+'</button>':'')
      +(hasSel?'<button class="btn" id="btn-delete-selected">'+t('zones.batchDelete')+'</button>':'');
  }else{
    row.innerHTML=taskBtns+selectedLabel
      +(hasSel?'<button class="btn" id="btn-download">'+svg('file','ico')+t('action.download')+'</button>':'')
      +(hasSel?'<button class="btn accent" id="btn-upload">'+svg('cloud','ico')+t('action.restore')+'</button>':'')
      +(hasSel?'<button class="btn" id="btn-copyback">'+svg('folder','ico')+t('action.copyBack')+'</button>':'')
      +(hasSel?'<button class="btn" id="btn-delete-selected">'+t('zones.batchDelete')+'</button>':'');
  }
  row.querySelector('#btn-generate')?.addEventListener('click',()=>doGenerate());
  row.querySelector('#btn-download')?.addEventListener('click',()=>{ actions.download?.([...state.selectedPkgs]); });
  row.querySelector('#btn-upload')?.addEventListener('click',()=>doUploadHost());
  row.querySelector('#btn-copyback')?.addEventListener('click',()=>doCopyBack());
  row.querySelector('#btn-delete-selected')?.addEventListener('click',()=>doDeleteSelected());
  row.querySelector('#btn-task-pause')?.addEventListener('click',()=>actions.taskPause?.());
  row.querySelector('#btn-task-resume')?.addEventListener('click',()=>actions.taskResume?.());
  row.querySelector('#btn-task-abort')?.addEventListener('click',()=>actions.taskAbort?.());
  renderTransfer();
  renderLan();
  renderCloud();
}

/* ── 渲染：局域网互传（执行卡内联） ── */
function lanTargets(){
  return [...state.selectedPkgs]
    .map(id=>state.packages.find(p=>p.id===id))
    .filter(p=>p && p.zone==='import');
}
function lanSummaryText(){
  const targets=lanTargets();
  if(!targets.length) return t('action.sendHint');
  const mb=targets.reduce((a,p)=>a+(p.mb||0),0);
  return t('lan.selectedSummary',{n:targets.length,size:fmtMB(mb)});
}
function setLanBar(fillId, pctId, pct){
  const f=document.getElementById(fillId); if(f) f.style.width=Math.max(0,Math.min(100,Number(pct)||0))+'%';
  const p=document.getElementById(pctId); if(p) p.textContent=Math.round(Number(pct)||0)+'%';
}
function setLanQr(id, text, show){
  const box=document.getElementById(id); if(!box) return;
  if(!show || !text || typeof qr?.encodeSvg!=='function'){ box.hidden=true; box.innerHTML=''; return; }
  try { box.innerHTML=qr.encodeSvg(text); box.hidden=false; }
  catch { box.hidden=true; box.innerHTML=''; }
}
/* ── 扩展管理（内联视图，不是浮层） ── */
function extStatusText(status){
  if(status==='ok') return t('extmgr.statusOk');
  if(status==='failed') return t('extmgr.statusFailed');
  if(status==='installing') return t('extmgr.statusInstalling');
  return t('extmgr.statusPending');
}
function parseExtEntries(text, defaultBranch){
  const out=[];
  const raw=String(text||'').trim();
  if(!raw) return out;
  const branchOf=(v)=>String(v||defaultBranch||'main').trim()||'main';
  if(raw.startsWith('[') || raw.startsWith('{')){
    try {
      const data=JSON.parse(raw);
      const arr=Array.isArray(data)?data:(Array.isArray(data.links)?data.links:Array.isArray(data.extensions)?data.extensions:[]);
      for(const item of arr){
        if(typeof item==='string'){ out.push({url:item.trim(), branch:branchOf(''), status:'pending'}); continue; }
        const url=item&&(item.url||item.link||item.repo); if(!url) continue;
        out.push({url:String(url).trim(), branch:branchOf(item.branch||item.version||item.ref), status:'pending'});
      }
      return out;
    } catch { /* 不是 JSON，按行解析 */ }
  }
  for(const line of raw.split(/\r?\n/)){
    const s=line.trim(); if(!s || s.startsWith('#')) continue;
    let url=s, branch=branchOf('');
    if(s.includes('|')){
      const p=s.split('|'); url=p[0].trim(); branch=branchOf(p[1]);
    } else {
      const m=/^(\S+)\s+(\S+)$/.exec(s);
      if(m){ url=m[1]; branch=branchOf(m[2]); }
      else {
        const h=/^(\S+)#(\S+)$/.exec(s);
        if(h){ url=h[1]; branch=branchOf(h[2]); }
      }
    }
    if(!/^https?:\/\/\S+/i.test(url)) continue;
    out.push({url, branch, status:'pending'});
  }
  return out;
}
function downloadTextFile(name, text){
  try {
    const blob=new Blob([String(text||'')],{type:'text/plain;charset=utf-8'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=name; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  } catch { toast(t('extmgr.exportFailed')); }
}
function renderExtInstall(body){
  const rows=state.extEntries.map((e,i)=>{
    return '<div class="ext-entry is-'+(e.status||'pending')+'">'
      +'<span class="ext-url" title="'+escapeHtml(e.url)+'">'+escapeHtml(e.url)+'</span>'
      +'<input class="text_pole ext-branch" data-extbranch="'+i+'" value="'+escapeHtml(e.branch||'main')+'" placeholder="main">'
      +'<span class="ext-state">'+extStatusText(e.status)+(e.error?' · '+escapeHtml(e.error):'')+'</span>'
      +'</div>';
  }).join('');
  body.innerHTML='<div class="ext-install">'
    +'<label class="ext-label">'+t('extmgr.linksLabel')+'</label>'
    +'<div class="ext-note">'+t('extmgr.policyNote')+'</div>'
    +'<textarea id="extmgr-links" class="text_pole" rows="5" placeholder="'+t('extmgr.linksPlaceholder')+'">'+escapeHtml(state.extLinksText||'')+'</textarea>'
    +'<div class="ext-row">'
      +'<input type="file" id="extmgr-file" accept=".txt,.json,.jsonl" hidden>'
      +'<button type="button" class="btn" id="extmgr-pick">'+t('extmgr.upload')+'</button>'
      +'<button type="button" class="btn" id="extmgr-paste">'+t('extmgr.paste')+'</button>'
      +'<label class="ext-branch-def"><span>'+t('extmgr.defaultBranch')+'</span><input id="extmgr-branch" class="text_pole" value="'+escapeHtml(state.extDefaultBranch||'main')+'"></label>'
      +'<span style="flex:1"></span>'
      +'<button type="button" class="btn" id="extmgr-parse">'+t('extmgr.parse')+'</button>'
      +'<button type="button" class="btn accent" id="extmgr-run"'+(state.extRunning?' disabled':'')+'>'+t('extmgr.install')+'</button>'
    +'</div>'
    +'<div class="ext-list">'+(rows||'<div class="ext-empty">'+t('extmgr.empty')+'</div>')+'</div>'
    +'<div class="ext-row ext-actions">'
      +'<button type="button" class="btn" id="extmgr-export-log">'+t('extmgr.exportLog')+'</button>'
      +'<button type="button" class="btn" id="extmgr-export-failed">'+t('extmgr.exportFailed')+'</button>'
      +'<button type="button" class="btn" id="extmgr-export-report">'+t('extmgr.exportReport')+'</button>'
      +'<span style="flex:1"></span>'
      +'<button type="button" class="btn" id="extmgr-clear">'+t('extmgr.clear')+'</button>'
    +'</div></div>';
  const ta=body.querySelector('#extmgr-links');
  ta?.addEventListener('input',()=>{ state.extLinksText=ta.value; });
  const branchEl=body.querySelector('#extmgr-branch');
  branchEl?.addEventListener('input',()=>{ state.extDefaultBranch=branchEl.value.trim()||'main'; });
  body.querySelector('#extmgr-pick')?.addEventListener('click',()=>body.querySelector('#extmgr-file')?.click());
  body.querySelector('#extmgr-file')?.addEventListener('change',async(e)=>{
    const file=e.target.files?.[0]; if(!file) return;
    try { state.extLinksText=await file.text(); } catch { state.extLinksText=''; }
    state.extEntries=parseExtEntries(state.extLinksText, state.extDefaultBranch);
    renderExtensionView();
  });
  body.querySelector('#extmgr-paste')?.addEventListener('click',async()=>{
    try {
      const text=await navigator.clipboard.readText();
      if(text){ state.extLinksText=text; state.extEntries=parseExtEntries(text, state.extDefaultBranch); renderExtensionView(); }
      else toast(t('extmgr.pasteEmpty'));
    } catch { toast(t('extmgr.pasteEmpty')); }
  });
  body.querySelector('#extmgr-parse')?.addEventListener('click',()=>{
    state.extEntries=parseExtEntries(state.extLinksText||ta?.value||'', state.extDefaultBranch);
    if(!state.extEntries.length) toast(t('extmgr.parseEmpty'));
    renderExtensionView();
  });
  body.querySelectorAll('[data-extbranch]').forEach((el)=>{
    el.addEventListener('input',()=>{ const i=Number(el.dataset.extbranch); if(state.extEntries[i]) state.extEntries[i].branch=el.value.trim()||'main'; });
  });
  body.querySelector('#extmgr-run')?.addEventListener('click',async()=>{
    if(state.extRunning) return;
    if(!state.extEntries.length) state.extEntries=parseExtEntries(state.extLinksText||ta?.value||'', state.extDefaultBranch);
    if(!state.extEntries.length){ toast(t('extmgr.parseEmpty')); return; }
    state.extRunning=true; state.extResults=[]; state.extLog=[];
    renderExtensionView();
    try {
      state.extResults=await actions.installExtensions?.(state.extEntries)||[];
    } finally {
      state.extRunning=false;
      renderExtensionView();
    }
  });
  const exportLog=()=>downloadTextFile('extension-install.log', (state.extLog||[]).join('\n'));
  const exportFailed=()=>{
    const failed=(state.extResults||[]).filter((r)=>r.status==='failed').map((r)=>r.url);
    downloadTextFile('extension-install-failed.txt', failed.join('\n'));
  };
  const exportReport=()=>{
    const report={ generatedAt:new Date().toISOString(), total:(state.extResults||[]).length,
      ok:(state.extResults||[]).filter((r)=>r.status==='ok').length,
      failed:(state.extResults||[]).filter((r)=>r.status==='failed').length,
      results:state.extResults||[] };
    downloadTextFile('extension-install-report.json', JSON.stringify(report,null,2));
  };
  body.querySelector('#extmgr-export-log')?.addEventListener('click',exportLog);
  body.querySelector('#extmgr-export-failed')?.addEventListener('click',exportFailed);
  body.querySelector('#extmgr-export-report')?.addEventListener('click',exportReport);
  body.querySelector('#extmgr-clear')?.addEventListener('click',()=>{
    state.extLinksText=''; state.extEntries=[]; state.extResults=[]; state.extLog=[]; renderExtensionView();
  });
}
async function renderExtInstalled(body){
  body.innerHTML='<div class="ext-empty">'+t('extmgr.loading')+'</div>';
  let list=[];
  try {
    const res=await actions.listHostExtensions?.();
    list=Array.isArray(res)?res:(Array.isArray(res?.items)?res.items:(Array.isArray(res?.list)?res.list:[]));
  } catch { list=[]; }
  if(state.extTab!=='installed') return;
  state.extInstalled=list;
  const rows=list.map((x)=>{
    const name=x?.name||x?.folder||x?.internalName||'';
    const version=x?.version||x?.manifest?.version||'';
    return '<div class="ext-entry is-ok"><span class="ext-url" title="'+escapeHtml(name)+'">'+escapeHtml(name)+'</span><span class="ext-state">'+escapeHtml(version)+'</span></div>';
  }).join('');
  body.innerHTML='<div class="ext-install"><div class="ext-row">'
    +'<button type="button" class="btn" id="extmgr-export-assetlist">'+t('extmgr.exportAssetList')+'</button>'
    +'<button type="button" class="btn" id="extmgr-refresh-installed">'+t('extmgr.refresh')+'</button>'
    +'<span style="flex:1"></span></div>'
    +'<div class="ext-list">'+(rows||'<div class="ext-empty">'+t('extmgr.noneInstalled')+'</div>')+'</div></div>';
  body.querySelector('#extmgr-export-assetlist')?.addEventListener('click',()=>actions.exportAssetList?.({source:'host'}));
  body.querySelector('#extmgr-refresh-installed')?.addEventListener('click',()=>{ state.extInstalled=null; renderExtensionView(); });
}
function renderExtReport(body){
  const results=state.extResults||[];
  const rows=results.map((r)=>'<div class="ext-entry is-'+(r.status==='ok'?'ok':'failed')+'">'
    +'<span class="ext-url" title="'+escapeHtml(r.url)+'">'+escapeHtml(r.url)+'</span>'
    +'<span class="ext-state">'+escapeHtml(r.branch||'')+' · '+extStatusText(r.status)+(r.error?' · '+escapeHtml(r.error):'')+'</span></div>').join('');
  const log=(state.extLog||[]).join('\n');
  body.innerHTML='<div class="ext-install">'
    +'<div class="ext-row"><b>'+t('extmgr.reportSummary',{ok:results.filter(r=>r.status==='ok').length,failed:results.filter(r=>r.status==='failed').length})+'</b></div>'
    +'<div class="ext-list">'+(rows||'<div class="ext-empty">'+t('extmgr.noReport')+'</div>')+'</div>'
    +'<pre class="ext-log">'+escapeHtml(log||t('extmgr.noLog'))+'</pre>'
    +'<div class="ext-row ext-actions">'
      +'<button type="button" class="btn" id="extmgr-export-log2">'+t('extmgr.exportLog')+'</button>'
      +'<button type="button" class="btn" id="extmgr-export-failed2">'+t('extmgr.exportFailed')+'</button>'
      +'<button type="button" class="btn" id="extmgr-export-report2">'+t('extmgr.exportReport')+'</button>'
    +'</div></div>';
  const exportLog=()=>downloadTextFile('extension-install.log', log);
  const exportFailed=()=>downloadTextFile('extension-install-failed.txt', results.filter(r=>r.status==='failed').map(r=>r.url).join('\n'));
  const exportReport=()=>downloadTextFile('extension-install-report.json', JSON.stringify({generatedAt:new Date().toISOString(),results},null,2));
  body.querySelector('#extmgr-export-log2')?.addEventListener('click',exportLog);
  body.querySelector('#extmgr-export-failed2')?.addEventListener('click',exportFailed);
  body.querySelector('#extmgr-export-report2')?.addEventListener('click',exportReport);
}
function renderExtensionView(){
  const body=document.getElementById('extension-body');
  if(!body) return;
  document.querySelectorAll('#extmgr-tabs [data-exttab]').forEach(b=>b.classList.toggle('active',b.dataset.exttab===state.extTab));
  if(state.extTab==='installed'){ void renderExtInstalled(body); return; }
  if(state.extTab==='report'){ renderExtReport(body); return; }
  renderExtInstall(body);
}

function renderTransfer(){
  document.querySelectorAll('[data-transfer-tab]').forEach(b=>{
    const on=b.dataset.transferTab===state.transfer.tab;
    b.classList.toggle('active',on);
    b.setAttribute('aria-selected',on?'true':'false');
  });
  syncMainView();
}
function renderLan(){
  const L=state.lan;
  const view=document.getElementById('lan-view');
  if(!view) return;
  view.hidden=!(state.transfer.open && state.transfer.tab==='lan');
  const targets=lanTargets();
  const sum=document.getElementById('lan-send-summary'); if(sum) sum.textContent=lanSummaryText();
  /* 概览：对端 / 类别 / 状态（对齐 Luker 后端行的信息层级） */
  const ovPeer=document.getElementById('lan-ov-peer');
  if(ovPeer) ovPeer.textContent = L.send.busy||L.send.waiting ? t('action.send') : (L.recv.busy ? t('action.recv') : t('lan.ovIdle'));
  const ovCats=document.getElementById('lan-ov-cats'); if(ovCats) ovCats.textContent = lanSummaryText() || t('lan.ovNone');
  const ovState=document.getElementById('lan-ov-state');
  if(ovState) ovState.textContent = (L.send.busy||L.send.waiting) ? (L.send.phase||t('action.ready')) : (L.recv.busy ? (L.recv.phase||t('action.waiting')) : t('action.ready'));
  const gen=document.getElementById('lan-btn-generate');
  if(gen) gen.disabled=!targets.length || L.send.busy || L.send.waiting;
  const sendCode=document.getElementById('lan-send-code');
  if(sendCode && document.activeElement!==sendCode) sendCode.value=L.send.code||'';
  const copySend=document.getElementById('lan-btn-copy-send'); if(copySend) copySend.hidden=!L.send.code;
  setLanQr('lan-send-qr',L.send.code,!!L.send.code);
  const answer=document.getElementById('lan-answer-input');
  if(answer && document.activeElement!==answer) answer.value=L.send.answer||'';
  const apply=document.getElementById('lan-btn-apply-answer');
  if(apply) apply.disabled=L.send.busy || !L.send.code;
  const scanAnswer=document.getElementById('lan-btn-scan-answer');
  if(scanAnswer) scanAnswer.hidden=!L.send.code;
  const retry=document.getElementById('lan-btn-retry'); if(retry) retry.hidden=!L.send.error;
  const cancel=document.getElementById('lan-btn-cancel'); if(cancel) cancel.hidden=!(L.send.busy || L.send.waiting);
  const sp=document.getElementById('lan-send-phase'); if(sp) sp.textContent=L.send.phase||t('action.ready');
  const sd=document.getElementById('lan-send-detail'); if(sd) sd.textContent=L.send.detail||'';
  setLanBar('lan-send-bar','lan-send-pct',L.send.pct);
  const offer=document.getElementById('lan-offer-input');
  if(offer && document.activeElement!==offer) offer.value=L.recv.offer||'';
  const recvCode=document.getElementById('lan-recv-code');
  if(recvCode && document.activeElement!==recvCode) recvCode.value=L.recv.code||'';
  const copyRecv=document.getElementById('lan-btn-copy-recv'); if(copyRecv) copyRecv.hidden=!L.recv.code;
  setLanQr('lan-recv-qr',L.recv.code,!!L.recv.code);
  const accept=document.getElementById('lan-btn-accept'); if(accept) accept.disabled=L.recv.busy;
  const abandon=document.getElementById('lan-btn-abandon'); if(abandon) abandon.hidden=!L.recv.busy;
  const rp=document.getElementById('lan-recv-phase'); if(rp) rp.textContent=L.recv.phase||t('action.waiting');
  const rd=document.getElementById('lan-recv-detail'); if(rd) rd.textContent=L.recv.detail||'';
  setLanBar('lan-recv-bar','lan-recv-pct',L.recv.pct);
  const scanBox=document.getElementById('lan-scan'); if(scanBox) scanBox.hidden=!L.scanning;
  const scanHint=document.getElementById('lan-scan-hint');
  if(scanHint) scanHint.textContent=L.scanning==='answer'?t('lan.scanAnswerHint'):t('action.scanHint');
  const err=document.getElementById('lan-scan-error');
  if(err){ err.hidden=!L.scanError; err.textContent=L.scanError||''; }
}

/* ── 云端包仓库（S3 兼容；凭据只存本机浏览器，不可用时如实降级） ── */
const CLOUD_KEY = 'st-pack-transfer:s3';

function loadCloudConfig() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(CLOUD_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      endpoint: String(parsed.endpoint || ''),
      region: String(parsed.region || ''),
      bucket: String(parsed.bucket || ''),
      prefix: normalizePrefix(parsed.prefix || ''),
      pathStyle: !!parsed.pathStyle,
      accessKeyId: String(parsed.accessKeyId || ''),
      secretAccessKey: String(parsed.secretAccessKey || ''),
      passphrase: String(parsed.passphrase || ''),
      mode: parsed.mode === 'set' ? 'set' : 'full',
      setName: String(parsed.setName || 'default'),
      retention: Math.max(1, Math.min(99, Number(parsed.retention) || 10)),
    };
  } catch {
    return null;
  }
}
function persistCloudConfig(config) {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(CLOUD_KEY, JSON.stringify(config));
    return true;
  } catch {
    return false;
  }
}

const WEBDAV_KEY = 'st-pack-transfer:webdav';

/** WebDAV 配置：凭据只存本机浏览器；读不到时返回空配置而不是伪造。 */
function loadWebdavConfig() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const parsed = JSON.parse(localStorage.getItem(WEBDAV_KEY) || 'null');
    if (!parsed || typeof parsed !== 'object') return null;
    return {
      baseUrl: String(parsed.baseUrl || '').replace(/\/+$/, ''),
      username: String(parsed.username || ''),
      password: String(parsed.password || ''),
      prefix: normalizePrefix(parsed.prefix || ''),
      passphrase: String(parsed.passphrase || ''),
      mode: parsed.mode === 'set' ? 'set' : 'full',
      setName: String(parsed.setName || 'default'),
      retention: Math.max(1, Math.min(99, Number(parsed.retention) || 10)),
    };
  } catch {
    return null;
  }
}
function persistWebdavConfig(config) {
  if (typeof localStorage === 'undefined') return false;
  try {
    localStorage.setItem(WEBDAV_KEY, JSON.stringify(config));
    return true;
  } catch {
    return false;
  }
}
function activeCloudConfig() {
  return state.cloud.provider === 'webdav'
    ? (state.cloud.webdav || {})
    : (state.cloud.config || {});
}
function cloudConfigFromForm() {
  const val = (id) => (document.getElementById(id)?.value || '').trim();
  const shared = {
    mode: document.getElementById('cloud-mode-select')?.value || 'full',
    setName: val('cloud-set-name') || 'default',
    retention: Math.max(1, Math.min(99, Number(val('cloud-retention')) || 10)),
  };
  if (state.cloud.provider === 'webdav') {
    return {
      ...shared,
      baseUrl: val('webdav-base-url').replace(/\/+$/, ''),
      username: val('webdav-username'),
      password: document.getElementById('webdav-password')?.value || '',
      prefix: normalizePrefix(val('webdav-prefix')),
      passphrase: document.getElementById('webdav-passphrase')?.value || '',
    };
  }
  return {
    ...shared,
    endpoint: val('cloud-endpoint').replace(/\/+$/, ''),
    region: val('cloud-region') || 'us-east-1',
    bucket: val('cloud-bucket'),
    prefix: normalizePrefix(val('cloud-prefix')),
    pathStyle: !!document.getElementById('cloud-path-style')?.checked,
    accessKeyId: val('cloud-access-key'),
    secretAccessKey: val('cloud-secret-key'),
    passphrase: document.getElementById('cloud-passphrase')?.value || '',
  };
}
function cloudClient() {
  const cfg = activeCloudConfig();
  if (state.cloud.provider === 'webdav') {
    const dav = createWebdavClient({
      config: cfg,
      fetchImpl: (url, init) => fetch(url, init),
    });
    return {
      ready: dav.ready,
      ensureCollection: (path) => dav.ensureCollection(path),
      putObject: (key, bytes, opts) => dav.putObject(key, bytes, opts),
      getObject: (key) => dav.getObject(key),
      deleteObject: (key) => dav.deleteObject(key),
      async listObjects(prefix = '') {
        const result = await dav.list(prefix);
        if (!result.ok) {
          return { ok: false, status: result.status, message: result.code || result.message };
        }
        const base = String(prefix || '').replace(/\/+$/, '');
        const items = (result.items || [])
          .filter((item) => item && !item.isDir && item.name)
          .map((item) => ({
            key: base ? `${base}/${item.name}` : item.name,
            size: item.size,
            lastModified: item.lastModified,
          }));
        return { ok: true, status: result.status, items };
      },
    };
  }
  return createS3Client({
    config: cfg,
    fetchImpl: (url, init) => fetch(url, init),
  });
}
function cloudReady() {
  return cloudClient().ready;
}
function renderCloud() {
  const C = state.cloud;
  const view = document.getElementById('cloud-view');
  if (!view) return;
  view.hidden = !(state.transfer.open && state.transfer.tab === 'cloud');
  document.querySelectorAll('[data-cloud-provider]').forEach((b) => {
    b.classList.toggle('active', b.dataset.cloudProvider === C.provider);
  });
  const s3Pane = document.getElementById('cloud-s3-pane');
  const wdPane = document.getElementById('cloud-webdav-pane');
  if (s3Pane) s3Pane.hidden = C.provider !== 's3';
  if (wdPane) wdPane.hidden = C.provider !== 'webdav';

  const cfg = activeCloudConfig() || {};
  const setVal = (id, value) => {
    const el = document.getElementById(id);
    if (el && document.activeElement !== el) el.value = value;
  };
  if (C.provider === 'webdav') {
    setVal('webdav-base-url', cfg.baseUrl || '');
    setVal('webdav-username', cfg.username || '');
    setVal('webdav-password', cfg.password || '');
    setVal('webdav-prefix', cfg.prefix || '');
    setVal('webdav-passphrase', cfg.passphrase || '');
  } else {
    setVal('cloud-endpoint', cfg.endpoint || '');
    setVal('cloud-region', cfg.region || '');
    setVal('cloud-bucket', cfg.bucket || '');
    setVal('cloud-prefix', cfg.prefix || '');
    setVal('cloud-access-key', cfg.accessKeyId || '');
    setVal('cloud-secret-key', cfg.secretAccessKey || '');
    setVal('cloud-passphrase', cfg.passphrase || '');
    const ps = document.getElementById('cloud-path-style');
    if (ps) ps.checked = !!cfg.pathStyle;
  }
  const modeSelect = document.getElementById('cloud-mode-select');
  if (modeSelect && document.activeElement !== modeSelect) modeSelect.value = cfg.mode || 'full';
  setVal('cloud-set-name', cfg.setName || 'default');
  setVal('cloud-retention', String(cfg.retention || 10));
  const status = document.getElementById('cloud-status');
  if (status) status.textContent = C.status || '';
  const picked = document.getElementById('cloud-picked');
  if (picked) {
    picked.textContent = state.selectedPkgs.size
      ? t('cloud.selectedCount', { n: state.selectedPkgs.size })
      : '';
  }
  const upload = document.getElementById('cloud-upload');
  if (upload) upload.disabled = !!C.busy || state.selectedPkgs.size === 0 || !cloudReady();
  const backupSelected = document.getElementById('cloud-backup-selected');
  if (backupSelected) backupSelected.disabled = !!C.busy || state.selectedPkgs.size === 0;
  const list = document.getElementById('cloud-list');
  if (!list) return;
  if (!C.list.length) {
    list.innerHTML = '<div class="cloud-empty">' + t('cloud.empty') + '</div>';
    return;
  }
  list.innerHTML = C.list
    .map((item) => {
      const snapshot = item.kind === 'set-snapshot';
      const key = escapeHtml(item.key);
      const label = snapshot ? `${item.setName} · ${item.ts}` : item.key;
      const sizeText = snapshot
        ? t('cloud.snapshotMeta', { n: Number(item.entries) || 0 })
        : (item.size == null
          ? t('cloud.sizeUnknown')
          : fmtMB((Number(item.size) || 0) / 1048576)
            + (item.entryCount ? ` · ${t('cloud.entries', { n: item.entryCount })}` : ''));
      const primary = snapshot
        ? '<button type="button" class="ci-btn" data-cloud-restore="' + key + '">' + t('cloud.restore') + '</button>'
        : '<button type="button" class="ci-btn" data-cloud-get="' + key + '">' + t('cloud.download') + '</button>';
      const removeAttr = snapshot ? 'data-cloud-del-snapshot' : 'data-cloud-del';
      return '<div class="cloud-item' + (snapshot ? ' is-snapshot' : '') + '" data-cloud-key="' + key + '">' +
        '<span class="ci-name" title="' + escapeHtml(label) + '">' + escapeHtml(label) + '</span>' +
        '<span class="ci-size">' + escapeHtml(sizeText) + '</span>' +
        '<span class="ci-time">' + escapeHtml(String(item.lastModified || '').replace('T', ' ').slice(0, 16)) + '</span>' +
        primary +
        '<button type="button" class="ci-btn danger" ' + removeAttr + '="' + key + '">' + t('cloud.remove') + '</button>' +
        '</div>';
    })
    .join('');
}
async function cloudSave() {
  const C = state.cloud;
  const cfg = cloudConfigFromForm();
  let saved;
  if (C.provider === 'webdav') {
    C.webdav = cfg;
    saved = persistWebdavConfig(cfg);
  } else {
    C.config = cfg;
    saved = persistCloudConfig(cfg);
  }
  if (!saved) {
    C.status = t('cloud.saveFailed');
    renderCloud();
    return;
  }
  if (C.provider === 'webdav') {
    if (cfg.baseUrl && !/^https?:\/\//i.test(cfg.baseUrl)) {
      C.status = t('webdav.badEndpoint');
      renderCloud();
      return;
    }
  } else if (cfg.endpoint && !buildBaseUrl(cfg)) {
    C.status = t('cloud.badEndpoint');
    renderCloud();
    return;
  }
  C.status = t('cloud.saved');
  renderCloud();
  await cloudRefresh();
}
async function cloudRefresh() {
  const C = state.cloud;
  const target = createTransferTarget({
    kind: C.provider === 'webdav' ? 'webdav' : 's3',
    config: activeCloudConfig(),
    fetchImpl: (url, init) => fetch(url, init),
  });
  if (!target.ready) {
    C.list = [];
    C.status = t('cloud.notConfigured');
    renderCloud();
    return;
  }
  C.busy = true;
  C.status = t('cloud.loading');
  renderCloud();
  const prefix = activeCloudConfig().prefix || '';
  const res = await target.list(prefix);
  C.busy = false;
  // 列表不可用（WebDAV 禁 PROPFIND）时仍可从备份集登记表显示增量快照，不整体失败。
  const packs = new Map();
  for (const item of (res.ok ? res.items : [])) {
    if (/\.part\d+$/i.test(item.key)) continue;
    // 备份集（sets/**）由登记表单独读取，避免把 objects/ 当包显示。
    if (/(^|\/)sets\//i.test(item.key)) continue;
    if (/\.manifest\.json$/i.test(item.key)) {
      const base = item.key.slice(0, -'.manifest.json'.length);
      const man = await target.get(item.key);
      const parsed = man.ok && man.bytes
        ? parseManifest(new TextDecoder().decode(man.bytes))
        : null;
      // 临时清单（中断在半路）不算一个可下载的包。
      if (parsed?.provisional) continue;
      packs.set(base, {
        key: base,
        size: parsed ? parsed.size : null,
        entryCount: parsed?.entryCount ?? null,
        encrypted: Boolean(parsed?.encrypted),
        lastModified: item.lastModified,
      });
      continue;
    }
    packs.set(item.key, { key: item.key, size: item.size, lastModified: item.lastModified });
  }

  const snapshots = [];
  const registry = await readSetRegistry({ target, prefix });
  if (registry.ok) {
    for (const entry of registry.sets) {
      const setBase = objectKey(prefix, `sets/${entry.name}`);
      const set = await readBackupSet({ target, setBase });
      if (!set.ok) continue;
      for (const snapshot of set.index.snapshots) {
        snapshots.push({
          kind: 'set-snapshot',
          key: `${setBase}/${snapshot.key}`,
          setName: entry.name,
          ts: snapshot.ts,
          entries: snapshot.entries,
          size: snapshot.size,
          lastModified: snapshot.createdAt || entry.updatedAt || '',
        });
      }
    }
  }

  C.list = [...packs.values(), ...snapshots].sort(
    (a, b) => String(b.lastModified || '').localeCompare(String(a.lastModified || '')),
  );
  C.status = (!res.ok && !C.list.length)
    ? t('cloud.error', { msg: res.message || res.code })
    : (C.list.length ? t('cloud.loaded', { n: C.list.length }) : t('cloud.empty'));
  renderCloud();
}
function cloudErrorText(code) {
  if (code === 'passphrase-required') return t('cloud.needPassphrase');
  if (code === 'bad-passphrase') return t('cloud.badPassphrase');
  if (code === 'encryption-mismatch') return t('cloud.encryptionMismatch');
  if (code === 'set-single-pack') return t('cloud.setSinglePack');
  return t('cloud.error', { msg: code || 'unknown' });
}
async function cloudDownload(key) {
  const C = state.cloud;
  const cfg = activeCloudConfig();
  const target = createTransferTarget({
    kind: C.provider === 'webdav' ? 'webdav' : 's3',
    config: cfg,
    fetchImpl: (url, init) => fetch(url, init),
  });
  if (!target.ready) {
    C.status = t('cloud.notConfigured');
    renderCloud();
    return;
  }
  C.busy = true;
  C.status = t('cloud.loading');
  renderCloud();
  const runner = createTransferRunner({
    target,
    chunkSize: DEFAULT_CHUNK_SIZE,
    passphrase: cfg.passphrase,
    onProgress: (progress) => {
      if (progress.phase !== 'downloading') return;
      C.status = t('cloud.downloadingChunk', {
        done: (Number(progress.downloadedBytes) / 1048576).toFixed(1),
        total: (Number(progress.totalBytes) / 1048576).toFixed(1),
      });
      renderCloud();
    },
  });
  const res = await runner.download({ name: key });
  C.busy = false;
  if (!res.ok) {
    C.status = cloudErrorText(res.code || res.message);
    renderCloud();
    return;
  }
  let bytes = res.bytes;
  let name = String(key).split('/').pop() || 'pack.zip';
  if (isEncrypted(bytes)) {
    if (!cfg.passphrase) {
      C.status = t('cloud.needPassphrase');
      renderCloud();
      return;
    }
    try {
      bytes = await decryptBytes(bytes, cfg.passphrase);
      name = name.replace(/\.spt$/i, '') + '.zip';
    } catch {
      C.status = t('cloud.badPassphrase');
      renderCloud();
      return;
    }
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  C.status = t('cloud.downloaded', { name });
  renderCloud();
}
async function cloudRestoreSnapshot(key) {
  const C = state.cloud;
  const cfg = activeCloudConfig();
  const target = createTransferTarget({
    kind: C.provider === 'webdav' ? 'webdav' : 's3',
    config: cfg,
    fetchImpl: (url, init) => fetch(url, init),
  });
  if (!target.ready) {
    C.status = t('cloud.notConfigured');
    renderCloud();
    return;
  }
  const at = String(key).indexOf('/snapshots/');
  if (at < 0) {
    C.status = cloudErrorText('bad-snapshot-key');
    renderCloud();
    return;
  }
  const setBase = String(key).slice(0, at);
  C.busy = true;
  C.status = t('cloud.restoringSnapshot');
  renderCloud();
  let result;
  try {
    result = await restoreBackupSet({
      target,
      setBase,
      snapshotKey: key,
      passphrase: cfg.passphrase,
      onProgress: (progress) => {
        C.status = t('cloud.restoringEntry', { done: progress.done, total: progress.total });
        renderCloud();
      },
    });
  } catch (error) {
    result = { ok: false, code: String(error?.message || error) };
  }
  C.busy = false;
  if (!result.ok) {
    C.status = cloudErrorText(result.code || result.message);
    renderCloud();
    return;
  }
  await actions.importCloudPack?.({ name: result.name, blob: result.blob });
  C.status = t('cloud.restoredSnapshot', { name: result.name, n: result.entries });
  renderCloud();
}

async function cloudDeleteSnapshot(key) {
  const C = state.cloud;
  const target = createTransferTarget({
    kind: C.provider === 'webdav' ? 'webdav' : 's3',
    config: activeCloudConfig(),
    fetchImpl: (url, init) => fetch(url, init),
  });
  if (!target.ready) {
    C.status = t('cloud.notConfigured');
    renderCloud();
    return;
  }
  const at = String(key).indexOf('/snapshots/');
  if (at < 0) {
    C.status = cloudErrorText('bad-snapshot-key');
    renderCloud();
    return;
  }
  const setBase = String(key).slice(0, at);
  C.busy = true;
  C.status = t('cloud.loading');
  renderCloud();
  let result;
  try {
    result = await removeSnapshotFromSet({ target, setBase, snapshotKey: key });
  } catch (error) {
    result = { ok: false, code: String(error?.message || error) };
  }
  C.busy = false;
  if (!result.ok) {
    C.status = cloudErrorText(result.code || result.message);
    renderCloud();
    return;
  }
  C.status = t('cloud.snapshotRemoved');
  renderCloud();
  await cloudRefresh();
}

async function cloudDelete(key) {
  const C = state.cloud;
  const target = createTransferTarget({
    kind: C.provider === 'webdav' ? 'webdav' : 's3',
    config: activeCloudConfig(),
    fetchImpl: (url, init) => fetch(url, init),
  });
  if (!target.ready) {
    C.status = t('cloud.notConfigured');
    renderCloud();
    return;
  }
  C.busy = true;
  C.status = t('cloud.loading');
  renderCloud();
  const manifestResult = await target.get(manifestKey(key));
  const manifest = manifestResult.ok && manifestResult.bytes
    ? parseManifest(new TextDecoder().decode(manifestResult.bytes))
    : null;
  if (manifest) {
    for (const chunk of manifest.chunks) {
      await target.remove(chunkKey(key, chunk.index));
    }
    await target.remove(manifestKey(key));
  }
  const direct = await target.remove(key);
  C.busy = false;
  if (!direct.ok && !(manifest && direct.status === 404)) {
    C.status = t('cloud.error', { msg: direct.message || direct.code });
    renderCloud();
    return;
  }
  C.status = t('cloud.removed', { name: key });
  renderCloud();
  await cloudRefresh();
}

let stopLanScan=null;
function finishLanScan(){
  if(stopLanScan){ try{ stopLanScan(); }catch{ /* 已停止 */ } stopLanScan=null; }
  state.lan.scanning=null;
  renderLan();
}
async function copyLanText(text){
  if(!text) return;
  try { await navigator.clipboard.writeText(text); toast(t('lan.copied')); }
  catch { toast(t('lan.copyFailed')); }
}
async function startLanScan(kind){
  if(typeof qr?.scan!=='function'){ toast(t('lan.scanUnsupported')); return; }
  state.lan.scanError=''; state.lan.scanning=kind; renderLan();
  try {
    stopLanScan=await qr.scan({
      video:document.getElementById('lan-scan-video'),
      canvas:document.getElementById('lan-scan-canvas'),
      onResult:(text)=>{
        finishLanScan();
        if(kind==='offer'){
          const el=document.getElementById('lan-offer-input');
          if(el) el.value=text;
          state.lan.recv.offer=text;
          actions.lan?.acceptOffer?.(text);
        }else{
          const el=document.getElementById('lan-answer-input');
          if(el) el.value=text;
          state.lan.send.answer=text;
          actions.lan?.applyAnswer?.(text);
        }
      },
      onError:(msg)=>{ state.lan.scanError=msg||t('lan.cameraUnavailable'); finishLanScan(); },
    });
  } catch(err) {
    state.lan.scanError=err?.message||t('lan.cameraUnavailable');
    finishLanScan();
  }
}

/* ── 渲染：日志 ── */
function renderLog(){
  const lines=document.getElementById('log-lines');
  const filter=state.logLevel;
  const list=state.log.filter(l=>filter==='ALL'||l.level===filter);
  lines.innerHTML=list.map(l=>'<div class="log-line '+l.level.toLowerCase()+'"><span class="t">['+escapeHtml(l.time)+']</span> <span class="lv">['+l.level+']</span> '+escapeHtml(l.msg)+'</div>').join('') || '<div class="log-line">'+t('log.empty')+'</div>';
  const last=state.log[state.log.length-1];
  document.getElementById('log-latest').textContent=last?last.msg:t('log.empty');
  /* 等级按钮直接带条数：取消独立徽标，避免同一数字出现两次。 */
  const counts={ALL:state.log.length,INFO:0,WARN:0,ERROR:0};
  state.log.forEach(l=>{ if(counts[l.level]!==undefined) counts[l.level]++; });
  const labels={ALL:t('log.all'),INFO:t('log.info'),WARN:t('log.warn'),ERROR:t('log.error')};
  Object.keys(labels).forEach(level=>{
    const btn=document.querySelector('.log-level-btn[data-level="'+level+'"]');
    if(!btn) return;
    btn.textContent=labels[level]+' ('+counts[level]+')';
    btn.classList.toggle('active',state.logLevel===level);
  });
  const dot=document.getElementById('log-dot');
  if(dot){ const n=counts.WARN+counts.ERROR; dot.hidden=n===0; dot.title=t('log.dotTitle',{n}); }
  const body=document.getElementById('log-body'); body.scrollTop=body.scrollHeight;
}
function escapeHtml(s){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ── 动作 ── */
function doFetch(){ actions.fetch?.(); return undefined; }
function doGenerate(){
  const pkgs=[...state.selectedPkgs].map(id=>state.packages.find(p=>p.id===id)).filter(Boolean);
  actions.generate?.({ packages: pkgs, merge: mergeActive(pkgs), target: state.target, delta: state.delta, splitMb: state.splitMb, filenameTemplate: state.filenameTemplate });
}
function doUploadHost(){ actions.restore?.([...state.selectedPkgs]); }
function doCopyBack(){ actions.copyBack?.([...state.selectedPkgs]); }
function doDeleteSelected(){ actions.deleteSelected?.([...state.selectedPkgs]); }

/* ── 面板内视图（设置 / 日志 / 帮助；确认框为顶层 dialog） ── */
const PANES=['workbench','settings','log','help'];
function showPane(name){
  state.pane=PANES.includes(name)?name:'workbench';
  const main=document.getElementById('view-workbench');
  if(main) main.hidden=state.pane!=='workbench';
  PANES.slice(1).forEach(p=>{
    const el=document.getElementById('view-'+p);
    if(el) el.hidden=state.pane!==p;
  });
  document.querySelectorAll('.app-header .icon-btn').forEach(b=>b.classList.remove('active-view'));
  if(state.pane==='settings') document.getElementById('btn-settings')?.classList.add('active-view');
}
function backToWorkbench(){ showPane('workbench'); }

function openSettingsView(html,{onSave,onClose,onAction}={}){
  const body=document.getElementById('settings-body');
  if(!body) return;
  body.innerHTML=html||'';
  const done=()=>{ onClose?.(); backToWorkbench(); };
  const save=document.getElementById('settings-save');
  if(save) save.onclick=()=>{ onSave?.(body); };
  ['settings-cancel','settings-close'].forEach(id=>{
    const b=document.getElementById(id);
    if(b) b.onclick=done;
  });
  body.querySelectorAll('[data-action]').forEach(el=>{
    el.addEventListener('click',()=>onAction?.(el.dataset.action, el));
  });
  showPane('settings');
}

/* ── 确认浮层（原生 dialog 顶层；签名沿用原弹窗，调用方零改动） ── */
function confirmDialogEl(){ return document.getElementById('confirm-dialog'); }
function openModal(title,desc,extraHtml,actions){
  const dlg=confirmDialogEl();
  if(!dlg) return;
  document.getElementById('modal-title').textContent=title;
  document.getElementById('modal-desc').textContent=desc;
  document.getElementById('modal-extra').innerHTML=(Array.isArray(extraHtml) ? extraHtml.join('') : (extraHtml || ''));
  const acts=document.getElementById('modal-actions'); acts.innerHTML='';
  (actions||[]).forEach(a=>{
    const b=document.createElement('button');
    b.className='btn'+(a.primary?' accent':'');
    b.textContent=a.label;
    if(a.danger) b.style.background='var(--drop)',b.style.borderColor='var(--drop)';
    b.addEventListener('click',a.onClick);
    acts.appendChild(b);
  });
  if(typeof dlg.showModal==='function'){
    if(!dlg.open) dlg.showModal();
  }else{
    dlg.setAttribute('open','');
  }
}
function closeModal(){
  const dlg=confirmDialogEl();
  if(!dlg) return;
  if(typeof dlg.close==='function' && dlg.open) dlg.close();
  else dlg.removeAttribute('open');
  const acts=document.getElementById('modal-actions');
  if(acts) acts.innerHTML='';
}
function openTrafficModal(onConfirm, { enabled = true, onNever, onCancel } = {}){
  if(!enabled || state.noTrafficPrompt){ onConfirm(); return; }
  openModal(t('traffic.title'),t('traffic.desc'),[
    '<label class="check"><input type="checkbox" id="traffic-nodisplay"> '+t('traffic.never')+'</label>'
  ],[
    {label:t('traffic.cancel'),onClick:()=>{ closeModal(); onCancel?.(); }},
    {label:t('traffic.continue'),primary:true,onClick:()=>{
      const cb=document.getElementById('traffic-nodisplay');
      if(cb && cb.checked){ state.noTrafficPrompt=true; onNever?.(); log('INFO',t('traffic.off')); }
      closeModal(); onConfirm();
    }}
  ]);
}

/* ── 帮助视图 ── */const HELP={
  chart:{ title:'help.chart.title', sections:[
    { title:'help.chart.rulesTitle', points:['help.chart.ruleST','help.chart.ruleL','help.chart.ruleTT','help.chart.rulePT'] },
    { title:'help.chart.selectTitle', points:['help.chart.selectP1','help.chart.selectP2','help.chart.selectP3','help.chart.selectP4'] },
    { title:'help.chart.compatTitle', points:['help.chart.compatP1','help.chart.compatP2','help.chart.compatP3'] },
    { title:'help.chart.chunkTitle', points:['help.chart.chunkP1','help.chart.chunkP2','help.chart.chunkP3'] },
  ]},
  zone:{ title:'help.zone.title', sections:[
    { title:'help.zone.uploadTitle', points:['help.zone.uploadP1','help.zone.uploadP2','help.zone.uploadP3','help.zone.uploadP4'] },
    { title:'help.zone.manifestTitle', points:['help.zone.manifestP1','help.zone.manifestP2','help.zone.manifestP3','help.zone.manifestP4','help.zone.manifestP5'] },
    { title:'help.zone.extTitle', points:['help.zone.extP1','help.zone.extP2','help.zone.extP3','help.zone.extP4'] },
    { title:'help.zone.assetTitle', points:['help.zone.assetP1','help.zone.assetP2','help.zone.assetP3'] },
  ]},
  action:{ title:'help.action.title', sections:[
    { title:'help.action.flowTitle', points:['help.action.p1','help.action.p2','help.action.p3'] },
  ]},
  log:{ title:'help.log.title', points:['help.log.p1','help.log.p2','help.log.p3'] }
};
function closeHelp(){
  const title=document.getElementById('help-title');
  const body=document.getElementById('help-body');
  if(title) title.textContent='';
  if(body) body.innerHTML='';
  if(state.pane==='help') backToWorkbench();
}
function openHelp(key){
  const topic=HELP[key]; if(!topic) return;
  const title=document.getElementById('help-title');
  const body=document.getElementById('help-body');
  if(!title||!body) return;
  title.textContent=t(topic.title);
  if(topic.sections){
    body.innerHTML=topic.sections.map(s=>
      '<section class="help-sec"><h4>'+t(s.title)+'</h4><ul>'
        +s.points.map(x=>'<li>'+t(x)+'</li>').join('')
      +'</ul></section>'
    ).join('');
  }else{
    body.innerHTML='<ul>'+topic.points.map(x=>'<li>'+t(x)+'</li>').join('')+'</ul>';
  }
  showPane('help');
}

/* ── 教程 ── */
const TUTORIAL_BASIC=[
  { sel:'#target-select', title:'tutorial.basic.0.title', desc:'tutorial.basic.0.desc' },
  { sel:'#chart-stack .vol-card', title:'tutorial.basic.1.title', desc:'tutorial.basic.1.desc' },
  { sel:'#chart-stack .chart-tree', title:'tutorial.basic.2.title', desc:'tutorial.basic.2.desc' },
  { sel:'#delta-toggle', title:'tutorial.basic.3.title', desc:'tutorial.basic.3.desc' },
  { sel:'#split-input', title:'tutorial.basic.4.title', desc:'tutorial.basic.4.desc' },
  { sel:'#zone-actions-bottom', title:'tutorial.basic.5.title', desc:'tutorial.basic.5.desc' },
  { sel:'#zone-card', title:'tutorial.basic.6.title', desc:'tutorial.basic.6.desc' }
];
const TUTORIAL_ADV=[
  { sel:'#dropzone', title:'tutorial.adv.0.title', desc:'tutorial.adv.0.desc' },
  { sel:'#chart-stack', title:'tutorial.adv.1.title', desc:'tutorial.adv.1.desc' },
  { sel:'#target-select', title:'tutorial.adv.2.title', desc:'tutorial.adv.2.desc' },
  { sel:'#split-input', title:'tutorial.adv.3.title', desc:'tutorial.adv.3.desc' },
  { sel:'#zone-actions-bottom', title:'tutorial.adv.4.title', desc:'tutorial.adv.4.desc' }
];
function tutorialSet(){ return state.tutorialKind==='adv' ? TUTORIAL_ADV : TUTORIAL_BASIC; }
function openTutorial(){
  state.tutorialOpen=true; state.tutorialStep=0; state.tutorialKind='basic';
  const overlay=document.getElementById('tutorial-overlay');
  if(!overlay) return;
  /* 首帧禁用位置过渡：蒙层必须立即铺满，不能从上一坐标飞过来（2026-11-09 用户反馈）。 */
  overlay.classList.add('open','instant');
  renderTutorial();
  const settle=()=>overlay.classList.remove('instant');
  if(typeof requestAnimationFrame==='function') requestAnimationFrame(()=>requestAnimationFrame(settle));
  else settle();
}
function closeTutorial(){ state.tutorialOpen=false; document.getElementById('tutorial-overlay').classList.remove('open'); }
function renderTutorial(){
  const set=tutorialSet();
  const step=set[state.tutorialStep];
  document.getElementById('tutorial-title').textContent=t(step.title);
  document.getElementById('tutorial-desc').textContent=t(step.desc);
  const dots=document.getElementById('tutorial-dots'); dots.innerHTML=set.map((_,i)=>'<i class="'+(i===state.tutorialStep?'on':'')+'"></i>').join('');
  document.getElementById('tutorial-prev').disabled=state.tutorialStep===0;
  document.getElementById('tutorial-next').textContent=state.tutorialStep===set.length-1?t('tutorial.done'):t('tutorial.next');
  document.getElementById('tutorial-adv').textContent=state.tutorialKind==='adv'?t('tutorial.basic'):t('tutorial.adv');
  const el=document.querySelector(step.sel);
  const ring=document.getElementById('tutorial-ring');
  const card=document.getElementById('tutorial-card');
  const overlay=document.getElementById('tutorial-overlay');
  /* 目标不存在时隐藏高亮环：保留上一帧的位置比不显示更糟（R6.4 锚定失败）。 */
  if(!el){ ring.style.display='none'; card.style.display='none'; return; }
  ring.style.display=''; card.style.display='';
  if(overlay){
    const anchor=tutorialAnchor(el.getBoundingClientRect(), overlay.getBoundingClientRect());
    ring.style.left=anchor.ring.left+'px';
    ring.style.top=anchor.ring.top+'px';
    ring.style.width=anchor.ring.width+'px';
    ring.style.height=anchor.ring.height+'px';
    card.style.left=anchor.card.left+'px';
    card.style.top=anchor.card.top+'px';
    card.style.width=anchor.card.width+'px';
  }
}

/* ── 全名查看（面板内提示，不使用固定定位浮层） ── */
function showFullName(el){
  const name=decodeURIComponent(el.dataset.fullname||'');
  if(name) toast(name);
}

/* ── 进度 ── */
let pendingProgress = null;
let progressRaf = 0;
function applyProgress(pct, label){
  document.getElementById('progress-fill').style.width=Math.max(0,Math.min(100,pct))+'%';
  document.getElementById('progress-pct').textContent=Math.round(pct)+'%';
  if(label) document.getElementById('progress-label').textContent=label;
}
function setProgress(pct,label){
  pendingProgress = { pct, label };
  if(progressRaf) return;
  if(typeof requestAnimationFrame !== 'function'){ applyProgress(pct,label); return; }
  progressRaf = requestAnimationFrame(()=>{
    progressRaf = 0;
    const next = pendingProgress;
    pendingProgress = null;
    if(next) applyProgress(next.pct, next.label);
  });
}

/* ── 事件绑定 ── */
function bind(){
  document.getElementById('btn-guide').addEventListener('click',openTutorial);
  document.getElementById('btn-settings').addEventListener('click',()=>actions.settings?.());
  const extModeClick = (e) => {
    const extBtn = e.target.closest('[data-setting-extmode]');
    if(extBtn){
      extBtn.parentElement.querySelectorAll('[data-setting-extmode]').forEach(b => b.classList.toggle('active', b === extBtn));
    }
  };
  ['modal-extra','settings-body'].forEach(id => document.getElementById(id)?.addEventListener('click', extModeClick));
  document.getElementById('btn-close')?.addEventListener('click',()=>actions.close?.());

  // 视图切换：桌面 2 个（图表 / 扩展管理），手机 3 个（图表 / 数据包 / 扩展管理）
  document.getElementById('view-switch')?.addEventListener('click',(e)=>{
    const b=e.target.closest('[data-wbview]'); if(!b) return;
    const v=b.dataset.wbview;
    if(state.view==='mobile') state.mobileView = (v==='zone'||v==='extension') ? v : 'chart';
    else state.mainView = v==='extension' ? 'extension' : 'chart';
    syncMainView();
    if(v==='extension') renderExtensionView();
  });
  document.getElementById('extension-close-btn')?.addEventListener('click',()=>{
    state.mainView='chart'; if(state.view==='mobile') state.mobileView='chart'; syncMainView();
  });
  document.getElementById('extmgr-tabs')?.addEventListener('click',(e)=>{
    const b=e.target.closest('[data-exttab]'); if(!b) return;
    state.extTab=b.dataset.exttab; renderExtensionView();
  });
  // 浏览器 / 宿主配额：点击跳到宿主原生存储页的对应分页（能力由控制器探测后传入）。
  document.getElementById('quota-head')?.addEventListener('click',(e)=>{
    const row=e.target.closest('[data-quota-kind]');
    if(!row) return;
    actions.hostStoragePage?.(row.dataset.quotaKind);
  });
  // 文件名模板默认折叠
  document.getElementById('filename-toggle')?.addEventListener('click',()=>{
    const row=document.getElementById('filename-row');
    const btn=document.getElementById('filename-toggle');
    if(!row) return;
    const open=row.hidden;
    row.hidden=!open;
    if(btn) btn.setAttribute('aria-expanded',open?'true':'false');
  });
  if(typeof window!=='undefined'){
    window.addEventListener('resize',()=>{ syncView(); syncMainView(); });
  }

  document.querySelectorAll('[data-help]').forEach(b=>b.addEventListener('click',e=>{ e.stopPropagation(); openHelp(b.dataset.help); }));

  // ── 顶部全局动作（按钮随 renderTopActions 重建）──
  document.getElementById('top-actions').addEventListener('click',(e)=>{
    if(e.target.closest('#transfer-open-btn')){
      state.transfer.open=true;
      if(state.transfer.tab!=='lan' && state.transfer.tab!=='cloud') state.transfer.tab='lan';
      renderTransfer(); renderLan(); renderCloud();
      return;
    }
  });
  document.getElementById('transfer-close-btn')?.addEventListener('click',()=>{
    state.transfer.open=false;
    renderTransfer(); renderLan(); renderCloud();
  });
  document.getElementById('transfer-tabs')?.addEventListener('click',(e)=>{
    const b=e.target.closest('[data-transfer-tab]'); if(!b) return;
    state.transfer.tab=b.dataset.transferTab==='cloud'?'cloud':'lan';
    renderTransfer(); renderLan(); renderCloud();
  });
  document.getElementById('cloud-provider-tabs')?.addEventListener('click',(e)=>{
    const b=e.target.closest('[data-cloud-provider]'); if(!b) return;
    state.cloud.provider=b.dataset.cloudProvider==='webdav'?'webdav':'s3';
    state.cloud.status='';
    state.cloud.list=[];
    renderCloud();
  });
  document.getElementById('webdav-save')?.addEventListener('click',()=>cloudSave());
  document.getElementById('webdav-refresh')?.addEventListener('click',()=>cloudRefresh());
  document.getElementById('lan-btn-generate').addEventListener('click',()=>actions.lan?.generate?.());
  document.getElementById('lan-btn-copy-send').addEventListener('click',()=>{
    copyLanText(document.getElementById('lan-send-code')?.value||'');
  });
  document.getElementById('lan-btn-apply-answer').addEventListener('click',()=>{
    actions.lan?.applyAnswer?.(document.getElementById('lan-answer-input')?.value.trim()||'');
  });
  document.getElementById('lan-btn-accept').addEventListener('click',()=>{
    actions.lan?.acceptOffer?.(document.getElementById('lan-offer-input')?.value.trim()||'');
  });
  document.getElementById('lan-btn-copy-recv').addEventListener('click',()=>{
    copyLanText(document.getElementById('lan-recv-code')?.value||'');
  });
  document.getElementById('lan-btn-retry').addEventListener('click',()=>actions.lan?.retry?.());
  document.getElementById('lan-btn-cancel').addEventListener('click',()=>{ finishLanScan(); actions.lan?.cancel?.(); });
  document.getElementById('lan-btn-abandon').addEventListener('click',()=>actions.lan?.abandon?.());
  document.getElementById('lan-btn-scan-offer').addEventListener('click',()=>startLanScan('offer'));
  document.getElementById('lan-btn-scan-answer').addEventListener('click',()=>startLanScan('answer'));
  document.getElementById('lan-scan-cancel').addEventListener('click',()=>finishLanScan());

  // ── 云端包仓库 ──
  document.getElementById('cloud-save')?.addEventListener('click',()=>cloudSave());
  document.getElementById('cloud-refresh')?.addEventListener('click',()=>cloudRefresh());
  document.getElementById('cloud-upload')?.addEventListener('click',async()=>{
    const cfg = activeCloudConfig();
    await actions.backupSelectedToCloud?.({
      provider: state.cloud.provider,
      config: cfg,
      mode: 'plain',
      setName: cfg.setName || 'default',
      retention: cfg.retention || 10,
    });
    await cloudRefresh();
  });
  document.getElementById('cloud-backup-selected')?.addEventListener('click',async()=>{
    const cfg = activeCloudConfig();
    await actions.backupSelectedToCloud?.({
      provider: state.cloud.provider,
      config: cfg,
      mode: cfg.mode || 'full',
      setName: cfg.setName || 'default',
      retention: cfg.retention || 10,
    });
    await cloudRefresh();
  });
  document.getElementById('cloud-list')?.addEventListener('click',(e)=>{
    const get=e.target.closest('[data-cloud-get]');
    if(get){ cloudDownload(get.dataset.cloudGet); return; }
    const restore=e.target.closest('[data-cloud-restore]');
    if(restore){ cloudRestoreSnapshot(restore.dataset.cloudRestore); return; }
    const delSnapshot=e.target.closest('[data-cloud-del-snapshot]');
    if(delSnapshot){ cloudDeleteSnapshot(delSnapshot.dataset.cloudDelSnapshot); return; }
    const del=e.target.closest('[data-cloud-del]');
    if(del) cloudDelete(del.dataset.cloudDel);
  });
  document.getElementById('lan-answer-input').addEventListener('input',(e)=>{ state.lan.send.answer=e.target.value; });
  document.getElementById('lan-offer-input').addEventListener('input',(e)=>{ state.lan.recv.offer=e.target.value; });

  document.getElementById('zone-tabs').addEventListener('click',e=>{
    const b=e.target.closest('.zone-tab'); if(!b) return;
    /* 切区必须让「选中集合」与「当前来源」一起失效并整体重绘：
       否则包卡的选中环会留下，而图表已被清空（2026-11-11 实测）。 */
    state.zone=b.dataset.zone; state.selectedPkgs=new Set();
    state.source={type:'host', pkgId:null}; state.sourceKey='host:'+state.host;
    renderAll();
  });

  const targetBtn=document.getElementById('target-btn');
  const targetPop=document.getElementById('target-pop');
  const closeTargetPop=()=>{ targetPop.hidden=true; targetBtn.setAttribute('aria-expanded','false'); };
  targetBtn.addEventListener('click',e=>{
    e.stopPropagation();
    const willOpen=targetPop.hidden;
    targetPop.hidden=!willOpen;
    targetBtn.setAttribute('aria-expanded',String(willOpen));
  });
  targetPop.addEventListener('click',e=>{
    const it=e.target.closest('[data-target]'); if(!it) return;
    state.target=it.dataset.target;
    state.targetManual=true;
    closeTargetPop(); renderTargetPicker(); renderChart();
    log('INFO',t('toast.targetChanged',{target:state.target}));
    actions.onTargetChange?.(state.target);
  });
  document.addEventListener('click',e=>{
    if(!targetPop.hidden && !e.target.closest('#target-select')) closeTargetPop();
  });
  document.getElementById('delta-toggle').addEventListener('click',e=>{
    const b=e.target.closest('button[data-delta]'); if(!b) return;
    document.querySelectorAll('#delta-toggle button').forEach(x=>x.classList.toggle('active',x===b));
    state.delta=b.dataset.delta; log('INFO',state.delta==='overwrite'?t('toast.deltaOverwrite'):t('toast.deltaIncremental'));
  });
  const splitInput=document.getElementById('split-input');
  const restoreSplitInput=()=>{ splitInput.value=state.splitMb; updateSplitSim(); };
  const commitSplit=(mb)=>{
    const next=Math.min(SPLIT_MAX,Math.max(SPLIT_MIN,Math.round(mb)));
    state.splitMb=String(next);
    splitInput.value=String(next);
    updateSplitSim();
    renderChart();
  };
  /* 输入过程中只预览估算，未确认前不写 state、不重算图表 */
  splitInput.addEventListener('input',e=>{ updateSplitSim(e.target.value); });
  splitInput.addEventListener('change',e=>{
    const raw=Number(e.target.value);
    if(e.target.value===''||!isFinite(raw)){ restoreSplitInput(); return; }
    const clamped=Math.min(SPLIT_MAX,Math.max(SPLIT_MIN,Math.round(raw)));
    if(clamped!==raw){
      splitInput.value=String(clamped);
      toast(t('toast.splitLimit',{min:SPLIT_MIN,max:SPLIT_MAX}));
    }
    if(state.splitMb!=='' && Number(state.splitMb)===clamped){ updateSplitSim(); return; }
    openModal(t('split.confirmTitle'),t('split.confirmDesc',{n:clamped}),[],[
      {label:t('modal.cancel'),onClick:()=>{ closeModal(); restoreSplitInput(); }},
      {label:t('modal.confirm'),primary:true,onClick:()=>{ closeModal(); commitSplit(clamped); }}
    ]);
  });
  const compressionSelect=document.getElementById('compression-select');
  if(compressionSelect){
    compressionSelect.value=state.compression;
    compressionSelect.addEventListener('change',e=>{ state.compression=e.target.value; });
  }
  const filenameInput=document.getElementById('filename-template');
  if(filenameInput){
    filenameInput.value=state.filenameTemplate;
    filenameInput.addEventListener('input',()=>{ state.filenameTemplate=filenameInput.value; renderFilenamePreview(); });
  }

  document.getElementById('chart-pref-btn')?.addEventListener('click', openChartPrefs);

  const stackEl=document.getElementById('chart-stack');
  const scopeFromEl=el=>{ const h=el.closest('[data-scope]'); return h?h.dataset.scope:null; };
  const nodesForScope=scope=>{
    if(scope && scope.indexOf('pkg:')===0){
      const p=state.packages.find(x=>x.id===scope.slice(4));
      return p ? packageNodes(p).nodes : [];
    }
    if(scope && scope.indexOf('merge:')===0){
      const pkgs=scope.slice(6).split(',').filter(Boolean)
        .map(id=>state.packages.find(p=>p.id===id)).filter(Boolean);
      return pkgs.length ? mergedNodes(pkgs) : [];
    }
    return hostNodes(state.host).nodes;
  };
  const applyTreeAll=(scope,mode,quiet,rootNode)=>{
    const nodes = rootNode ? [rootNode] : nodesForScope(scope);
    walk(nodes,n=>{
      if(!n.children || !n.children.length){
        const cur=isChecked(n,scope);
        state.sel[treeKey(scope,n.id)] = mode==='all' ? true : mode==='none' ? false : !cur;
      }
    });
    if(!quiet) renderChart();
  };
  const closeGroup=(id)=>{
    state.selectedPkgs.delete(id);
    if(state.source.type==='package' && state.source.pkgId===id) state.source={type:'host',pkgId:null};
    renderChart(); renderZones(); renderActions();
  };

  stackEl.addEventListener('click',e=>{
    /* 最大化 / 面包屑 / 下钻：只改视图层级，勾选仍走同一 scope 与同一棵树。 */
    const maxBtn=e.target.closest('[data-volmax]');
    if(maxBtn){
      const key=maxBtn.dataset.volmax;
      state.volMaxKey = state.volMaxKey===key ? null : key;
      if(!state.volMaxKey) state.volPath[key]=[];
      renderChart(); return;
    }
    const crumb=e.target.closest('[data-volcrumb]');
    if(crumb){
      const key=crumb.closest('.vol-card')?.dataset.volkey;
      if(!key) return;
      const n=Math.max(0,Number(crumb.dataset.volcrumb)||0);
      state.volPath[key]=(state.volPath[key]||[]).slice(0,n);
      renderChart(); return;
    }
    const drill=e.target.closest('[data-voldrill]');
    if(drill){
      const key=drill.closest('.vol-card')?.dataset.volkey;
      if(!key) return;
      state.volPath[key]=[...(state.volPath[key]||[]),drill.dataset.voldrill];
      renderChart(); return;
    }
    const emptyFetch=e.target.closest('#btn-empty-fetch');
    if(emptyFetch){
      const fetchBtn=document.getElementById('btn-fetch');
      if(fetchBtn) fetchBtn.click();
      else actions.fetch?.();
      return;
    }
    const hostAssetList=e.target.closest('#btn-assetlist-host');
    if(hostAssetList){
      // 宿主扩展清单导出已收束到「扩展管理 → 已装」页，不再单独弹导出。
      state.extTab='installed'; state.mainView='extension';
      if(state.view==='mobile') state.mobileView='extension';
      syncMainView(); renderExtensionView();
      return;
    }
    const cardAssetList=e.target.closest('[data-assetlist]');
    if(cardAssetList){
      const pkgIds=String(cardAssetList.dataset.assetpkgs||'').split(',').filter(Boolean);
      actions.exportAssetList?.({source:'package', pkgIds});
      return;
    }
    const emptyImport=e.target.closest('#btn-empty-import');
    if(emptyImport){
      const fi=document.getElementById('file-input');
      if(fi) fi.click();
      return;
    }
    const extMode=e.target.closest('[data-extmode]');
    if(extMode){
      state.extensionMode = extMode.dataset.extmode==='manifest' ? EXTENSION_MODES.MANIFEST : EXTENSION_MODES.FULL;
      renderChart();
      return;
    }
    const extUnchecked=e.target.closest('[data-extunchecked]');
    if(extUnchecked){
      state.extUncheckedMode = extUnchecked.dataset.extunchecked==='manifest' ? 'manifest' : 'none';
      renderChart();
      return;
    }
    const prefExtMode=e.target.closest('[data-prefextmode]');
    if(prefExtMode){
      state.extensionMode = prefExtMode.dataset.prefextmode==='manifest' ? EXTENSION_MODES.MANIFEST : EXTENSION_MODES.FULL;
      prefExtMode.parentElement.querySelectorAll('[data-prefextmode]').forEach((b)=>b.classList.toggle('active', b===prefExtMode));
      return;
    }
    const sub=e.target.closest('[data-suball]');
    if(sub){
      const scope=scopeFromEl(sub); if(!scope) return;
      const node=findNode(nodesForScope(scope),sub.dataset.subnode);
      if(node) applyTreeAll(scope,sub.dataset.suball,false,node);
      return;
    }
    const bulk=e.target.closest('[data-treeall],[data-treenone],[data-treeinvert]');
    if(bulk){
      const scope=scopeFromEl(bulk); if(!scope) return;
      applyTreeAll(scope, bulk.dataset.treeall?'all':bulk.dataset.treenone?'none':'invert');
      return;
    }
    const vol=e.target.closest('[data-voltoggle]');
    if(vol){ const k=vol.dataset.voltoggle; state.collapsedVol[k]=!state.collapsedVol[k]; renderChart(); return; }
    const close=e.target.closest('[data-closegroup]');
    if(close){ closeGroup(close.dataset.closegroup); return; }
    const t=e.target.closest('[data-node]');
    if(t){
      const scope=scopeFromEl(t); if(!scope) return;
      const id=t.dataset.node, key=treeKey(scope,id);
      const row=t.closest('.tree-row');
      state.expanded[key]=state.expanded[key]!==undefined ? !state.expanded[key] : !row.classList.contains('expanded');
      renderChart(); return;
    }
    const priv=e.target.closest('[data-privfiles]');
    if(priv){ void openPrivateFiles(); return; }
    const extManifest=e.target.closest('[data-extmanifest]');
    if(extManifest){ actions.openExtensionManifest?.(extManifest.dataset.extmanifest); return; }
    const fmtBtn=e.target.closest('[data-chartfmt-toggle]');
    if(fmtBtn){
      const key=fmtBtn.dataset.chartfmtToggle;
      state.chartFmt[key] = chartFmtOf(key)==='bar' ? 'donut' : 'bar';
      renderChart(); return;
    }
    if(e.target.closest('#pref-save')){ saveChartPrefsDraft(); return; }
    if(e.target.closest('#pref-cancel')){ cancelChartPrefs(); return; }
  });
  stackEl.addEventListener('change',e=>{
    const pg=e.target.closest('[data-prefgroup]');
    if(pg){
      const base=state.prefDraft || normalizeChartPrefs(chartPrefs);
      const set=new Set(base.checkedGroups);
      if(pg.checked) set.add(pg.dataset.prefgroup); else set.delete(pg.dataset.prefgroup);
      state.prefDraft={...base, checkedGroups:[...set]};
      return;
    }
    const git=e.target.closest('[data-gitmode]');
    if(git){
      state.gitMode = [GIT_MODES.KEEP,GIT_MODES.MINIMAL,GIT_MODES.STRIP].includes(git.value) ? git.value : GIT_MODES.KEEP;
      return;
    }
    const prefGit=e.target.closest('[data-prefgitmode]');
    if(prefGit){
      state.gitMode = [GIT_MODES.KEEP,GIT_MODES.MINIMAL,GIT_MODES.STRIP].includes(prefGit.value) ? prefGit.value : GIT_MODES.KEEP;
      return;
    }
    const prefKeepDev=e.target.closest('[data-prefkeepdev]');
    if(prefKeepDev){ state.keepDev = !!prefKeepDev.checked; return; }
    const keepDev=e.target.closest('[data-keepdev]');
    if(keepDev){ state.keepDev = !!keepDev.checked; return; }
    const cb=e.target.closest('[data-check]'); if(!cb) return;
    const scope=scopeFromEl(cb); if(!scope) return;
    const tree=nodesForScope(scope);
    const n=findNode(tree,cb.dataset.check); if(!n) return;
    setChecked(n,scope,cb.checked);
    /* 角色卡 ↔ 聊天记录：只同步勾选，不删改任何文件 */
    const linked=counterpartsOf(tree,n);
    linked.forEach(x=>setChecked(x,scope,cb.checked));
    if(linked.length) toast(t('link.synced',{n:linked.length}));
    renderChart();
  });
  document.getElementById('batch-bar').addEventListener('click',e=>{
    const toggle=e.target.closest('[data-mergetoggle]');
    if(toggle){ state.mergeMode = toggle.dataset.mergetoggle==='on'; renderChart(); return; }
    const b=e.target.closest('[data-batchall],[data-batchnone],[data-batchinvert]'); if(!b) return;
    const mode=b.dataset.batchall?'all':b.dataset.batchnone?'none':'invert';
    const targets=chartTargets();
    const mergeTarget=targets.find(t=>t.merge);
    if(mergeTarget){
      applyTreeAll(mergeScope(mergeTarget.pkgs),mode,true);
      renderChart(); renderZones();
      const modeLabel=mode==='all'?t('chart.selectAll'):mode==='none'?t('chart.selectNone'):t('chart.invert');
      log('INFO',t('toast.batch',{mode:modeLabel,n:mergeTarget.pkgs.length}));
      return;
    }
    const pkgs=targets.filter(t=>t.pkg);
    pkgs.forEach(t=>applyTreeAll('pkg:'+t.pkg.id,mode,true));
    renderChart(); renderZones();
    const modeLabel=mode==='all'?t('chart.selectAll'):mode==='none'?t('chart.selectNone'):t('chart.invert');
    log('INFO',t('toast.batch',{mode:modeLabel,n:pkgs.length}));
  });

  document.getElementById('zone-card').addEventListener('click',e=>{
    const check=e.target.closest('[data-pkgcheck]');
    if(check){
      const id=check.dataset.pkgcheck;
      if(check.checked) state.selectedPkgs.add(id); else state.selectedPkgs.delete(id);
      renderZones(); renderChart(); renderActions(); renderCloud(); return;
    }
    const act=e.target.closest('[data-pkgact]');
    if(act){
      const id=act.dataset.id; const pkg=state.packages.find(p=>p.id===id); if(!pkg) return;
      const kind=act.dataset.pkgact;
      if(kind==='delete'){
        state.selectedPkgs=new Set([id]); doDeleteSelected();
      }else if(kind==='download'){
        log('INFO',t('toast.downloaded',{name:pkg.name})); toast(t('toast.downloadStarted'));
      }else if(kind==='upload'){
        state.selectedPkgs=new Set([id]); doUploadHost();
      }else if(kind==='copyback'){
        state.selectedPkgs=new Set([id]); doCopyBack();
      }
      return;
    }
    const name=e.target.closest('[data-fullname]');
    if(name && (state.view==='mobile' || window.innerWidth<=860)){ e.stopPropagation(); showFullName(name); return; }
    const card=e.target.closest('[data-pkg]');
    if(card && !e.target.closest('input')){
      const id=card.dataset.pkg;
      // 只切换当前查看的包，不改勾选集合：取消选择只能靠复选框或「反选」。
      state.source={type:'package',pkgId:id}; state.sourceKey='pkg:'+id;
      if(actions.onActivePackage) actions.onActivePackage(id);
      else renderAll();
    }
  });

  // 进度条即日志入口：点击或键盘激活都进日志视图
  const progressBar=document.getElementById('workbench-progress');
  if(progressBar){
    const openLogView=()=>{ renderLog(); showPane('log'); };
    progressBar.addEventListener('click',openLogView);
    progressBar.addEventListener('keydown',(e)=>{
      if(e.key==='Enter'||e.key===' '){ e.preventDefault(); openLogView(); }
    });
  }
  document.getElementById('log-close').addEventListener('click',backToWorkbench);
  document.getElementById('help-close').addEventListener('click',closeHelp);
  document.getElementById('modal-close').addEventListener('click',closeModal);
  const dlg=confirmDialogEl();
  if(dlg){
    dlg.addEventListener('click',e=>{ if(e.target===dlg) closeModal(); });
    dlg.addEventListener('close',()=>{ const acts=document.getElementById('modal-actions'); if(acts) acts.innerHTML=''; });
  }
  document.getElementById('log-toolbar').addEventListener('click',e=>{
    const b=e.target.closest('[data-level]'); if(!b) return;
    document.querySelectorAll('#log-toolbar [data-level]').forEach(x=>x.classList.toggle('active',x===b));
    state.logLevel=b.dataset.level; renderLog();
  });
  document.getElementById('log-clear').addEventListener('click',()=>{
    state.log=[];
    try{ if(typeof localStorage!=='undefined') localStorage.removeItem(LOG_STORAGE_KEY); }catch{}
    renderLog();
  });
  document.getElementById('log-export').addEventListener('click',exportLog);
  document.getElementById('log-copy').addEventListener('click',()=>{
    navigator.clipboard?.writeText(logText()).then(()=>toast(t('toast.logCopied'))).catch(()=>toast(t('toast.copyFailed')));
  });

  document.getElementById('tutorial-skip').addEventListener('click',closeTutorial);
  document.getElementById('tutorial-prev').addEventListener('click',()=>{ if(state.tutorialStep>0){ state.tutorialStep--; renderTutorial(); } });
  document.getElementById('tutorial-next').addEventListener('click',()=>{
    const set=tutorialSet();
    if(state.tutorialStep>=set.length-1){ closeTutorial(); toast(t('toast.tutorialDone')); }
    else{ state.tutorialStep++; renderTutorial(); }
  });
  document.getElementById('tutorial-adv').addEventListener('click',()=>{
    state.tutorialKind = state.tutorialKind==='adv' ? 'basic' : 'adv';
    state.tutorialStep=0; renderTutorial();
  });
  document.addEventListener('keydown',(e)=>{ if(e.key!=='Escape') return;
    if(confirmDialogEl()?.open) return; // 原生 dialog 自行处理 Esc
    if(state.volMaxKey){ state.volPath[state.volMaxKey]=[]; state.volMaxKey=null; renderChart(); return; }
    if(state.pane!=='workbench'){ backToWorkbench(); return; }
    closeTutorial();
  });
  let tutorialRaf=0;
  const scheduleTutorial=()=>{
    if(!state.tutorialOpen || tutorialRaf) return;
    tutorialRaf=requestAnimationFrame(()=>{ tutorialRaf=0; renderTutorial(); });
  };
  document.addEventListener('scroll',scheduleTutorial,true);
  window.addEventListener('resize',()=>{ scheduleTutorial(); fitPackageNames(); });
  if(typeof ResizeObserver!=='undefined'){
    const ro=new ResizeObserver(scheduleTutorial);
    const stack=document.getElementById('chart-stack');
    const overlay=document.getElementById('tutorial-overlay');
    if(stack) ro.observe(stack);
    if(overlay) ro.observe(overlay);
  }
}

/* ── 桌面拖拽分隔条 ── */
function initSplitters(){
  const main=document.querySelector('.app-main');
  const sv=document.getElementById('split-v');
  if(sv && main){
    let on=false;
    sv.addEventListener('pointerdown',e=>{
      on=true; sv.classList.add('is-dragging'); sv.setPointerCapture(e.pointerId);
      document.body.style.cursor='col-resize'; e.preventDefault();
    });
    sv.addEventListener('pointermove',e=>{
      if(!on) return;
      const r=main.getBoundingClientRect();
      let pct=((e.clientX-r.left)/r.width)*100;
      pct=Math.max(30,Math.min(80,pct));
      main.style.setProperty('--split-left',pct.toFixed(2)+'%');
    });
    const stop=()=>{ on=false; sv.classList.remove('is-dragging'); document.body.style.cursor=''; };
    sv.addEventListener('pointerup',stop); sv.addEventListener('pointercancel',stop);
  }
}

/* ── 图表网格拖拽条：列间 1 条 + 行间左右两段 ── */
function initChartSplitters(){
  const stack=document.getElementById('chart-stack');
  if(!stack) return;
  let drag=null;
  const stop=()=>{
    if(!drag) return;
    drag.bar.classList.remove('is-dragging');
    document.body.style.cursor='';
    drag=null;
    persistChartLayout();
  };
  stack.addEventListener('pointerdown',e=>{
    const bar=e.target.closest('[data-split]');
    if(!bar) return;
    const canvas=bar.closest('.chart-canvas');
    if(!canvas) return;
    drag={ kind:bar.dataset.split, gap:Number(bar.dataset.gap)||0, canvas, bar };
    bar.classList.add('is-dragging');
    try { bar.setPointerCapture(e.pointerId); } catch { /* 老浏览器 */ }
    document.body.style.cursor = drag.kind==='col' ? 'col-resize' : 'row-resize';
    e.preventDefault();
  });
  stack.addEventListener('pointermove',e=>{
    if(!drag) return;
    const { kind, gap, canvas } = drag;
    const rect = canvas.getBoundingClientRect();
    if(kind==='col'){
      const col=Math.max(0.2, Math.min(0.8, (e.clientX-rect.left)/rect.width));
      state.chartLayout.col=col;
      canvas.style.gridTemplateColumns='minmax(0,'+col+'fr) 6px minmax(0,'+(1-col)+'fr)';
      return;
    }
    const count=Math.max(2, Number(canvas.dataset.rows)||2);
    const rows=layoutRowRatios(count);
    const usable=Math.max(1, rect.height - 6*(count-1));
    let start=0;
    for(let i=0;i<gap;i++) start += rows[i]*usable + 6;
    const pair=rows[gap]+rows[gap+1];
    let first=(e.clientY-rect.top-start)/usable;
    first=Math.max(0.15, Math.min(pair-0.15, first));
    rows[gap]=first;
    rows[gap+1]=pair-first;
    state.chartLayout.rows=rows;
    canvas.style.gridTemplateRows=rows.map(r=>'minmax(0,'+r+'fr)').join(' 6px ');
  });
  stack.addEventListener('pointerup',stop);
  stack.addEventListener('pointercancel',stop);
}

/* ── 初始化（视图自有，不依赖外部数据） ── */
renderAll();
bind();
syncTopControls();
initSplitters();
initChartSplitters();

  /* ── 对外 API ── */
  function renderAll() {
    syncView();
    state.seq = pkgSeq();
    renderHeader();
    renderZones();
    renderActions();
    renderChart();
    syncMainView();
    renderPendingExports();
    renderCloud();
  }

  /** 扩展组未勾选但用户选了「仅清单」：保留扩展元数据扫描，实体仍由 manifest 模式丢弃。 */
  function extensionManifestOnly(pkg, scopeArg) {
    if (state.extUncheckedMode !== 'manifest') return false;
    const scope = scopeArg || ('pkg:' + pkg.id);
    const extNode = findNode(packageNodes(pkg).nodes, 'group:extensions');
    return !!extNode && !isChecked(extNode, scope);
  }
  function extensionLeafIds(pkg) {
    const extNode = findNode(packageNodes(pkg).nodes, 'group:extensions');
    const ids = new Set();
    if (extNode) walk([extNode], (n) => { if (!(n.children && n.children.length)) ids.add(n.id); });
    return ids;
  }

  function getExcludedPaths(pkg) {
    const scope = 'pkg:' + pkg.id;
    const manifestOnly = extensionManifestOnly(pkg, scope);
    const extIds = manifestOnly ? extensionLeafIds(pkg) : null;
    const excluded = new Set();
    walk(packageNodes(pkg).nodes, (n) => {
      if (n.children && n.children.length) return;
      if (n.action === 'DROP') return;
      // 仅清单模式：扩展条目不能排除，否则转换器看不到 manifest/git 元数据。
      if (manifestOnly && extIds.has(n.id)) return;
      if (!isChecked(n, scope)) excluded.add(n.label && n.path ? n.path : n.id);
    });
    return excluded;
  }

  /**
   * 合并模式的导出计划：每个包各自的不勾选路径 + 各自的派生 options。
   * 合并树里别的包的叶子对本包一律视为「未勾选」，这样 anyChecked 只反映本包。
   */
  function getMergedPlan(pkgs) {
    const nodes = mergeChartTrees(pkgs.map((pkg) => ({ pkgId: pkg.id, nodes: packageNodes(pkg).nodes })));
    const scope = mergeScope(pkgs);
    const mergedExt = findNode(nodes, 'group:extensions');
    const mergedManifestOnly = state.extUncheckedMode === 'manifest' && !!mergedExt && !isChecked(mergedExt, scope);
    const excludedByPkg = {};
    for (const pkg of pkgs) {
      const excluded = new Set();
      walk(nodes, (n) => {
        if (n.children && n.children.length) return;
        if (n.srcPkgId !== pkg.id) return;
        if (n.action === 'DROP') return;
        if (mergedManifestOnly && String(n.path || '').startsWith('extensions/')) return;
        if (!isChecked(n, scope)) excluded.add(n.path || n.id);
      });
      excludedByPkg[pkg.id] = excluded;
    }
    const optionsByPkg = {};
    for (const pkg of pkgs) {
      optionsByPkg[pkg.id] = deriveExportOptions({
        nodes,
        isChecked: (n) => (n.srcPkgId && n.srcPkgId !== pkg.id ? false : isChecked(n, scope)),
        ui: {
          compression: state.compression,
          extensionMode: mergedManifestOnly ? EXTENSION_MODES.MANIFEST : state.extensionMode,
          gitMode: state.gitMode,
          keepDev: state.keepDev,
          target: state.target,
        },
      });
    }
    return { nodes, scope, excludedByPkg, optionsByPkg };
  }

  function getExportOptions(pkg) {
    const scope = 'pkg:' + pkg.id;
    return deriveExportOptions({
      nodes: packageNodes(pkg).nodes,
      isChecked: (n) => isChecked(n, scope),
      ui: {
        compression: state.compression,
        extensionMode: extensionManifestOnly(pkg, scope) ? EXTENSION_MODES.MANIFEST : state.extensionMode,
        gitMode: state.gitMode,
        keepDev: state.keepDev,
        target: state.target,
      },
    });
  }

  /* ── 渲染：本次待导出（内存队列，不入库） ── */
  function renderPendingExports(){
    const host=document.getElementById('pending-exports');
    if(!host) return;
    const list=state.pendingExports||[];
    host.hidden=list.length===0;
    if(!list.length){ host.innerHTML=''; return; }
    host.innerHTML='<div class="pending-head"><span>'+t('pending.title',{n:list.length})+'</span>'
      +'<button class="mini" id="pending-clear">'+t('pending.clear')+'</button></div>'
      +'<div class="pending-list">'+list.map(it=>'<div class="pending-row" data-id="'+escapeHtml(it.id)+'">'
        +'<span class="pending-name" title="'+escapeHtml(it.name)+'">'+escapeHtml(it.name)+'</span>'
        +'<span class="pending-size">'+fmtMB((it.blob?.size||0)/1048576)+'</span>'
        +'<button class="mini" data-act="download">'+t('pending.download')+'</button>'
        +'<button class="mini" data-act="stash">'+t('pending.stash')+'</button>'
        +'<button class="mini" data-act="remove">'+t('pending.remove')+'</button>'
        +'</div>').join('')+'</div>';
    host.querySelector('#pending-clear')?.addEventListener('click',()=>actions.pendingClear?.());
    host.querySelectorAll('[data-act]').forEach(btn=>btn.addEventListener('click',()=>{
      const id=btn.closest('[data-id]')?.dataset.id;
      if(!id) return;
      if(btn.dataset.act==='download') actions.pendingDownload?.(id);
      else if(btn.dataset.act==='stash') actions.pendingStash?.(id);
      else actions.pendingRemove?.(id);
    }));
  }

  /** 转换报告：结构化的计数 + 三类清单，全部来自 `Report#toJSON()` 的纯对象。 */
  function showReport(report){
    if(!report) return;
    const counts=Object.entries(report.modules||{})
      .map(([name,mod])=>'<div class="rep-row"><span>'+escapeHtml(name)+'</span><b>'+((mod&&mod.copied)||0)+'</b></div>')
      .join('');
    const section=(title,list)=>{
      if(!Array.isArray(list)||!list.length) return '';
      const text=list.map((x)=>typeof x==='string'?x:(x&&x.path)?x.path:JSON.stringify(x)).join('\n');
      return '<details class="rep-sec"><summary>'+title+' ('+list.length+')</summary><pre>'+escapeHtml(text)+'</pre></details>';
    };
    const html='<div class="rep-grid">'+(counts||'<div class="rep-row"><span>-</span><b>0</b></div>')+'</div>'
      +section(t('report.dropped'),report.dropped)
      +section(t('report.filtered'),report.filtered)
      +section(t('report.warnings'),report.warnings);
    openModal(
      t('report.title'),
      t('report.desc',{from:report.sourceLayout||'-',to:report.target||'-'}),
      [html],
      [
        {label:t('report.download'), onClick:()=>actions.reportDownload?.(report)},
        {label:t('modal.close'), primary:true, onClick:()=>closeModal()},
      ],
    );
  }

  /**
   * 批量恢复报告：逐包状态 + 失败原因 + 引擎转储剔除说明。
   * 不再「首包失败即整体失败」：成功的算成果，失败的留给用户重试。
   */
  function showRestoreReport(results, { onKeepPartial, onDiscardPartial, onRefresh } = {}) {
    const list = Array.isArray(results) ? results : [];
    const rows = list.map((r) => {
      const ok = r.status === 'ok';
      const skipped = r.status === 'skipped';
      const status = ok ? t('restore.statusOk') : skipped ? t('restore.statusSkipped') : t('restore.statusFailed');
      return '<div class="rep-row restore-row ' + (ok ? 'is-ok' : skipped ? 'is-skip' : 'is-bad') + '">'
        + '<span class="rr-name" title="' + escapeHtml(r.name) + '">' + escapeHtml(r.name) + '</span>'
        + '<b>' + status + '</b>'
        + (r.message ? '<span class="rr-msg">' + escapeHtml(r.message) + '</span>' : '')
        + (r.note ? '<span class="rr-note">' + escapeHtml(r.note) + '</span>' : '')
        + '</div>';
    }).join('');
    const okCount = list.filter((r) => r.status === 'ok').length;
    const badCount = list.filter((r) => r.status !== 'ok').length;
    const actions = [];
    if (okCount > 0) {
      actions.push({ label: t('restore.keepPartial'), primary: true, onClick: () => { closeModal(); onKeepPartial?.(); } });
      actions.push({ label: t('restore.discardPartial'), danger: true, onClick: () => { closeModal(); onDiscardPartial?.(); } });
    } else {
      actions.push({ label: t('modal.close'), primary: true, onClick: () => closeModal() });
    }
    actions.push({ label: t('restore.refreshNow'), onClick: () => { closeModal(); onRefresh?.(); } });
    openModal(
      t('restore.reportTitle'),
      t('restore.reportDesc', { ok: okCount, failed: badCount }),
      ['<div class="rep-grid restore-report">' + (rows || '<div class="rep-row"><span>-</span><b>0</b></div>') + '</div>'],
      actions,
    );
  }

  return {
    setPackages(list) {
      const next = (list || []).map((pkg) => ({ ...pkg }));
      const fresh = next.filter((pkg) => !state.prefAppliedPkgs.has(pkg.id) && Array.isArray(pkg.nodes) && pkg.nodes.length);
      state.packages = next;
      /* 包被删除后，选中集合与当前来源都必须同步失效：
         否则会残留「已选 N 项」动作条，或出现「包卡选中环在、图表没有」。 */
      const alive = new Set(next.map((pkg) => pkg.id));
      for (const id of [...state.selectedPkgs]) {
        if (!alive.has(id)) state.selectedPkgs.delete(id);
      }
      if (state.source.type === 'package' && !alive.has(state.source.pkgId)) {
        state.source = { type: 'host', pkgId: null };
        state.sourceKey = 'host:' + state.host;
      }
      if (fresh.length) {
        fresh.forEach((pkg) => { applyPrefsToPackage(pkg); state.prefAppliedPkgs.add(pkg.id); });
        applyTopControlsFromPrefs();
      }
      renderAll();
    },
    setHost(hostKey, mode) {
      state.host = hostKey;
      state.mode = mode;
      if (!state.targetManual) state.target = targetForHost(hostKey);
      state.source = { type: 'host', pkgId: null };
      state.sourceKey = 'host:' + hostKey;
      renderAll();
    },
    setHostTree(nodes) {
      state.hostTree = nodes || [];
      renderChart();
      renderQuota();
    },
    setPackageNodes(id, nodes) {
      const pkg = state.packages.find((p) => p.id === id);
      if (pkg) {
        pkg.nodes = nodes || [];
        renderAll();
      }
    },
    setProgress,
    setLan(next = {}) {
      if ('open' in next) {
        state.transfer.open = !!next.open;
        if (next.open) state.transfer.tab = 'lan';
      }
      if (next.send) Object.assign(state.lan.send, next.send);
      if (next.recv) Object.assign(state.lan.recv, next.recv);
      if ('scanError' in next) state.lan.scanError = next.scanError;
      renderTransfer();
      renderLan();
    },
    getLan() { return state.lan; },
    setStorage(next) {
      state.storage = { ...state.storage, ...(next || {}) };
      renderQuota();
    },
    setLibraryExport(on) { state.libraryExport = !!on; renderActions(); },
    /**
     * 拉取落库后的默认不勾选：备份快照 `backups/` 与原生资产 `user/`。
     * 只改插件侧选择状态，不触碰宿主原生界面的任何设置。
     */
    applyPullDefaults(pkgId, prefixes) {
      const pkg = state.packages.find(p => p.id === pkgId);
      if (!pkg) return;
      const scope = 'pkg:' + pkgId;
      const rules = Array.isArray(prefixes) && prefixes.length ? prefixes : ['backups/', 'user/'];
      walk(packageNodes(pkg).nodes, (n) => {
        const path = n.path || '';
        if (!path) return;
        // 聊天/角色/世界书等用户内容永不在默认取消范围内（曾出现聊天记录被误取消）。
        if (path.startsWith('chats/') || path.startsWith('characters/')
          || path.startsWith('worlds/') || path.startsWith('group chats/')) return;
        if (rules.some((pre) => path === pre.replace(/\/$/, '') || path.startsWith(pre))) {
          state.sel[treeKey(scope, n.id)] = false;
        }
      });
      renderChart();
    },
    setPrivateFiles(list) { state.privateFiles = Array.isArray(list) ? list : []; renderChart(); },
    setZone(zone) { state.zone = zone; state.selectedPkgs = new Set(); renderAll(); },
    /** 任务条：running / paused / null。只影响动作行的暂停·继续·中止三键。 */
    setTask(task) { state.task = task || null; renderActions(); },
    /** 本次待导出（内存队列）；空数组即隐藏整块。 */
    setPendingExports(items) { state.pendingExports = Array.isArray(items) ? items : []; renderPendingExports(); },
    showReport,
    showRestoreReport,
    renderExtensionView,
    /** 从图表卡「清单」或包选择入口进入扩展管理，并预填条目。 */
    openExtensionManager(entries){
      const list=Array.isArray(entries)?entries:[];
      if(list.length){
        state.extEntries=list.map((e)=>{
          if(typeof e==='string') return { url:e, branch:'main', status:'pending' };
          return { url:String(e.url||e.link||'').trim(), branch:String(e.branch||e.version||e.ref||'main'), status:'pending' };
        }).filter((e)=>e.url);
        state.extLinksText=state.extEntries.map((e)=>e.url+(e.branch&&e.branch!=='main'?' | '+e.branch:'')).join('\n');
      }
      state.extTab='install';
      state.mainView='extension';
      if(state.view==='mobile') state.mobileView='extension';
      syncMainView();
      renderExtensionView();
    },
    /** index.js 的批量安装进度回调：更新单条状态。 */
    extEntryUpdate(update){
      if(!update || !update.url) return;
      const hit=state.extEntries.find((e)=>e.url===update.url);
      if(hit){ hit.status=update.status; if(update.error) hit.error=update.error; }
      if(state.extRunning) renderExtensionView();
    },
    extLogAppend(line){ if(line) state.extLog.push(String(line)); },
    setExtensionResults(results){ state.extResults=Array.isArray(results)?results:[]; renderExtensionView(); },
    setActivePackage(id) { state.source = { type: 'package', pkgId: id }; state.sourceKey = 'pkg:' + id; renderAll(); },
    pushLog(level, msg) { log(String(level || 'INFO').toUpperCase(), msg); },
    openModal,
    closeModal,
    openSettingsView,
    showPane,
    backToWorkbench,
    confirmTraffic(onConfirm, opts) { openTrafficModal(onConfirm, opts); },
    toast,
    renderAll,
    getExcludedPaths,
    getExportOptions,
    getMergedPlan,
    getVolumes(pkg) { return volumesOf(pkg, packageNodes(pkg).nodes); },
    getState() { return state; },
    applySettings(s) {
      if(!s) return;
      renderChart();
    },
    openTutorial,
    renderLog,
  };
}

