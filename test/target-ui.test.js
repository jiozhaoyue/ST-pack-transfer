import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { TARGET_PLATFORMS } from '../src/data/target-platforms.js';
import { TARGET_UI } from '../src/data/target-ui.js';
import { TARGET_PLATFORMS as NAMING_TARGETS } from '../src/core/naming.js';

describe('target platform UI metadata', () => {
  it('has four platforms with unique names and hosts', () => {
    expect(TARGET_PLATFORMS).toHaveLength(4);
    expect(TARGET_PLATFORMS.map((p) => p.code)).toEqual(['st', 'l', 'tt', 'pt']);
    expect(TARGET_PLATFORMS.map((p) => p.host)).toEqual(['st', 'luker', 'tt', 'pt']);
    expect(new Set(TARGET_PLATFORMS.map((p) => p.name)).size).toBe(4);
  });

  it('naming engine derives the same code/name pairs', () => {
    expect(NAMING_TARGETS).toEqual(TARGET_PLATFORMS.map(({ code, name }) => ({ code, name })));
  });

  it('maps every target host to its own brand tokens (no fixed purple single accent)', () => {
    expect(Object.keys(TARGET_UI.byHost)).toEqual(['st', 'luker', 'tt', 'pt']);
    for (const host of ['st', 'luker', 'tt', 'pt']) {
      expect(TARGET_UI.byHost[host].accent).toBe(`var(--brand-${host})`);
      expect(TARGET_UI.byHost[host].ink).toBe(`var(--brand-${host}-ink)`);
      expect(TARGET_UI.byHost[host].ring).toBe(`var(--brand-${host}-ring)`);
    }
  });

  it('does not reintroduce per-target accent overrides or a local TARGETS array', () => {
    const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
    expect(css).not.toMatch(/data-target-host="(st|luker|tt|pt)"\]\s*\{[^}]*--accent/s);
    const view = readFileSync(new URL('../src/ui/workbench-view.js', import.meta.url), 'utf8');
    expect(view).not.toMatch(/const TARGETS\s*=\s*\[/);
  });
});
