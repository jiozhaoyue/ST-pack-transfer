/**
 * Luker backup selection 取证 · 第五轮（终轮）：真布尔 false 验证
 *
 * 前四轮已证：特殊键被忽略（backups/ 892MB 恒在包）；数组值形状被忽略（第三轮"伪 false"
 * 方法论无效，V2/V3 差分为噪声）；M2（单键数组+9 键缺省）独缺 public/ 79.4MB，
 * 疑 assets 缺省=排除。**真布尔 false 从未验证过**——本轮补齐：
 *
 *   V4-chats-false  chats:false（真布尔），其余 9 键 true  → 期待少 chats/ 226.5MB ⇒ 布尔有效
 *   V5-assets-false assets:false（真布尔），其余 9 键 true → 期待少 public/ 79.4MB ⇒ assets↔public 映射
 *
 * 用法：node .trellis/tasks/10-25-luker-selection-max/research/probe-bool-false.cjs
 */

const path = require('path');
const { INSTANCES } = require(path.resolve(__dirname, '..', '..', '..', '..', 'e2e', 'lib', 'instances.cjs'));
const { openInstance } = require(path.resolve(__dirname, '..', '..', '..', '..', 'e2e', 'lib', 'harness.cjs'));

const STD10 = ['characters', 'chats', 'lorebooks', 'presets', 'settings', 'secrets', 'assets', 'extensions', 'globalExtensions', 'vectors'];

const VARIANTS = [
  { name: 'V4-chats-false', offKey: 'chats' },
  { name: 'V5-assets-false', offKey: 'assets' },
];

const BASELINE = 1794066397; // M1-std10-true.zip（第四轮存盘实测）

(async () => {
  const inst = INSTANCES['dev-luker'];
  const h = await openInstance(inst);
  try {
    await h.goto();
    const me = await h.page.evaluate(async () => (await (await fetch('/api/users/me', { credentials: 'same-origin' })).json()));
    const handle = me.handle;

    const results = await h.page.evaluate(async ({ handle, variants, std10 }) => {
      const out = [];
      for (const v of variants) {
        const selection = Object.fromEntries(std10.map((k) => [k, k === v.offKey ? false : true]));
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
    }, { handle, variants: VARIANTS, std10: STD10 });

    const fs = require('fs');
    fs.writeFileSync(path.resolve(__dirname, 'probe-bool-false.json'), JSON.stringify({ probedAt: new Date().toISOString(), variants: results }, null, 2));
    console.log(`\n=== 真布尔 false 差分（基线 ${BASELINE}） ===`);
    for (const r of results) {
      const saved = r.totalBytes != null ? BASELINE - r.totalBytes : null;
      console.log(`${r.name}: status=${r.status} total=${r.totalBytes ?? '-'} 节省=${saved ?? '-'} (${saved != null ? (saved / 1e6).toFixed(1) + 'MB' : '-'}) ${r.ms}ms${r.errorBody ? ` err="${r.errorBody.slice(0, 100)}"` : ''}`);
    }
  } finally {
    await h.close();
  }
})().catch((e) => { console.error('取证失败:', e); process.exit(1); });
