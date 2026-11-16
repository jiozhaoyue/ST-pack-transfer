import { afterAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readGitHistoryFromEntries } from '../src/core/git-local.js';

let hasGit = true;
try {
  execFileSync('git', ['--version'], { stdio: 'ignore' });
} catch {
  hasGit = false;
}

const TMP = [];
afterAll(() => {
  for (const dir of TMP) {
    try { rmSync(dir, { recursive: true, force: true }); } catch { /* 忽略 */ }
  }
});

function walk(dir, prefix = '') {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    const rel = prefix ? `${prefix}/${name}` : name;
    const stat = statSync(full);
    if (stat.isDirectory()) out.push(...walk(full, rel));
    else out.push({ rel, full, size: stat.size });
  }
  return out;
}

async function* entriesOf(repoDir) {
  for (const file of walk(path.join(repoDir, '.git'))) {
    yield {
      fileName: `.git/${file.rel}`,
      uncompressedSize: file.size,
      read: async () => readFileSync(file.full),
    };
  }
}

describe('git-local · 包内 .git 只读解析', () => {
  it('解析 packfile 中的真实提交与分支', async () => {
    if (!hasGit) return;
    const repo = mkdtempSync(path.join(os.tmpdir(), 'stpt-git-local-'));
    TMP.push(repo);
    execFileSync('git', ['init', '-q'], { cwd: repo });
    execFileSync('git', ['config', 'user.email', 'demo@example.com'], { cwd: repo });
    execFileSync('git', ['config', 'user.name', 'Demo'], { cwd: repo });
    writeFileSync(path.join(repo, 'index.js'), 'export const a = 1;\n');
    execFileSync('git', ['add', '.'], { cwd: repo });
    execFileSync('git', ['commit', '-qm', 'first commit'], { cwd: repo });
    writeFileSync(path.join(repo, 'index.js'), 'export const a = 2;\n');
    execFileSync('git', ['commit', '-qam', 'second commit'], { cwd: repo });
    // 打包对象，确保走 packfile 而不是 loose objects。
    execFileSync('git', ['gc', '--quiet'], { cwd: repo });

    const result = await readGitHistoryFromEntries(entriesOf(repo), { extensionName: 'demo' });
    expect(result.ok).toBe(true);
    expect(result.totalCommits).toBeGreaterThanOrEqual(2);
    expect(result.commits.map((c) => c.message)).toContain('first commit');
    expect(result.commits.map((c) => c.message)).toContain('second commit');
    expect(result.branches.length).toBeGreaterThanOrEqual(1);
    expect(result.branches[0].commit).toMatch(/^[0-9a-f]{40}$/);
    expect(result.head).toMatch(/^[0-9a-f]{40}$/);
  });

  it('没有 .git 时如实返回 no-git，不伪造提交', async () => {
    async function* empty() { /* no entries */ }
    const result = await readGitHistoryFromEntries(empty(), { extensionName: 'demo' });
    expect(result).toEqual({ ok: false, reason: 'no-git' });
  });
});
