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

import { chartTreeFor, deriveExportOptions } from '../core/chart-model.js';
import { mergeChartTrees } from '../core/merge-packages.js';
import { actionsForZone, actionEnabled } from '../core/zone-model.js';
import { EXTENSION_MODES, GIT_MODES } from '../core/export-modes.js';
import { t } from '../i18n/index.js';

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

const state = {
  host:'luker', mode:'plugin', view:'desktop', zone:'import',
  source:{ type:'host', pkgId:null }, target:'SillyTavern', delta:'overwrite', splitMb:'',
  compression:'5', extensionMode:'full', gitMode:'keep', keepDev:false,
  packages: INITIAL_PACKAGES.map(p=>({...p})),
  selectedPkgs:new Set(), mergeMode:false, privateFiles:[], expanded:{}, collapsedVol:{}, sel:{}, log:[], logLevel:'ALL',
  noTrafficPrompt:false, keepExport:true,
  storage:{ browser:null, host:null },
  sort:'time-desc', filter:'all', tutorialStep:0, tutorialOpen:false, tutorialKind:'basic',
  sourceKey:'host:luker', seq:{}, libraryExport:false,
  lan:{
    open:false, scanning:null, scanError:'',
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
  const d=new Date(); const p=n=>String(n).padStart(2,'0');
  return p(d.getHours())+':'+p(d.getMinutes())+':'+p(d.getSeconds());
}
function dtNow(){
  const d=new Date(); const p=n=>String(n).padStart(2,'0');
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'_'+p(d.getHours())+'-'+p(d.getMinutes())+'-'+p(d.getSeconds());
}
function log(level,msg){
  state.log.push({ level, msg, time:nowTime() });
  if(state.log.length>200) state.log.shift();
  renderLog();
}
function toast(msg){
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
      const vals=n.children.map(c=>isChecked(c,scope));
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

/* ── 渲染：头部 ── */
/* 目标平台固定四项 + 英文全称；图标只在标识处用品牌色环，面板本身不染色。 */
const TARGETS=[
  { value:'SillyTavern', host:'st' },
  { value:'Luker', host:'luker' },
  { value:'TauriTavern', host:'tt' },
  { value:'PureTavern', host:'pt' }
];
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
  document.getElementById('target-pop').innerHTML=TARGETS.map(opt=>{
    const isHost = state.mode!=='web' && opt.host===state.host;
    return '<button class="picker-item" role="option" data-target="'+opt.value+'" aria-selected="'+(opt.value===state.target)+'">'
      +'<img class="picker-ico" data-host="'+opt.host+'" src="'+hostIcon(opt.host)+'" alt="">'
      +'<span>'+opt.value+'</span>'
      +(isHost?'<span class="host-tag">'+t('target.hostSuffix')+'</span>':'')
      +'</button>';
  }).join('');
}
function updateSplitSim(){
  const sim=document.getElementById('split-sim');
  if(!sim) return;
  if(state.splitMb===''){ sim.textContent=''; sim.style.color=''; return; }
  const raw=Number(state.splitMb);
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
/* 图表目标：勾了包 → 每个勾选的包一组图表；否则看当前来源；都没有则看宿主。 */
function chartTargets(){
  const sel=[...state.selectedPkgs].map(id=>state.packages.find(p=>p.id===id)).filter(Boolean);
  if(sel.length) return mergeActive(sel) ? [{merge:true,pkgs:sel}] : sel.map(p=>({pkg:p}));
  if(state.source.type==='package'){
    const p=state.packages.find(x=>x.id===state.source.pkgId);
    if(p) return [{pkg:p}];
  }
  return [{host:true}];
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
  const row=(label,ico,cell,emptyText)=>{
    if(!cell || !(cell.total>0)) return '<div class="quota-row is-disabled">'
      +'<span class="q-label">'+svg(ico,'tree-ico')+label+'</span>'
      +'<span class="quota-bar"><span class="quota-fill" style="width:0%"></span></span>'
      +'<span class="quota-val">'+emptyText+'</span></div>';
    const p=Math.max(0,Math.min(100,Math.round(cell.used/cell.total*100)));
    return '<div class="quota-row">'
      +'<span class="q-label">'+svg(ico,'tree-ico')+label+'</span>'
      +'<span class="quota-bar"><span class="quota-fill '+(p>85?'warn':'')+'" style="width:'+p+'%"></span></span>'
      +'<span class="quota-val">'+(cell.used/1073741824).toFixed(1)+' / '+(cell.total/1073741824).toFixed(1)+' GB · '+p+'%</span></div>';
  };
  const hostReadable=!!(HOSTS[state.host]||{}).readable;
  head.innerHTML = row(t('quota.browser'),'db',state.storage.browser,t('quota.browserEmpty'))
    + row(t('quota.host'),'shield',hostReadable ? state.storage.host : null,t('quota.hostEmpty'));
}
function renderTreeRows(nodes,depth,scope,readonly,tools){
  let out='';
  for(const n of nodes){
    if(tools && tools[n.id]) out+=tools[n.id];
    const key=treeKey(scope,n.id);
    const expanded=state.expanded[key]!==undefined ? state.expanded[key] : !!n.expanded;
    const hasKids=n.children && n.children.length;
    const checked = hasKids ? !!n._checked : isChecked(n,scope);
    const indeterminate = hasKids && !!n._indeterminate;
    const ind=Math.min(depth,8)*15;
    const pillCls=n.suggest==='keep'?'keep':n.suggest==='optional'?'optional':n.suggest==='drop'?'drop':'unknown';
    const pillText=n.suggest==='keep'?t('tree.suggestKeep'):n.suggest==='optional'?t('tree.suggestOptional'):n.suggest==='drop'?t('tree.suggestDrop'):t('tree.suggestUnknown');
    out+='<div class="tree-row'+(expanded?' expanded':'')+'" data-id="'+n.id+'" style="padding-left:'+(6+ind)+'px">'
      +'<button class="tree-toggle'+(hasKids?'':' empty')+'" data-node="'+n.id+'" aria-label="'+t('chart.expand')+'">'
      +'<svg class="chev" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7"/></svg></button>'
      +'<input class="tree-check" type="checkbox" data-check="'+n.id+'"'+(checked?' checked':'')+(indeterminate?' data-ind="1"':'')+(readonly?' disabled':'')+'>'
      +svg(n.icon,'tree-ico')
      +'<span class="tree-label" title="'+n.label+'">'+n.label+(n.badge?'<span class="sub">'+n.badge+'</span>':'')+(n.note?'<span class="sub">'+n.note+'</span>':'')+'</span>'
      +'<span class="tree-pill '+pillCls+'">'+pillText+'</span>'
      +(hasKids && !readonly ? '<span class="row-bulk">'
        +'<button data-suball="all" data-subnode="'+n.id+'" title="'+t('chart.selectAll')+'">✓</button>'
        +'<button data-suball="none" data-subnode="'+n.id+'" title="'+t('chart.selectNone')+'">✕</button>'
        +'<button data-suball="invert" data-subnode="'+n.id+'" title="'+t('chart.invert')+'">⇄</button>'
      +'</span>' : '')
      +'<span class="tree-size">'+fmtMB(n.mb)+'</span>'
      +(n.uploadable?'<button class="tree-mini" data-upload="'+n.id+'">'+t('tree.upload')+'</button>':'')
      +'</div>';
    if(hasKids && expanded){
      out+='<div class="tree-children">'+renderTreeRows(n.children,depth+1,scope,readonly,tools)+'</div>';
    }
  }
  return out;
}

/* 一张标准图表卡：包序号 + 卷号 + 本卷容量 + 全选 + 树 + 勾选摘要。
   导入/导出序号在卡片 DOM 内；每一级（卡/分类/子目录）都可全选/全不选/反选。 */
function chartCardHtml(o){
  const collapsed = state.collapsedVol[o.key]!==undefined ? !!state.collapsedVol[o.key] : !!o.defaultCollapsed;
  syncAncestors(o.nodes,o.scope);
  const sum=sumSelected(o.nodes,o.scope);
  const dis = !!o.disabled;
  return '<div class="vol-card'+(collapsed?' is-collapsed':'')+(dis?' is-disabled':'')+'" data-scope="'+o.scope+'" data-volkey="'+o.key+'"'+(dis?' aria-disabled="true"':'')+'>'
    +'<div class="vol-head">'
      +'<span class="vol-idx'+(o.merged?' is-merged':'')+'">'+o.idxText+'</span>'
      +(o.volText?'<span class="vol-cap">'+o.volText+'</span>':'')
      +(o.capText?'<span class="vol-cap'+(o.over?' is-over':'')+'">'+o.capText+'</span>':'')
      +(o.over?'<span class="vol-flag">'+t('chart.overLimit')+'</span>':'')
      +'<span class="vol-spacer"></span>'
      +(o.totalText?'<span class="vol-total">'+o.totalText+'</span>':'')
      +(dis || o.readonly ? '' : '<span class="vol-bulk">'
        +'<button data-treeall="1">'+t('chart.selectAll')+'</button>'
        +'<button data-treenone="1">'+t('chart.selectNone')+'</button>'
        +'<button data-treeinvert="1">'+t('chart.invert')+'</button>'
      +'</span>')
      +(o.pkgId?'<button class="group-close" data-closegroup="'+o.pkgId+'" aria-label="'+t('chart.closeGroup')+'">×</button>':'')
      +'<button class="vol-collapse" data-voltoggle="'+o.key+'" aria-label="'+t('chart.expand')+'">'
      +'<svg class="chev" viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 5l7 7-7 7"/></svg></button>'
    +'</div>'
    +'<div class="vol-body">'
      +(o.noticeHtml||'')
      +'<div class="chart-tree">'+renderTreeRows(o.nodes,0,o.scope,o.readonly||dis,groupToolsOf(o))+'</div>'
      +(dis?'':'<div class="chart-foot"><span>'+t('chart.selected',{count:sum.count,size:fmtMB(sum.mb)})+'</span></div>')
    +'</div>'
  +'</div>';
}

/** 扩展组内的模式/ Git / 构建配置控件（只有完整扩展时才显示 Git）。 */
function extensionToolsHtml(pkg){
  const hasExt = (pkg?.extensions && pkg.extensions.length) || !!findNode(pkg?.nodes || [], 'group:extensions');
  if(!hasExt) return '';
  const full = state.extensionMode !== EXTENSION_MODES.MANIFEST;
  return '<div class="extension-tools" data-exttools="1">'
    +'<span class="et-label">'+t('extension.label')+'</span>'
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
    +'</div>';
}

/* ── 云端私有件（user/files）：宿主无列表端点，条目来自本地上传登记 ── */
function userFilesAvailable(){
  return state.mode!=='web' && (state.host==='st' || state.host==='luker');
}
function privateFilesHtml(){
  if(!userFilesAvailable()) return '';
  const n=state.privateFiles.length;
  return '<div class="priv-tools" data-privtools="1">'
    +'<button class="tree-mini" data-privfiles="open">'+t('priv.open')+(n?' ('+n+')':'')+'</button>'
    +'</div>';
}
/* 组级工具条：扩展组放模式/Git，私有组放「云端私有件」入口。 */
function groupToolsOf(o){
  const tools={};
  if(o.extToolsHtml) tools['group:extensions']=o.extToolsHtml;
  const priv=privateFilesHtml();
  if(priv) tools['group:private']=priv;
  return tools;
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

function renderChart(){
  state.seq=pkgSeq();
  const targets=chartTargets();
  renderQuota();
  renderBatchBar(targets);
  const stack=document.getElementById('chart-stack');
  const scroll=stack.scrollTop;
  let html='';
  targets.forEach(target=>{
    if(target.host){
      const tree=hostNodes(state.host);
      const degraded = state.mode==='web' || !HOSTS[state.host].readable || !(state.hostTree && state.hostTree.length);
      html+='<div class="chart-group">'
        +'<div class="vol-grid" data-vols="1">'+chartCardHtml({
            key:'host', scope:'host:'+state.host, nodes:tree.nodes, idxText:t('chart.hostData'),
            noticeHtml: '',
            disabled: degraded,
            readonly:false
          })+'</div></div>';
      return;
    }
    if(target.merge){
      const nodes=mergedNodes(target.pkgs);
      const totalMb=mergedTotalMb(target.pkgs);
      const vols=volumesFor(totalMb,nodes);
      const multi=vols.length>1;
      const scope=mergeScope(target.pkgs);
      const extOwner=target.pkgs.find(p=>p.extensions&&p.extensions.length)||target.pkgs[0];
      const extTools=extensionToolsHtml(extOwner);
      html+='<div class="chart-group is-merged">'
        +'<div class="vol-grid" data-vols="'+vols.length+'">'
        + vols.map(v=>chartCardHtml({
            key:'merge-'+v.i, scope, nodes:v.nodes,
            idxText:t('chart.mergedBadge',{n:target.pkgs.length}),
            merged:true,
            volText: multi ? t('chart.volume',{i:v.i,n:v.n}) : t('chart.whole'),
            capText: fmtMB(v.mb),
            totalText: multi ? t('chart.total',{size:fmtMB(totalMb)}) : '',
            noticeHtml: '', readonly: false, over: !!v.over, pkgId: '',
            extToolsHtml: extTools,
            defaultCollapsed: state.view==='mobile' && multi && v.i>1
          })).join('')
        +'</div></div>';
      return;
    }
    const pkg=target.pkg;
    const tree=packageNodes(pkg);
    const vols=volumesOf(pkg, tree.nodes);
    const multi=vols.length>1;
    const notice=tree.unrecognized ? '<div class="chart-unavailable"><b>'+t('chart.unrecognizedTitle')+'</b></div>' : '';
    const extTools=extensionToolsHtml(pkg);
    html+='<div class="chart-group">'
      +'<div class="vol-grid" data-vols="'+vols.length+'">'
      + vols.map(v=>chartCardHtml({
          key:pkg.id+'-'+v.i, scope:'pkg:'+pkg.id, nodes:v.nodes,
          idxText: seqLabel(pkg),
          volText: multi ? t('chart.volume',{i:v.i,n:v.n}) : t('chart.whole'),
          capText: fmtMB(v.mb),
          totalText: multi ? t('chart.total',{size:pkg.size}) : '',
          noticeHtml: notice, readonly: pkg.zone==='export',
          over: !!v.over,
          pkgId: pkg.id,
          extToolsHtml: extTools,
          defaultCollapsed: state.view==='mobile' && multi && v.i>1
        })).join('')
      +'</div></div>';
  });
  stack.innerHTML=html;
  stack.querySelectorAll('.tree-check[data-ind="1"]').forEach(el=>{ el.indeterminate=true; });
  stack.scrollTop=scroll;
  renderFilenamePreview();
  updateSplitSim();
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
    +'<div class="pkg-actions">'
    +(p.zone==='export'
      ? '<button data-pkgact="download" data-id="'+p.id+'" title="'+t('pkg.download')+'">'+svg('file','tree-ico')+'</button>'
        +'<button data-pkgact="upload" data-id="'+p.id+'" title="'+t('pkg.restore')+'">'+svg('cloud','tree-ico')+'</button>'
        +'<button data-pkgact="copyback" data-id="'+p.id+'" title="'+t('pkg.copyBack')+'">'+svg('folder','tree-ico')+'</button>'
      : '<button data-pkgact="delete" data-id="'+p.id+'" title="'+t('pkg.delete')+'">'+svg('archive','tree-ico')+'</button>')
    +'</div></div>';
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
  const zoneActions=actionsForZone(state.zone);
  const sel={selectedCount:state.selectedPkgs.size};
  if(zoneActions.includes('generate') && state.selectedPkgs.size>0){
    html+='<div class="batch-bar"><span class="lbl">'+t('zones.selected',{n:state.selectedPkgs.size})+'</span>'
      +'<button id="batch-generate"'+(!actionEnabled(state.zone,'generate',sel)?' disabled':'')+'>'+t('zones.batchGenerate')+'</button>'
      +'<button id="batch-merge"'+(!actionEnabled(state.zone,'merge',sel)?' disabled':'')+'>'+t('zones.batchMerge')+'</button>'
      +'<button id="batch-delete">'+t('zones.batchDelete')+'</button></div>';
  }
  body.innerHTML=html;
  body.querySelector('#sort-select')?.addEventListener('change',e=>{ state.sort=e.target.value; renderZones(); });
  body.querySelector('#host-filter')?.addEventListener('change',e=>{ state.filter=e.target.value; renderZones(); });
  body.querySelector('#dropzone')?.addEventListener('click',()=>{
    actions.uploadRequest?.();
  });
  body.querySelector('#batch-generate')?.addEventListener('click',()=>doGenerate());
  body.querySelector('#batch-merge')?.addEventListener('click',()=>doMerge());
  body.querySelector('#batch-delete')?.addEventListener('click',()=>doDeleteSelected());
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

/* ── 渲染：操作 ── */
function renderActions(){
  const row=document.getElementById('action-row');
  const hasSel=state.selectedPkgs.size>0;
  const sel={selectedCount:state.selectedPkgs.size};
  const zoneActions=actionsForZone(state.zone);
  const libBtn=state.libraryExport && zoneActions.includes('libraryExport')
    ? '<button class="btn" id="btn-library-export">'+svg('db','ico')+t('action.libraryExport')+'</button>'
    : '';
  if(zoneActions.includes('generate')){
    row.innerHTML=
      '<button class="btn" id="btn-fetch">'+svg('cloud','ico')+t('action.fetch')+'</button>'
      +'<button class="btn accent" id="btn-generate"'+(actionEnabled(state.zone,'generate',sel)?'':' disabled')+'>'+svg('archive','ico')+t('action.generatePack')+'</button>'
      +'<button class="btn" id="btn-merge"'+(actionEnabled(state.zone,'merge',sel)?'':' disabled')+'>'+svg('copy','ico')+t('action.mergeUpload')+'</button>'
      +libBtn;
    row.querySelector('#btn-generate')?.addEventListener('click',()=>doGenerate());
    row.querySelector('#btn-merge')?.addEventListener('click',()=>doMerge());
    row.querySelector('#btn-library-export')?.addEventListener('click',()=>actions.libraryExport?.());
  }else{
    row.innerHTML=
      '<button class="btn" id="btn-download"'+(hasSel?'':' disabled')+'>'+svg('file','ico')+t('action.download')+'</button>'
      +'<button class="btn accent" id="btn-upload"'+(hasSel?'':' disabled')+'>'+svg('cloud','ico')+t('action.restore')+'</button>'
      +'<button class="btn" id="btn-copyback"'+(hasSel?'':' disabled')+'>'+svg('folder','ico')+t('action.copyBack')+'</button>';
    row.querySelector('#btn-download')?.addEventListener('click',()=>{ actions.download?.([...state.selectedPkgs]); });
    row.querySelector('#btn-upload')?.addEventListener('click',()=>doUploadHost());
    row.querySelector('#btn-copyback')?.addEventListener('click',()=>doCopyBack());
  }
  row.querySelector('#btn-fetch')?.addEventListener('click',()=>doFetch());
  renderLan();
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
function renderLan(){
  const L=state.lan;
  const body=document.getElementById('lan-body');
  const toggle=document.getElementById('lan-toggle');
  if(!body||!toggle) return;
  toggle.setAttribute('aria-expanded',String(!!L.open));
  body.hidden=!L.open;
  document.querySelector('.col-side')?.classList.toggle('lan-open', !!L.open);
  const hint=document.getElementById('lan-toggle-hint');
  if(hint){
    const s=L.send.busy?t('lan.sending',{pct:Math.round(L.send.pct)}):'';
    const r=L.recv.busy?t('lan.receiving',{pct:Math.round(L.recv.pct)}):'';
    hint.textContent=[s,r].filter(Boolean).join(' · ') || t('action.lanHint');
  }
  const targets=lanTargets();
  const sum=document.getElementById('lan-send-summary'); if(sum) sum.textContent=lanSummaryText();
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
  lines.innerHTML=list.map(l=>'<div class="log-line '+l.level.toLowerCase()+'"><span class="t">['+l.time+']</span> <span class="lv">['+l.level+']</span> '+escapeHtml(l.msg)+'</div>').join('') || '<div class="log-line">'+t('log.empty')+'</div>';
  const last=state.log[state.log.length-1];
  document.getElementById('log-latest').textContent=last?last.msg:t('log.empty');
  const counts={INFO:0,WARN:0,ERROR:0}; state.log.forEach(l=>{ if(counts[l.level]!==undefined) counts[l.level]++; });
  document.getElementById('log-count-info').textContent=counts.INFO+' INFO';
  const warn=document.getElementById('log-count-warn'); warn.textContent=counts.WARN+' WARN'; warn.style.display=counts.WARN?'inline-block':'none';
  const err=document.getElementById('log-count-err'); err.textContent=counts.ERROR+' ERR'; err.style.display=counts.ERROR?'inline-block':'none';
  const dot=document.getElementById('log-dot');
  if(dot){ const n=counts.WARN+counts.ERROR; dot.hidden=n===0; dot.title=t('log.dotTitle',{n}); }
  const body=document.getElementById('log-body'); body.scrollTop=body.scrollHeight;
}
function escapeHtml(s){ return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* ── 动作 ── */
function doFetch(){ actions.fetch?.(); return undefined; }
function doGenerate(){
  const pkgs=[...state.selectedPkgs].map(id=>state.packages.find(p=>p.id===id)).filter(Boolean);
  actions.generate?.({ packages: pkgs, merge: mergeActive(pkgs), target: state.target, delta: state.delta, splitMb: state.splitMb, filenameTemplate: document.getElementById('filename-template').value });
}
function doMerge(){
  const pkgs=[...state.selectedPkgs].map(id=>state.packages.find(p=>p.id===id)).filter(Boolean);
  if(pkgs.length<2){ toast(t('lan.atLeastTwo')); return; }
  actions.mergeUpload?.(pkgs);
}
function doUploadHost(){ actions.restore?.([...state.selectedPkgs]); }
function doCopyBack(){ actions.copyBack?.([...state.selectedPkgs]); }
function doDeleteSelected(){ actions.deleteSelected?.([...state.selectedPkgs]); }
function doUploadPrivate(payload){ actions.uploadPrivate?.(payload); }

/* ── 弹窗 ── */
function openModal(title,desc,extraHtml,actions){
  document.getElementById('modal-title').textContent=title;
  document.getElementById('modal-desc').textContent=desc;
  document.getElementById('modal-extra').innerHTML=(extraHtml||[]).join('');
  const acts=document.getElementById('modal-actions'); acts.innerHTML='';
  (actions||[]).forEach(a=>{
    const b=document.createElement('button');
    b.className='btn'+(a.primary?' accent':'');
    b.textContent=a.label;
    if(a.danger) b.style.background='var(--drop)',b.style.borderColor='var(--drop)';
    b.addEventListener('click',a.onClick);
    acts.appendChild(b);
  });
  document.getElementById('modal-overlay').classList.add('open');
}
function closeModal(){ document.getElementById('modal-overlay').classList.remove('open'); }
function openTrafficModal(onConfirm, { enabled = true, onNever } = {}){
  if(!enabled || state.noTrafficPrompt){ onConfirm(); return; }
  openModal(t('traffic.title'),t('traffic.desc'),[
    '<label class="check"><input type="checkbox" id="traffic-nodisplay"> '+t('traffic.never')+'</label>'
  ],[
    {label:t('traffic.cancel'),onClick:closeModal},
    {label:t('traffic.continue'),primary:true,onClick:()=>{
      const cb=document.getElementById('traffic-nodisplay');
      if(cb && cb.checked){ state.noTrafficPrompt=true; onNever?.(); log('INFO',t('traffic.off')); }
      closeModal(); onConfirm();
    }}
  ]);
}

function openSettings(){ actions.settings?.(); }
/* ── 帮助浮层 ── */const HELP={
  chart:{ title:'help.chart.title', points:['help.chart.p1','help.chart.p2','help.chart.p3','help.chart.p4','help.chart.p5','help.chart.p6'] },
  zone:{ title:'help.zone.title', points:['help.zone.p1','help.zone.p2','help.zone.p3','help.zone.p4'] },
  action:{ title:'help.action.title', points:['help.action.p1','help.action.p2','help.action.p3'] },
  log:{ title:'help.log.title', points:['help.log.p1','help.log.p2','help.log.p3'] }
};
let helpOpenFor=null;
function closeHelp(){ const p=document.getElementById('help-popover'); p.hidden=true; p.innerHTML=''; helpOpenFor=null; }
function openHelp(btn,key){
  const p=document.getElementById('help-popover');
  if(helpOpenFor===key){ closeHelp(); return; }
  const topic=HELP[key]; if(!topic) return;
  p.innerHTML='<h4>'+t(topic.title)+'</h4><ul>'+topic.points.map(x=>'<li>'+t(x)+'</li>').join('')+'</ul>';
  p.hidden=false; helpOpenFor=key;
  const r=btn.getBoundingClientRect();
  const w=Math.min(280,window.innerWidth-24);
  let left=Math.min(Math.max(12,r.right-w),window.innerWidth-w-12);
  let top=r.bottom+6;
  const h=p.offsetHeight;
  if(top+h>window.innerHeight-12) top=Math.max(12,r.top-h-6);
  p.style.left=left+'px'; p.style.top=top+'px';
  setTimeout(()=>{
    const onDoc=(e)=>{ if(!p.contains(e.target) && e.target!==btn){ closeHelp(); document.removeEventListener('click',onDoc); } };
    document.addEventListener('click',onDoc);
  },0);
}

/* ── 教程 ── */
const TUTORIAL_BASIC=[
  { sel:'#target-select', title:'tutorial.basic.0.title', desc:'tutorial.basic.0.desc' },
  { sel:'#chart-stack .vol-card', title:'tutorial.basic.1.title', desc:'tutorial.basic.1.desc' },
  { sel:'#chart-stack .chart-tree', title:'tutorial.basic.2.title', desc:'tutorial.basic.2.desc' },
  { sel:'#delta-toggle', title:'tutorial.basic.3.title', desc:'tutorial.basic.3.desc' },
  { sel:'#split-input', title:'tutorial.basic.4.title', desc:'tutorial.basic.4.desc' },
  { sel:'#btn-generate', title:'tutorial.basic.5.title', desc:'tutorial.basic.5.desc' },
  { sel:'#zone-card', title:'tutorial.basic.6.title', desc:'tutorial.basic.6.desc' }
];
const TUTORIAL_ADV=[
  { sel:'#dropzone', title:'tutorial.adv.0.title', desc:'tutorial.adv.0.desc' },
  { sel:'#chart-stack', title:'tutorial.adv.1.title', desc:'tutorial.adv.1.desc' },
  { sel:'#target-select', title:'tutorial.adv.2.title', desc:'tutorial.adv.2.desc' },
  { sel:'#split-input', title:'tutorial.adv.3.title', desc:'tutorial.adv.3.desc' },
  { sel:'#btn-generate', title:'tutorial.adv.4.title', desc:'tutorial.adv.4.desc' }
];
function tutorialSet(){ return state.tutorialKind==='adv' ? TUTORIAL_ADV : TUTORIAL_BASIC; }
function openTutorial(){
  state.tutorialOpen=true; state.tutorialStep=0; state.tutorialKind='basic';
  document.getElementById('tutorial-overlay').classList.add('open');
  renderTutorial();
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
  if(!el){ ring.style.display='none'; return; }
  ring.style.display='';
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

/* ── 全名查看（手机点击） ── */
function showFullName(el){
  const name=decodeURIComponent(el.dataset.fullname||'');
  const p=document.getElementById('fullname-pop');
  p.textContent=name; p.hidden=false;
  const r=el.getBoundingClientRect();
  const w=Math.min(320,window.innerWidth-24);
  p.style.left=Math.min(Math.max(12,r.left),window.innerWidth-w-12)+'px';
  let top=r.bottom+6; const h=p.offsetHeight;
  if(top+h>window.innerHeight-12) top=Math.max(12,r.top-h-6);
  p.style.top=top+'px';
  setTimeout(()=>{
    const onDoc=(e)=>{ if(!p.contains(e.target)){ p.hidden=true; document.removeEventListener('click',onDoc); } };
    document.addEventListener('click',onDoc);
  },0);
}

/* ── 进度 ── */
function setProgress(pct,label){
  document.getElementById('progress-fill').style.width=Math.max(0,Math.min(100,pct))+'%';
  document.getElementById('progress-pct').textContent=Math.round(pct)+'%';
  if(label) document.getElementById('progress-label').textContent=label;
}

/* ── 事件绑定 ── */
function bind(){
  document.getElementById('btn-guide').addEventListener('click',openTutorial);
  document.getElementById('btn-settings').addEventListener('click',()=>actions.settings?.());
  document.getElementById('btn-close')?.addEventListener('click',()=>actions.close?.());

  document.querySelectorAll('[data-help]').forEach(b=>b.addEventListener('click',e=>{ e.stopPropagation(); openHelp(b,b.dataset.help); }));

  // ── 局域网互传（执行卡内联）──
  document.getElementById('lan-toggle').addEventListener('click',()=>{
    state.lan.open=!state.lan.open;
    renderLan();
  });
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
  document.getElementById('lan-answer-input').addEventListener('input',(e)=>{ state.lan.send.answer=e.target.value; });
  document.getElementById('lan-offer-input').addEventListener('input',(e)=>{ state.lan.recv.offer=e.target.value; });

  document.getElementById('zone-tabs').addEventListener('click',e=>{
    const b=e.target.closest('.zone-tab'); if(!b) return;
    state.zone=b.dataset.zone; state.selectedPkgs=new Set();
    renderZones(); renderActions();
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
  splitInput.addEventListener('input',e=>{
    state.splitMb=e.target.value;
    renderChart();
  });
  splitInput.addEventListener('change',e=>{
    const raw=Number(e.target.value);
    if(e.target.value===''||!isFinite(raw)) return;
    const clamped=Math.min(SPLIT_MAX,Math.max(SPLIT_MIN,Math.round(raw)));
    if(clamped!==raw){
      e.target.value=clamped; state.splitMb=String(clamped);
      renderChart(); toast(t('toast.splitLimit',{min:SPLIT_MIN,max:SPLIT_MAX}));
    }
  });
  const compressionSelect=document.getElementById('compression-select');
  if(compressionSelect){
    compressionSelect.value=state.compression;
    compressionSelect.addEventListener('change',e=>{ state.compression=e.target.value; });
  }
  document.getElementById('filename-template').addEventListener('input',renderFilenamePreview);

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
    const extMode=e.target.closest('[data-extmode]');
    if(extMode){
      state.extensionMode = extMode.dataset.extmode==='manifest' ? EXTENSION_MODES.MANIFEST : EXTENSION_MODES.FULL;
      renderChart();
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
    const up=e.target.closest('[data-upload]');
    if(up){
      const scope=scopeFromEl(up);
      const n=findNode(nodesForScope(scope),up.dataset.upload);
      doUploadPrivate({ name:n?n.label:'', path:n?(n.path||''):'', pkgId:scope && scope.indexOf('pkg:')===0 ? scope.slice(4) : null });
      return;
    }
  });
  stackEl.addEventListener('change',e=>{
    const git=e.target.closest('[data-gitmode]');
    if(git){
      state.gitMode = [GIT_MODES.KEEP,GIT_MODES.MINIMAL,GIT_MODES.STRIP].includes(git.value) ? git.value : GIT_MODES.KEEP;
      return;
    }
    const keepDev=e.target.closest('[data-keepdev]');
    if(keepDev){ state.keepDev = !!keepDev.checked; return; }
    const cb=e.target.closest('[data-check]'); if(!cb) return;
    const scope=scopeFromEl(cb); if(!scope) return;
    const n=findNode(nodesForScope(scope),cb.dataset.check); if(!n) return;
    setChecked(n,scope,cb.checked); renderChart();
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
      renderZones(); renderActions(); return;
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
      state.selectedPkgs=new Set();          // 点卡 = 聚焦单包；批量只走勾选框
      state.source={type:'package',pkgId:id}; state.sourceKey='pkg:'+id; actions.onActivePackage?.(id);
      renderChart(); renderZones(); renderActions(); toast(t('toast.packageSwitched'));
    }
  });

  const logOverlay=document.getElementById('log-overlay');
  document.getElementById('btn-log').addEventListener('click',()=>{ renderLog(); logOverlay.classList.add('open'); });
  document.getElementById('log-close').addEventListener('click',()=>logOverlay.classList.remove('open'));
  logOverlay.addEventListener('click',e=>{ if(e.target===logOverlay) logOverlay.classList.remove('open'); });
  document.getElementById('log-toolbar').addEventListener('click',e=>{
    const b=e.target.closest('[data-level]'); if(!b) return;
    document.querySelectorAll('#log-toolbar [data-level]').forEach(x=>x.classList.toggle('active',x===b));
    state.logLevel=b.dataset.level; renderLog();
  });
  document.getElementById('log-clear').addEventListener('click',()=>{ state.log=[]; renderLog(); });
  document.getElementById('log-copy').addEventListener('click',()=>{
    const txt=state.log.map(l=>'['+l.time+'] ['+l.level+'] '+l.msg).join('\n');
    navigator.clipboard?.writeText(txt).then(()=>toast(t('toast.logCopied'))).catch(()=>toast(t('toast.copyFailed')));
  });

  document.getElementById('modal-overlay').addEventListener('click',e=>{ if(e.target.id==='modal-overlay') closeModal(); });
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
  document.addEventListener('keydown',(e)=>{ if(e.key!=='Escape') return; closeModal(); document.getElementById('log-overlay')?.classList.remove('open'); closeTutorial(); closeHelp(); });
  let tutorialRaf=0;
  const scheduleTutorial=()=>{
    if(!state.tutorialOpen || tutorialRaf) return;
    tutorialRaf=requestAnimationFrame(()=>{ tutorialRaf=0; renderTutorial(); });
  };
  document.addEventListener('scroll',scheduleTutorial,true);
  window.addEventListener('resize',()=>{ scheduleTutorial(); closeHelp(); fitPackageNames(); });
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
  const side=document.querySelector('.col-side');
  const sh=document.getElementById('split-h');
  if(sh && side){
    let on=false;
    sh.addEventListener('pointerdown',e=>{
      on=true; sh.classList.add('is-dragging'); sh.setPointerCapture(e.pointerId);
      document.body.style.cursor='row-resize'; e.preventDefault();
    });
    sh.addEventListener('pointermove',e=>{
      if(!on) return;
      const r=side.getBoundingClientRect();
      let h=e.clientY-r.top;
      h=Math.max(150,Math.min(r.height-170,h));
      side.style.setProperty('--zone-h',h.toFixed(0)+'px');
    });
    const stop=()=>{ on=false; sh.classList.remove('is-dragging'); document.body.style.cursor=''; };
    sh.addEventListener('pointerup',stop); sh.addEventListener('pointercancel',stop);
  }
  // 交叉点：一次拖动同时改列宽与上下高度
  const corner=document.getElementById('split-corner');
  if(corner && main && side){
    let on=false, mainRect=null, sideTop=0, sideH=0;
    corner.addEventListener('pointerdown',e=>{
      on=true; corner.classList.add('is-dragging'); corner.setPointerCapture(e.pointerId);
      mainRect=main.getBoundingClientRect();
      const sr=side.getBoundingClientRect(); sideTop=sr.top; sideH=sr.height;
      document.body.style.cursor='move'; e.preventDefault(); e.stopPropagation();
    });
    corner.addEventListener('pointermove',e=>{
      if(!on) return;
      let pct=((e.clientX-mainRect.left)/mainRect.width)*100;
      pct=Math.max(30,Math.min(80,pct));
      main.style.setProperty('--split-left',pct.toFixed(2)+'%');
      let h=e.clientY-sideTop;
      h=Math.max(150,Math.min(sideH-170,h));
      side.style.setProperty('--zone-h',h.toFixed(0)+'px');
    });
    const stop=()=>{ on=false; corner.classList.remove('is-dragging'); document.body.style.cursor=''; };
    corner.addEventListener('pointerup',stop); corner.addEventListener('pointercancel',stop);
  }
}

/* ── 初始化（视图自有，不依赖外部数据） ── */
renderAll();
bind();
initSplitters();

  /* ── 对外 API ── */
  function renderAll() {
    state.seq = pkgSeq();
    renderHeader();
    renderZones();
    renderActions();
    renderChart();
  }

  function getExcludedPaths(pkg) {
    const scope = 'pkg:' + pkg.id;
    const excluded = new Set();
    walk(packageNodes(pkg).nodes, (n) => {
      if (n.children && n.children.length) return;
      if (n.action === 'DROP') return;
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
    const excludedByPkg = {};
    for (const pkg of pkgs) {
      const excluded = new Set();
      walk(nodes, (n) => {
        if (n.children && n.children.length) return;
        if (n.srcPkgId !== pkg.id) return;
        if (n.action === 'DROP') return;
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
          extensionMode: state.extensionMode,
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
        extensionMode: state.extensionMode,
        gitMode: state.gitMode,
        keepDev: state.keepDev,
        target: state.target,
      },
    });
  }

  return {
    setPackages(list) {
      state.packages = (list || []).map((pkg) => ({ ...pkg }));
      renderAll();
    },
    setHost(hostKey, mode) {
      state.host = hostKey;
      state.mode = mode;
      state.source = { type: 'host', pkgId: null };
      state.sourceKey = 'host:' + hostKey;
      renderAll();
    },
    setHostTree(nodes) {
      state.hostTree = nodes || [];
      renderChart();
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
      if ('open' in next) state.lan.open = !!next.open;
      if (next.send) Object.assign(state.lan.send, next.send);
      if (next.recv) Object.assign(state.lan.recv, next.recv);
      if ('scanError' in next) state.lan.scanError = next.scanError;
      renderLan();
    },
    getLan() { return state.lan; },
    setStorage(next) {
      state.storage = { ...state.storage, ...(next || {}) };
      renderQuota();
    },
    setLibraryExport(on) { state.libraryExport = !!on; renderActions(); },
    setPrivateFiles(list) { state.privateFiles = Array.isArray(list) ? list : []; renderChart(); },
    setZone(zone) { state.zone = zone; state.selectedPkgs = new Set(); renderAll(); },
    setActivePackage(id) { state.source = { type: 'package', pkgId: id }; state.sourceKey = 'pkg:' + id; renderAll(); },
    pushLog(level, msg) { log(String(level || 'INFO').toUpperCase(), msg); },
    openModal,
    closeModal,
    confirmTraffic(onConfirm, opts) { openTrafficModal(onConfirm, opts); },
    toast,
    renderAll,
    getExcludedPaths,
    getExportOptions,
    getMergedPlan,
    getVolumes(pkg) { return volumesOf(pkg, packageNodes(pkg).nodes); },
    getState() { return state; },
    openTutorial,
    renderLog,
  };
}

