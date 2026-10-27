/**
 * 局域网互传 · 真互传 E2E（两个页面同源直连）
 *
 * 为什么值得一条：单测只锁纯逻辑，**真实 WebRTC 链路**（offer/answer 交换、DataChannel、
 * 分块、摘要核对、一次性失效）没有任何自动化证据。本 spec 在同一浏览器里开两个页面，
 * 走完整的「取件码 → 应答码 → 传输 → 核对」路径，断言接收端拿到**同字节**的包。
 *
 * 判定纪律：
 *  - 一切等待有界（L1-MR-7）；超时即失败，不空转。
 *  - 断言的是**正向读数**（状态文案、包名、摘要结论），不是「没崩」。
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const BIG_NAME = 'lan-big.zip';
const BIG_BYTES = 3 * 1024 * 1024;

/** 造一个 3 MB 的**合法 zip**（store 不压缩），用来真正跨过 64 KB 分块边界。 */
async function ensureBigZip(dir, repoRoot) {
  const outPath = path.join(dir, BIG_NAME);
  if (fs.existsSync(outPath) && fs.statSync(outPath).size >= BIG_BYTES) return outPath;
  const mod = await import(pathToFileURL(path.join(repoRoot, 'src', 'core', 'zip-io.js')).href);
  const writer = await mod.zipIo.createWriter(outPath, { level: 0 });
  await writer.add('worlds/big.bin', crypto.randomBytes(BIG_BYTES));
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

/** 工作台就绪判据：新工作台用 `#host-badge-text`（`#env-badge` 已被 2026-10-27 重写移除）。 */
async function waitWorkbench(page) {
  return waitFor((arg, opts) => page.waitForFunction(() => {
    const el = document.getElementById('host-badge-text');
    return Boolean(el) && el.textContent.trim().length > 0;
  }, arg, opts), null, 30_000);
}

/** 首装引导会盖住整页并拦截点击——E2E 必须先跳过（见 workbench-three-layer.md）。
 *  自动打开是 `setTimeout(openTutorial, 300)`，所以先写 sessionStorage 标记，再等一拍确认关闭。 */
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

module.exports = {
  name: '局域网互传：两页面真互传（含分块、摘要、一次性）',
  async run(t, h, ctx) {
    // 独立浏览器 + 关闭 mDNS 候选隐藏：两个标签在**同一进程**里用真实 host 候选互连，
    // 免去沙箱里 mDNS 解析的不确定性（本 spec 验的是互传链路，不是 mDNS）。
    const { loadPlaywright } = require('../../lib/resolve-playwright.cjs');
    const pw = loadPlaywright();
    const browser = await pw.chromium.launch({ args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
    const pageCtx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
    pageCtx.setDefaultTimeout(30_000);
    await pageCtx.addInitScript(() => {
      try { localStorage.setItem('lan-debug', '1'); } catch { /* 隐私模式 */ }
    });

    const sender = await pageCtx.newPage();
    sender.on('console', (m) => { if (m.text().startsWith('[lan]')) t.log(`    · ${m.text()}`); });
    await sender.goto(ctx.baseUrl, { waitUntil: 'domcontentloaded' });
    t.ok('L0 工作台就绪', await waitWorkbench(sender));
    await dismissTutorial(sender);

    const receiver = await pageCtx.newPage();
    receiver.on('console', (m) => { if (m.text().startsWith('[lan]')) t.log(`    · ${m.text()}`); });
    await receiver.goto(ctx.baseUrl, { waitUntil: 'domcontentloaded' });
    t.ok('L1 接收端页面就绪', await waitWorkbench(receiver));
    await dismissTutorial(receiver);

    // ── ① 发送端出取件码 ──
    await sender.click('#btn-lan-send');
    t.ok('L2 面板打开（发送端）', await sender.isVisible('.wb-lan-card'));

    const bigZip = await ensureBigZip(ctx.fixtureDir, ctx.repoRoot);
    t.ok('L3 大固件已生成（> 分块边界）', fs.statSync(bigZip).size > BIG_BYTES, `${fs.statSync(bigZip).size} B`);

    await sender.setInputFiles('#lan-send-file', bigZip);
    const offerReady = await waitFor((arg, opts) => sender.waitForFunction(() => {
      const el = document.getElementById('lan-send-code');
      return Boolean(el) && el.value.startsWith('SZC1.');
    }, arg, opts), null, 30_000);
    const offer = await value(sender, '#lan-send-code');
    t.ok('L4 取件码已生成', offerReady && offer.startsWith('SZC1.'), `len=${offer.length}`);
    t.ok('L5 发送端已进入「等待对端」语义', /等待|取件码/.test(await text(sender, '#lan-send-status')),
      `status=${await text(sender, '#lan-send-status')}`);

    // ── ② 接收端生成应答码 ──
    await receiver.click('#btn-lan-send');
    await receiver.click('#lan-role-recv');
    t.ok('L6 接收面板可见', await receiver.isVisible('#lan-offer-input'));
    t.ok('L7 取件码粘贴成功', await fillTextarea(receiver, '#lan-offer-input', offer));

    await receiver.click('#lan-btn-accept');
    const answerReady = await waitFor((arg, opts) => receiver.waitForFunction(() => {
      const el = document.getElementById('lan-recv-code');
      return Boolean(el) && el.value.startsWith('SZC1.');
    }, arg, opts), null, 30_000);
    const answer = await value(receiver, '#lan-recv-code');
    t.ok('L8 应答码已生成', answerReady && answer.startsWith('SZC1.'), `len=${answer.length}`);

    // ── ③ 发送端应用应答码并传输 ──
    t.ok('L9 应答码粘贴成功', await fillTextarea(sender, '#lan-answer-input', answer));
    await sender.click('#lan-btn-apply-answer');

    const sentDone = await waitFor((arg, opts) => sender.waitForFunction(
      () => (document.getElementById('lan-send-status')?.textContent || '').includes('已发送'),
      arg, opts), null, 120_000);
    t.ok('L10 发送端完成', sentDone, `status=${await text(sender, '#lan-send-status')}`);

    const recvDone = await waitFor((arg, opts) => receiver.waitForFunction(
      () => (document.getElementById('lan-recv-status')?.textContent || '').includes('已接收'),
      arg, opts), null, 120_000);
    const recvStatus = await text(receiver, '#lan-recv-status');
    t.ok('L11 接收端完成', recvDone, `status=${recvStatus}`);
    t.ok('L12 接收端做了摘要核对且一致', recvStatus.includes('摘要一致'), `status=${recvStatus}`);

    // ── ④ 接收端工作区真的出现了这个包 ──
    const pkgSeen = await waitFor((arg, opts) => receiver.waitForFunction((name) => {
      return [...document.querySelectorAll('.pkg-name-txt')]
        .some((el) => (el.dataset.fullname || el.textContent || '').includes(name));
    }, arg, opts), BIG_NAME, 30_000);
    t.ok('L13 接收端工作区出现该包', pkgSeen,
      await receiver.$$eval('.pkg-name-txt', (els) => els.map((e) => e.dataset.fullname || e.textContent).join('|')));

    // ── ⑤ 一次性：码被清空，重复使用被明确拒绝 ──
    t.eq('L14 发送端取件码已清空（一次性）', await value(sender, '#lan-send-code'), '');
    t.eq('L15 接收端取件码已清空（一次性）', await value(receiver, '#lan-offer-input'), '');

    await fillTextarea(sender, '#lan-answer-input', answer);
    await sender.click('#lan-btn-apply-answer');
    await sender.waitForTimeout(300);
    const repeatStatus = await text(sender, '#lan-send-status');
    t.ok('L16 重复使用应答码被拒绝', /已完成|失败|不是应答码|取件码为空/.test(repeatStatus), `status=${repeatStatus}`);

    // ── ⑥ 坏码必须明确失败 ──
    await receiver.click('#lan-role-recv');
    await fillTextarea(receiver, '#lan-offer-input', 'NOT-A-CODE');
    await receiver.click('#lan-btn-accept');
    await receiver.waitForTimeout(500);
    const badStatus = await text(receiver, '#lan-recv-status');
    t.ok('L17 坏取件码明确报失败', badStatus.includes('失败'), `status=${badStatus}`);

    await browser.close().catch(() => {});
  },
};
