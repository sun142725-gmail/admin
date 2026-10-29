// 分镜提示词合成纯函数单测（无 Nest 容器/无网络，范本：hexagram.util.spec.ts）。
import {
  composeShotImagePrompt,
  composeShotMotionPrompt,
  I2V_MOTION_SUFFIX
} from '../src/modules/flow/novel/shot-prompt.util';

describe('composeShotImagePrompt', () => {
  it('按 scenePrompt + visualTask + stylePrompt 顺序拼接非空段', () => {
    const result = composeShotImagePrompt({
      scenePrompt: 'a girl under cherry blossom',
      visualTask: '突出主角面部特写',
      stylePrompt: 'cinematic lighting'
    });
    expect(result).toBe('a girl under cherry blossom, 突出主角面部特写, cinematic lighting');
  });

  it('跳过空段（undefined/null/纯空白）', () => {
    expect(composeShotImagePrompt({ scenePrompt: 'solo scene', visualTask: null, stylePrompt: undefined })).toBe(
      'solo scene'
    );
    expect(composeShotImagePrompt({ scenePrompt: 'solo scene', visualTask: '  ', stylePrompt: '' })).toBe(
      'solo scene'
    );
  });

  it('完全一致的段去重只保留一次（忽略首尾空白）', () => {
    const result = composeShotImagePrompt({
      scenePrompt: 'night city',
      visualTask: 'night city',
      stylePrompt: ' night city '
    });
    expect(result).toBe('night city');
  });

  it('剥掉片段首尾多余的分隔标点后再拼接', () => {
    const result = composeShotImagePrompt({
      scenePrompt: 'a cat,',
      visualTask: '，on the roof',
      stylePrompt: 'warm tone。'
    });
    expect(result).toBe('a cat, on the roof, warm tone');
  });
});

describe('composeShotMotionPrompt', () => {
  it('i2v 模式追加首帧一致性后缀', () => {
    const result = composeShotMotionPrompt({ motionPrompt: 'slow push in', progression: '缓慢推进', shotMode: 'i2v' });
    expect(result).toBe(`slow push in, 缓慢推进, ${I2V_MOTION_SUFFIX}`);
  });

  it('t2v 模式不追加首帧后缀', () => {
    const result = composeShotMotionPrompt({ motionPrompt: 'slow push in', shotMode: 't2v' });
    expect(result).toBe('slow push in');
    expect(result).not.toContain(I2V_MOTION_SUFFIX);
  });

  it('shotMode 缺省按 i2v 语义处理（与实体默认值一致）', () => {
    const result = composeShotMotionPrompt({ motionPrompt: 'pan left', shotMode: null });
    expect(result).toBe(`pan left, ${I2V_MOTION_SUFFIX}`);
  });

  it('progression 与 motionPrompt 相同时去重', () => {
    const result = composeShotMotionPrompt({ motionPrompt: 'zoom out', progression: ' zoom out ', shotMode: 't2v' });
    expect(result).toBe('zoom out');
  });
});
