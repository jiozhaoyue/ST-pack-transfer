/**
 * 本地取证（不纳版本控制）：设置三态（× 保留草稿 / 取消丢弃 / 保存持久化）+ 导出勾选默认值。
 */
const { loadPlaywright } = require('../e2e/lib/resolve-playwright.cjs');

(async () => {
  const pw = loadPlaywright();
  const b = await pw.chromium.launch({ headless: true });
  const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await p.goto('http://localhost:4173/', { waitUntil: 'networkidle' });
  await p.waitForSelector('#app.app-container');
  await p.evaluate(() => {
    const k = 'st-pack-transfer:settings';
    let s = {};
    try { s = JSON.parse(localStorage.getItem(k) || '{}'); } catch { s = {}; }
    s.autoTutorial = false;
    localStorage.setItem(k, JSON.stringify(s));
  });
  await p.reload({ waitUntil: 'networkidle' });
  await p.waitForSelector('#app.app-container');
  await p.evaluate(() => {
    document.getElementById('tutorial-overlay')?.remove();
  });
  await p.waitForTimeout(200);

  const open = async () => {
    await p.click('#btn-settings');
    await p.waitForSelector('#settings-body [data-setting]', { timeout: 5000 });
    await p.waitForTimeout(120);
  };
  const read = () => p.evaluate(() => ({
    creds: document.getElementById('set-include-creds')?.checked,
    oauth: document.getElementById('set-include-oauth')?.checked,
    oauthDisabled: document.getElementById('set-include-oauth')?.disabled,
    cancelLabel: document.getElementById('settings-cancel')?.textContent.trim(),
    saveLabel: document.getElementById('settings-save')?.textContent.trim(),
    traffic: document.querySelector('[data-setting="trafficPrompt"]')?.checked,
  }));

  await open();
  await p.screenshot({ path: require('node:path').join(process.env.TEMP, 'spt-shots', '15-settings-default.png') });
  const defaults = await read();

  // 改一项 → × 关闭（草稿保留）→ 重开
  await p.click('[data-setting="trafficPrompt"]');
  await p.click('#settings-close');
  await open();
  const afterX = await read();

  // 取消 → 丢弃
  await p.click('#settings-cancel');
  await open();
  const afterCancel = await read();

  // 改一项 → 保存 → 重开 + 看 localStorage
  await p.click('[data-setting="trafficPrompt"]');
  await p.click('#settings-save');
  await p.waitForTimeout(150);
  const stored = await p.evaluate(() => {
    const raw = localStorage.getItem('st-pack-transfer:settings');
    try { return JSON.parse(raw).trafficPrompt; } catch { return 'parse-fail'; }
  });
  await open();
  const afterSave = await read();

  console.log(JSON.stringify({ defaults, afterX, afterCancel, afterSave, stored }, null, 2));
  await b.close();
})().catch((e) => { console.error('FAILED', e); process.exit(1); });
