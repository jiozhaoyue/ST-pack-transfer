import { describe, it, expect } from 'vitest';
import { checkBundlerOnly } from '../tooling/no-bundler-only.js';

describe('宿主直装守卫 · 只能在打包器里成立的写法', () => {
  it('静态 JSON 导入被拦（本次宿主事故的根因）', () => {
    const v = checkBundlerOnly("import data from './demo.json';\n");
    expect(v).toHaveLength(1);
    expect(v[0].reason).toContain('JSON');
  });

  it('带 with { type: json } 的 JSON 导入放行（浏览器原生支持）', () => {
    expect(checkBundlerOnly("import data from './demo.json' with { type: 'json' };\n")).toEqual([]);
  });

  it('静态 node: 内置模块被拦；函数体里的动态导入放行', () => {
    expect(checkBundlerOnly("import fs from 'node:fs/promises';\n")).toHaveLength(1);
    expect(checkBundlerOnly("async function f(){ return import('node:fs/promises'); }\n")).toEqual([]);
  });

  it('裸包名被拦（宿主不解析 node_modules）', () => {
    const v = checkBundlerOnly("import * as zip from '@zip.js/zip.js';\n");
    expect(v).toHaveLength(1);
    expect(v[0].reason).toContain('裸包名');
  });

  it('Vite 专有语法被拦', () => {
    expect(checkBundlerOnly("import a from './a.js?raw';\n")).toHaveLength(1);
    expect(checkBundlerOnly('const x = import.meta.env.MODE;\n')).toHaveLength(1);
    expect(checkBundlerOnly("const y = import.meta.glob('./x/*.js');\n")).toHaveLength(1);
  });

  it('相对 JS 导入与注释里的示例不误报', () => {
    expect(checkBundlerOnly("import a from './a.js';\n// import b from './b.json'\n")).toEqual([]);
    expect(checkBundlerOnly("const s = \"import c from 'node:fs'\";\n")).toEqual([]);
  });
});
