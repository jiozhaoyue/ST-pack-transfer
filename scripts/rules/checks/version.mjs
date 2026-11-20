/**
 * 版本号四处真源一致。
 *
 * 这个仓库有四份各自独立可被读取的版本：
 *   - package.json          → 构建 / npm 元数据
 *   - manifest.json         → 宿主直装（酒馆读这份）
 *   - src/core/app-version.js → 独立态运行期显示（APP_VERSION / APP_COMMIT）
 *   - src/core/changelog.js → 更新弹窗里的「最新版本」
 * 四者没有生成关系，全靠发布时手改，漏一处用户就会看到两个版本号。
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** APP_COMMIT 约定为 `v<version>` */
const COMMIT_PREFIX = 'v';

export async function run(ctx) {
  const pkg = await ctx.readJson('package.json');
  const manifest = await ctx.readJson('manifest.json');

  const appVersionSource = await readFile(path.join(ctx.root, 'src/core/app-version.js'), 'utf8');
  /* 取赋值行里**最后一个**字符串字面量：源码形态是 `typeof __APP_VERSION__ !== 'undefined' ? ... : '0.5.3'`，
     正则会先撞上 'undefined'，所以按行取末尾字面量而不是第一个捕获。 */
  const tailLiteral = (name) => {
    const line = appVersionSource.split('\n').find((item) => new RegExp(`\\b${name}\\s*=`).test(item));
    if (!line) return null;
    const literals = line.match(/'[^']*'/g) || [];
    return literals.length ? literals[literals.length - 1].slice(1, -1) : null;
  };
  const appVersion = tailLiteral('APP_VERSION');
  const appCommit = tailLiteral('APP_COMMIT');

  const changelogSource = await readFile(path.join(ctx.root, 'src/core/changelog.js'), 'utf8');
  const changelogVersion = (/version:\s*'([^']+)'/.exec(changelogSource) || [])[1] || null;

  const sources = [
    ['package.json', pkg.version || null],
    ['manifest.json', manifest.version || null],
    ['src/core/app-version.js APP_VERSION', appVersion],
    ['src/core/app-version.js APP_COMMIT', appCommit ? appCommit.replace(COMMIT_PREFIX, '') : null],
    ['src/core/changelog.js 最新条目', changelogVersion],
  ];

  const missing = sources.filter(([, value]) => !value).map(([name]) => `${name} 无法解析版本号`);
  if (missing.length) return { ok: false, detail: missing.join('\n') };

  const distinct = [...new Set(sources.map(([, value]) => value))];
  const table = sources.map(([name, value]) => `${name}=${value}`).join('，');
  const commitMismatch =
    appCommit && appCommit !== `${COMMIT_PREFIX}${pkg.version}`
      ? [`APP_COMMIT=${appCommit} 与 package.json 版本 ${pkg.version} 不匹配（应为 v${pkg.version}）`]
      : [];

  if (distinct.length > 1 || commitMismatch.length) {
    return {
      ok: false,
      detail: [`版本号出现 ${distinct.length} 个值：${distinct.join(' / ')}`, `明细：${table}`, ...commitMismatch].join(
        '\n',
      ),
    };
  }

  return { ok: true, detail: `${sources.length} 处版本号一致：${distinct[0]}` };
}
