/**
 * file:// 单文件离线产物构建（S7）。
 *
 * 为什么不能直接用 `npm run build` 的产物：那个产物是 `<script type="module">`，
 * 而 `file://` 下 module 脚本必然被 CORS 拒（`public/file-protocol-notice.js` 就是
 * 为此存在的提示）——用户双击只会看到提示页，不是工作台。
 *
 * 本脚本：
 *   1. 用 Vite 既有能力产 **IIFE** 单包（`build.lib` + `formats:['iife']`，零新增依赖）；
 *   2. 把 JS 与 CSS **内联**进单文件 HTML；
 *   3. 注入 `__ST_ZIP_OFFLINE__` ⇒ `worker-client.js` 确定走主线程降级（file:// 下 Worker 不可用）；
 *   4. 内联字体等二进制资源（`assetsInlineLimit` 调高）⇒ 产物**零外部资源请求**。
 *
 * 产出：`dist-offline/ST-pack-transfer-offline.html`（单文件，可双击）。
 * 既有 `npm run build`（GitHub Pages 形态）**不受影响**——本脚本是独立入口。
 */
import { readFile, writeFile, readdir, rm, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { build } from 'vite';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = 'dist-offline';
const OUT_HTML = 'ST-pack-transfer-offline.html';
const LIB_NAME = 'ST-pack-transfer';

/** `</script>` 出现在内联脚本里会提前闭合标签；转义为 `<\/script>`（JS 字符串里等价）。 */
function escapeScriptBody(code) {
  return code.replace(/<\/script/gi, '<\\/script');
}

/** `</style>` 同理（CSS 里出现即闭合）。 */
function escapeStyleBody(code) {
  return code.replace(/<\/style/gi, '<\\/style');
}

/**
 * 剔除**本地副本里根本不存在**的字体格式回退项。
 *
 * Font Awesome 的 `@font-face` 里同时列了 `.woff2`（仓库有）与 `.ttf`（仓库没有，见
 * `src/vendor/fontawesome/webfonts/` 只有 woff2）。Vite 对解析不到的 URL 会原样保留
 * ⇒ 单文件产物里就留下一条 `url(../webfonts/….ttf)` 的**外部引用**，file:// 下必 404。
 * 留着它是无用的回退项（woff2 已是所有目标浏览器都支持的格式），故直接删掉。
 */
function stripMissingFontFallbacks(css) {
  return css
    // 先删「逗号 + ttf/eot/woff/svg 项」
    .replace(/,\s*url\([^)]*\.(?:ttf|eot|woff|svg)[^)]*\)\s*(?:format\([^)]*\))?/gi, '')
    // 再删残留的裸项（万一它是列表第一项）
    .replace(/url\([^)]*\.(?:ttf|eot|woff|svg)[^)]*\)\s*(?:format\([^)]*\))?\s*,?/gi, '');
}

async function findEmitted(dir, predicate) {
  const names = await readdir(dir);
  const hit = names.filter(predicate);
  if (hit.length !== 1) {
    throw new Error(`期望恰好一个匹配产物，实际 ${hit.length} 个：${hit.join(', ')}`);
  }
  return path.join(dir, hit[0]);
}

async function main() {
  const outDir = path.join(ROOT, OUT_DIR);
  if (existsSync(outDir)) await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });

  await build({
    configFile: false,
    root: ROOT,
    base: './',
    logLevel: 'warn',
    // 不复制 public/（离线单文件不需要 file-protocol-notice.js，那是 HTTP 形态的说明页）
    publicDir: false,
    // 离线标记：worker-client.js 见到它直接主线程降级
    define: {
      __ST_ZIP_OFFLINE__: 'true',
      'globalThis.__ST_ZIP_OFFLINE__': 'true',
    },
    resolve: {
      alias: [
        // Worker 构造换成空实现：IIFE 单包构建不接受 `new Worker(new URL(...))`
        // （Vite 的 worker 插件会为它做代码分割，iife 直接报错）。见 worker-factory.js 顶部说明。
        {
          find: /^\.\/worker-factory\.js$/,
          replacement: path.join(ROOT, 'scripts/offline/worker-factory.stub.js'),
        },
      ],
    },
    build: {
      outDir: OUT_DIR,
      emptyOutDir: true,
      cssCodeSplit: false,
      // 字体等资源全部内联为 data URI ⇒ 单文件自包含
      assetsInlineLimit: Number.MAX_SAFE_INTEGER,
      lib: {
        entry: path.join(ROOT, 'scripts/offline/entry.js'),
        name: 'StZipConverter',
        formats: ['iife'],
        fileName: () => `${LIB_NAME}.iife.js`,
      },
      rollupOptions: {
        output: { inlineDynamicImports: true },
      },
    },
  });

  const jsPath = await findEmitted(outDir, (n) => n.endsWith('.iife.js'));
  const cssPath = await findEmitted(outDir, (n) => n.endsWith('.css'));

  const [jsRaw, cssRaw, skeleton] = await Promise.all([
    readFile(jsPath, 'utf8'),
    readFile(cssPath, 'utf8'),
    readFile(path.join(ROOT, 'index.html'), 'utf8'),
  ]);

  const js = jsRaw;
  const css = stripMissingFontFallbacks(cssRaw);

  // 骨架只取 <body> 里的容器：样式与脚本全部由本脚本注入（不引外部文件）
  const bodyMatch = skeleton.match(/<div class="app-container app-standalone" id="app"><\/div>/);
  if (!bodyMatch) {
    throw new Error('index.html 骨架缺少 `#app` 空容器——单一模板源守卫应先拦住这种改动');
  }

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>数据包转运（离线单文件）</title>
<!--
  由 scripts/build-offline.mjs 生成，请勿手工编辑。
  单文件自包含：CSS 与 JS 全部内联，字体已内联为 data URI，file:// 下零外部请求。
-->
<script>window.__ST_ZIP_OFFLINE__ = true;</script>
<style>
${escapeStyleBody(css)}
</style>
</head>
<body>
${bodyMatch[0]}
<script>
${escapeScriptBody(js)}
</script>
</body>
</html>
`;

  const outHtmlPath = path.join(outDir, OUT_HTML);
  await writeFile(outHtmlPath, html, 'utf8');

  // 自检：产物里不得残留对外部资源文件的引用（`http(s)://` 只允许出现在超链接里）
  const externalRefs = [
    ...[...html.matchAll(/(?:src|href)\s*=\s*"(?!data:|#)([^"]+)"/g)].map((m) => m[1]),
    ...[...html.matchAll(/url\(\s*['"]?(?!data:)([^'")]+)['"]?\s*\)/g)].map((m) => m[1]),
  ];
  const badRefs = externalRefs.filter((u) => !u.startsWith('https://github.com/'));

  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
  console.log(`离线单文件产物：${path.relative(ROOT, outHtmlPath)}`);
  console.log(`  体积：${kb(Buffer.byteLength(html, 'utf8'))}（CSS ${kb(Buffer.byteLength(css, 'utf8'))} / JS ${kb(Buffer.byteLength(js, 'utf8'))}）`);
  console.log(`  外部资源引用：${badRefs.length === 0 ? '0（自包含）' : badRefs.join(', ')}`);
  console.log(`  其它引用（超链接，不发请求）：${externalRefs.filter((u) => u.startsWith('https://github.com/')).length}`);
  const inlineFonts = (css.match(/data:font|data:application\/font/gi) || []).length;
  console.log(`  内联字体：${inlineFonts} 处`);

  if (badRefs.length > 0) {
    console.error('离线产物仍引用外部资源，不能声称自包含');
    process.exitCode = 1;
  }
}

await main();
