#!/usr/bin/env node
/**
 * 全视口 UI 审计采集器（一次性审计工具，2026-11-17 用户要求）
 *
 * 目的：在 16:9 / 21:9 带鱼屏 / 平板横竖 / Duo 折叠与展开 / 手机极窄等视口下，
 * 采集**真实渲染**截图并跑程序化度量，供人或多模态子代理判读。
 *
 * 产物（默认 test-results/audit/<stamp>/，被 .gitignore 覆盖，不入库）：
 *   shots/<viewport>/<nn>-<state>.png
 *   probe.json          每视口每状态的度量明细
 *   summary.md          计数摘要
 *
 * 不修改产品代码；不安装依赖；复用 e2e/lib/resolve-playwright 的全局 Playwright。
 * 前置：dev 服务已在 http://localhost:3040 运行（端口规则见 R-24）。
 *
 * 用法：node tooling/ui-audit/matrix.cjs [--url http://localhost:3040] [--out test-results/audit]
 */

const path = require('node:path');
const fs = require('node:fs');
const { loadPlaywright } = require('../../e2e/lib/resolve-playwright.cjs');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const VIEWPORTS = [
  { name: 'desktop-1920x1080-16x9', width: 1920, height: 1080, touch: false },
  { name: 'desktop-2560x1440-16x9', width: 2560, height: 1440, touch: false },
  { name: 'ultrawide-3440x1440-21x9', width: 3440, height: 1440, touch: false },
  { name: 'laptop-1440x900-16x10', width: 1440, height: 900, touch: false },
  { name: 'tablet-land-1180x820', width: 1180, height: 820, touch: true },
  { name: 'tablet-port-820x1180', width: 820, height: 1180, touch: true },
  { name: 'ipad-port-768x1024', width: 768, height: 1024, touch: true },
  { name: 'duo-unfolded-1114x705', width: 1114, height: 705, touch: true },
  { name: 'duo-folded-540x720', width: 540, height: 720, touch: true },
  { name: 'phone-390x844', width: 390, height: 844, touch: true },
  { name: 'phone-360x640', width: 360, height: 640, touch: true },
  { name: 'phone-320x568', width: 320, height: 568, touch: true },
  { name: 'fold-280x653', width: 280, height: 653, touch: true },
];

function parseArgs(argv) {
  const out = {
    url: process.env.AUDIT_URL || 'http://localhost:3040',
    out: path.join(REPO_ROOT, 'test-results', 'audit'),
  };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--url') out.url = argv[++i];
    else if (argv[i] === '--out') out.out = path.resolve(argv[++i]);
  }
  return out;
}

/** 页面内度量：只报可复核的几何/样式事实，不做主观判读 */
function probeInPage() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const findings = [];
  const push = (kind, severity, el, extra) => {
    const r = el.getBoundingClientRect();
    findings.push({
      kind,
      severity,
      tag: el.tagName.toLowerCase(),
      id: el.id || '',
      cls: (el.className && typeof el.className === 'string' ? el.className : '').slice(0, 90),
      text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 60),
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      ...extra,
    });
  };
  const isVisible = (el) => {
    for (let p = el; p; p = p.parentElement) {
      if (p.hasAttribute && p.hasAttribute('hidden')) return false;
      const ps = getComputedStyle(p);
      if (ps.display === 'none' || ps.visibility === 'hidden' || Number(ps.opacity) === 0) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const inViewportRough = (el) => {
    const r = el.getBoundingClientRect();
    return r.bottom > -4 && r.top < vh + 4;
  };
  const textOf = (el) => (el.textContent || '').trim();

  /* 1. 文档级横向溢出 → 横向滚动条（MR-15 禁止） */
  const doc = document.documentElement;
  if (doc.scrollWidth > vw + 1) {
    findings.push({ kind: 'doc-horizontal-overflow', severity: 'high', scrollWidth: doc.scrollWidth, vw });
  }
  const bodyStyle = getComputedStyle(document.body);
  if (bodyStyle.overflowX === 'scroll') {
    findings.push({ kind: 'body-overflow-x-scroll', severity: 'high' });
  }

  /* 2. 元素横向出界（排除自身可横向滚动的容器与其子节点） */
  const hasScrollableAncestorX = (el) => {
    for (let p = el.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && p.scrollWidth > p.clientWidth + 1) return true;
    }
    return false;
  };
  const all = Array.from(document.querySelectorAll('#app *'));
  for (const el of all) {
    if (!isVisible(el) || !inViewportRough(el)) continue;
    if (el.closest('svg')) continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1.5 || r.left < -1.5) {
      if (hasScrollableAncestorX(el)) continue;
      // 只记层级最深的可见出界元素，避免整条祖先链刷屏
      const childOut = Array.from(el.children).some((c) => {
        if (!isVisible(c)) return false;
        const cr = c.getBoundingClientRect();
        return cr.right > vw + 1.5 || cr.left < -1.5;
      });
      if (childOut) continue;
      push('element-out-of-viewport', 'high', el, { side: r.left < -1.5 ? 'left' : 'right' });
    }
  }

  /* 3. 功能性文字被裁切（overflow hidden/clip 且 scrollWidth 超宽、无 title/aria-label 兜底） */
  const FUNCTIONAL = new Set(['BUTTON', 'SELECT', 'LABEL', 'OPTION', 'SUMMARY']);
  for (const el of all) {
    if (!isVisible(el) || !inViewportRough(el)) continue;
    if (!textOf(el)) continue;
    if (Array.from(el.children).some((c) => textOf(c))) continue;
    const s = getComputedStyle(el);
    const clippedX = (s.overflowX === 'hidden' || s.overflowX === 'clip') && el.scrollWidth > el.clientWidth + 1;
    const clippedY = (s.overflowY === 'hidden' || s.overflowY === 'clip') && el.scrollHeight > el.clientHeight + 1;
    if (!clippedX && !clippedY) continue;
    const functional = FUNCTIONAL.has(el.tagName)
      || /(^|\s)(btn|badge|tab|view-switch-btn|seg-btn|pill|chip)(\s|$)/.test(el.className || '');
    const hasFullText = el.hasAttribute('title') || el.hasAttribute('aria-label')
      || (el.closest('[title]') !== null) || (el.closest('[aria-label]') !== null);
    if (functional && !hasFullText) {
      push('functional-text-clipped', 'high', el, {
        clippedX, clippedY, scrollW: el.scrollWidth, clientW: el.clientWidth, scrollH: el.scrollHeight, clientH: el.clientHeight,
      });
    } else if (!functional && clippedY) {
      push('content-clipped-vertically', 'medium', el, { scrollH: el.scrollHeight, clientH: el.clientHeight });
    }
  }

  /* 4. 垂直不可达内容：overflow hidden 且内容高于容器（滚动不到即信息丢失） */
  for (const el of all) {
    if (!isVisible(el) || !inViewportRough(el)) continue;
    const s = getComputedStyle(el);
    if ((s.overflowY === 'hidden' || s.overflowY === 'clip')
      && el.scrollHeight > el.clientHeight + 4 && el.clientHeight > 24) {
      const canScroll = s.overflowY === 'auto' || s.overflowY === 'scroll';
      if (!canScroll) push('unreachable-vertical-clip', 'high', el, { scrollH: el.scrollHeight, clientH: el.clientHeight });
    }
  }

  /* 5. 触控目标尺寸（触屏视口） */
  const touch = matchMedia('(pointer: coarse)').matches || window.innerWidth <= 820;
  if (touch) {
    const interactive = Array.from(document.querySelectorAll('#app button, #app a, #app select, #app input, #app textarea, #app [role="button"], #app [tabindex]'));
    for (const el of interactive) {
      if (!isVisible(el) || !inViewportRough(el)) continue;
      if (el.type === 'hidden') continue;
      const r = el.getBoundingClientRect();
      if (el.tagName === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) {
        // 复选框本体小是设计，但要看标签可点区域
        const label = el.closest('label');
        const lr = label ? label.getBoundingClientRect() : null;
        if (!lr || lr.height < 28) push('tap-target-checkbox-small', 'medium', el, { h: Math.round(r.height) });
        continue;
      }
      if (r.height < 24 || r.width < 24) push('tap-target-under-24', 'high', el, { w: Math.round(r.width), h: Math.round(r.height) });
      else if (r.height < 32) push('tap-target-under-32', 'medium', el, { w: Math.round(r.width), h: Math.round(r.height) });
    }
  }

  /* 6. 功能字过小 */
  for (const el of all) {
    if (!isVisible(el) || !inViewportRough(el)) continue;
    if (!textOf(el)) continue;
    if (Array.from(el.children).some((c) => textOf(c))) continue;
    const s = getComputedStyle(el);
    const fs = parseFloat(s.fontSize);
    if (!fs) continue;
    const functional = FUNCTIONAL.has(el.tagName)
      || /(^|\s)(btn|badge|tab|view-switch-btn|seg-btn|pill|chip|hint|note|label)(\s|$)/.test(el.className || '');
    if (functional && fs < 9.5) push('functional-font-under-9.5px', 'high', el, { fontSize: fs });
    else if (functional && fs < 10.5) push('functional-font-under-10.5px', 'medium', el, { fontSize: fs });
  }

  /* 7. 图标按钮无可访问名 */
  for (const el of document.querySelectorAll('#app button, #app [role="button"]')) {
    if (!isVisible(el)) continue;
    if (textOf(el)) continue;
    if (el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('data-i18n-title')) continue;
    push('icon-button-unnamed', 'medium', el);
  }

  /* 8. 滚动容器计数（手机应只有 1 个纵向） */
  const scrollers = [];
  for (const el of all) {
    if (!isVisible(el)) continue;
    const s = getComputedStyle(el);
    const sy = s.overflowY;
    if ((sy === 'auto' || sy === 'scroll') && el.scrollHeight > el.clientHeight + 4) {
      scrollers.push({
        id: el.id || '', cls: String(el.className || '').slice(0, 60),
        scrollH: el.scrollHeight, clientH: el.clientHeight,
      });
    }
  }

  /* 9. 对比度（best-effort：向上取第一个不透明背景，透明度高的跳过） */
  const parse = (c) => {
    const m = String(c).match(/rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
    return m ? { r: +m[1], g: +m[2], b: +m[3], a: m[4] === undefined ? 1 : +m[4] } : null;
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const bgOf = (el) => {
    for (let p = el; p; p = p.parentElement) {
      const c = parse(getComputedStyle(p).backgroundColor);
      if (c && c.a >= 0.9) return c;
    }
    return { r: 18, g: 18, b: 18, a: 1 };
  };
  let contrastChecked = 0;
  for (const el of all) {
    if (!isVisible(el) || !inViewportRough(el)) continue;
    if (!textOf(el)) continue;
    if (Array.from(el.children).some((c) => textOf(c))) continue;
    const s = getComputedStyle(el);
    const fg = parse(s.color);
    if (!fg || fg.a < 0.9) continue;
    const bg = bgOf(el);
    const L1 = lum(fg); const L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const fs = parseFloat(s.fontSize) || 12;
    const bold = (parseInt(s.fontWeight, 10) || 400) >= 700;
    const large = fs >= 18.66 || (fs >= 14 && bold);
    const need = large ? 3 : 4.5;
    contrastChecked += 1;
    if (ratio < need - 0.05) {
      push('contrast-below-wcag', 'medium', el, { ratio: Math.round(ratio * 100) / 100, need, fontSize: fs });
    }
  }

  /* 10. 同视图重复入口（同名按钮 ≥2 且都可见） */
  const byName = new Map();
  for (const el of document.querySelectorAll('#app button')) {
    if (!isVisible(el)) continue;
    const name = (el.getAttribute('aria-label') || textOf(el)).trim();
    if (!name || name.length < 2) continue;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(el);
  }
  for (const [name, list] of byName) {
    if (list.length >= 2) {
      findings.push({ kind: 'duplicate-button-name', severity: 'medium', name, count: list.length });
    }
  }

  return {
    vw, vh,
    docScrollW: doc.scrollWidth,
    docScrollH: doc.scrollHeight,
    appScrollW: document.getElementById('app')?.scrollWidth || 0,
    scrollers,
    contrastChecked,
    findings,
  };
}

async function shoot(page, dir, seq, name) {
  seq.n += 1;
  const file = path.join(dir, `${String(seq.n).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file });
  return path.basename(file);
}

/** 关掉所有打开的模态（更新日志 / 确认框）：否则会吃掉页头按钮的真实点击。
    2026-11-17 实测：教程退出后自动弹「已更新到 vX」并覆盖整屏，采集器不关它就会点歪。 */
async function dismissDialogs(page) {
  await page.evaluate(() => {
    document.querySelectorAll('dialog[open]').forEach((d) => {
      try { d.close(); } catch { d.removeAttribute('open'); }
    });
  });
  await page.waitForTimeout(120);
}

function summarize(results) {
  const byKind = new Map();
  const byViewport = new Map();
  for (const r of results) {
    for (const f of r.findings) {
      byKind.set(f.kind, (byKind.get(f.kind) || 0) + 1);
      const key = `${r.viewport} / ${r.state}`;
      byViewport.set(key, (byViewport.get(key) || 0) + 1);
    }
  }
  const lines = ['# UI 矩阵采集摘要', '', `生成：${new Date().toISOString()}`, ''];
  lines.push('## 违规类型计数', '', '| kind | count |', '| --- | --- |');
  for (const [k, v] of [...byKind.entries()].sort((a, b) => b[1] - a[1])) lines.push(`| ${k} | ${v} |`);
  lines.push('', '## 每视口/状态计数', '', '| viewport / state | count |', '| --- | --- |');
  for (const [k, v] of [...byViewport.entries()].sort()) lines.push(`| ${k} | ${v} |`);
  lines.push('');
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const root = path.join(args.out, stamp);
  fs.mkdirSync(root, { recursive: true });
  process.stdout.write(`UI 矩阵采集：${args.url} → ${root}\n`);

  const pw = loadPlaywright();
  const browser = await pw.chromium.launch();
  const results = [];

  for (const vp of VIEWPORTS) {
    const dir = path.join(root, 'shots', vp.name);
    fs.mkdirSync(dir, { recursive: true });
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      hasTouch: vp.touch,
      isMobile: vp.touch && vp.width <= 820,
      deviceScaleFactor: 1,
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e.message).slice(0, 200)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(`console: ${m.text().slice(0, 160)}`); });

    await page.goto(args.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForSelector('#app', { state: 'visible', timeout: 30000 }).catch(() => {});
    await page.waitForTimeout(700);

    const seq = { n: 0 };
    const stateResults = async (state) => {
      const p = await page.evaluate(probeInPage).catch((e) => ({ error: String(e) }));
      results.push({
        viewport: vp.name, state, errors: errors.splice(0),
        ...p,
        findings: (p.findings || []),
      });
    };

    // 1. 首次进入（教程 overlay）
    const tutorialVisible = await page.locator('#st-pt-tutorial-overlay').isVisible().catch(() => false);
    if (tutorialVisible) {
      await shoot(page, dir, seq, '00-tutorial-overlay');
      await stateResults('tutorial-overlay');
      // 教程目标列表
      const goals = await page.locator('#tutorial-goals button').count().catch(() => 0);
      if (goals > 0) {
        await page.locator('#tutorial-goals button').first().click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(400);
        await shoot(page, dir, seq, '01-tutorial-step1');
        await stateResults('tutorial-step1');
        for (let i = 2; i <= 4; i += 1) {
          const next = page.locator('#tutorial-next');
          if (!(await next.isVisible().catch(() => false))) break;
          await next.click({ timeout: 5000 }).catch(() => {});
          await page.waitForTimeout(450);
          await shoot(page, dir, seq, `0${i}-tutorial-step${i}`);
          await stateResults(`tutorial-step${i}`);
        }
      }
      const skip = page.locator('#tutorial-skip');
      if (await skip.isVisible().catch(() => false)) {
        await skip.click({ timeout: 5000 }).catch(() => {});
        await page.waitForTimeout(450);
      }
      // 用户真实路径是「跳过浮层 → 退出教程模式」两步；只用 actionability 点击会被
      // 浮层/模态拦住（2026-11-17 实测 320 宽截图仍盖着教程）。这里直接派发点击。
      await page.evaluate(() => {
        document.getElementById('tutorial-skip')?.click();
        document.getElementById('tutorial-banner-exit')?.click();
      });
      await page.waitForTimeout(500);
    }
    // 教程退出后宿主/插件可能自动弹更新日志模态，先关掉再采工作台与页头视图。
    await dismissDialogs(page);

    // 2. 工作台空态
    await shoot(page, dir, seq, '10-workbench');
    await stateResults('workbench');

    // 3. 三/四个主视图
    const viewIds = vp.touch && vp.width <= 820 ? ['chart', 'transfer', 'extension', 'zone'] : ['chart', 'transfer', 'extension'];
    for (const id of viewIds) {
      const clicked = await page.evaluate((vid) => {
        const btns = Array.from(document.querySelectorAll('[data-wbview]'));
        const b = btns.find((x) => x.dataset.wbview === vid && x.getBoundingClientRect().width > 0);
        if (!b) return false;
        b.click();
        return true;
      }, id);
      if (!clicked) continue;
      await page.waitForTimeout(500);
      await shoot(page, dir, seq, `20-view-${id}`);
      await stateResults(`view-${id}`);
      // 传输视图：切到 cloud / webdav 再拍
      if (id === 'transfer') {
        for (const tab of ['cloud']) {
          const ok = await page.evaluate((t) => {
            const b = Array.from(document.querySelectorAll('[data-transfer-tab]'))
              .find((x) => x.dataset.transferTab === t && x.getBoundingClientRect().width > 0);
            if (!b) return false; b.click(); return true;
          }, tab);
          if (ok) {
            await page.waitForTimeout(450);
            await shoot(page, dir, seq, `21-transfer-${tab}`);
            await stateResults(`transfer-${tab}`);
          }
        }
      }
      // 扩展视图：滚到底再拍
      if (id === 'extension') {
        await page.evaluate(() => {
          const main = document.querySelector('#app .app-main') || document.scrollingElement;
          if (main) main.scrollTop = main.scrollHeight;
        });
        await page.waitForTimeout(350);
        await shoot(page, dir, seq, '22-extension-bottom');
        await stateResults('extension-bottom');
        await page.evaluate(() => {
          const main = document.querySelector('#app .app-main') || document.scrollingElement;
          if (main) main.scrollTop = 0;
        });
      }
    }

    // 4. 设置与日志（页头按钮）
    const headerBtns = await page.evaluate(() => Array.from(document.querySelectorAll('#app .app-header button'))
      .map((b) => ({ id: b.id || '', label: (b.getAttribute('aria-label') || b.title || b.textContent || '').trim() })));
    for (const b of headerBtns) {
      if (!/设置|settings|日志|log/i.test(`${b.id} ${b.label}`)) continue;
      await dismissDialogs(page);
      const ok = await page.evaluate((id) => {
        const el = id ? document.getElementById(id) : null;
        if (!el) return false; el.click(); return true;
      }, b.id);
      if (!ok) continue;
      await page.waitForTimeout(600);
      const slug = /日志|log/i.test(`${b.id} ${b.label}`) ? 'log' : 'settings';
      await shoot(page, dir, seq, `30-${slug}`);
      await stateResults(slug);
      await page.evaluate(() => {
        const main = document.querySelector('#app .app-main') || document.scrollingElement;
        if (main) main.scrollTop = main.scrollHeight;
      });
      await page.waitForTimeout(300);
      await shoot(page, dir, seq, `31-${slug}-bottom`);
      await stateResults(`${slug}-bottom`);
      await page.evaluate(() => {
        const main = document.querySelector('#app .app-main') || document.scrollingElement;
        if (main) main.scrollTop = 0;
      });
    }

    // 5. 手机唯一滚动容器核验已进 probe.scrollers
    await ctx.close();
  }

  await browser.close();
  fs.writeFileSync(path.join(root, 'probe.json'), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(root, 'summary.md'), summarize(results));
  const total = results.reduce((s, r) => s + r.findings.length, 0);
  process.stdout.write(`完成：${results.length} 个状态，${total} 条度量发现。\n报告：${path.join(root, 'summary.md')}\n`);
}

main().catch((e) => { console.error(e); process.exit(1); });
