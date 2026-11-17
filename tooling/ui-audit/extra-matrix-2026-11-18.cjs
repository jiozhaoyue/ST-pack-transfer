#!/usr/bin/env node
/**
 * 扩展视口 UI 审计采集器（2026-11-18 用户要求，一次性审计工具）
 *
 * 与 matrix.cjs（13 视口既有口径）互补：追加 16 个视口（异形屏 / 平板 / 超宽 / 极小横窗），
 * 每视口采集 首屏 / 设置视图 / 迁移与备份视图 三张截图 + 四类 DOM 断言（只记录，不判定）。
 *
 * 断言项（用户明令口径）：
 *   A1 #app 无横向溢出        scrollWidth <= clientWidth + 2
 *   A2 页头按钮行不折行错位    .header-actions 各按钮 boundingBox 高度一致 ±2px（另记 top 离散作折行佐证）
 *   A3 底部队列条可见          #workbench-progress 可见且贴近 #app 底边
 *   A4 正文无水平滚动条        documentElement / body / .app-main 无横向溢出
 *
 * 产物（tooling/ui-audit/out/extra-views/）：
 *   <宽>x<高>/01-home.png | 02-settings.png | 03-transfer.png
 *   probe.json   每视口每状态的度量与异常明细
 *   summary.md   计数摘要
 *
 * 不修改产品代码；不安装依赖；复用 e2e/lib/resolve-playwright 的全局 Playwright。
 * 前置：dev 服务已在 http://localhost:3040 运行。
 *
 * 用法：node tooling/ui-audit/extra-matrix-2026-11-18.cjs [--url http://localhost:3040] [--out tooling/ui-audit/out/extra-views]
 */

const path = require('node:path');
const fs = require('node:fs');
const { loadPlaywright } = require('../../e2e/lib/resolve-playwright.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..');

/** 16 个追加视口（用户明令清单，顺序即执行顺序） */
const VIEWPORTS = [
  { w: 320, h: 480, kind: 'phone', touch: true },
  { w: 360, h: 740, kind: 'phone', touch: true },
  { w: 390, h: 844, kind: 'phone', touch: true },
  { w: 412, h: 915, kind: 'phone', touch: true },
  { w: 414, h: 896, kind: 'phone', touch: true },
  { w: 280, h: 653, kind: 'fold', touch: true },
  { w: 768, h: 1024, kind: 'tablet-port', touch: true },
  { w: 820, h: 1180, kind: 'tablet-port', touch: true },
  { w: 1024, h: 768, kind: 'tablet-land', touch: true },
  { w: 1280, h: 800, kind: 'laptop', touch: false },
  { w: 1366, h: 768, kind: 'laptop', touch: false },
  { w: 1440, h: 900, kind: 'desktop', touch: false },
  { w: 1920, h: 1080, kind: 'desktop', touch: false },
  { w: 2560, h: 1080, kind: 'ultrawide', touch: false },
  { w: 3440, h: 1440, kind: 'ultrawide', touch: false },
  { w: 512, h: 320, kind: 'tiny-land', touch: false },
];

function parseArgs(argv) {
  const out = {
    url: process.env.AUDIT_URL || 'http://localhost:3040',
    out: path.join(REPO_ROOT, 'tooling', 'ui-audit', 'out', 'extra-views'),
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--url') out.url = argv[++i];
    else if (argv[i] === '--out') out.out = path.resolve(argv[++i]);
  }
  return out;
}

/**
 * 页面内断言采集：只记录几何事实，不做通过/失败判定。
 * 返回 { metrics, findings }；findings 元素形如 { id, detail?, items? }。
 */
function auditInPage() {
  const out = { metrics: {}, findings: [] };
  const app = document.getElementById('app');
  const push = (id, detail, extra) => out.findings.push({ id, ...(detail ? { detail } : {}), ...(extra || {}) });

  /* A1 #app 无横向溢出 */
  if (app) {
    const sw = app.scrollWidth;
    const cw = app.clientWidth;
    out.metrics.app = { scrollW: sw, clientW: cw, diff: sw - cw };
    if (sw > cw + 2) push('A1-app-h-overflow', `scrollWidth=${sw} clientWidth=${cw} diff=${sw - cw}`);
  } else {
    push('A1-app-missing', '#app 不存在');
  }

  /* A2 页头按钮行不折行错位 */
  const row = document.querySelector('#app .app-header .header-actions');
  if (row) {
    const els = Array.from(row.querySelectorAll('button, select'))
      .filter((el) => {
        if (el.hasAttribute('hidden')) return false;
        const r = el.getBoundingClientRect();
        if (r.width <= 0 || r.height <= 0) return false;
        for (let p = el; p && p !== row.parentElement; p = p.parentElement) {
          const s = getComputedStyle(p);
          if (s.display === 'none' || s.visibility === 'hidden') return false;
        }
        return true;
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          tag: el.tagName.toLowerCase(),
          id: el.id || '',
          w: Math.round(r.width * 10) / 10,
          h: Math.round(r.height * 10) / 10,
          top: Math.round(r.top * 10) / 10,
        };
      });
    out.metrics.headerButtons = els;
    if (els.length >= 2) {
      const hs = els.map((x) => x.h);
      const hMin = Math.min(...hs);
      const hMax = Math.max(...hs);
      const hDiff = Math.round((hMax - hMin) * 10) / 10;
      out.metrics.headerHeightSpread = hDiff;
      if (hDiff > 2) push('A2-header-btn-height-mismatch', `高差=${hDiff}px（max=${hMax} min=${hMin}）`, { items: els });
      const tops = els.map((x) => x.top);
      const tMin = Math.min(...tops);
      const tMax = Math.max(...tops);
      const tDiff = Math.round((tMax - tMin) * 10) / 10;
      out.metrics.headerTopSpread = tDiff;
      if (tDiff > 2) push('A2-header-btn-row-wrap', `行内 top 离散=${tDiff}px（疑似折行）`, { items: els });
    }
  } else {
    push('A2-header-row-missing', '.header-actions 不存在');
  }

  /* A3 底部队列条可见 */
  const qp = document.getElementById('workbench-progress');
  if (app && qp) {
    const r = qp.getBoundingClientRect();
    const ar = app.getBoundingClientRect();
    const visible = r.width > 0 && r.height > 0
      && getComputedStyle(qp).display !== 'none'
      && getComputedStyle(qp).visibility !== 'hidden';
    const bottomGap = Math.round((ar.bottom - r.bottom) * 10) / 10;
    out.metrics.queueBar = { visible, w: Math.round(r.width), h: Math.round(r.height), bottomGap, top: Math.round(r.top) };
    if (!visible) push('A3-queue-bar-not-visible', `w=${Math.round(r.width)} h=${Math.round(r.height)}`);
    else if (Math.abs(bottomGap) > 8) push('A3-queue-bar-not-at-bottom', `与 #app 底边距=${bottomGap}px`);
  } else if (!qp) {
    push('A3-queue-bar-missing', '#workbench-progress 不存在');
  }

  /* A4 正文无水平滚动条 */
  const de = document.documentElement;
  const body = document.body;
  out.metrics.doc = { scrollW: de.scrollWidth, clientW: de.clientWidth };
  if (de.scrollWidth > de.clientWidth + 2) {
    push('A4-doc-h-scrollbar', `documentElement scrollWidth=${de.scrollWidth} clientWidth=${de.clientWidth}`);
  }
  if (getComputedStyle(body).overflowX === 'scroll') push('A4-body-overflow-x-scroll', 'body overflow-x:scroll');
  const main = document.querySelector('#app .app-main');
  if (main) {
    const s = getComputedStyle(main);
    out.metrics.appMain = { scrollW: main.scrollWidth, clientW: main.clientWidth, overflowX: s.overflowX };
    if (main.scrollWidth > main.clientWidth + 2 && (s.overflowX === 'auto' || s.overflowX === 'scroll' || s.overflowX === 'visible')) {
      push('A4-main-h-overflow', `.app-main scrollWidth=${main.scrollWidth} clientWidth=${main.clientWidth} overflowX=${s.overflowX}`);
    }
  }

  /* 附带事实：打开的 dialog（弹窗会拦截点击，记录以便走查） */
  const openDialogs = Array.from(document.querySelectorAll('dialog[open]')).map((d) => d.id || d.className);
  if (openDialogs.length) push('info-dialog-open', `dialog[open]: ${openDialogs.join(', ')}`);
  const overlay = document.getElementById('st-pt-tutorial-overlay');
  if (overlay && getComputedStyle(overlay).display !== 'none') push('info-tutorial-overlay', '教程浮层仍在');

  return out;
}

/** 关闭打开中的 dialog，避免拦截后续点击（记录到采集结果） */
async function dismissDialogs(page) {
  await page.evaluate(() => {
    document.querySelectorAll('dialog[open]').forEach((d) => {
      try { d.close(); } catch { d.removeAttribute('open'); }
    });
  });
  await page.waitForTimeout(150);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const root = args.out;
  fs.mkdirSync(root, { recursive: true });
  process.stdout.write(`扩展视口采集：${args.url} → ${root}\n`);

  const pw = loadPlaywright();
  const browser = await pw.chromium.launch();
  const results = [];

  for (const vp of VIEWPORTS) {
    const dir = path.join(root, `${vp.w}x${vp.h}`);
    fs.mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext({
      viewport: { width: vp.w, height: vp.h },
      hasTouch: vp.touch,
      isMobile: vp.touch && vp.w <= 820,
      deviceScaleFactor: 1,
    });

    // 页面加载前合并写入设置：关教程 + 关更新日志弹窗（整体覆盖会丢标志 → dialog 拦截点击）
    await ctx.addInitScript(() => {
      try {
        const KEY = 'st-pack-transfer:settings';
        let prev = {};
        try {
          const raw = localStorage.getItem(KEY);
          prev = raw ? (JSON.parse(raw) || {}) : {};
          if (typeof prev !== 'object' || Array.isArray(prev)) prev = {};
        } catch { prev = {}; }
        localStorage.setItem(KEY, JSON.stringify({ ...prev, autoTutorial: false, showChangelogOnUpdate: false }));
      } catch { /* 隐私模式等静默跳过 */ }
    });

    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(`pageerror: ${String(e.message).slice(0, 200)}`));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 160)}`); });

    const rec = { viewport: `${vp.w}x${vp.h}`, kind: vp.kind, states: {}, errors: [] };

    try {
      await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      await page.waitForSelector('#app', { state: 'visible', timeout: 30000 }).catch(() => {});
      await page.waitForTimeout(900);

      const collect = async (state, shot) => {
        if (shot) await page.screenshot({ path: path.join(dir, shot) });
        const p = await page.evaluate(auditInPage).catch((e) => ({ metrics: {}, findings: [{ id: 'evaluate-error', detail: String(e).slice(0, 200) }] }));
        rec.states[state] = { shot: shot || null, ...p };
      };

      // 状态 1：首屏（教程/更新弹窗已由 init script 预防；若仍出现则关闭并记入 findings）
      let dialogs = await page.evaluate(() => document.querySelectorAll('dialog[open]').length).catch(() => 0);
      if (dialogs > 0) {
        await dismissDialogs(page);
        dialogs = await page.evaluate(() => document.querySelectorAll('dialog[open]').length).catch(() => 0);
      }
      await collect('home', '01-home.png');

      // 状态 2：设置视图
      await dismissDialogs(page);
      const openedSettings = await page.evaluate(() => {
        const b = document.getElementById('btn-settings');
        if (!b) return false;
        b.click();
        return true;
      }).catch(() => false);
      await page.waitForTimeout(650);
      const settingsShown = await page.evaluate(() => {
        const v = document.getElementById('view-settings');
        return !!v && !v.hasAttribute('hidden');
      }).catch(() => false);
      rec.states.settingsOpened = { clicked: openedSettings, shown: settingsShown };
      await collect('settings', '02-settings.png');
      // 关闭设置视图，回到工作台
      await page.evaluate(() => document.getElementById('settings-close')?.click()).catch(() => {});
      await page.waitForTimeout(350);

      // 状态 3：迁移与备份视图
      await dismissDialogs(page);
      const openedTransfer = await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('[data-wbview="transfer"]'))
          .find((x) => x.getBoundingClientRect().width > 0 && !x.closest('[hidden]'));
        if (!b) return false;
        b.click();
        return true;
      }).catch(() => false);
      await page.waitForTimeout(650);
      const transferShown = await page.evaluate(() => {
        const v = document.getElementById('transfer-view');
        return !!v && !v.hasAttribute('hidden');
      }).catch(() => false);
      rec.states.transferOpened = { clicked: openedTransfer, shown: transferShown };
      await collect('transfer', '03-transfer.png');
      // 切回图表视图，保持状态干净
      await page.evaluate(() => {
        const b = Array.from(document.querySelectorAll('[data-wbview="chart"]'))
          .find((x) => x.getBoundingClientRect().width > 0 && !x.closest('[hidden]'));
        if (b) b.click();
      }).catch(() => {});
    } catch (e) {
      rec.fatal = String(e && e.message || e).slice(0, 300);
    }

    rec.errors = errors.splice(0);
    results.push(rec);
    process.stdout.write(`  ${vp.w}x${vp.h} 完成（findings: ${Object.values(rec.states).reduce((s, st) => s + ((st && st.findings) ? st.findings.length : 0), 0)}）\n`);
    await ctx.close();
  }

  await browser.close();

  // 汇总
  fs.writeFileSync(path.join(root, 'probe.json'), JSON.stringify(results, null, 2));
  const byVp = results.map((r) => ({
    viewport: r.viewport,
    count: Object.values(r.states).reduce((s, st) => s + ((st && st.findings) ? st.findings.length : 0), 0),
    kinds: Object.values(r.states).flatMap((st) => (st && st.findings ? st.findings.map((f) => f.id) : []))
      .reduce((m, k) => { m[k] = (m[k] || 0) + 1; return m; }, {}),
  }));
  const lines = ['# 扩展视口采集摘要', '', `生成：${new Date().toISOString()}`, '',
    '| 视口 | findings 总数 | 明细 |', '| --- | --- | --- |'];
  for (const r of byVp) {
    const det = Object.entries(r.kinds).map(([k, v]) => `${k}×${v}`).join(' ') || '（无）';
    lines.push(`| ${r.viewport} | ${r.count} | ${det} |`);
  }
  lines.push('');
  fs.writeFileSync(path.join(root, 'summary.md'), lines.join('\n'));
  const total = byVp.reduce((s, r) => s + r.count, 0);
  process.stdout.write(`完成：${results.length} 视口，findings 共 ${total} 条。\n摘要：${path.join(root, 'summary.md')}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
