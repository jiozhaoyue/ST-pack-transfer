/**
 * 产物**前缀过滤** —— 从包里剔除指定前缀的条目，产出新包（其余条目原样搬运）。
 *
 * ## 为什么需要它（2026-10-13 实测）
 *
 * `dev-luker` 的 `data/default-user/extensions/ST-BgLoader` 是指向工作区仓
 * `My-repo/ST-BgLoader` 的 **junction**（`P-19` 那条）。产物里有 **1090 条**
 * `extensions/ST-BgLoader/**`，而 Luker 的原生整包恢复是**服务端一把写完**、客户端无法逐条跳过
 * ⇒ `restore-luker.cjs` 的链接门禁**拒绝启动**（设计如此）。
 *
 * 用户 2026-10-13 裁定：**剔除该子树后再灌入**。本脚本就是那个「剔除」装置 ——
 * 它**只改产物，不碰实例**，产出物随后可安全灌入（穿透写入被彻底消除，而不是靠 `--allow-links` 放行）。
 *
 * ## 用法
 *
 * ```bash
 * node scripts/instance-sync/filter-pack.cjs --in <zip> --out <zip> \
 *      --exclude extensions/ST-BgLoader/ [--exclude <其它前缀>/] [--level 5]
 * ```
 *
 * 前缀按**条目路径**匹配（自动补尾斜杠）；命中即剔除并计数登记。
 *
 * @module scripts/instance-sync/filter-pack
 */

const fs = require('fs');
const path = require('path');

const { getNodeIo } = require('./lib/node-zip-io.cjs');

function parseArgs(argv) {
  const out = { in: '', out: '', exclude: [], level: '5' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--in') out.in = argv[++i] || '';
    else if (a === '--out') out.out = argv[++i] || '';
    else if (a === '--exclude') out.exclude.push(argv[++i] || '');
    else if (a === '--level') out.level = argv[++i] || '5';
  }
  return out;
}

(async () => {
  const args = parseArgs(process.argv.slice(2));
  if (!args.in || !args.out || !args.exclude.length) {
    console.error('用法：node scripts/instance-sync/filter-pack.cjs --in <zip> --out <zip> --exclude <前缀/> [--exclude <前缀/> ...] [--level 5]');
    process.exit(2);
  }
  const prefixes = args.exclude.map((p) => (p.endsWith('/') ? p : `${p}/`));
  const MB = (n) => (n / 1048576).toFixed(1);

  const io = await getNodeIo();
  const reader = await io.openReader(args.in);
  const writer = await io.createWriter(args.out, { level: Number(args.level) });

  let kept = 0;
  let dropped = 0;
  const droppedByPrefix = {};
  for await (const e of reader.entries()) {
    if (e.fileName.endsWith('/')) { e.skip(); continue; }
    const n = e.fileName.replace(/\\/g, '/');
    const hit = prefixes.find((p) => n.startsWith(p));
    if (hit) {
      dropped += 1;
      droppedByPrefix[hit] = (droppedByPrefix[hit] || 0) + 1;
      e.skip();
      continue;
    }
    const data = await e.read();
    await writer.add(n, data);
    kept += 1;
    if (kept % 1000 === 0) console.log(`  已搬运 ${kept} 条…`);
  }
  await reader.close();
  await writer.close();

  const bytes = fs.statSync(args.out).size;
  const report = {
    in: path.basename(args.in), out: path.basename(args.out),
    prefixes, kept, dropped, droppedByPrefix, bytes,
  };
  console.log(`\n完成：保留 ${kept} 条 / 剔除 ${dropped} 条 / ${MB(bytes)} MB`);
  console.log(JSON.stringify(report, null, 2));
})().catch((e) => {
  console.error('过滤失败：', e && e.stack ? e.stack : e);
  process.exit(1);
});
