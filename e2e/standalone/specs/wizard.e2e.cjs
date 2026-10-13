/**
 * 迁移向导默认入口（S5 第二步）——**HTTP 独立形态**下的契约。
 *
 * 与 `offline-single-file.e2e.cjs` 的分工：那个验的是 file:// 单文件产物；
 * 本 spec 验的是**默认入口本身**：向导是默认视图、六步披露、键盘导航、可切回高级工作台。
 *
 * 为什么要单独一条：默认入口是**产品级承诺**（R-08），而其余 14 个 spec 现在都显式
 * `useAdvancedView()` 绕开向导 ⇒ 若没有本 spec，「向导真的是默认」就没人测得到。
 */

const common = require('../lib/common.cjs');

const stepOf = (page) => page.evaluate(() => (document.getElementById('app') || {}).dataset?.wbStep || '');
const viewOf = (page) => page.evaluate(() => (document.getElementById('app') || {}).dataset?.wbView || '');

module.exports = {
  name: '迁移向导：默认入口 / 六步披露 / 键盘导航 / 切回高级',
  async run(t, h, ctx) {
    const { page, rec } = h;

    t.ok('W1 工作台就绪', Boolean(await ctx.waitForReady(page)));

    t.eq('W2 【默认入口】新会话落在**向导**视图', await viewOf(page), 'wizard');
    t.eq('W3 向导起始步是「来源」', await stepOf(page), 'source');

    const rail = await page.$$eval('#wizard-rail [data-wb-step]', (els) => els.map((e) => e.dataset.wbStep));
    t.eq('W4 步骤条含六步且顺序正确', rail.join(','), 'source,target,scope,check,run,verify');

    const counter = await page.$eval('#wizard-step-counter', (el) => el.textContent.trim());
    t.ok('W5 步骤计数可读（非空前置门）', counter.length > 0, counter);

    // 步骤披露：起始步只显示「来源」，目标选择器应被隐藏
    t.eq('W6 起始步下「目标」区块被隐藏（披露生效）', await page.isVisible('#target-select'), false);
    t.eq('W7 起始步下「来源」区块可见（前置门，否则 W6 恒真）',
      await page.isVisible('#dropzone'), true);

    // 键盘导航：聚焦步骤条后按 ArrowRight
    await page.focus('#wizard-rail [data-wb-step="source"]');
    await page.keyboard.press('ArrowRight');
    t.eq('W8 键盘 ArrowRight 前进一步（→ 目标）', await stepOf(page), 'target');
    await page.keyboard.press('End');
    t.eq('W9 键盘 End 跳到末步（核对）', await stepOf(page), 'verify');
    await page.keyboard.press('Home');
    t.eq('W10 键盘 Home 回到首步（来源）', await stepOf(page), 'source');

    // 上一步在首步应禁用（不能倒退到不存在的位置）
    t.eq('W11 首步「上一步」禁用', await page.$eval('#btn-wizard-prev', (el) => el.disabled), true);

    // 真实流程：喂源包 → 计划就绪 → 检查步给读数
    const fixtures = await common.ensureFixtures(ctx.fixtureDir);
    await page.setInputFiles('#file-input', fixtures['fixture-st.zip']);
    t.ok('W12 上传源包后计划预览就绪', await common.waitForPlan(page));

    await page.click('#wizard-rail [data-wb-step="check"]');
    const summary = await page.$eval('#wizard-check-summary', (el) => el.textContent.trim());
    t.ok('W13 检查步给出计划读数（同一计划快照，不从 DOM 重拼）', summary.length > 0, summary);

    // 切到高级：全量展示；切回向导：视图码回位
    t.eq('W14 可切到高级视图', await common.useAdvancedView(page), 'advanced');
    t.eq('W15 高级视图下「目标」区块同时可见', await page.isVisible('#target-select'), true);

    // 关键输入变更 ⇒ 旧「检查」读数作废（R-05 / AC-04）。高级视图下检查页始终可见，故这里可观测。
    await page.selectOption('#target-select', 'tt');
    const warned = await page.waitForFunction(
      () => ((document.getElementById('wizard-check-summary') || {}).textContent || '').includes('⚠'),
      null, { timeout: 15_000 },
    ).then(() => true).catch(() => false);
    t.ok('W15b 改目标后检查页出现「关键输入已变更」失效提示', warned,
      await page.$eval('#wizard-check-summary', (el) => el.textContent.trim()).catch(() => ''));

    await page.click('#btn-wb-view-toggle');
    t.eq('W16 可切回向导视图', await viewOf(page), 'wizard');
    t.eq('W17 切回后仍停在「检查」步（视图切换不重置步骤）', await stepOf(page), 'check');
    await page.click('#wizard-rail [data-wb-step="scope"]');
    await page.click('#wizard-rail [data-wb-step="check"]');
    const cleared = await page.$eval('#wizard-check-summary', (el) => el.textContent.trim());
    t.ok('W17b 重新进入「检查」步后失效提示清除（用户已看过新读数）',
      !cleared.includes('⚠'), cleared);

    t.eq('W18 全程零页面错误', rec.pageErrors.length, 0, JSON.stringify(rec.pageErrors.slice(0, 3)));
  },
};
