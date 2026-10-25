/**
 * Luker backup selection 取证 · 第七轮：settings:false 包清单独立验证
 *
 * 逐键表重磅结论：settings:false 省 899.3MB ≈ backups/892.2 + settings.json/6.9 ⇒
 * 「settings 类目与 backups/ 目录在 Luker 端点绑死」。此结论将进 spec 与 R-B2 需求，
 * 按报告纪律用清单法独立验证一次（存盘后 python zipfile 聚合对照）。
 * 用法：NODE_TLS_REJECT_UNAUTHORIZED=0 node .trellis/tasks/10-25-luker-selection-max/research/probe-settings-off.cjs
 */
const path = require('path');
const fs = require('fs');
const { INSTANCES } = require(path.resolve(__dirname, '..', '..', '..', '..', 'e2e', 'lib', 'instances.cjs'));
const { openInstance } = require(path.resolve(__dirname, '..', '..', '..', '..', 'e2e', 'lib', 'harness.cjs'));

const STD10 = ['characters', 'chats', 'lorebooks', 'presets', 'settings', 'secrets', 'assets', 'extensions', 'globalExtensions', 'vectors'];

(async () => {
  const inst = INSTANCES['dev-luker'];
  const h = await openInstance(inst);
  try {
    await h.goto();
    const cookies = await h.ctx.cookies(inst.url);
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const me = await h.page.evaluate(async () => (await (await fetch('/api/users/me', { credentials: 'same-origin' })).json()));
    const selection = Object.fromEntries(STD10.map((k) => [k, k === 'settings' ? false : true]));
    const out = path.resolve(__dirname, 'tmp', 'M3-settings-false.zip');
    const res = await fetch(`${inst.url}/api/users/backup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
      body: JSON.stringify({ handle: me.handle, selection }),
    });
    console.log(`M3-settings-false: status=${res.status}`);
    if (!res.ok) throw new Error(await res.text());
    const ws = fs.createWriteStream(out);
    let total = 0;
    for await (const chunk of res.body) { ws.write(chunk); total += chunk.length; }
    await new Promise((r) => ws.end(r));
    console.log(`total=${total} -> ${out}`);
  } finally {
    await h.close();
  }
})().catch((e) => { console.error('取证失败:', e); process.exit(1); });
