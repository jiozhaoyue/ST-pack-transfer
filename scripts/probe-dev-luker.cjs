const path = require('path');
const { loadPlaywright } = require('../e2e/lib/resolve-playwright.cjs');

(async () => {
  const pw = loadPlaywright();
  const ctx = await pw.chromium.launchPersistentContext(path.join(__dirname, '..', '.pw-profile-dev'), {
    ignoreHTTPSErrors: true,
    viewport: { width: 1600, height: 950 },
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  const resp = await page.goto('https://dev-luker.localhost:8003', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(4000);
  console.log('status', resp && resp.status(), 'url', page.url(), 'title', await page.title());
  console.log('counts', JSON.stringify({
    app: await page.locator('#app').count(),
    loginForm: await page.locator('#login_form, form#login, .login-form').count(),
    forms: await page.locator('form').count(),
    sendForm: await page.locator('#send_form').count(),
  }));
  const asset = await page.evaluate(async () => {
    const out = {};
    for (const url of [
      '/scripts/extensions/third-party/ST-pack-transfer/manifest.json',
      '/scripts/extensions/third-party/ST-pack-transfer/index.js',
      '/scripts/extensions/third-party/ST-BgLoader/manifest.json',
    ]) {
      try {
        const r = await fetch(url);
        out[url] = { status: r.status, len: (await r.text()).length };
      } catch (e) { out[url] = { error: String(e) }; }
    }
    return out;
  });
  console.log('asset', JSON.stringify(asset, null, 1));
  const cookies = await ctx.cookies();
  console.log('cookies', cookies.map((c) => `${c.name}@${c.domain}`).join(' '));
  await ctx.close();
})().catch((e) => { console.error('ERR', e); process.exit(1); });
