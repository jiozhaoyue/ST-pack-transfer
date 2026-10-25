/**
 * Luker backup selection 取证 · 第三轮：单键差分（extensions-data 归属定案）
 *
 * 前两轮结论：selection 只认 10 标准键布尔；特殊/未知键静默忽略；缺省=包含；
 * 空集 400；无 Content-Length；全量包 1.79GB；数组值疑似被当 false（qD 少 ~76MB ≈ characters 压缩量）。
 *
 * 本轮用「目标键 = 数组（伪 false），其余 9 键 true」差分，量化每键可省字节：
 *   V2-ext-off   extensions=false  → 差分应含 extensions/482MB（+extensions-data/643MB 若受管）
 *   V3-chats-off chats=false       → 差分应 ≈ chats/671MB 压缩量（交叉验证方法论）
 *
 * 用法：node .trellis/tasks/10-25-luker-selection-max/research/probe-key-diff.cjs
 */

const path = require('path');
const { INSTANCES } = require(path.resolve(__dirname, '..', '..', '..', '..', 'e2e', 'lib', 'instances.cjs'));
const { openInstance } = require(path.resolve(__dirname, '..', '..', '..', '..', 'e2e', 'lib', 'harness.cjs'));

const STD10 = ['characters', 'chats', 'lorebooks', 'presets', 'settings', 'secrets', 'assets', 'extensions', 'globalExtensions', 'vectors'];

const OFF = ['*.probe-off']; // 数组值 ⇒ 端点按该键排除处理（qD 已证）

const VARIANTS = [
  { name: 'V2-ext-off', offKey: 'extensions' },
  { name: 'V3-chats-off', offKey: 'chats' },
];

(async () => {
  const inst = INSTANCES['dev-luker'];
  const h = await openInstance(inst);
  try {
    await h.goto();
    const me = await h.page.evaluate(async () => (await (await fetch('/api/users/me', { credentials: 'same-origin' })).json()));
    const handle = me.handle;

    const results = await h.page.evaluate(async ({ handle, variants, std10, off }) => {
      const out = [];
      for (const v of variants) {
        const selection = Object.fromEntries(std10.map((k) => [k, k === v.offKey ? off : true]));
        const t0 = performance.now();
        const rec = { name: v.name, offKey: v.offKey, selection };
        try {
          const res = await fetch('/api/users/backup', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ handle, selection }),
          });
          rec.status = res.status;
          if (res.ok) {
            let total = 0;
            const reader = res.body.getReader();
            for (;;) {
              const { done, value } = await reader.read();
              if (done) break;
              total += value.byteLength;
            }
            rec.totalBytes = total;
          } else {
            rec.errorBody = (await res.text()).slice(0, 300);
          }
        } catch (e) {
          rec.error = String(e);
        }
        rec.ms = Math.round(performance.now() - t0);
        out.push(rec);
        await new Promise((r) => setTimeout(r, 1500));
      }
      return out;
    }, { handle, variants: VARIANTS, std10: STD10, off: OFF });

    const fs = require('fs');
    const outPath = path.resolve(__dirname, 'probe-key-diff.json');
    fs.writeFileSync(outPath, JSON.stringify({ probedAt: new Date().toISOString(), target: inst.url, variants: results }, null, 2));
    console.log('\n=== 单键差分（基线 qA=1794066398） ===');
    for (const r of results) {
      const saved = r.totalBytes != null ? 1794066398 - r.totalBytes : null;
      console.log(`${r.name}: status=${r.status} total=${r.totalBytes ?? '-'} 节省=${saved ?? '-'} ${r.ms}ms${r.errorBody ? ` err="${r.errorBody.slice(0, 100)}"` : ''}`);
    }
    console.log(`\n原始读数: ${outPath}`);
  } finally {
    await h.close();
  }
})().catch((e) => { console.error('取证失败:', e); process.exit(1); });
