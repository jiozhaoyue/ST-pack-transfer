/**
 * Luker backup selection 取证 · 第六轮：逐键 false 全表（8 键补齐）
 *
 * 已测：chats→226.9MB(chats/)、assets→159.2MB(user/)。本轮扫余下 8 键，
 * 产出「selection 键 → 包内目录/字节」完整映射表（含 public/ 79.4MB 归属定案）。
 * 用法：node .trellis/tasks/10-25-luker-selection-max/research/probe-each-key.cjs
 */
const path = require('path');
const fs = require('fs');
const { INSTANCES } = require(path.resolve(__dirname, '..', '..', '..', '..', 'e2e', 'lib', 'instances.cjs'));
const { openInstance } = require(path.resolve(__dirname, '..', '..', '..', '..', 'e2e', 'lib', 'harness.cjs'));

const STD10 = ['characters', 'chats', 'lorebooks', 'presets', 'settings', 'secrets', 'assets', 'extensions', 'globalExtensions', 'vectors'];
const KEYS = ['characters', 'lorebooks', 'presets', 'settings', 'secrets', 'extensions', 'globalExtensions', 'vectors'];
const BASELINE = 1794066397;

(async () => {
  const inst = INSTANCES['dev-luker'];
  const h = await openInstance(inst);
  try {
    await h.goto();
    const me = await h.page.evaluate(async () => (await (await fetch('/api/users/me', { credentials: 'same-origin' })).json()));
    const handle = me.handle;
    const results = [];
    for (const offKey of KEYS) {
      const selection = Object.fromEntries(STD10.map((k) => [k, k === offKey ? false : true]));
      const t0 = performance.now();
      let rec = { name: `off-${offKey}`, offKey };
      try {
        const r = await h.page.evaluate(async ({ handle, selection }) => {
          const res = await fetch('/api/users/backup', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ handle, selection }),
          });
          if (!res.ok) return { status: res.status, err: (await res.text()).slice(0, 200) };
          let total = 0;
          const reader = res.body.getReader();
          for (;;) { const { done, value } = await reader.read(); if (done) break; total += value.byteLength; }
          return { status: res.status, total };
        }, { handle, selection });
        rec = { ...rec, ...r, saved: r.total != null ? BASELINE - r.total : null, ms: Date.now() - t0 };
      } catch (e) { rec = { ...rec, error: String(e) }; }
      results.push(rec);
      console.log(`${rec.name}: status=${rec.status} total=${rec.total ?? '-'} 节省=${rec.saved ?? '-'}(${rec.saved != null ? (rec.saved / 1e6).toFixed(1) + 'MB' : '-'}) ${((rec.ms || 0) / 1000).toFixed(0)}s${rec.err ? ' err=' + rec.err : ''}`);
      await new Promise((r2) => setTimeout(r2, 1500));
    }
    fs.writeFileSync(path.resolve(__dirname, 'probe-each-key.json'), JSON.stringify({ probedAt: new Date().toISOString(), baseline: BASELINE, results }, null, 2));
  } finally {
    await h.close();
  }
})().catch((e) => { console.error('取证失败:', e); process.exit(1); });
