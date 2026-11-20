import path from 'node:path';
import os from 'node:os';
import { zipIo } from '../src/core/zip-io.js';
import { planEngineConversion } from '../src/core/engine-bridge.js';
import { loadSqlJs } from '../src/core/sqlite-init.js';
import { convert } from '../src/core/transform.js';

const [, , sourcePath, targetEngine = 'fs', outPath] = process.argv;
if (!sourcePath) {
  console.error('用法: node scripts/verify-engine-bridge.mjs <源包> [目标引擎] [产出路径]');
  console.error('  环境变量 VIA_CONVERT=1 时走完整 convert() 管线（含 manifest 等其它条目）');
  process.exit(2);
}
const target = outPath || path.join(os.tmpdir(), `engine-bridge-${Date.now()}.zip`);

if (process.env.VIA_CONVERT === '1') {
  const started = Date.now();
  const layout = process.env.TARGET_LAYOUT || 'l';
  const report = await convert(sourcePath, target, {
    target: layout,
    engine: layout === 'l' ? targetEngine : '',
    compressionLevel: 0,
  });
  const json = report.toJSON();
  console.log(`[convert] ${Date.now() - started}ms → ${target}`);
  console.log('[engine]', JSON.stringify(json.engine));
  console.log('[warnings]', json.warnings?.slice(0, 5));
  process.exit(0);
}

const plan = await planEngineConversion({
  io: zipIo,
  sourcePath,
  targetEngine,
  sqliteInit: loadSqlJs,
  onWarn: (message) => console.warn('[warn]', message),
});
if (!plan.applicable) {
  console.error('[inapplicable]', plan.reason);
  process.exit(1);
}
console.log(`[plan] ${plan.sourceEngine} → ${plan.targetEngine} handle=${plan.handle}`);

const writer = await zipIo.createWriter(target, { level: 0 });
const started = Date.now();
const summary = await plan.emit(writer, { onWarn: (message) => console.warn('[warn]', message) });
await writer.close();
console.log(`[done] ${Date.now() - started}ms → ${target}`);
console.log('[counts]', JSON.stringify(summary.counts));
console.log('[total]', summary.total);
