/**
 * 视觉溢出守卫：元素不得超出其父容器边框。
 *
 * ## 为什么必须存在（线上缺陷）
 *
 * 线上缺陷：`.lan-peer-qr-wrap .lan-qr` 容器 116×116，内部 `svg` 写死 150×150，
 * 二维码直接顶出白色卡片边框（用户截图实测）。1434 个测试全绿，
 * **没有任何一条断言能发现它** —— 因为项目所有 UI 测试都是
 * `readFileSync` + `toMatch` 的源码文本匹配，永远看不到几何结果。
 *
 * ## 为什么受检对不能再拿 wrap 当父
 *
 * 首版把 `.lan-peer-qr-wrap`（`width:fit-content`）当父容器，实测 256×159：
 * wrap 会被 150px 的 svg 撑宽，于是「svg 不超出 wrap」恒真，
 * 脚本 PASS 而真正溢出的 116px `.lan-qr` 无人检查 —— 守卫假绿。
 * 因此二维码用例现在**直接**比对 `.lan-qr`（116px 容器）与其内部 svg，
 * 并额外保留「svg 也不得超出 wrap」这一层，防止 svg 顶到 wrap 边框外。
 *
 * 本守卫用真实 Chromium 计算 **布局盒**，对每个受检元素断言：
 *   子元素渲染矩形必须落在父容器 padding box 之内（容差 1px 抗亚像素）。
 * 这不是「样式字符串对不对」，而是「画出来有没有溢出」。
 *
 * ## 局限（必须写清楚）
 * 只覆盖本文件列出的受检对；不覆盖动画中途状态、不覆盖 hover/active 态。
 *
 * 用法：node tooling/verify-no-overflow.cjs
 * 退出码 1 = 发现溢出。
 */
const fs = require('node:fs');
const path = require('node:path');
const { loadPlaywright } = require('../e2e/lib/resolve-playwright.cjs');
const { chromium } = loadPlaywright();

const ROOT = path.join(__dirname, '..');
const TOLERANCE = 1;

/**
 * 受检对：每条用例一组「父选择器 → 子选择器」，可含多层检查。
 * 容器 HTML 由该用例自己给出；parent / child 必须能在用例 HTML 内命中。
 */
const CASES = [
  {
    name: '对等模式二维码（含长码）',
    view: 'desktop',
    width: 460,
    html: `<div class="lan-peer-box" id="probe">
        <div class="lan-peer-qr-wrap" id="wrap">
          <div class="lan-qr is-compact" id="qr">
            ${'<svg id="qr-svg" viewBox="0 0 33 33" shape-rendering="crispEdges"><rect width="33" height="33" fill="#fff"/></svg>'}
          </div>
          <span class="lan-qr-tip">互联码已生成，请对端扫码或输入此码</span>
        </div>
      </div>`,
    pairs: [
      // 主检查：真正的 116px 容器。首版误拿 wrap 当父，wrap 被撑宽后恒真，漏掉这里。
      { label: 'svg 不得超出 .lan-qr', parent: '#qr', child: '#qr-svg' },
      // 兜底：svg 也不得顶到白色卡片（wrap）边框外。
      { label: 'svg 不得超出 .lan-peer-qr-wrap', parent: '#wrap', child: '#qr-svg' },
    ],
  },
  {
    name: '传统模式二维码（发送）',
    view: 'desktop',
    width: 460,
    html: `<div class="lan-send" id="probe">
        <div class="lan-qr" id="child">
          <svg viewBox="0 0 33 33" shape-rendering="crispEdges"><rect width="33" height="33" fill="#fff"/></svg>
        </div>
      </div>`,
    pairs: [{ label: 'svg 不得超出 .lan-qr', parent: '#child', child: '#child svg' }],
  },
  {
    name: '数据包卡图标',
    view: 'desktop',
    width: 460,
    html: `<div class="pkg-card" id="probe">
        <span class="pkg-icon-wrap" id="parent">
          <span class="pkg-icon" id="child" style="display:block;width:30px;height:30px"></span>
        </span>
      </div>`,
    pairs: [{ label: '图标不得超出图标框', parent: '#parent', child: '#child' }],
  },
];

async function renderProbe(page, { view, width, html }) {
  const css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
  const doc = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:#1a1a1a}
  ${css}
  </style></head><body>
  <div class="app-container" id="app" data-view="${view}">${html}</div>
  </body></html>`;
  const handle = await page.evaluateHandle((d) => {
    const f = document.createElement('iframe');
    f.style.cssText = `width:${d.width}px;height:700px;border:0`;
    document.body.appendChild(f);
    const doc2 = f.contentDocument;
    doc2.open(); doc2.write(d.html); doc2.close();
    return f;
  }, { html: doc, width });
  const frame = await handle.contentFrame();
  await frame.waitForLoadState?.('domcontentloaded').catch(() => {});
  return frame;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.setContent('<!doctype html><html><body></body></html>');

  const failures = [];

  for (const c of CASES) {
    const frame = await renderProbe(page, c);
    for (const pair of c.pairs) {
      const geo = await frame.evaluate(({ parentSel, childSel }) => {
        const parent = document.querySelector(parentSel);
        const child = document.querySelector(childSel);
        if (!parent || !child) {
          return { error: `missing: ${!parent ? 'parent' : 'child'}` };
        }
        const pb = parent.getBoundingClientRect();
        const cb = child.getBoundingClientRect();
        const cs = getComputedStyle(parent);
        // 溢出判定基准 = padding box（边框之内、含内边距）
        const padL = parseFloat(cs.borderLeftWidth) || 0;
        const padT = parseFloat(cs.borderTopWidth) || 0;
        const padR = parseFloat(cs.borderRightWidth) || 0;
        const padB = parseFloat(cs.borderBottomWidth) || 0;
        const inner = {
          left: pb.left + padL,
          top: pb.top + padT,
          right: pb.right - padR,
          bottom: pb.bottom - padB,
        };
        return {
          parentBox: { w: +pb.width.toFixed(2), h: +pb.height.toFixed(2) },
          childBox: { w: +cb.width.toFixed(2), h: +cb.height.toFixed(2) },
          overflow: {
            left: +(inner.left - cb.left).toFixed(2),
            top: +(inner.top - cb.top).toFixed(2),
            right: +(cb.right - inner.right).toFixed(2),
            bottom: +(cb.bottom - inner.bottom).toFixed(2),
          },
        };
      }, { parentSel: pair.parent, childSel: pair.child });

      const label = `${c.name} · ${pair.label}`;
      if (geo.error) {
        failures.push({ name: label, reason: `元素缺失（${geo.error}）` });
        console.log(`FAIL ${label} → ${geo.error}`);
        continue;
      }
      const o = geo.overflow;
      const worst = Math.max(o.left, o.top, o.right, o.bottom);
      const ok = worst <= TOLERANCE;
      console.log(
        `${ok ? 'PASS' : 'FAIL'} ${label}  ` +
        `父=${geo.parentBox.w}x${geo.parentBox.h} 子=${geo.childBox.w}x${geo.childBox.h}  ` +
        `溢出 L${o.left} T${o.top} R${o.right} B${o.bottom}`,
      );
      if (!ok) {
        failures.push({ name: label, reason: `子元素超出父容器 ${worst}px`, detail: o });
      }
    }
  }

  await browser.close();

  console.log('');
  if (failures.length) {
    console.log(`✗ ${failures.length} 项溢出`);
    for (const f of failures) console.log(`  - ${f.name}: ${f.reason}`);
    process.exit(1);
  }
  console.log('✓ 全部通过：受检元素均未超出父容器');
  process.exit(0);
})().catch((err) => {
  console.error('守卫脚本异常:', err);
  process.exit(2);
});
