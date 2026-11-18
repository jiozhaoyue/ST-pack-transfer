/**
 * 视觉断言：复选框对勾居中 + 手机抽屉布局模型一致。
 *
 * 2026-11-19 修复验收；同日第二轮加固（审计实测发现假阴性盲区）。
 * 用真实 Chromium 计算样式取证，不靠推断：
 *  1. 对勾**最终渲染中心**必须落在 padding box 中心，容差 1.2px。
 *     ⚠ 关键：不能只看 `left`/`top` 数值。旧版脚本读了 `::after` 的 transform
 *     却从不参与断言，于是「删掉 translate(-50%,-50%)、保留 left:50%/top:50%」
 *     仍然 PASS——实际对勾偏到右下 1.5px / 3.5px（审计实测）。
 *     现在按 CSS 定位语义复算真实中心：
 *       起点 = left/top（百分比相对 padding box 解析）
 *      + 对勾自身宽高的一半（box 中心，非左上角）
 *      + transform 矩阵的平移量（m41/m42，即 rotate 45° 前的 translate）
 *     并与 padding box 中心比较。样式里删掉 translate，m41/m42 归零，
 *     中心必然右移/下移半个对勾，断言立刻变红。
 *  2. `:indeterminate`（半选）也是真实可达状态（树父节点 / 待导出分组），
 *     必须一并验：它有独立的 `:indeterminate::after` 规则。
 *  3. 覆盖多个放大点：14px 桌面 / 20px 手机（.tree-check / .pkg-check /
 *     .ext-dev-check input）/ 18px 桌面 .tree-keepincompat input。
 *     审计指出「多处放大点只有 .tree-check/.pkg-check 被验」，这里补齐。
 *  4. 手机抽屉展开态与收起态必须同一布局模型（此前 flex ↔ grid 中途切换导致动画塌陷）。
 *
 * 用法：node tooling/verify-checkbox-centering.cjs
 * 退出码 1 = 断言失败；2 = 脚本异常（如 Chromium 起不来）。
 */
const { loadPlaywright } = require('../e2e/lib/resolve-playwright.cjs');
const { chromium } = loadPlaywright();

const TOLERANCE = 1.2;

/**
 * 被验样式表路径。默认本仓 `style.css`；可用 `--css <path>` 指向副本，
 * 用于变异验证（改副本、不动正在被并发编辑的源文件）。
 */
function resolveCssPath(argv = process.argv.slice(2)) {
  const idx = argv.indexOf('--css');
  const custom = idx >= 0 ? argv[idx + 1] : '';
  return require('node:path').resolve(
    custom || require('node:path').join(__dirname, '..', 'style.css'),
  );
}
const CSS_PATH = resolveCssPath();
const CSS_TEXT = require('node:fs').readFileSync(CSS_PATH, 'utf8');

/**
 * 在独立 iframe 里渲染一份完整 #app，返回该 frame 以便在隔离环境里查询计算样式。
 * 必须隔离：CSS 规则以 `#app.app-container` 为根，同一文档放多份会产生 id 冲突。
 */
async function makeFrame(page, { view, inner, width = 375, zoneOpen = false }) {
  const css = CSS_TEXT;
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

/**
 * 读单选框的 `::after` 最终几何，返回**真实渲染中心**与目标中心的偏差。
 *
 * 三种无对勾情形必须区分，不能一律算失败：
 *  - `content: none`：规则根本没生效（如未勾选、或该选择器没有 ::after 规则）——
 *    这是「无对勾」，视为通过（另用 dotRendered 标记，便于人工核对）。
 *  - 元素未渲染（display:none / 0 尺寸）：无法测量，报失败，避免用「测不到」冒充通过。
 *  - 有对勾：按「定位起点 + 自身半宽高 + transform 平移」复算中心。
 */
const measure = (frame, selector, state) => frame.evaluate(({ sel, state }) => {
  const el = document.querySelector(sel);
  if (!el) return { error: '未取到元素' };
  /* 用真实属性驱动状态机，而不是靠 HTML 里的 checked 属性——
     :indeterminate 只能由属性设置，不能写在标签上。 */
  el.checked = state === 'checked';
  el.indeterminate = state === 'indeterminate';

  const box = el.getBoundingClientRect();
  const cs = getComputedStyle(el);
  if (!box.width || !box.height || cs.display === 'none') {
    return { error: `元素不可见（display=${cs.display}, ${box.width}x${box.height}）` };
  }

  const num = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  };
  const after = getComputedStyle(el, '::after');

  /* ::after 的百分比偏移相对 padding box（已扣边框），
     所以对齐基准也必须用 padding box 尺寸，不能用 border box。
     这是上一版脚本误判「偏差 1.48px」的原因——脚本错，不是样式错。 */
  const padW = box.width - num(cs.borderLeftWidth) - num(cs.borderRightWidth);
  const padH = box.height - num(cs.borderTopWidth) - num(cs.borderBottomWidth);

  const dotRendered = after.content !== 'none' && after.content !== 'normal';
  if (!dotRendered) {
    /* 对勾伪元素不存在 ⇒ 该状态没画勾 ⇒ 必然是规则丢失/被覆盖，按失败处理。
       这里**不能**算通过：这正是「规则被删掉、脚本仍报绿」的假阴性形态。 */
    return {
      boxW: +box.width.toFixed(2), boxH: +box.height.toFixed(2),
      padW: +padW.toFixed(2), padH: +padH.toFixed(2),
      dotRendered: false,
      error: `无 ::after 对勾（content=${after.content}，transform=${after.transform}）`,
    };
  }

  /* 定位起点：left/top 可能是百分比（相对 padding box）或绝对像素。 */
  const resolveOffset = (raw, base) => (String(raw).endsWith('%')
    ? (num(raw) / 100) * base
    : num(raw));
  const startX = resolveOffset(after.left, padW);
  const startY = resolveOffset(after.top, padH);

  const dotW = num(after.width);
  const dotH = num(after.height);

  /* 解 transform 矩阵：matrix(a,b,c,d,e,f) 的 e/f 就是平移量（m41/m42）。
     本项目对勾用 translate(-50%,-50%) rotate(45deg)，浏览器先合成成一个矩阵，
     平移分量已被 rotate 包裹，但 m41/m42 仍是 rotate 之前的净平移——
     这正是我们要的「对勾中心相对定位起点的偏移」。 */
  let tx = 0;
  let ty = 0;
  const matrix = /^matrix\(([^)]+)\)$/.exec(String(after.transform || '').trim());
  if (matrix) {
    const parts = matrix[1].split(',').map((v) => num(v));
    if (parts.length >= 6) { tx = parts[4]; ty = parts[5]; }
  }

  /* 真实中心 = 定位起点 + 自身半宽高（box 原点在左上角） + 平移。 */
  const dotCx = startX + dotW / 2 + tx;
  const dotCy = startY + dotH / 2 + ty;
  const centerX = padW / 2;
  const centerY = padH / 2;

  return {
    boxW: +box.width.toFixed(2),
    boxH: +box.height.toFixed(2),
    padW: +padW.toFixed(2),
    padH: +padH.toFixed(2),
    dotRendered: true,
    leftRaw: after.left,
    topRaw: after.top,
    dotW: +dotW.toFixed(2),
    dotH: +dotH.toFixed(2),
    transform: after.transform,
    tx: +tx.toFixed(2),
    ty: +ty.toFixed(2),
    dotCx: +dotCx.toFixed(2),
    dotCy: +dotCy.toFixed(2),
    centerX: +centerX.toFixed(2),
    centerY: +centerY.toFixed(2),
    maxDelta: +Math.max(
      Math.abs(dotCx - centerX),
      Math.abs(dotCy - centerY),
    ).toFixed(2),
  };
}, { sel: selector, state });

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.setContent('<!doctype html><html><body></body></html>');

  /* ── 被验组合：选择器 × 状态 × 视图档 ──
     每一档都对应一处真实的「放大点」，不是凑数：
       .tree-check        14px → 手机 20px（树行主勾）
       .pkg-check         14px → 手机 20px（包卡勾）
       .ext-dev-check input 16px 容器内 14px → 手机 20px（扩展行）
       .tree-keepincompat input 12px（桌面内联小勾）
     :indeterminate 与 :checked 的 ::after 是两条独立规则，必须分开验。 */
  const CASES = [
    { name: '桌面 14px .tree-check :checked', view: 'desktop', state: 'checked',
      inner: '<input type="checkbox" class="tree-check" id="x">' },
    { name: '手机 20px .tree-check :checked', view: 'mobile', state: 'checked',
      inner: '<input type="checkbox" class="tree-check" id="x">' },
    { name: '手机 20px .pkg-check :checked', view: 'mobile', state: 'checked',
      inner: '<input type="checkbox" class="pkg-check" id="x">' },
    { name: '手机 20px .ext-dev-check input :checked', view: 'mobile', state: 'checked',
      inner: '<label class="check ext-dev-check"><input type="checkbox" data-extsel="demo" id="x"></label>' },
    /* 注意：.tree-keepincompat input 声明 12px，但被通用
       `input[type="checkbox"]{width:14px}` 以同特异性、更晚源码顺序覆盖，
       实测就是 14px。这里按**实测尺寸**命名，不照抄声明值以免误导读者。 */
    { name: '桌面 .tree-keepincompat input :checked（实测 14px）', view: 'desktop', state: 'checked',
      inner: '<label class="tree-keepincompat"><input type="checkbox" id="x"></label>' },
    { name: '桌面 14px .tree-check :indeterminate', view: 'desktop', state: 'indeterminate',
      inner: '<input type="checkbox" class="tree-check" id="x">' },
    /* 既存缺陷已修（2026-11-19）：`:indeterminate::after` 原先写死 left:3px/top:5px/6x2，
       手机档放大到 20px 后偏 3px。style.css 已改为 50%/50% + translate，
       本档现为硬性 PASS（不再带 knownIssue 豁免）。 */
    { name: '手机 20px .tree-check :indeterminate', view: 'mobile', state: 'indeterminate',
      inner: '<input type="checkbox" class="tree-check" id="x">' },
    { name: '桌面 14px .eq-group-box :indeterminate', view: 'desktop', state: 'indeterminate',
      inner: '<input type="checkbox" class="eq-group-box" id="x">' },
  ];

  const results = [];
  for (const c of CASES) {
    /* 每档独立 iframe：#app 的 id 在同一文档只能有一份。 */
    const frame = await makeFrame(page, {
      view: c.view,
      inner: `<div style="padding:20px">${c.inner}</div>`,
    });
    const r = await measure(frame, '#x', c.state);
    results.push({ name: c.name, knownIssue: c.knownIssue, ...r });
  }

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
  let knownHits = 0;
  let knownFixed = 0;
  console.log('\n=== 复选框对勾居中 ===');
  for (const r of results) {
    if (r.error) { console.log(`FAIL ${r.name}：${r.error}`); failed = true; continue; }
    if (!r.maxDelta && r.dotRendered === undefined) { console.log(`FAIL ${r.name}：未取到元素`); failed = true; continue; }
    const ok = r.maxDelta <= TOLERANCE;
    const line = `${r.name}  box=${r.boxW}x${r.boxH}  `
      + `dot=${r.dotW}x${r.dotH}@(${r.leftRaw},${r.topRaw})  `
      + `实际中心=(${r.dotCx},${r.dotCy})  目标中心=(${r.centerX},${r.centerY})  `
      + `偏差=${r.maxDelta}px  transform=${r.transform}`;
    if (ok) {
      console.log(`PASS ${line}`);
      /* 已登记的既存缺陷若已修好：提示删标记，避免豁免长期滞留。 */
      if (r.knownIssue) {
        knownFixed += 1;
        console.log(`     ↑ 该档已登记为 KNOWN（${r.knownIssue.reason}），现已通过——请删掉 knownIssue 标记`);
      }
      continue;
    }
    if (r.knownIssue && r.maxDelta <= r.knownIssue.maxDelta) {
      knownHits += 1;
      console.log(`KNOWN ${line}`);
      console.log(`      既存缺陷已登记（上限 ${r.knownIssue.maxDelta}px）：${r.knownIssue.reason}。不参与退出码。`);
      continue;
    }
    failed = true;
    console.log(`FAIL ${line}`);
    if (r.knownIssue) {
      console.log(`     超出已登记上限 ${r.knownIssue.maxDelta}px，按失败处理（缺陷在恶化）`);
    }
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

  if (knownHits || knownFixed) {
    console.log(`\n已知缺陷：${knownHits} 项未修（有上界，不参与退出码）`
      + (knownFixed ? `；${knownFixed} 项已修复（请删 knownIssue 标记）` : ''));
  }
  console.log(`\n${failed ? '✗ 存在失败项' : '✓ 全部通过'}`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error('验证脚本异常:', err);
  process.exit(2);
});
