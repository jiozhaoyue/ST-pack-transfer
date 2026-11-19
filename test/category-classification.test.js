import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ATTACHMENT_KINDS as K,
  attachmentKindOf,
  attachmentKindOfPath,
} from '../src/core/inspect.js';
import { CHART_GROUPS } from '../src/core/chart-model.js';

const chartModelSource = readFileSync(
  new URL('../src/core/chart-model.js', import.meta.url),
  'utf8',
);

describe('附件细分 · 枚举完整性', () => {
  it('ATTACHMENT_KINDS 覆盖全部 9 种取值', () => {
    expect(K).toEqual({
      IMAGE: 'image',
      AUDIO: 'audio',
      VIDEO: 'video',
      DOCUMENT: 'document',
      MODEL: 'model',
      DATABASE: 'database',
      ARCHIVE: 'archive',
      OTHER_BINARY: 'other-binary',
      UNKNOWN: 'unknown',
    });
  });
});

describe('attachmentKindOf · 按扩展名判定（大小写不敏感）', () => {
  // 1) .bin 默认 → other-binary（裁定纠正：本仓 .bin 至少三种互斥语义，
  //    扩展名本身不携带语义，默认 other-binary，语义提升只走路径规则）
  it('1. .bin 默认 → other-binary（绝不归 image）', () => {
    expect(attachmentKindOf('a.bin')).toBe(K.OTHER_BINARY);
    expect(attachmentKindOf('model.bin')).toBe(K.OTHER_BINARY);
    expect(attachmentKindOf('embedding.bin')).not.toBe(K.IMAGE);
    expect(attachmentKindOf('embedding.bin')).not.toBe(K.MODEL);
  });

  // 2) .PNG（大写）→ image
  it('2. 大写 .PNG → image（大小写不敏感）', () => {
    expect(attachmentKindOf('photo.PNG')).toBe(K.IMAGE);
    expect(attachmentKindOf('photo.JpEg')).toBe(K.IMAGE);
  });

  // 3) .onnx / .gguf / .safetensors → model
  it('3. onnx / gguf / safetensors → model', () => {
    expect(attachmentKindOf('m.onnx')).toBe(K.MODEL);
    expect(attachmentKindOf('m.gguf')).toBe(K.MODEL);
    expect(attachmentKindOf('m.safetensors')).toBe(K.MODEL);
  });

  // 4) .sqlite / .db → database，不归其它桶
  it('4. sqlite / db → database', () => {
    expect(attachmentKindOf('memory.sqlite')).toBe(K.DATABASE);
    expect(attachmentKindOf('cache.db')).toBe(K.DATABASE);
    expect(attachmentKindOf('cache.db')).not.toBe(K.IMAGE);
    expect(attachmentKindOf('cache.db')).not.toBe(K.MODEL);
  });

  // 5) .mp3 / .wav → audio
  it('5. mp3 / wav → audio', () => {
    expect(attachmentKindOf('a.mp3')).toBe(K.AUDIO);
    expect(attachmentKindOf('a.WAV')).toBe(K.AUDIO);
  });

  // 6) .mp4 → video
  it('6. mp4 → video', () => {
    expect(attachmentKindOf('v.mp4')).toBe(K.VIDEO);
    expect(attachmentKindOf('v.webm')).toBe(K.VIDEO);
  });

  // 7) .pdf / .md → document
  it('7. pdf / md → document', () => {
    expect(attachmentKindOf('d.pdf')).toBe(K.DOCUMENT);
    expect(attachmentKindOf('README.md')).toBe(K.DOCUMENT);
  });

  // 8) .zip → archive
  it('8. zip → archive', () => {
    expect(attachmentKindOf('pack.zip')).toBe(K.ARCHIVE);
    expect(attachmentKindOf('pack.7z')).toBe(K.ARCHIVE);
  });

  // 9) 无扩展名 → unknown
  it('9. 无扩展名 / 空 → unknown', () => {
    expect(attachmentKindOf('README')).toBe(K.UNKNOWN);
    expect(attachmentKindOf('')).toBe(K.UNKNOWN);
    expect(attachmentKindOf(null)).toBe(K.UNKNOWN);
  });

  // 15) 中文文件名 → image
  it('15. 中文文件名 角色立绘.png → image', () => {
    expect(attachmentKindOf('角色立绘.png')).toBe(K.IMAGE);
  });

  // 双扩展名：PT 包 *.png.bin / *.jpg.bin 实为图片
  it('双扩展名 a.png.bin → image（按前一个扩展名）', () => {
    expect(attachmentKindOf('a.png.bin')).toBe(K.IMAGE);
    expect(attachmentKindOf('a.jpg.bin')).toBe(K.IMAGE);
    expect(attachmentKindOf('a.PNG.BIN')).toBe(K.IMAGE);
  });

  it('边界：其它二进制 wasm → other-binary；未收录扩展名 → unknown', () => {
    expect(attachmentKindOf('mod.wasm')).toBe(K.OTHER_BINARY);
    expect(attachmentKindOf('x.unknownext')).toBe(K.UNKNOWN);
  });
});

describe('attachmentKindOfPath · 路径细分（覆盖扩展名）', () => {
  // 10) assets/bgm/x.bin → audio（路径覆盖扩展名）
  it('10. assets/bgm/x.bin → audio（强语义用途目录覆盖 .bin）', () => {
    expect(attachmentKindOfPath('assets/bgm/x.bin')).toBe(K.AUDIO);
    expect(attachmentKindOf('assets/bgm/x.bin')).toBe(K.AUDIO);
  });

  // 11) assets/vrm/model.bin → model（模型目录提升 .bin）
  it('11. assets/vrm/model.bin → model', () => {
    expect(attachmentKindOfPath('assets/vrm/model.bin')).toBe(K.MODEL);
    expect(attachmentKindOf('assets/vrm/model.bin')).toBe(K.MODEL);
  });

  // 12) backgrounds/x.bin → other-binary（.bin 默认就是 other-binary，
  //     属强类型，覆盖弱图片路径；绝不归 image）
  it('12. backgrounds/x.bin → other-binary（.bin 强类型覆盖弱图片路径）', () => {
    expect(attachmentKindOfPath('backgrounds/x.bin')).toBe(K.OTHER_BINARY);
    expect(attachmentKindOf('backgrounds/x.bin')).toBe(K.OTHER_BINARY);
    expect(attachmentKindOfPath('backgrounds/x.bin')).not.toBe(K.IMAGE);
    // 对照：真图片仍按图片路径判为 image
    expect(attachmentKindOfPath('backgrounds/x.png')).toBe(K.IMAGE);
  });

  // 13) TT 深层路径 data/default-user/assets/x.bin → other-binary（无提升条件）
  it('13. data/default-user/assets/x.bin → other-binary（TT 深层嵌套）', () => {
    expect(attachmentKindOfPath('data/default-user/assets/x.bin')).toBe(K.OTHER_BINARY);
    expect(attachmentKindOf('data/default-user/assets/x.bin')).toBe(K.OTHER_BINARY);
  });

  // 14) assets-archive/x.png 不应命中 assets/ 规则（目录边界）
  it('14. assets-archive/x.png 不命中 assets/ 前缀（目录边界）', () => {
    expect(attachmentKindOfPath('assets-archive/x.png')).toBeNull();
    expect(attachmentKindOf('assets-archive/x.png')).toBe(K.IMAGE); // 回退扩展名
  });

  it('.bin 提升：vectors/index.bin → database；models/x.bin → model；_engine_dump.bin → database', () => {
    expect(attachmentKindOf('vectors/index.bin')).toBe(K.DATABASE);
    expect(attachmentKindOf('models/x.bin')).toBe(K.MODEL);
    expect(attachmentKindOf('_engine_dump.bin')).toBe(K.DATABASE);
    expect(attachmentKindOf('data/default-user/vectors/index.bin')).toBe(K.DATABASE);
  });

  it('边界：无路径线索返回 null；assets/ 下其它子目录按扩展名', () => {
    expect(attachmentKindOfPath('characters/a.json')).toBeNull();
    expect(attachmentKindOfPath('assets/other/data.bin')).toBe(K.OTHER_BINARY);
    expect(attachmentKindOfPath('user/files/doc.pdf')).toBe(K.DOCUMENT);
  });

  it('边界：反斜杠路径统一、assets/ambient/blip、user/images', () => {
    expect(attachmentKindOf('assets\\bgm\\song.bin')).toBe(K.AUDIO);
    expect(attachmentKindOfPath('assets/ambient/a.bin')).toBe(K.AUDIO);
    expect(attachmentKindOfPath('assets/blip/a.wav')).toBe(K.AUDIO);
    expect(attachmentKindOfPath('user/images/pic.png')).toBe(K.IMAGE);
    expect(attachmentKindOfPath('user/images/model.bin')).toBe(K.OTHER_BINARY);
  });

  it('健壮性：超长名 / 中文路径不崩溃', () => {
    const longName = 'a'.repeat(500) + '.bin';
    expect(attachmentKindOf(longName)).toBe(K.OTHER_BINARY);
    expect(attachmentKindOf('资源/角色/模型777.bin')).toBe(K.OTHER_BINARY);
  });
});

describe('chart-model · 附件分组标签（用户可见 bug 回归）', () => {
  it("源码不含 label: '图片'，且 CHART_GROUPS 有 attachments 组", () => {
    expect(chartModelSource).not.toContain("label: '图片'");
    const keys = CHART_GROUPS.map((g) => g.key);
    expect(keys).toContain('attachments');
    expect(keys).not.toContain('images');
    const attachments = CHART_GROUPS.find((g) => g.key === 'attachments');
    expect(attachments.label).toBe('附件');
  });
});
