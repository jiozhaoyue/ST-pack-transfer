/**
 * 跨宿主**有向迁移路径**矩阵 —— 「四端互通」的可自动化证据面。
 *
 * ## 为什么单开一条
 *
 * `targets.e2e.cjs` 只从**一个**源（`fixture-st.zip`）连转四目标 ⇒ 覆盖 4 条有向路径。
 * 而「四宿主互通」的真正命题是 **4 源布局 × 4 目标布局** 的有向路径**逐条**走通
 * （`10-01` 的 `R-01` / `AC-12`：不以代表路径替代）。
 *
 * 本 spec 把**可自动化**的那部分做实：3 个真实源布局（ST 摊平 / Luker 摊平+manifest / TT `data/`）
 * × 4 个目标布局 = **12 条有向路径**，每条都断言：
 *   ① 产物是合法 zip 且非空（**前置门** —— 否则后面的否命题在空包上恒真）；
 *   ② 目标落位规则（必须有 / 必须没有的前缀，取自 `tavern-datapack-formats.md` 的〔仓内〕条）；
 *   ③ **数据真的搬过去了**：聊天条目数与角色卡条目数与源包**逐条对上**（不是"只剩合成物"）。
 *
 * ## 不可自动化的那部分（如实登记，不冒充）
 *
 * 「写入目标宿主」不是本 spec 的判定面：
 *  - **ST**：恢复端点 404（`host-capability-matrix.md` E-3）⇒ `targetWrite = unavailable`，只能人工导入；
 *  - **TT**：Tauri 桌面应用，**无浏览器端口** ⇒ 人工交付（`09-27` 的 `C-3`）；
 *  - **PT**：宿主数据管理面板，人工导入。
 * 故这 12 条是**格式转换 + 交付**层面的证据；**目标侧写入**的证据在实例侧与人工记录里，
 * 两者**不得互相顶替**（`AC-12` 明文）。
 *
 * ## 为什么每个源要**新开上下文**
 *
 * `#file-input` 的处理是「总是入库，**仅在尚无源包时**采纳为当前源」⇒ 同一个页面里换源包
 * 不会被采纳（量到的还是第一个源）。故每个源开一个**全新 context**（与 `perf.e2e.cjs`
 * 的 `measureFresh` 同一手法，那里有更长的说明）。
 */

const path = require('path');
const common = require('../lib/common.cjs');

/** 目标 → 落位判据（与 `targets.e2e.cjs` 同源，取自 `tavern-datapack-formats.md`） */
const TARGET_RULES = {
  st: { label: 'SillyTavern', mustHave: ['characters/', 'chats/', 'settings.json'], mustNotHave: ['data/'] },
  l: { label: 'Luker', mustHave: ['manifest.json', 'characters/', 'chats/', 'settings.json'], mustNotHave: ['data/'] },
  tt: { label: 'TauriTavern', mustHave: ['data/default-user/characters/', 'data/default-user/chats/'], mustNotHave: [] },
  pt: { label: 'PureTavern', mustHave: ['data/default-user/characters/', 'data/default-user/chats/'], mustNotHave: [] },
};

/** 三个**真实**源布局（`fixtures/gen.js` 的三份确定性产物） */
const SOURCES = [
  { key: 'st', fixture: 'fixture-st.zip', label: 'ST 摊平' },
  { key: 'l', fixture: 'fixture-l.zip', label: 'Luker 摊平+manifest' },
  { key: 'tt', fixture: 'fixture-tt.zip', label: 'TT data/' },
];

const TARGETS = ['st', 'l', 'tt', 'pt'];

const hasPrefix = (names, p) => names.some((n) => n.startsWith(p));
const countChats = (names) => names.filter((n) => n === 'chats/' || n.startsWith('chats/')
  || n.includes('/chats/')).length;
const countChars = (names) => names.filter((n) => n === 'characters/' || n.startsWith('characters/')
  || n.includes('/characters/')).length;

/**
 * 在**全新上下文**里：上传源 → 依次转到四目标，逐条量产物。
 * @returns {Promise<{ok: boolean, reason?: string, perTarget: object, pageErrors: string[]}>}
 */
async function convertAllTargets(ctx, fixturePath) {
  const { openSite, waitForReady } = require('../lib/harness.cjs');
  const h = await openSite(ctx.baseUrl);
  const perTarget = {};
  try {
    await h.goto();
    if (!(await waitForReady(h.page))) return { ok: false, reason: 'not-ready', perTarget, pageErrors: [] };
    await common.useAdvancedView(h.page);
    await h.page.setInputFiles('#file-input', fixturePath);
    if (!(await common.waitForPlan(h.page))) {
      return { ok: false, reason: 'no-plan', perTarget, pageErrors: h.rec.pageErrors };
    }
    // 「完整」扩展模式：让扩展实体也走一遍路由（否则轻量清单模式会跳过扩展面）
    await h.page.evaluate(() => {
      const el = document.querySelector('input[name="extension-mode"][value="full"]');
      if (!el) return;
      el.checked = true;
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });

    let rowIndex = 0;
    for (const target of TARGETS) {
      await h.page.selectOption('#target-select', target);
      await h.page.waitForTimeout(120);
      await h.page.click('#btn-convert');
      const names = await common.waitForQueue(h.page, rowIndex + 1);
      if (!names) { perTarget[target] = { ok: false, reason: 'no-product' }; break; }
      const out = await common.downloadNthRow(h.page, rowIndex, ctx.fixtureDir,
        `cross-${path.basename(fixturePath, '.zip')}-to-${target}.zip`);
      rowIndex += 1;
      perTarget[target] = { ok: true, product: await common.readZip(out) };
    }
    return { ok: true, perTarget, pageErrors: h.rec.pageErrors };
  } finally {
    await h.close().catch(() => {});
  }
}

module.exports = {
  name: '跨宿主有向路径矩阵（3 源 × 4 目标 = 12 条 · 四端互通的可自动化面）',
  async run(t, h, ctx) {
    const fixtures = await common.ensureFixtures(ctx.fixtureDir);

    // 先量源包自身的条目数（作为"数据一条不少"的分母 —— 没有它，「产物有 chats」是弱断言）
    const sourceCounts = {};
    for (const s of SOURCES) {
      const zip = await common.readZip(fixtures[s.fixture]);
      sourceCounts[s.key] = { chats: countChats(zip.names), chars: countChars(zip.names), total: zip.names.length };
      t.ge(`S-${s.key}.0 【前置门】源包 ${s.label} 有聊天条目（否则"搬运"无从谈起）`,
        sourceCounts[s.key].chats, 1, JSON.stringify(zip.names.slice(0, 6)));
      t.ge(`S-${s.key}.0b 【前置门】源包 ${s.label} 有角色卡条目`,
        sourceCounts[s.key].chars, 1, JSON.stringify(zip.names.slice(0, 6)));
    }

    let pathsOk = 0;
    const matrix = [];
    const allPageErrors = [];

    for (const s of SOURCES) {
      const res = await convertAllTargets(ctx, fixtures[s.fixture]);
      allPageErrors.push(...(res.pageErrors || []));
      t.ok(`C-${s.key}.1 源 ${s.label} 的上下文就绪并产出计划`, res.ok, res.reason || '');
      if (!res.ok) { matrix.push(`${s.key}->(none): ${res.reason}`); continue; }

      for (const target of TARGETS) {
        const r = res.perTarget[target];
        const tag = `${s.key}->${target}`;
        if (!r || !r.ok) { t.ok(`C-${tag}.1 转换完成`, false, JSON.stringify(r)); matrix.push(`${tag}: FAIL(no-product)`); continue; }
        const names = r.product.names;
        const rule = TARGET_RULES[target];

        const nonEmpty = t.ge(`C-${tag}.2 产物是合法 zip 且非空（前置门）`, names.length, 1,
          `entries=${names.length}`);
        if (!nonEmpty) { matrix.push(`${tag}: FAIL(empty)`); continue; }

        const missing = rule.mustHave.filter((p) => !hasPrefix(names, p));
        t.eq(`C-${tag}.3 落位含全部必需前缀（${rule.label}）`, missing.length, 0,
          `缺=${JSON.stringify(missing)} 实际前 8=${JSON.stringify(names.slice(0, 8))}`);
        const forbidden = rule.mustNotHave.filter((p) => hasPrefix(names, p));
        t.eq(`C-${tag}.4 落位**不含**禁止前缀（${rule.label}）`, forbidden.length, 0,
          `多=${JSON.stringify(forbidden)}`);

        // **数据一条不少**：聊天与角色卡的条目数与源包**逐条对上**（跨布局只改路径，不丢条目）
        const chats = countChats(names);
        const chars = countChars(names);
        t.eq(`C-${tag}.5 聊天条目数与源包**一条不差**`, chats, sourceCounts[s.key].chats,
          `产物=${chats} 源=${sourceCounts[s.key].chats}`);
        t.eq(`C-${tag}.6 角色卡条目数与源包**一条不差**`, chars, sourceCounts[s.key].chars,
          `产物=${chars} 源=${sourceCounts[s.key].chars}`);

        const ok = nonEmpty && missing.length === 0 && forbidden.length === 0
          && chats === sourceCounts[s.key].chats && chars === sourceCounts[s.key].chars;
        if (ok) pathsOk += 1;
        matrix.push(`${tag}: ${ok ? 'OK' : 'FAIL'} (${names.length} 条, chats=${chats}, chars=${chars})`);
      }
    }

    t.log('  · 有向路径矩阵：');
    for (const line of matrix) t.log(`      ${line}`);
    t.eq('C-ALL 12 条有向路径**逐条**走通（不以代表路径替代）', pathsOk, 12,
      `走通 ${pathsOk}/12：${JSON.stringify(matrix)}`);

    t.eq('Z1 全流程零未捕获页面异常（12 条路径各自上下文的合计）', allPageErrors.length, 0,
      JSON.stringify(allPageErrors.slice(0, 2)));
  },
};
