/**
 * 视觉断言：复选框对勾居中 + 手机抽屉布局模型一致。
 *
 * 2026-11-19 修复验收。用真实 Chromium 计算样式取证，不靠推断：
 *  1. 14px（桌面）与 20px（手机）两档下，`:checked::after` 的对勾中心必须落在方框中心
 *     容差 1.2px 内（此前硬编码 left:4px/top:1px，20px 档严重偏左上）。
 *  2. 手机抽屉展开态与收起态必须同一布局模型（此前 flex ↔ grid 中途切换导致动画塌陷）。
 *
 * 用法：node tooling/verify-checkbox-centering.cjs
 * 退出码 1 = 断言失败。
 */
const { loadPlaywright } = require('../e2e/lib/resolve-playwright.cjs');
const { chromium } = loadPlaywright();

const TOLERANCE = 1.2;

/**
 * 在独立 iframe 里渲染一份完整 #app，返回该 frame 以便在隔离环境里查询计算样式。
 * 必须隔离：CSS 规则以 `#app.app-container` 为根，同一文档放多份会产生 id 冲突。
 */
async function makeFrame(page, { view, inner, width = 375, zoneOpen = false }) {
  const css = require('node:fs').readFileSync(
    require('node:path').join(__dirname, '..', 'style.css'), 'utf8',
  );
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0;padding:0;background:#1a1a1a}
  ${css}
  </style></head><body>
  <div class="app-container" id="app" data-view="${view}"${zoneOpen ? ' data-zone-open="1"' : ''}>${inner}</div>
  </body></html>`;

  const handle = await page.evaluateHandle((doc) => {
    const f = document.createElement('iframe');
    f.style.cssText = `width:${doc.width}px;height:760px;border:0`;
    document.body.appendChild(f);
    const d = f.contentDocument;
    d.open(); d.write(doc.html); d.close();
    return f;
  }, { html, width });
  const frame = await handle.contentFrame();
  return frame;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.setContent('<!doctype html><html><body></body></html>');

  const measure = (frame, selector) => frame.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const box = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const after = getComputedStyle(el, '::after');
    /* ::after 的百分比偏移相对 padding box（已扣边框），
       所以对齐基准也必须用 padding box 尺寸，不能用 border box。
       这是上一版脚本误判「偏差 1.48px」的原因——脚本错，不是样式错。 */
    const padW = box.width - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth);
    const padH = box.height - parseFloat(cs.borderTopWidth) - parseFloat(cs.borderBottomWidth);
    const leftRaw = after.left;
    const topRaw = after.top;
    const left = parseFloat(leftRaw) || 0;
    const top = parseFloat(topRaw) || 0;
    return {
      boxW: +box.width.toFixed(2),
      boxH: +box.height.toFixed(2),
      padW: +padW.toFixed(2),
      padH: +padH.toFixed(2),
      leftRaw, topRaw,
      dotCx: +left.toFixed(2),
      dotCy: +top.toFixed(2),
      centerX: +(padW / 2).toFixed(2),
      centerY: +(padH / 2).toFixed(2),
      maxDelta: +Math.max(
        Math.abs(left - padW / 2),
        Math.abs(top - padH / 2),
      ).toFixed(2),
      transform: after.transform,
    };
  }, selector);

  const deskFrame = await makeFrame(page, {
    view: 'desktop',
    inner: '<div style="padding:20px"><input type="checkbox" class="tree-check" id="desk" checked></div>',
  });
  /* 手机档必须用 .tree-check：放大到 20px 的规则只对 .tree-check 生效
     （style.css 的 [data-view="mobile"] .tree-check）。用普通 checkbox 测等于没测。 */
  const mobFrame = await makeFrame(page, {
    view: 'mobile',
    inner: '<div style="padding:20px"><input type="checkbox" class="tree-check" id="mob" checked></div>',
  });
  /* 包卡复选框同样在手机档放大到 20px，单独验一档以防漏改。 */
  const pkgFrame = await makeFrame(page, {
    view: 'mobile',
    inner: '<div style="padding:20px"><input type="checkbox" class="pkg-check" id="pkg" checked></div>',
  });

  const results = [
    { name: '桌面 14px .tree-check', ...(await measure(deskFrame, '#desk')) },
    { name: '手机 20px .tree-check', ...(await measure(mobFrame, '#mob')) },
    { name: '手机 20px .pkg-check', ...(await measure(pkgFrame, '#pkg')) },
  ];

  const openFrame = await makeFrame(page, {
    view: 'mobile',
    zoneOpen: true,
    inner: '<div class="col-side" id="sideOpen" style="min-height:240px"></div>',
  });
  const closeFrame = await makeFrame(page, {
    view: 'mobile',
    inner: '<div class="col-side is-closing" id="sideClosing"></div>',
  });

  const readDrawer = (frame, sel) => frame.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return { display: cs.display, dir: cs.flexDirection, rows: cs.gridTemplateRows };
  }, sel);

  const drawer = {
    openDisplay: (await readDrawer(openFrame, '#sideOpen'))?.display,
    openDir: (await readDrawer(openFrame, '#sideOpen'))?.dir,
    closingDisplay: (await readDrawer(closeFrame, '#sideClosing'))?.display,
    closingDir: (await readDrawer(closeFrame, '#sideClosing'))?.dir,
    closingRows: (await readDrawer(closeFrame, '#sideClosing'))?.rows,
  };

  await browser.close();

  let failed = false;
  console.log('\n=== 复选框对勾居中 ===');
  for (const r of results) {
    if (!r.boxW) { console.log(`FAIL ${r.name}：未取到元素`); failed = true; continue; }
    const ok = r.maxDelta <= TOLERANCE;
    if (!ok) failed = true;
    console.log(
      `${ok ? 'PASS' : 'FAIL'} ${r.name}  box=${r.boxW}x${r.boxH}  ` +
      `dot=(${r.dotCx},${r.dotCy})  center=(${r.centerX},${r.centerY})  ` +
      `偏差=${r.maxDelta}px  (容差 ${TOLERANCE})`,
    );
  }

  console.log('\n=== 手机抽屉布局模型 ===');
  const sameModel = !!drawer.openDisplay && drawer.openDisplay === drawer.closingDisplay;
  if (!sameModel) failed = true;
  console.log(`${sameModel ? 'PASS' : 'FAIL'} 展开 display=${drawer.openDisplay} / 收起 display=${drawer.closingDisplay}`);
  console.log(`     展开 flex-direction=${drawer.openDir} / 收起 flex-direction=${drawer.closingDir}`);
  if (drawer.closingRows && drawer.closingRows !== 'none') {
    console.log(`     FAIL 收起态仍带 grid-template-rows=${drawer.closingRows}（应为 none）`);
    failed = true;
  }

  console.log(`\n${failed ? '✗ 存在失败项' : '✓ 全部通过'}`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error('验证脚本异常:', err);
  process.exit(2);
});
