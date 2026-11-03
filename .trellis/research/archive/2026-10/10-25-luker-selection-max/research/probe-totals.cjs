/**
 * Luker backup selection 取证 · 第二轮：完整收流拿总字节数
 *
 * 第一轮（probe-backup-selection.cjs）结论：端点认 13 键、无 Content-Length、空集 400、
 * 未知键宽容。本轮回答核心悬问：**现状只传 10 标准键时，Luker 对 backups/cache/appPrivate
 * 的默认行为是包含还是排除**——用同数据集的总字节数对照（流式计数，不落盘、不囤内存）。
 *
 *   qA-total  10 键全 true（现状等价）
 *   qB-total  13 键、特殊三类 false（显式排除）
 *   qC-total  13 键全 true（特殊类目全开 ⇒ 字节占比分母）
 *   qD-total  characters: ['*.png']（数组形状是否有语义：与 qA-total 相等 ⇒ 被 truthy 化忽略）
 *
 * 用法：node .trellis/tasks/10-25-luker-selection-max/research/probe-totals.cjs
 */

const path = require('path');
const { INSTANCES } = require(path.resolve(__dirname, '..', '..', '..', '..', 'e2e', 'lib', 'instances.cjs'));
const { openInstance } = require(path.resolve(__dirname, '..', '..', '..', '..', 'e2e', 'lib', 'harness.cjs'));

const STD10 = ['characters', 'chats', 'lorebooks', 'presets', 'settings', 'secrets', 'assets', 'extensions', 'globalExtensions', 'vectors'];
const mk = (keys, val) => Object.fromEntries(keys.map((k) => [k, val]));

const VARIANTS = [
  { name: 'qA-total-std10', selection: mk(STD10, true) },
  { name: 'qB-total-13-exclude', selection: { ...mk(STD10, true), backups: false, cache: false, appPrivate: false } },
  { name: 'qC-total-13-all', selection: { ...mk(STD10, true), backups: true, cache: true, appPrivate: true } },
  { name: 'qD-total-array', selection: { characters: ['*.png'] } },
];

(async () => {
  const inst = INSTANCES['dev-luker'];
  const h = await openInstance(inst);
  try {
    await h.goto();
    const me = await h.page.evaluate(async () => (await (await fetch('/api/users/me', { credentials: 'same-origin' })).json()));
    const handle = me.handle;

    const results = await h.page.evaluate(async ({ handle, variants }) => {
      const out = [];
      for (const v of variants) {
        const t0 = performance.now();
        const rec = { name: v.name };
        try {
          const res = await fetch('/api/users/backup', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ handle, selection: v.selection }),
          });
          rec.status = res.status;
          rec.contentLength = res.headers.get('content-length');
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
    }, { handle, variants: VARIANTS });

    const fs = require('fs');
    const outPath = path.resolve(__dirname, 'probe-totals.json');
    fs.writeFileSync(outPath, JSON.stringify({ probedAt: new Date().toISOString(), target: inst.url, variants: results }, null, 2));
    console.log('\n=== 总字节对照 ===');
    for (const r of results) {
      console.log(`${r.name}: status=${r.status} CL=${r.contentLength ?? '-'} total=${r.totalBytes ?? '-'} ${r.ms}ms${r.errorBody ? ` err="${r.errorBody.slice(0, 100)}"` : ''}`);
    }
    console.log(`\n原始读数: ${outPath}`);
  } finally {
    await h.close();
  }
})().catch((e) => { console.error('取证失败:', e); process.exit(1); });
