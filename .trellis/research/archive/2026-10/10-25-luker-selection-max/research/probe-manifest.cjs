/**
 * Luker backup selection 取证 · 第四轮：包内清单定案
 *
 * 前三轮悬点：所有「10 键齐全」变体总量恒 ≈1.79GB（值怎么改都不变），
 * 唯「单键数组」qD 少 76MB。响应头 x-response-time 显示服务端按规范化 selection
 * 指纹缓存 zip（qB 重打包 9.2s，其后 <10ms 复用）。本轮把两个关键变体的包
 **完整存盘**，用 zip central directory 列清单按顶级目录聚合字节——76MB 差异归属定案。
 *
 *   M1 = qA（10 键全 true，现状等价）
 *   M2 = qD（单键 characters:['*.png']）
 *
 * 存盘 research/tmp/*.zip（跑完即删，不进 git）；清单由随后的 python zipfile 步骤产出。
 * 用法：node .trellis/tasks/10-25-luker-selection-max/research/probe-manifest.cjs
 */

const path = require('path');
const fs = require('fs');
const { INSTANCES } = require(path.resolve(__dirname, '..', '..', '..', '..', 'e2e', 'lib', 'instances.cjs'));
const { openInstance } = require(path.resolve(__dirname, '..', '..', '..', '..', 'e2e', 'lib', 'harness.cjs'));

const STD10 = ['characters', 'chats', 'lorebooks', 'presets', 'settings', 'secrets', 'assets', 'extensions', 'globalExtensions', 'vectors'];
const mk = (keys, val) => Object.fromEntries(keys.map((k) => [k, val]));

const VARIANTS = [
  { file: 'M1-std10-true.zip', selection: mk(STD10, true) },
  { file: 'M2-single-array.zip', selection: { characters: ['*.png'] } },
];

(async () => {
  const inst = INSTANCES['dev-luker'];
  const h = await openInstance(inst);
  try {
    await h.goto();
    // 导出认证 cookie 给 Node fetch（页面 fetch 不便流式落盘大文件）
    const cookies = await h.ctx.cookies(inst.url);
    const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
    const me = await h.page.evaluate(async () => (await (await fetch('/api/users/me', { credentials: 'same-origin' })).json()));
    const handle = me.handle;

    fs.mkdirSync(path.resolve(__dirname, 'tmp'), { recursive: true });
    for (const v of VARIANTS) {
      const out = path.resolve(__dirname, 'tmp', v.file);
      const t0 = Date.now();
      const res = await fetch(`${inst.url}/api/users/backup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: cookieHeader },
        body: JSON.stringify({ handle, selection: v.selection }),
      });
      console.log(`${v.file}: status=${res.status} CL=${res.headers.get('content-length') ?? '-'}`);
      if (!res.ok) {
        console.log(`  err="${(await res.text()).slice(0, 200)}"`);
        continue;
      }
      const ws = fs.createWriteStream(out);
      let total = 0;
      for await (const chunk of res.body) {
        ws.write(chunk);
        total += chunk.length;
      }
      await new Promise((r) => ws.end(r));
      console.log(`  total=${total} bytes, ${((Date.now() - t0) / 1000).toFixed(1)}s -> ${out}`);
    }
  } finally {
    await h.close();
  }
})().catch((e) => { console.error('取证失败:', e); process.exit(1); });
