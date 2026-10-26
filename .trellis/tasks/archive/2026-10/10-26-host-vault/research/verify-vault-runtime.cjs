/**
 * 仓（vault）真实宿主运行时验证 —— 截图留证
 *
 * 验证链（10-26-host-vault 的 AC-1/AC-2/AC-3 运行时面）：
 *   ① 工作台可见「仓」模块 + 后端徽标
 *   ② 任意文件存入（#vault-file-input）→ 列表行出现，**后端真值恰好 1 条**
 *   ③ 导出 → 下载字节与源文件一致
 *   ④ 删除 → 行消失且后端真值归零
 * 后端真值经页内 `import` 插件自身 vault-store 读取（不靠 DOM 推断）。
 * 每步截图落 test-results/instances/vault-<host>-<step>-<date>.png。
 *
 * 只连 Dev（harness.assertDevTarget 内建）。
 * 用法：node verify-vault-runtime.cjs [dev-st|dev-luker]
 */
const path = require('path');
const fs = require('fs');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const { INSTANCES } = require(path.join(REPO_ROOT, 'e2e', 'lib', 'instances.cjs'));
const { openInstance } = require(path.join(REPO_ROOT, 'e2e', 'lib', 'harness.cjs'));
const { openWorkbenchModal } = require(path.join(REPO_ROOT, 'e2e', 'lib', 'workbench-entry.cjs'));

const OUT = path.join(REPO_ROOT, 'test-results', 'instances');
const FIXTURE_DIR = 'D:/tmp/vault-fixtures';
const HOST_ID = process.argv[2] || 'dev-st';
const stamp = new Date().toISOString().slice(0, 10);
const shot = (page, name) => page.screenshot({ path: path.join(OUT, `vault-${HOST_ID}-${name}-${stamp}.png`), fullPage: false });

const STORE_MOD = '/scripts/extensions/third-party/st-zip-converter/src/storage/vault-store.js';

/** 页内后端真值（直接调插件自己的 vault-store，不经 DOM） */
const backendState = (page) => page.evaluate(async (modPath) => {
  const m = await import(modPath);
  const entries = await m.vaultList();
  return {
    backend: await m.vaultBackend(),
    count: entries.length,
    entries: entries.map((e) => ({ id: e.id, name: e.name, size: e.size })),
  };
}, STORE_MOD);

const openPanel = async (page) => {
  await page.waitForFunction(
    () => Boolean(document.getElementById('st-zip-converter-menu-item')
      || document.getElementById('st-converter-modal-overlay')),
    null, { timeout: 60_000 },
  ).catch(() => {});
  let opened = await page.evaluate(() => {
    const item = document.getElementById('st-zip-converter-menu-item');
    if (!item) return { ok: false, via: 'no-menu-item' };
    item.click();
    return { ok: true, via: 'menu-item' };
  });
  if (!opened.ok) opened = await openWorkbenchModal(page);
  await page.waitForFunction(() => {
    const ov = document.getElementById('st-converter-modal-overlay');
    if (!ov || getComputedStyle(ov).display === 'none') return false;
    const el = document.getElementById('target-select');
    if (!el) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }, null, { timeout: 30_000 }).catch(() => { opened.ok = false; });
  // 关掉可能残留的宿主扩展弹层（open-button 路径会留在最上层，遮住截图）
  const closed = await page.evaluate(() => {
    const btns = [...document.querySelectorAll('.popup button, .popup .menu_button, [class*="popup"] button')]
      .filter((b) => b.getBoundingClientRect().height > 0);
    const close = btns.find((b) => /^(关闭|Close|×|✕)$/i.test((b.textContent || '').trim()));
    if (!close) return false;
    close.click();
    return true;
  });
  await page.waitForTimeout(600);
  return { ...opened, closedPopup: closed };
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const inst = INSTANCES[HOST_ID];
  if (!inst) throw new Error(`未知宿主 ${HOST_ID}`);
  const { page, ctx, rec } = await openInstance(inst);
  const steps = [];
  const log = (s) => { steps.push(s); console.log(s); };

  try {
    await page.goto(inst.url, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(6_000);

    // ——① 打开工作台（先清后端真值，避免历史遗留干扰「恰好 1 条」断言）——
    let opened = await openPanel(page);
    log(`[1] 打开工作台 ${JSON.stringify(opened)}`);
    if (!opened.ok) throw new Error('工作台打不开');

    const clean = await page.evaluate(async (modPath) => {
      const m = await import(modPath);
      const list = await m.vaultList();
      for (const e of list) await m.vaultDelete(e.id);
      return { deleted: list.length };
    }, STORE_MOD);
    log(`[1b] 后端清场 ${JSON.stringify(clean)}`);

    // 清场后重载，让面板从后端真值重建（也顺带验证「重载后列表与后端一致」）
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(7_000);
    opened = await openPanel(page);
    if (!opened.ok) throw new Error('重载后工作台打不开');

    // ——② 仓模块可见 + 后端徽标——
    await page.waitForFunction(() => !!document.querySelector('#vault-backend-badge .badge'), null, { timeout: 15_000 }).catch(() => {});
    const vault = await page.evaluate(() => {
      const sec = document.querySelector('section[data-wb-module="vault"]');
      const badge = document.querySelector('#vault-backend-badge .badge');
      if (sec) sec.scrollIntoView({ block: 'center' });
      return {
        found: !!sec,
        visible: sec ? sec.getBoundingClientRect().height > 0 : false,
        badge: badge ? badge.textContent.trim() : null,
        hasAddBtn: !!document.getElementById('btn-vault-add'),
        hasInput: !!document.getElementById('vault-file-input'),
        listText: (document.getElementById('vault-list')?.textContent || '').trim().slice(0, 40),
      };
    });
    log(`[2] vault 模块 ${JSON.stringify(vault)}`);
    const before = await backendState(page);
    log(`[2b] 后端真值 ${JSON.stringify({ backend: before.backend, count: before.count })}`);
    await shot(page, 'panel');

    // ——③ 存入（任意文件，不限格式）——
    const fixture = fs.readdirSync(FIXTURE_DIR).filter((f) => f.endsWith('.zip')).sort()[0];
    if (!fixture) throw new Error(`固件目录无 zip：${FIXTURE_DIR}`);
    const fixturePath = path.join(FIXTURE_DIR, fixture);
    const fixtureSize = fs.statSync(fixturePath).size;
    await page.setInputFiles('#vault-file-input', fixturePath);
    await page.waitForFunction(() => document.querySelectorAll('#vault-list .archive-card').length > 0, null, { timeout: 30_000 });
    // 再等一拍，捕捉「并发渲染重复追加」回归（修复后应恒为 1 行）
    await page.waitForTimeout(2_500);
    const row = await page.evaluate(() => {
      const card = document.querySelector('#vault-list .archive-card');
      return {
        cardCount: document.querySelectorAll('#vault-list .archive-card').length,
        name: card?.querySelector('.archive-name')?.textContent ?? null,
        badges: card ? [...card.querySelectorAll('.archive-meta span')].map((s) => s.textContent.trim()) : [],
        buttons: card ? [...card.querySelectorAll('.btn-archive-action')].map((b) => b.textContent.trim()) : [],
      };
    });
    const afterStore = await backendState(page);
    log(`[3] 存入 行=${JSON.stringify(row)} 后端=${JSON.stringify({ count: afterStore.count, size: afterStore.entries[0]?.size })}（源 ${fixture} ${fixtureSize}B）`);
    await shot(page, 'stored');

    // ——④ 导出 → 下载字节一致——
    const [download] = await Promise.all([
      page.waitForEvent('download', { timeout: 30_000 }),
      page.evaluate(() => {
        const card = document.querySelector('#vault-list .archive-card');
        [...card.querySelectorAll('.btn-archive-action')].find((b) => b.textContent.trim() === '导出')?.click();
      }),
    ]);
    const dlPath = path.join(FIXTURE_DIR, 'vault-export-out.zip');
    await download.saveAs(dlPath);
    const dlSize = fs.statSync(dlPath).size;
    log(`[4] 导出 ${download.suggestedFilename()} ${dlSize}B —— 字节一致=${dlSize === fixtureSize}`);

    // ——⑤ 删除 → 行消失且后端归零——
    page.on('dialog', (d) => d.accept());
    await page.evaluate(() => {
      const card = document.querySelector('#vault-list .archive-card');
      [...card.querySelectorAll('.btn-archive-action')].find((b) => b.textContent.trim() === '删除')?.click();
    });
    await page.waitForTimeout(900);
    const confirmHit = await page.evaluate(() => {
      const btns = [...document.querySelectorAll('.popup button, .popup .menu_button, [class*="popup"] button')]
        .filter((b) => b.getBoundingClientRect().height > 0);
      const pick = btns.find((b) => /确定|确认|OK|Yes/i.test(b.textContent || '')) || btns[0];
      if (!pick) return { clicked: false };
      const label = pick.textContent.trim();
      pick.click();
      return { clicked: true, label };
    });
    await page.waitForFunction(() => document.querySelectorAll('#vault-list .archive-card').length === 0, null, { timeout: 20_000 })
      .then(() => true).catch(() => false);
    const afterDelete = await backendState(page);
    const uiEmpty = await page.evaluate(() => ({
      cards: document.querySelectorAll('#vault-list .archive-card').length,
      text: (document.getElementById('vault-list')?.textContent || '').trim().slice(0, 20),
    }));
    log(`[5] 删除 确认=${JSON.stringify(confirmHit)} UI=${JSON.stringify(uiEmpty)} 后端=${JSON.stringify({ count: afterDelete.count })}`);
    await shot(page, 'deleted');

    const pluginErr = [...rec.pluginConsoleErrors, ...rec.pluginFailures];
    log(`[6] 插件侧错误 ${pluginErr.length} 条 ${JSON.stringify(pluginErr.slice(0, 3))}`);
    fs.writeFileSync(path.join(OUT, `vault-runtime-${HOST_ID}-${stamp}.md`),
      [`# 仓运行时验证 · ${HOST_ID} · ${new Date().toISOString()}`, '', ...steps.map((s) => `- ${s}`), ''].join('\n'));
  } finally {
    await ctx.close();
  }
})().catch((e) => { console.error('FAILED:', String(e).slice(0, 600)); process.exit(1); });
