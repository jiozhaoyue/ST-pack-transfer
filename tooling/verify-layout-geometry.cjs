/**
 * 几何回归守卫 —— 唯一目标：**真能检测出布局缺陷**。
 *
 * ## 为什么必须存在（2026-11-19 用户铁律）
 *
 * 用户原话：「绝对保证测试能真检测出问题」「不可能说测试全跑，阵仗很大，但是一测就拉稀」。
 * 本仓 1434 个测试全绿，却连续漏掉三个真实几何缺陷：
 *
 *  1. `.lan-qr` 容器 116×116，内部 svg 写死 150×150 → 二维码顶出白色卡片边框。
 *  2. `#webdav-test-result` 复用 `.cloud-note-box`（display:flex），报告每行 `<div>`
 *     被横向并排挤压到 45px 宽 → 文字逐字竖排。
 *  3. 复选框对勾硬编码 left/top → 20px 档偏左上（已由 verify-checkbox-centering.cjs 覆盖）。
 *
 * 全部漏检的**共同根因**：既有 UI 测试是 `readFileSync` + `toMatch` 的源码字符串匹配，
 * 永远看不到渲染结果。字符串里写着 `display:flex` 也「符合预期」，但画出来是竖排。
 *
 * ## 本守卫的做法
 *
 * 用真实 Chromium 计算**布局盒**，对真实模板 + 真实样式 + 真实 i18n 文案 + 真实二维码编码器
 * 断言几何关系。不是「样式字符串对不对」，而是「画出来是什么样」。
 *
 * ## 为什么必须注入真实文案（恒真陷阱）
 *
 * `getWorkbenchHtml()` 产出的节点只有 `data-i18n="key"`、**没有文本**。若直接测量：
 * 文本宽高恒为 0，`getClientRects().length` 恒为 0，「行数 ≤ 1」永远成立 —— 守卫恒真通过。
 * 因此本脚本必须先用真实 `zh-CN` 词条填充文本，再测量。同一理由：二维码必须用真实
 * `encodeSvg()` 产物（只有 viewBox、没有 width/height），手写固定尺寸矩形会让断言失效。
 *
 * ## 元素缺失 = FAIL（不得静默跳过）
 *
 * 任何受检元素取不到、或尺寸为 0（说明祖先链被隐藏/结构被改坏），一律记为失败。
 * 「取不到就跳过」正是上一代守卫（verify-no-overflow.cjs）恒真的根源：
 * 它在 HEAD 缺陷版上照样 PASS，因为量错了父容器。
 *
 * ## 断言清单
 *
 *  A. 溢出：受检对子元素渲染矩形必须落在父容器 **padding box** 之内（容差 1px）。
 *  B. 二维码：`.lan-qr` 内 svg 必须完全落在 `.lan-qr` 内，且容器不得超出其父级。
 *  C. 可读性：文本容器宽度不得低于下限；文本行数 `getClientRects().length` 不得 > 1。
 *  D. flex 挤压：并列子元素不得被压到宽度 < 40px。
 *  E. 多行报告：每行必须单行渲染，容器宽度必须接近父级（不被挤成一条）。
 *
 * ## 自证（--self-check）
 *
 * `node tooling/verify-layout-geometry.cjs --self-check`
 * 依次注入「已知缺陷」覆盖，逐条确认对应断言**必须失败**；全部失败才算自证通过。
 * 这是防止守卫本身沦为恒真的唯一手段：一个从不失败的断言没有价值。
 *
 * ## 局限（必须写清楚）
 * 不覆盖动画中途状态、不覆盖 hover/active/focus 态、不覆盖宿主主题变量被外部改写的情形。
 *
 * 用法：
 *   node tooling/verify-layout-geometry.cjs               # 守卫当前代码
 *   node tooling/verify-layout-geometry.cjs --self-check  # 证明守卫有检测力
 * 退出码：0 全通过；1 发现几何缺陷；2 脚本自身异常。
 */
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { loadPlaywright } = require('../e2e/lib/resolve-playwright.cjs');

const ROOT = path.join(__dirname, '..');

/** 亚像素容差。1px 是浏览器缩放/小数像素的常规抖动上限。 */
const OVERFLOW_TOL = 1;
/** 并列子元素宽度下限（px）。低于此值按钮文字必然竖排或截断。 */
const MIN_PEER_WIDTH = 40;
/** 文本容器最小可读宽度（px）。10.5px 字号下约 12 个汉字。 */
const MIN_TEXT_WIDTH = 90;
/**
 * 逐字竖排判据：行宽中位数低于 `字号 × 该倍数`。
 *
 * 为什么不用「行数 ≤ 1」：`cloud.note` 等词条本身含 `\n`，多行是**设计意图**
 * （如「WebDAV 直连\n凭据只存本机浏览器」）。用行数当尺子会误报。
 * 逐字竖排的真实特征是「行数很多、每行只有 1~2 个字宽」——
 * 中位数行宽 ≈ 字号本身。中文 10.5px 字号下，1 个字 = 10.5px，3 个字 = 31.5px。
 */
const VERTICAL_MEDIAN_FACTOR = 3;
/** 行数达到此值才可能判定为竖排（2 行短文本是正常排版）。 */
const VERTICAL_MIN_LINES = 3;
/** 报告行容器宽度 / 父容器宽度 的最低占比。低于此值说明被并排挤压。 */
const MIN_REPORT_WIDTH_RATIO = 0.8;

/* ────────────────────────── 真实来源加载 ────────────────────────── */

/** 动态 import 一个 ESM 源文件；加时间戳参数避免模块缓存。 */
async function importFresh(absPath) {
  return import(`${pathToFileURL(absPath).href}?v=${Date.now()}`);
}

/**
 * 读取真实工作台模板。
 * @returns {Promise<string>} 完整工作台 HTML（含所有视图，默认隐藏）
 */
async function loadTemplate() {
  /* --template <file> 允许对**另一份**模板跑断言（自证/结构缺失实验用）。 */
  const idx = process.argv.indexOf('--template');
  const target = idx > -1 && process.argv[idx + 1]
    ? path.resolve(process.argv[idx + 1])
    : path.join(ROOT, 'src', 'ui', 'workbench-template.js');
  const mod = await importFresh(target);
  if (typeof mod.getWorkbenchHtml !== 'function') {
    throw new Error('workbench-template.js 未导出 getWorkbenchHtml');
  }
  const html = mod.getWorkbenchHtml();
  if (typeof html !== 'string' || html.length < 5000) {
    throw new Error(`模板长度异常（${html && html.length}），疑似模板源被改坏`);
  }
  return html;
}

/**
 * 读取真实 i18n 词条（zh-CN）。
 *
 * **不可省略**：模板节点只有 data-i18n 键名没有文本；不注入文案时所有文本宽度为 0，
 * 「行数 ≤ 1」类断言会恒真通过 —— 这正是「测试全绿但一测就拉稀」的根源。
 * @returns {Promise<Record<string,string>>}
 */
async function loadLocale() {
  const mod = await importFresh(path.join(ROOT, 'src', 'i18n', 'locales', 'zh-CN.js'));
  const dict = mod.default || mod['zh-CN'] || mod.zhCN || mod;
  if (!dict || typeof dict !== 'object' || Object.keys(dict).length < 100) {
    throw new Error('zh-CN 词条加载失败，无法注入真实文案');
  }
  return dict;
}

/** 读取真实设计令牌（--ctl-h 等），保证与生产同一尺寸基线。 */
async function loadUiTokens() {
  const mod = await importFresh(path.join(ROOT, 'src', 'data', 'ui-tokens.js'));
  if (typeof mod.uiTokenVars !== 'function') throw new Error('ui-tokens.js 未导出 uiTokenVars');
  return mod.uiTokenVars();
}

/**
 * 用真实二维码编码器产出 SVG。
 *
 * 必须是真实产物：`qrcode-generator` 的 `scalable:true` 只给 viewBox、**不给 width/height**，
 * 尺寸完全由 CSS 决定 —— 这正是缺陷 1 的成因。手写固定尺寸矩形会让溢出断言失效。
 */
async function loadQrSvg() {
  const mod = await importFresh(path.join(ROOT, 'src', 'ui', 'qr.js'));
  if (typeof mod.encodeSvg !== 'function') throw new Error('qr.js 未导出 encodeSvg');
  const svg = mod.encodeSvg('SZC1.0.geometry-guard-probe-payload');
  if (typeof svg !== 'string' || !svg.includes('<svg') || !svg.includes('viewBox')) {
    throw new Error('encodeSvg 未产出合法 SVG，无法验证二维码几何');
  }
  /* 只检查**根 svg 标签**的 width/height 属性。
     注意不能全文正则：内部 `<rect width="100%">` 会误伤。
     scalable:true 的契约就是「根 svg 无固定像素宽高、尺寸由 CSS 决定」，
     一旦根标签带像素宽高，缺陷 1（容器 116 / svg 150）就会重现。 */
  const rootTag = svg.slice(0, svg.indexOf('>') + 1);
  if (/\swidth\s*=\s*"\s*\d/.test(rootTag) || /\sheight\s*=\s*"\s*\d/.test(rootTag)) {
    throw new Error('encodeSvg 根标签带固定像素 width/height，与 scalable 契约不符（会导致溢出断言失真）');
  }
  return svg;
}

/* ────────────────────────── Playwright 渲染 ────────────────────────── */

/**
 * 在隔离 iframe 中渲染真实模板。
 *
 * 必须隔离：CSS 规则以 `#app.app-container` 为根，同文档放多份会产生 id 冲突与规则叠加。
 * @param {import('playwright').Page} page
 * @param {object} opts
 * @param {string} opts.html 模板 HTML
 * @param {string} opts.css 样式文本
 * @param {string} opts.view desktop|mobile
 * @param {number} opts.width iframe 宽度
 * @param {object} opts.tokens 设计令牌
 * @param {string} opts.extraCss 自证时注入的缺陷覆盖
 * @returns {Promise<import('playwright').Frame>}
 */
async function renderFrame(page, { html, css, view, width, tokens, extraCss = '' }) {
  const tokenCss = Object.entries(tokens).map(([k, v]) => `${k}:${v}`).join(';');
  const doc = `<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;padding:0;background:#0b0b0d;color:#dcdcd2;
  font-family:"Segoe UI","Microsoft YaHei",system-ui,sans-serif;font-size:14px}
${css}
${extraCss}
</style></head><body><div class="app-container" id="app" data-view="${view}" style="${tokenCss}">${html}</div></body></html>`;

  const handle = await page.evaluateHandle((d) => {
    const f = document.createElement('iframe');
    f.style.cssText = `width:${d.w}px;height:${d.h}px;border:0`;
    document.body.appendChild(f);
    const inner = f.contentDocument;
    inner.open(); inner.write(d.doc); inner.close();
    return f;
  }, { doc, w: width, h: 900 });
  const frame = await handle.contentFrame();
  await frame.waitForLoadState?.('domcontentloaded').catch(() => {});
  return frame;
}

/* ────────────────────────── 页面内测量逻辑 ────────────────────────── */

/**
 * 填充真实文案、解除隐藏、注入真实二维码与报告行，然后测量全部几何指标。
 *
 * 注意：本函数被 `page.evaluate` 序列化执行，**不得引用外部闭包**。
 * @param {{dict: object, qrSvg: string}} input
 */
function measureAll({ dict, qrSvg }) {
  /* ---- 前置：让被测节点可见且带真实内容 ---- */

  /** 向上解除 hidden，否则祖先 display:none 会让所有几何恒为 0（恒真陷阱）。 */
  const reveal = (el) => {
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (n.hasAttribute('hidden')) n.removeAttribute('hidden');
      n.hidden = false;
    }
  };

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    const v = dict[el.dataset.i18n];
    if (typeof v === 'string' && v) el.textContent = v;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const v = dict[el.dataset.i18nPlaceholder];
    if (typeof v === 'string' && v) el.placeholder = v;
  });

  const QR_IDS = ['lan-peer-qr', 'lan-send-qr', 'lan-recv-qr'];
  const REVEAL_IDS = [
    'transfer-view', 'lan-view', 'cloud-view', 'cloud-s3-pane', 'cloud-webdav-pane',
    'lan-peer-container', 'lan-peer-unconnected', 'lan-peer-qr-box', 'lan-peer-connected',
    'lan-legacy-container', 'lan-send', 'lan-recv',
    'webdav-test-result',
  ];
  REVEAL_IDS.forEach((id) => { const el = document.getElementById(id); if (el) reveal(el); });
  QR_IDS.forEach((id) => {
    const box = document.getElementById(id);
    if (box) { reveal(box); box.innerHTML = qrSvg; }
  });

  /* 报告容器：结构以模板真实 class 为准（cloud-test-box / cloud-test-head / cloud-test-row），
     但**不写死**——取容器内现有子节点类名，避免模板重构后守卫静默失效。 */
  const report = document.getElementById('webdav-test-result');
  if (report) {
    reveal(report);
    const headCls = [...report.classList].find((c) => c !== 'cloud-test-box') || '';
    const head = dict['webdav.testOk'] || '连接正常：各步骤全部通过';
    const steps = ['连接 ✓ · 200', '列目录 ✓ · 207', '写入 ✓ · 201', '读回 ✓ · 200', '删除 ✓ · 204'];
    report.innerHTML = `<div class="${headCls ? 'cloud-test-head' : ''}">${head}</div>`
      + steps.map((s) => '<div class="cloud-test-row">' + s + '</div>').join('');
  }

  /* ---- 测量工具 ---- */

  const rectOf = (el) => {
    const r = el.getBoundingClientRect();
    return { w: +r.width.toFixed(2), h: +r.height.toFixed(2) };
  };

  /** 元素 padding box（边框之内、含内边距）——溢出判定的正确基准。 */
  const padBoxOf = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      left: r.left + (parseFloat(cs.borderLeftWidth) || 0),
      top: r.top + (parseFloat(cs.borderTopWidth) || 0),
      right: r.right - (parseFloat(cs.borderRightWidth) || 0),
      bottom: r.bottom - (parseFloat(cs.borderBottomWidth) || 0),
    };
  };

  /** 子元素相对父级 padding box 的四向溢出量（正值 = 溢出）。 */
  const overflowOf = (parent, child) => {
    const p = padBoxOf(parent);
    const c = child.getBoundingClientRect();
    return {
      left: +(p.left - c.left).toFixed(2),
      top: +(p.top - c.top).toFixed(2),
      right: +(c.right - p.right).toFixed(2),
      bottom: +(c.bottom - p.bottom).toFixed(2),
    };
  };

  /**
   * 文本行数：用 Range.getClientRects() 取真实排版行框。
   * 逐字竖排时：宽度很小、行数极多。这是缺陷 2 的直接观测量。
   */
  const textMetrics = (el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const rects = [...range.getClientRects()].filter((r) => r.width > 0 && r.height > 0);
    const compact = (el.textContent || '').replace(/\s+/g, '');
    return {
      lineCount: rects.length,
      lineWidths: rects.map((r) => +r.width.toFixed(2)),
      textLen: compact.length,
      box: rectOf(el),
      fontSize: getComputedStyle(el).fontSize,
    };
  };

  /* ---- A/B：二维码溢出 ---- */
  const qr = {};
  for (const id of QR_IDS) {
    const host = document.getElementById(id);
    if (!host) { qr[id] = { error: '容器缺失' }; continue; }
    const svg = host.querySelector('svg');
    if (!svg) { qr[id] = { error: '容器内无 svg' }; continue; }
    const parent = host.parentElement;
    qr[id] = {
      host: rectOf(host),
      svg: rectOf(svg),
      hostDisplay: getComputedStyle(host).display,
      overflowSelf: overflowOf(host, svg),
      overflowParent: parent ? overflowOf(parent, host) : null,
      parentTag: parent ? parent.className : null,
    };
  }

  /* ---- C：文本可读性 ---- */
  const notes = [...document.querySelectorAll('.cloud-note')].map((el) => ({
    text: (el.textContent || '').slice(0, 20),
    parentCls: el.parentElement ? el.parentElement.className : '',
    ...textMetrics(el),
  }));

  /* ---- D：flex 挤压（真实并列行） ---- */
  const SQUEEZE_ROWS = ['.lan-peer-actions', '.cloud-action-buttons', '.lan-peer-actions-row'];
  const squeeze = {};
  for (const sel of SQUEEZE_ROWS) {
    const row = document.querySelector(sel);
    if (!row) { squeeze[sel] = { error: '容器缺失' }; continue; }
    const cs = getComputedStyle(row);
    squeeze[sel] = {
      display: cs.display,
      wrap: cs.flexWrap,
      rowW: rectOf(row).w,
      kids: [...row.children]
        .filter((c) => c.getBoundingClientRect().width > 0)
        .map((c) => ({
          cls: String(c.className).slice(0, 30),
          text: (c.textContent || '').trim().slice(0, 12),
          ...rectOf(c),
        })),
    };
  }

  /* ---- E：多行报告 ---- */
  let reportMetrics = null;
  if (report) {
    const cs = getComputedStyle(report);
    const kids = [...report.children].map((c) => ({
      cls: c.className,
      ...rectOf(c),
      ...textMetrics(c),
    }));
    reportMetrics = {
      box: rectOf(report),
      display: cs.display,
      dir: cs.flexDirection,
      wrap: cs.flexWrap,
      parentW: report.parentElement ? rectOf(report.parentElement).w : null,
      kids,
    };
  }

  return { qr, notes, squeeze, report: reportMetrics };
}

/* ────────────────────────── 断言 ────────────────────────── */

/**
 * 对一次测量结果跑全部断言。
 * @param {object} m measureAll 的返回值
 * @returns {Array<{id: string, name: string, ok: boolean, detail: string}>}
 */
function assertAll(m) {
  const results = [];
  const add = (id, name, ok, detail) => results.push({ id, name, ok, detail });

  /* A/B：二维码 */
  const QR_LABEL = { 'lan-peer-qr': '对等模式', 'lan-send-qr': '传统发送', 'lan-recv-qr': '传统接收' };
  for (const [id, label] of Object.entries(QR_LABEL)) {
    const q = m.qr[id];
    if (!q) { add(`qr:${id}`, `${label}二维码存在`, false, '未测量'); continue; }
    if (q.error) { add(`qr:${id}`, `${label}二维码存在`, false, q.error); continue; }

    const self = q.overflowSelf;
    const worstSelf = Math.max(self.left, self.top, self.right, self.bottom);
    add(`qr:${id}:in`,
      `${label}二维码 svg 不溢出 .lan-qr`,
      worstSelf <= OVERFLOW_TOL,
      `容器 ${q.host.w}x${q.host.h} / svg ${q.svg.w}x${q.svg.h}；` +
      `溢出 L${self.left} T${self.top} R${self.right} B${self.bottom}（限 ${OVERFLOW_TOL}）`);

    if (q.overflowParent) {
      const p = q.overflowParent;
      const worstP = Math.max(p.left, p.top, p.right, p.bottom);
      add(`qr:${id}:out`,
        `${label}二维码容器不溢出父级`,
        worstP <= OVERFLOW_TOL,
        `.lan-qr ${q.host.w}x${q.host.h} 溢出父级 L${p.left} T${p.top} R${p.right} B${p.bottom}`);
    }

    /* 容器尺寸必须真实（0 宽高说明祖先被隐藏 —— 后续断言会恒真）。 */
    add(`qr:${id}:size`,
      `${label}二维码容器尺寸非零`,
      q.host.w > 0 && q.host.h > 0,
      `容器 ${q.host.w}x${q.host.h}（0 表示不可见，几何断言会失去意义）`);
  }

  /* C：文本可读性 —— 逐字竖排检测 */
  if (!m.notes.length) {
    add('text:absent', '云设置说明文本存在', false, '未找到任何 .cloud-note 节点');
  }
  m.notes.forEach((n, i) => {
    const tag = `text:note${i}`;
    const label = `说明文本「${n.text.replace(/\s+/g, ' ')}」`;
    add(`${tag}:present`, `${label}有真实文案`, n.textLen > 0,
      `文本长度 ${n.textLen}（0 说明 i18n 未注入，行数断言会恒真）`);
    add(`${tag}:width`, `${label}宽度不低于 ${MIN_TEXT_WIDTH}px`, n.box.w >= MIN_TEXT_WIDTH,
      `实测宽 ${n.box.w}px（下限 ${MIN_TEXT_WIDTH}）`);

    /* 逐字竖排判据：行数够多 **且** 行宽中位数小到「一行只放得下几个字」。
       单看行数会误报正常的多行文案；单看宽度会漏掉「容器够宽但被 flex 挤成细条」的情形
       —— 此时 .cloud-note 自身宽度也小，两个条件都会命中。 */
    const fsPx = parseFloat(n.fontSize) || 10.5;
    const widths = [...n.lineWidths].sort((a, b) => a - b);
    const median = widths.length ? widths[Math.floor(widths.length / 2)] : 0;
    const limit = fsPx * VERTICAL_MEDIAN_FACTOR;
    const suspicious = n.lineCount >= VERTICAL_MIN_LINES && median <= limit;
    add(`${tag}:vertical`,
      `${label}未逐字竖排`,
      !suspicious,
      `行数 ${n.lineCount}，行宽中位数 ${median.toFixed(1)}px（判据：行数 ≥ ${VERTICAL_MIN_LINES} 且中位数 ≤ ${limit.toFixed(1)}）` +
      `，全部行宽 [${n.lineWidths.join(', ')}]`);
  });

  /* D：flex 挤压 */
  for (const [sel, row] of Object.entries(m.squeeze)) {
    if (row.error) { add(`squeeze:${sel}`, `并列行 ${sel} 存在`, false, row.error); continue; }
    if (!row.kids.length) {
      add(`squeeze:${sel}:kids`, `并列行 ${sel} 有可见子元素`, false,
        `无可见子元素（行宽 ${row.rowW}，display=${row.display}）；`
        + '说明祖先被隐藏或子元素全为 0 宽 —— 该项断言失去检测意义');
      continue;
    }
    const narrow = row.kids.filter((k) => k.w < MIN_PEER_WIDTH);
    add(`squeeze:${sel}`,
      `并列行 ${sel} 子元素宽度 ≥ ${MIN_PEER_WIDTH}px`,
      narrow.length === 0,
      narrow.length
        ? `被挤压：${narrow.map((k) => `「${k.text}」${k.w}px`).join('；')}（行宽 ${row.rowW}，wrap=${row.wrap}）`
        : `${row.kids.length} 个子元素，最窄 ${Math.min(...row.kids.map((k) => k.w))}px，行宽 ${row.rowW}`);
  }

  /* E：多行报告 */
  const rep = m.report;
  if (!rep) {
    add('report:absent', 'WebDAV 自检报告容器存在', false, '未找到 #webdav-test-result');
  } else {
    add('report:block', '报告容器为块级布局（非 flex 横排）',
      rep.display !== 'flex' && rep.display !== 'inline-flex',
      `display=${rep.display} flex-direction=${rep.dir} wrap=${rep.wrap}`);

    if (rep.parentW && rep.parentW > 0) {
      const ratio = +(rep.box.w / rep.parentW).toFixed(3);
      add('report:width', '报告容器宽度接近父级（未被挤成一条）',
        ratio >= MIN_REPORT_WIDTH_RATIO,
        `报告宽 ${rep.box.w} / 父级 ${rep.parentW} = ${ratio}（下限 ${MIN_REPORT_WIDTH_RATIO}）`);
    }

    if (!rep.kids.length) {
      add('report:kids', '报告行存在', false, '报告容器无子行');
    }
    rep.kids.forEach((k, i) => {
      const tag = `report:row${i}`;
      add(`${tag}:single`, `报告第 ${i + 1} 行单行渲染`, k.lineCount <= 1,
        `「${(k.textLen ? '' : '')}${k.cls || 'div'}」行数 ${k.lineCount}，行宽 [${k.lineWidths.join(', ')}]`);
      add(`${tag}:width`, `报告第 ${i + 1} 行占满容器宽度`,
        rep.box.w <= 0 ? false : k.w >= rep.box.w * 0.8,
        `行宽 ${k.w} / 容器 ${rep.box.w}（下限 80%）`);
    });
  }

  return results;
}

/* ────────────────────────── 自证 ────────────────────────── */

/**
 * 自证用「已知缺陷」覆盖。
 *
 * 每条都必须让至少一个指定断言**失败**。若某条覆盖跑完仍全绿，说明对应断言形同虚设。
 *
 * ⚠️ 覆盖必须真正改变几何，否则自证本身会变成假阳性。实测教训（2026-11-19）：
 *   - 只写 `width:150px` 无效 —— 现行 `max-width:100%` 会把它压回 104px；
 *     必须同时 `max-width:none` 才能复现「容器 116 / svg 150」的历史缺陷。
 *   - 只放大子元素不触发父级溢出 —— 父级 `width:fit-content` 会随之长大；
 *     必须同时把父级定宽才能复现「撑破卡片边框」。
 */
const SELF_CHECKS = [
  {
    name: '二维码 svg 写死 150×150（历史缺陷 1：容器 116 / svg 150）',
    extraCss: '#app.app-container .lan-qr svg{width:150px !important;height:150px !important;'
      + 'max-width:none !important;max-height:none !important}',
    expectFail: ['qr:lan-peer-qr:in'],
  },
  {
    name: '报告容器退回 flex 横排（历史缺陷 2：报告逐字竖排）',
    extraCss: '#app.app-container .cloud-test-box{display:flex !important;flex-wrap:nowrap !important}',
    expectFail: ['report:block'],
  },
  {
    name: '说明文本被压窄到 30px（逐字竖排）',
    extraCss: '#app.app-container .cloud-note{width:30px !important;flex:0 0 30px !important}',
    expectFail: ['text:note0:width', 'text:note0:vertical'],
  },
  {
    name: '并列按钮强制不换行并压窄',
    extraCss: '#app.app-container .lan-peer-actions{flex-wrap:nowrap !important;width:150px !important;'
      + 'max-width:150px !important}#app.app-container .lan-peer-actions .btn{min-width:0 !important;padding:0 2px !important}',
    expectFail: ['squeeze:.lan-peer-actions'],
  },
  {
    name: '二维码容器撑破父级（父级定宽 + 容器放大 + overflow:visible）',
    extraCss: '#app.app-container .lan-peer-qr-wrap{width:116px !important;max-width:116px !important}'
      + '#app.app-container .lan-qr.is-compact{width:400px !important;height:400px !important;'
      + 'max-width:none !important;overflow:visible !important}',
    expectFail: ['qr:lan-peer-qr:out'],
  },
];

/**
 * 执行自证：逐条注入缺陷，确认期望断言真的失败。
 * @returns {Promise<boolean>} 全部符合预期才算通过
 */
async function runSelfCheck(ctx) {
  console.log('\n=== 自证：注入已知缺陷，确认守卫会失败 ===');
  let allGood = true;

  for (const check of SELF_CHECKS) {
    const m = await measureWithCss(ctx, check.extraCss);
    const results = assertAll(m);
    const failedIds = results.filter((r) => !r.ok).map((r) => r.id);

    const hit = check.expectFail.filter((id) => failedIds.includes(id));
    const missed = check.expectFail.filter((id) => !failedIds.includes(id));
    const ok = missed.length === 0;
    if (!ok) allGood = false;

    console.log(`${ok ? 'PASS' : 'FAIL'} 自证「${check.name}」`);
    console.log(`     失效断言（应有）：${hit.length ? hit.join(', ') : '（无）'}`);
    if (missed.length) {
      console.log(`     ✗ 未触发：${missed.join(', ')} —— 该断言无法检测此缺陷`);
    }
    /* 打印失败断言的真实读数，证明不是靠别的原因碰巧失败 */
    for (const r of results.filter((x) => !x.ok && hit.includes(x.id))) {
      console.log(`     · ${r.name} → ${r.detail}`);
    }
  }

  console.log(`\n${allGood ? '✓' : '✗'} 自证${allGood ? '通过：每条断言都能检测出对应缺陷' : '失败：存在形同虚设的断言'}`);
  return allGood;
}

/**
 * 用额外缺陷 CSS 渲染并测量一次（自证专用）。
 * @returns {Promise<object>} measureAll 结果
 */
async function measureWithCss(ctx, extraCss) {
  const frame = await renderFrame(ctx.page, {
    html: ctx.html,
    css: ctx.css,
    view: 'desktop',
    width: 1280,
    tokens: ctx.tokens,
    extraCss,
  });
  const m = await frame.evaluate(measureAll, { dict: ctx.dict, qrSvg: ctx.qrSvg });
  await frame.evaluate(() => { /* 让 frame 自然销毁 */ });
  return m;
}

/* ────────────────────────── 主流程 ────────────────────────── */

(async () => {
  const selfCheck = process.argv.includes('--self-check');
  const { chromium } = loadPlaywright();

  /* 真实来源：任一加载失败都必须硬失败（不得降级为「跳过」）。 */
  const [html, dict, tokens, qrSvg] = await Promise.all([
    loadTemplate(), loadLocale(), loadUiTokens(), loadQrSvg(),
  ]);
  /* --css <file> 允许对**另一份**样式跑断言（自证/对照实验用，默认用真实 style.css）。 */
  const cssArgIdx = process.argv.indexOf('--css');
  const cssPath = cssArgIdx > -1 && process.argv[cssArgIdx + 1]
    ? path.resolve(process.argv[cssArgIdx + 1])
    : path.join(ROOT, 'style.css');
  const css = fs.readFileSync(cssPath, 'utf8');
  if (!css.length) throw new Error(`样式文件为空：${cssPath}`);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  await page.setContent('<!doctype html><html><body style="margin:0"></body></html>');

  const ctx = { page, html, css, tokens, dict, qrSvg };

  let failedCount = 0;
  const SCENARIOS = [
    { view: 'desktop', width: 1280 },
    { view: 'mobile', width: 390 },
  ];

  console.log('=== 几何回归守卫 ===');
  console.log(`模板 ${html.length} 字符 · 词条 ${Object.keys(dict).length} 条 · 样式 ${css.length} 字符`);

  for (const sc of SCENARIOS) {
    const frame = await renderFrame(page, {
      html, css, view: sc.view, width: sc.width, tokens,
    });
    const m = await frame.evaluate(measureAll, { dict, qrSvg });
    const results = assertAll(m);

    console.log(`\n--- ${sc.view} ${sc.width}px ---`);
    for (const r of results) {
      console.log(`${r.ok ? 'PASS' : 'FAIL'} ${r.name}  |  ${r.detail}`);
      if (!r.ok) failedCount += 1;
    }
  }

  let selfOk = true;
  if (selfCheck) selfOk = await runSelfCheck(ctx);

  await browser.close();

  console.log('');
  if (failedCount > 0) {
    console.log(`✗ 几何缺陷 ${failedCount} 项`);
    process.exit(1);
  }
  if (!selfOk) {
    console.log('✗ 自证未通过（存在无法检测缺陷的断言）');
    process.exit(1);
  }
  console.log('✓ 全部通过：受检几何关系均正常'
    + (selfCheck ? '，且自证已确认每条断言有检测力' : ''));
  process.exit(0);
})().catch((err) => {
  console.error('守卫脚本异常:', err);
  process.exit(2);
});
