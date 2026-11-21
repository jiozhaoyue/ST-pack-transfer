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

  it('src/ui/vue/ 下的 vue 裸包名豁免（vite 构建产物专用，宿主直装由 mount.js 静默降级）', () => {
    // 真实 store.js 的导入形态：具名导入 'vue'
    expect(checkBundlerOnly("import { reactive, computed, ref } from 'vue';\n", 'src/ui/vue/store.js')).toEqual([]);
    expect(checkBundlerOnly("import { createApp } from 'vue';\n", 'src/ui/vue/mount.js')).toEqual([]);
  });

  it('反向断言：src/ui/vue/ 之外或其他裸包名仍一律拦截', () => {
    // 目录不对：即使 spec 是 'vue' 也不放行
    const outside = checkBundlerOnly("import { reactive } from 'vue';\n", 'src/core/store.js');
    expect(outside).toHaveLength(1);
    expect(outside[0].reason).toContain('裸包名');
    // spec 不对：即使在 src/ui/vue/ 目录下，其他裸包名仍拦截
    const otherPkg = checkBundlerOnly("import _ from 'lodash';\n", 'src/ui/vue/helper.js');
    expect(otherPkg).toHaveLength(1);
    expect(otherPkg[0].reason).toContain('裸包名');
    // 典型反向：src/core/xxx.js 里 import 'lodash' 仍 FAIL
    const coreLodash = checkBundlerOnly("import 'lodash';\n", 'src/core/xxx.js');
    expect(coreLodash).toHaveLength(1);
    expect(coreLodash[0].reason).toContain('裸包名');
  });

  it('反向断言：.. 路径构造不得绕过 vue 裸包名豁免（P2-5）', () => {
    // 从 src/ui/vue/ 用 .. 逃到 core：归一后不在豁免目录，必须拦截
    const escapeCore = checkBundlerOnly(
      "import { reactive } from 'vue';\n",
      'src/ui/vue/../../core/store.js',
    );
    expect(escapeCore).toHaveLength(1);
    expect(escapeCore[0].reason).toContain('裸包名');

    // 逃到上一级 src/ui/：同样不在豁免目录
    const escapeParent = checkBundlerOnly(
      "import { createApp } from 'vue';\n",
      'src/ui/vue/../store.js',
    );
    expect(escapeParent).toHaveLength(1);
    expect(escapeParent[0].reason).toContain('裸包名');

    // 前置 .. 让路径看似藏进 vue 目录，实际归一后不在：拦截
    const leadingDots = checkBundlerOnly(
      "import { ref } from 'vue';\n",
      '../../src/ui/vue/mount.js',
    );
    expect(leadingDots).toHaveLength(1);
    expect(leadingDots[0].reason).toContain('裸包名');
  });

  it('反向断言：反斜杠 .. 路径构造同样不得绕过豁免（P2-5）', () => {
    // Windows 分隔符先归一再判前缀，防止 \..\ 绕行
    const backslashEscape = checkBundlerOnly(
      "import { reactive } from 'vue';\n",
      'src\\ui\\vue\\..\\..\\core\\store.js',
    );
    expect(backslashEscape).toHaveLength(1);
    expect(backslashEscape[0].reason).toContain('裸包名');
  });

  it('归一后确实落在 src/ui/vue/ 的路径仍放行（P2-5 防过度拦截）', () => {
    // src/core/../ui/vue/mount.js 归一后 = src/ui/vue/mount.js，属合法豁免
    const normalizedIn = checkBundlerOnly(
      "import { createApp } from 'vue';\n",
      'src/core/../ui/vue/mount.js',
    );
    expect(normalizedIn).toEqual([]);
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
