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

  it('uses one vivid accent with always-white target ink', () => {
    expect(TARGET_UI.ink).toBe('#ffffff');
    expect(TARGET_UI.accent).toMatch(/^#[0-9a-f]{6}$/i);
    expect(TARGET_UI.accentStrong).toMatch(/^#[0-9a-f]{6}$/i);
    expect(TARGET_UI.accentSoft).toMatch(/^rgba?\(/);
  });

  it('does not reintroduce per-target accent overrides or a local TARGETS array', () => {
    const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
    expect(css).not.toMatch(/data-target-host="(st|luker|tt|pt)"\]\s*\{[^}]*--accent/s);
    const view = readFileSync(new URL('../src/ui/workbench-view.js', import.meta.url), 'utf8');
    expect(view).not.toMatch(/const TARGETS\s*=\s*\[/);
  });
});
