/**
 * Luker /api/users/backup selection 契约取证（任务 10-25-luker-selection-max · R-B1）
 *
 * 取证矩阵（结论三问 + 形状边界）：
 *   qE  10 标准键全 false        —— 最小集基线（端点必然载荷）
 *   qA  10 标准键全 true         —— 现状等价（本仓 FULL_SELECTION 只传标准键）
 *   qB  13 键 backups/cache/fa  false —— Luker 认不认特殊类目键（现状默认行为对照）
 *   qC  13 键全 true             —— 特殊类目全开的包体差分
 *   qD  characters: ['*.png']    —— 非法形状（数组值）探边界
 *   qF  exclude: ['backups/**']  —— 路径级排除形状探边界
 *
 * 每变体：POST 后先读响应头；ok 响应只流式收 ≤64KB 即 cancel（不为取证拉全量包）；
 * 4xx 响应全读错误体（契约边界的直接证据）。dev-luker 实例 config `disableCsrfProtection: true`
 * （取证读数 2026-10-25），故不带 X-CSRF-Token；handle 经 /api/users/me 取权威值。
 *
 * 用法：node .trellis/tasks/10-25-luker-selection-max/research/probe-backup-selection.cjs
 * 只连 Dev Luker（dev-luker.localhost:8003，白名单内；D-12 域名强制）。
 */

const path = require('path');
const { INSTANCES } = require(path.resolve(__dirname, '..', '..', '..', '..', 'e2e', 'lib', 'instances.cjs'));
const { openInstance } = require(path.resolve(__dirname, '..', '..', '..', '..', 'e2e', 'lib', 'harness.cjs'));

const STD10 = ['characters', 'chats', 'lorebooks', 'presets', 'settings', 'secrets', 'assets', 'extensions', 'globalExtensions', 'vectors'];
const mk = (keys, val) => Object.fromEntries(keys.map((k) => [k, val]));

const VARIANTS = [
  { name: 'qE-std10-all-false', selection: mk(STD10, false) },
  { name: 'qA-std10-all-true', selection: mk(STD10, true) },
  {
    name: 'qB-13-special-false',
    selection: { ...mk(STD10, true), backups: false, cache: false, appPrivate: false },
  },
  {
    name: 'qC-13-all-true',
    selection: { ...mk(STD10, true), backups: true, cache: true, appPrivate: true },
  },
  { name: 'qD-shape-array', selection: { characters: ['*.png'] } },
  { name: 'qF-shape-exclude', selection: { ...mk(STD10, true), exclude: ['backups/**'] } },
];

const CAP = 65536; // ok 响应最多收 64KB 即 cancel

(async () => {
  const inst = INSTANCES['dev-luker'];
  if (!inst || inst.side !== 'dev') throw new Error('目标必须是 dev-luker（白名单/D-12 守卫）');

  const h = await openInstance(inst);
  try {
    await h.goto();
    // 登录态与 handle 权威值（同产品代码路径）
    const me = await h.page.evaluate(async () => {
      const r = await fetch('/api/users/me', { credentials: 'same-origin' });
      return { status: r.status, body: await r.text() };
    });
    console.log('[me]', me.status, me.body.slice(0, 200));
    if (me.status !== 200) throw new Error('未认证（session 失效）——需要先人工登录刷新 .pw-profile-dev');
    const handle = JSON.parse(me.body).handle;

    const results = await h.page.evaluate(async ({ handle, variants, cap }) => {
      const out = [];
      for (const v of variants) {
        const t0 = performance.now();
        const rec = { name: v.name, selection: v.selection };
        try {
          const res = await fetch('/api/users/backup', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ handle, selection: v.selection }),
          });
          rec.status = res.status;
          const headers = {};
          res.headers.forEach((val, k) => { headers[k] = val; });
          rec.headers = headers;
          rec.contentLength = res.headers.get('content-length');
          if (res.ok) {
            let received = 0;
            if (res.body) {
              const reader = res.body.getReader();
              while (received < cap) {
                const { done, value } = await reader.read();
                if (done) break;
                received += value.byteLength;
              }
              try { await reader.cancel(); } catch { /* 中断传输即可 */ }
            }
            rec.receivedBeforeCancel = received;
          } else {
            rec.errorBody = (await res.text()).slice(0, 400);
          }
        } catch (e) {
          rec.error = String(e);
        }
        rec.ms = Math.round(performance.now() - t0);
        out.push(rec);
        await new Promise((r) => setTimeout(r, 1200));
      }
      return out;
    }, { handle, variants: VARIANTS, cap: CAP });

    const stamped = {
      probedAt: new Date().toISOString(),
      target: inst.url,
      lukerVersion: '2.7.0 (heads/luker e1dbd1904)',
      handle,
      variants: results,
    };
    const fs = require('fs');
    const outPath = path.resolve(__dirname, 'probe-output.json');
    fs.writeFileSync(outPath, JSON.stringify(stamped, null, 2));
    console.log('\n=== 取证矩阵结果 ===');
    for (const r of results) {
      console.log(
        `${r.name}: status=${r.status} CL=${r.contentLength ?? '-'} firstBytes=${r.receivedBeforeCancel ?? '-'} ${r.ms}ms`
        + (r.errorBody ? ` err="${r.errorBody.slice(0, 120)}"` : ''),
      );
    }
    console.log(`\n原始读数: ${outPath}`);
  } finally {
    await h.close();
  }
})().catch((e) => { console.error('取证失败:', e); process.exit(1); });
