/**
 * S1 四现症修复的真浏览器验收（任务 10-15 的 1.5 补做，固化为永久回归）
 *
 * 断言对应 PRD AC-1.1 / AC-1.2 / AC-1.3 / AC-1.4：
 *   ① 上传后全页零「待扫描」残留；计数为 0 的类目 checkbox.disabled === true（AC-1.1）
 *   ② 320px 视口下「明细」按钮单行不折（计算样式 white-space === 'nowrap'）（AC-1.2）
 *   ③ 暂存行「更多」菜单展开后与 #dropzone 矩形不相交（AC-1.3）
 *   ④ idle 态工作台根容器不是滚动容器（scrollHeight <= clientHeight + 1 且
 *      计算样式 overflow-y 非 auto/scroll）（AC-1.4，design.md §9.2 裁定验收时机＝idle 态）
 *
 * 附带四张截图 → `test-results/shots/s1-*.png`（供视觉审查，不作断言依据）。
 * 后缀必须是 `.e2e.cjs`：`.spec.cjs` / `.test.js` 会被 vitest 当单测收集。
 */

const fs = require('fs');
const path = require('path');
const common = require('../lib/common.cjs');

module.exports = {
  name: 'S1 现症修复：待扫描清零 / 空类目置灰 / 明细单行 / 菜单不压上传区 / 无外层滚动',
  async run(t, h, ctx) {
    const { page } = h;
    const shotDir = path.join(ctx.repoRoot ?? '.', 'test-results', 'shots');
    fs.mkdirSync(shotDir, { recursive: true });
    const shot = (name) => path.join(shotDir, name);

    // ============ A 就绪（与 workbench-shell 同款：env-badge + 退出首装引导） ============
    await page.goto(ctx.baseUrl, { waitUntil: 'domcontentloaded' });
    const envBadge = await page.waitForFunction(() => {
      const el = document.getElementById('env-badge');
      return el && el.textContent.trim() && el.textContent.trim() !== '检测中...';
    }, null, { timeout: 30_000 })
      .then(() => page.$eval('#env-badge', (el) => el.textContent.trim())).catch(() => null);
    t.ok('A1 工作台就绪', !!envBadge, String(envBadge));
    if (await page.$('.wb-guide-overlay')) {
      await page.click('.wb-guide-actions button:has-text("退出")').catch(() => {});
      await page.waitForFunction(() => {
        const el = document.querySelector('.wb-guide-overlay');
        return !el || el.hidden || getComputedStyle(el).display === 'none';
      }, null, { timeout: 5_000 }).catch(() => {});
    }

    // ============ B idle 态：无外层滚动条（AC-1.4，验收时机按 design §9.2 定在 idle） ============
    const idleScroll = await page.evaluate(() => {
      const root = document.querySelector('#app.app-container');
      if (!root) return { found: false };
      const cs = getComputedStyle(root);
      return {
        found: true,
        overflowY: cs.overflowY,
        scrollH: root.scrollHeight,
        clientH: root.clientHeight,
      };
    });
    t.ok('B1 工作台根容器存在', idleScroll.found, JSON.stringify(idleScroll));
    t.ok('B2 idle 态根容器不是滚动容器（overflow-y 非 auto/scroll）',
      idleScroll.overflowY !== 'auto' && idleScroll.overflowY !== 'scroll',
      `overflow-y=${idleScroll.overflowY}`);
    t.ok('B3 idle 态内容不溢出（scrollHeight <= clientHeight + 1）',
      idleScroll.scrollH <= idleScroll.clientH + 1,
      `scrollH=${idleScroll.scrollH} clientH=${idleScroll.clientH}`);
    await page.screenshot({ path: shot('s1-idle.png'), fullPage: true });

    // ============ C 上传 → scanned：待扫描清零 + 空类目置灰（AC-1.1） ============
    const fixtures = await common.ensureFixtures(ctx.fixtureDir);
    await page.setInputFiles('#file-input', fixtures['fixture-st.zip']);
    t.ok('C1 上传后计划预览就绪', await common.waitForPlan(page));
    await page.waitForTimeout(400);

    const catAudit = await page.evaluate(() => {
      const cards = [...document.querySelectorAll('#category-panel .category-card')];
      const unscannedBadges = [...document.querySelectorAll('#category-panel')]
        .map((el) => (el.textContent || '').includes('待扫描'))
        .filter(Boolean).length;
      const rows = cards.map((card) => {
        const badge = card.querySelector('.cat-badge');
        const box = card.querySelector('input[type="checkbox"]');
        const text = badge ? badge.textContent.trim() : '';
        const count = (text.match(/(\d+)/) || [null, null])[1];
        return {
          key: card.getAttribute('data-category'),
          badge: text,
          count: count === null ? null : Number(count),
          disabled: box ? box.disabled : null,
        };
      });
      return { total: cards.length, unscannedBadges, rows };
    });
    t.eq('C2 类目面板零「待扫描」残留', catAudit.unscannedBadges, 0, '');
    t.ok('C3 类目卡片数 > 0（读数有效）', catAudit.total > 0, `total=${catAudit.total}`);
    const zeroCountRows = catAudit.rows.filter((r) => r.count === 0);
    const zeroButEnabled = zeroCountRows.filter((r) => r.disabled === false);
    t.eq('C4 计数为 0 的类目全部禁用勾选', zeroButEnabled.length, 0,
      JSON.stringify(zeroButEnabled.map((r) => r.key)));
    t.ok('C5 至少一个类目被置灰禁用（fixture-st 不含全部类目）', zeroCountRows.length > 0,
      `disabled=${zeroCountRows.map((r) => r.key).join(',')}`);
    await page.screenshot({ path: shot('s1-scanned.png'), fullPage: true });

    // ============ D 320px 视口：明细按钮单行（AC-1.2） ============
    await page.setViewportSize({ width: 320, height: 700 });
    await page.waitForTimeout(200);
    const detailBtn = await page.evaluate(() => {
      const btn = document.querySelector('#category-panel .btn-expand-detail');
      if (!btn) return { found: false };
      const cs = getComputedStyle(btn);
      return { found: true, whiteSpace: cs.whiteSpace, h: btn.offsetHeight, w: btn.offsetWidth };
    });
    t.ok('D1 320px 下「明细」按钮存在', detailBtn.found, JSON.stringify(detailBtn));
    t.ok('D2 「明细」按钮 white-space === nowrap', detailBtn.whiteSpace === 'nowrap',
      `white-space=${detailBtn.whiteSpace}`);
    t.ok('D3 「明细」按钮高度为单行（<= 48px）', detailBtn.h > 0 && detailBtn.h <= 48,
      `height=${detailBtn.h}px width=${detailBtn.w}px`);
    await page.screenshot({ path: shot('s1-320px.png'), fullPage: true });
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.waitForTimeout(200);

    // ============ E 行菜单不压上传区（AC-1.3） ============
    const moreBtn = await page.$('#stash-list .archive-card .archive-buttons button:has-text("⋯")');
    t.ok('E1 暂存行「更多」按钮存在', !!moreBtn);
    if (moreBtn) {
      await moreBtn.click();
      await page.waitForTimeout(200);
      const rects = await page.evaluate(() => {
        const menu = document.querySelector('.stash-row-menu');
        const dz = document.getElementById('dropzone');
        if (!menu || !dz) return { menu: !!menu, dz: !!dz };
        const a = menu.getBoundingClientRect();
        const b = dz.getBoundingClientRect();
        const intersect = !(a.right <= b.left || b.right <= a.left
          || a.bottom <= b.top || b.bottom <= a.top);
        return {
          menu: true, dz: true, intersect,
          menuRect: { t: Math.round(a.top), b: Math.round(a.bottom), l: Math.round(a.left), r: Math.round(a.right) },
          dzRect: { t: Math.round(b.top), b: Math.round(b.bottom), l: Math.round(b.left), r: Math.round(b.right) },
        };
      });
      t.ok('E2 菜单已展开且上传区存在', rects.menu && rects.dz, JSON.stringify(rects));
      t.ok('E3 菜单与 #dropzone 矩形不相交', rects.intersect === false,
        `menu=${JSON.stringify(rects.menuRect)} dz=${JSON.stringify(rects.dzRect)}`);
      await page.screenshot({ path: shot('s1-row-menu.png') });
      // 收尾：点空白处收起菜单，不影响后续 spec
      await page.mouse.click(8, 300).catch(() => {});
    }
  },
};
