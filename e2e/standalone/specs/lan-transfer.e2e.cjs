/**
 * 局域网互传 · 真互传 E2E（两个独立上下文同源直连）
 *
 * 为什么值得一条：单测只锁纯逻辑，**真实 WebRTC 链路**（offer/answer 交换、DataChannel、
 * 分块、摘要核对、一次性失效）没有任何自动化证据。本 spec 在同一浏览器里开两个**独立上下文**
 * （各自独立的 IndexedDB，避免接收端「本来就有这个包」的假阳性），走完整的
 * 「勾选多个包 → 逐个生成取件码 → 应答码 → 传输 → 核对 → 远程导入」路径。
 *
 * 判定纪律：
 *  - 一切等待有界（L1-MR-7）；超时即失败，不空转。
 *  - 断言的是**正向读数**（状态文案、来源徽标、包名、摘要结论），不是「没崩」。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const BIG_NAME = 'lan-big.zip';
const BIG_BYTES = 3 * 1024 * 1024;
const SMALL_NAME = 'lan-small.zip';
const SMALL_BYTES = 64 * 1024;

/** 造一个合法 zip（store 不压缩）；大包跨过 64 KB 分块边界，小包用于验证多包排队。 */
async function ensureZip(dir, repoRoot, name, bytes) {
  const outPath = path.join(dir, name);
  if (fs.existsSync(outPath) && fs.statSync(outPath).size >= bytes) return outPath;
  const mod = await import(pathToFileURL(path.join(repoRoot, 'src', 'core', 'zip-io.js')).href);
  const writer = await mod.zipIo.createWriter(outPath, { level: 0 });
  await writer.add(`worlds/${name.replace(/\.zip$/, '')}.bin`, crypto.randomBytes(bytes));
  await writer.close();
  return outPath;
}

const text = (page, sel) => page.$eval(sel, (el) => el.textContent.trim()).catch(() => '');
const value = (page, sel) => page.$eval(sel, (el) => el.value).catch(() => '');

async function fillTextarea(page, sel, val) {
  await page.fill(sel, val).catch(() => {});
  for (let i = 0; i < 8; i += 1) {
    if ((await value(page, sel)) === val) return true;
    await page.evaluate(({ s, v }) => {
      const el = document.querySelector(s);
      if (!el) return;
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }, { s: sel, v: val });
    await page.waitForTimeout(100);
  }
  return (await value(page, sel)) === val;
}

async function waitFor(fn, arg, timeout) {
  try {
    await fn(arg, { timeout });
    return true;
  } catch {
    return false;
  }
}

/** 工作台就绪判据：新工作台用 `#host-badge-text`。 */
async function waitWorkbench(page) {
  return waitFor((arg, opts) => page.waitForFunction(() => {
    const el = document.getElementById('host-badge-text');
    return Boolean(el) && el.textContent.trim().length > 0;
  }, arg, opts), null, 30_000);
}

/** 首装引导会盖住整页并拦截点击——E2E 必须先跳过。 */
async function dismissTutorial(page) {
  await page.evaluate(() => {
    try { sessionStorage.setItem('st-pack-transfer:tutorial-seen', '1'); } catch { /* 隐私模式 */ }
  }).catch(() => {});
  await page.waitForTimeout(450);
  for (let i = 0; i < 3; i += 1) {
    const open = await page.evaluate(() => {
      const overlay = document.getElementById('tutorial-overlay');
      if (!overlay || !overlay.classList.contains('open')) return false;
      document.getElementById('tutorial-skip')?.click();
      return true;
    }).catch(() => false);
    if (!open) return;
    await page.waitForTimeout(200);
  }
}

async function newPage(browser, baseUrl) {
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  context.setDefaultTimeout(30_000);
  await context.addInitScript(() => {
    try { localStorage.setItem('lan-debug', '1'); } catch { /* 隐私模式 */ }
  });
  const page = await context.newPage();
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  return { context, page };
}

module.exports = {
  name: '局域网互传：两上下文真互传（分块、摘要、多包排队、远程导入、一次性）',
  async run(t, h, ctx) {
    // 关闭 mDNS 候选隐藏：两个上下文在同一浏览器进程里用真实 host 候选互连，
    // 免去沙箱里 mDNS 解析的不确定性（本 spec 验的是互传链路，不是 mDNS）。
    const { loadPlaywright } = require('../../lib/resolve-playwright.cjs');
    const pw = loadPlaywright();
    const browser = await pw.chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });

    const senderCtx = await newPage(browser, ctx.baseUrl);
    const receiverCtx = await newPage(browser, ctx.baseUrl);
    const sender = senderCtx.page;
    const receiver = receiverCtx.page;

    t.ok('L0 发送端工作台就绪', await waitWorkbench(sender));
    t.ok('L1 接收端工作台就绪', await waitWorkbench(receiver));
    await dismissTutorial(sender);
    await dismissTutorial(receiver);

    const bigZip = await ensureZip(ctx.fixtureDir, ctx.repoRoot, BIG_NAME, BIG_BYTES);
    const smallZip = await ensureZip(ctx.fixtureDir, ctx.repoRoot, SMALL_NAME, SMALL_BYTES);
    t.ok('L2 固件已生成（大包跨分块边界）', fs.statSync(bigZip).size > BIG_BYTES, `${fs.statSync(bigZip).size} B`);

    // ── ① 发送端：导入两个包 → 全部勾选 → 生成第一个取件码 ──
    await sender.setInputFiles('#file-input', [bigZip, smallZip]);
    const pkgsSeen = await waitFor((arg, opts) => sender.waitForFunction((names) => {
      const have = [...document.querySelectorAll('.pkg-name-txt')]
        .map((el) => decodeURIComponent(el.dataset.fullname || ''));
      return names.every((n) => have.some((h) => h.includes(n)));
    }, arg, opts), [BIG_NAME, SMALL_NAME], 60_000);
    t.ok('L3 发送端两个包都已出现在导入区', pkgsSeen);

    // 勾选会触发 renderZones() 重建卡片，必须每次重新查询，不能缓存 DOM 引用。
    for (let i = 0; i < 5; i += 1) {
      const clicked = await sender.evaluate(() => {
        const box = [...document.querySelectorAll('.pkg-card .pkg-check')].find((c) => !c.checked);
        if (!box) return false;
        box.click();
        return true;
      });
      if (!clicked) break;
      await sender.waitForTimeout(150);
    }
    const picked = await sender.evaluate(() => document.querySelectorAll('.pkg-card .pkg-check:checked').length);
    t.ok('L4 发送端已勾选全部包', picked === 2, `checked=${picked}`);

    await sender.click('#lan-toggle');
    t.ok('L5 局域网区块已展开', await sender.isVisible('#lan-body'));
    t.ok('L6 发送摘要识别到两个包', /已选 2 个包/.test(await text(sender, '#lan-send-summary')),
      `summary=${await text(sender, '#lan-send-summary')}`);

    await sender.click('#lan-btn-generate');
    const code1Ready = await waitFor((arg, opts) => sender.waitForFunction(() => {
      const el = document.getElementById('lan-send-code');
      return Boolean(el) && el.value.startsWith('SZC1.');
    }, arg, opts), null, 30_000);
    const code1 = await value(sender, '#lan-send-code');
    t.ok('L7 第一个取件码已生成', code1Ready && code1.startsWith('SZC1.'), `len=${code1.length}`);
    t.ok('L8 发送端二维码已渲染（正式 qr.js）', await sender.isVisible('#lan-send-qr svg'));

    // ── ② 接收端：第一个包 ──
    await receiver.click('#lan-toggle');
    t.ok('L9 接收端粘贴第一个取件码', await fillTextarea(receiver, '#lan-offer-input', code1));
    await receiver.click('#lan-btn-accept');

    const answer1Ready = await waitFor((arg, opts) => receiver.waitForFunction(() => {
      const el = document.getElementById('lan-recv-code');
      return Boolean(el) && el.value.startsWith('SZC1.');
    }, arg, opts), null, 30_000);
    const answer1 = await value(receiver, '#lan-recv-code');
    t.ok('L10 第一个应答码已生成', answer1Ready && answer1.startsWith('SZC1.'), `len=${answer1.length}`);
    t.ok('L11 接收端二维码已渲染（正式 qr.js）', await receiver.isVisible('#lan-recv-qr svg'));

    t.ok('L12 发送端粘贴第一个应答码', await fillTextarea(sender, '#lan-answer-input', answer1));
    await sender.click('#lan-btn-apply-answer');

    // 第一个包完成后，队列会自动生成第二个取件码（新码 != 旧码）。
    const code2Ready = await waitFor((arg, opts) => sender.waitForFunction((prev) => {
      const el = document.getElementById('lan-send-code');
      return Boolean(el) && el.value.startsWith('SZC1.') && el.value !== prev;
    }, arg, opts), code1, 120_000);
    const code2 = await value(sender, '#lan-send-code');
    t.ok('L13 第一个包完成后自动生成第二个取件码（多包排队）', code2Ready && code2 !== code1, `len=${code2.length}`);

    // ── ③ 接收端：第二个包 ──
    t.ok('L14 接收端粘贴第二个取件码', await fillTextarea(receiver, '#lan-offer-input', code2));
    await receiver.click('#lan-btn-accept');

    const answer2Ready = await waitFor((arg, opts) => receiver.waitForFunction((prev) => {
      const el = document.getElementById('lan-recv-code');
      return Boolean(el) && el.value.startsWith('SZC1.') && el.value !== prev;
    }, arg, opts), answer1, 30_000);
    const answer2 = await value(receiver, '#lan-recv-code');
    t.ok('L15 第二个应答码已生成', answer2Ready && answer2 !== answer1, `len=${answer2.length}`);

    t.ok('L16 发送端粘贴第二个应答码', await fillTextarea(sender, '#lan-answer-input', answer2));
    await sender.click('#lan-btn-apply-answer');

    const sentDone = await waitFor((arg, opts) => sender.waitForFunction(() => {
      const phase = document.getElementById('lan-send-phase')?.textContent || '';
      const code = document.getElementById('lan-send-code')?.value || '';
      return phase.includes('已发送') && code === '';
    }, arg, opts), null, 120_000);
    t.ok('L17 发送端两个包全部完成', sentDone, `phase=${await text(sender, '#lan-send-phase')}`);

    const recvDone = await waitFor((arg, opts) => receiver.waitForFunction(
      () => (document.getElementById('lan-recv-phase')?.textContent || '').includes('已接收'),
      arg, opts), null, 120_000);
    const recvPhase = await text(receiver, '#lan-recv-phase');
    t.ok('L18 接收端完成且摘要一致', recvDone && recvPhase.includes('摘要一致'), `phase=${recvPhase}`);

    // ── ④ 接收端工作区出现两个包，且都标「远程导入」 ──
    const recvSeen = await waitFor((arg, opts) => receiver.waitForFunction((names) => {
      const cards = [...document.querySelectorAll('.pkg-card')];
      return names.every((name) => cards.some((card) => {
        const fullname = decodeURIComponent(card.querySelector('.pkg-name-txt')?.dataset.fullname || '');
        if (!fullname.includes(name)) return false;
        return [...card.querySelectorAll('.pkg-badge')].some((b) => b.textContent.includes('远程导入'));
      }));
    }, arg, opts), [BIG_NAME, SMALL_NAME], 60_000);
    t.ok('L19 接收端两个包都在且标「远程导入」', recvSeen,
      await receiver.$$eval('.pkg-card', (cards) => cards.map((c) => c.textContent.replace(/\s+/g, ' ').trim()).join(' | ')));

    // ── ⑤ 一次性：码被清空，按钮不再允许复用 ──
    t.eq('L20 发送端取件码已清空（一次性）', await value(sender, '#lan-send-code'), '');
    t.eq('L21 接收端取件码已清空（一次性）', await value(receiver, '#lan-offer-input'), '');
    t.ok('L22 发送端「开始传输」已禁用（一次性）', await sender.isDisabled('#lan-btn-apply-answer'));

    // ── ⑥ 坏码必须明确失败 ──
    await fillTextarea(receiver, '#lan-offer-input', 'NOT-A-CODE');
    await receiver.click('#lan-btn-accept');
    const badFailed = await waitFor((arg, opts) => receiver.waitForFunction(
      () => (document.getElementById('lan-recv-phase')?.textContent || '').includes('失败'),
      arg, opts), null, 5_000);
    t.ok('L23 坏取件码明确报失败', badFailed, `phase=${await text(receiver, '#lan-recv-phase')}`);

    await browser.close().catch(() => {});
  },
};
