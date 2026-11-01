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

// ---------- 真实中文数据扩展（素材口径见 fixtures/novel-fixtures.ts 头注释，仿写非原文） ----------

describe('composeShotImagePrompt（真实中文数据）', () => {
  it('中文 visualTask/stylePrompt 与英文 scenePrompt 拼接顺序保持不变', () => {
    const result = composeShotImagePrompt({
      scenePrompt: 'ancient bronze coffin hovering over desert, starry sky',
      visualTask: '青铜古棺悬浮坑底，九点暗芒如眼',
      stylePrompt: '国风玄幻，冷色调，电影感构图'
    });
    expect(result).toBe(
      'ancient bronze coffin hovering over desert, starry sky, 青铜古棺悬浮坑底，九点暗芒如眼, 国风玄幻，冷色调，电影感构图'
    );
  });

  it('重复的中文段去重只保留一次', () => {
    const result = composeShotImagePrompt({
      scenePrompt: '夜空下的戈壁滩',
      visualTask: '科考队仰望天穹',
      stylePrompt: '科考队仰望天穹'
    });
    expect(result).toBe('夜空下的戈壁滩, 科考队仰望天穹');
  });

  it('全中文标点首尾剥离（，、。）后再拼接', () => {
    const result = composeShotImagePrompt({
      scenePrompt: '荒原夜景，',
      visualTask: '，主角侧影渺小、',
      stylePrompt: '。冷色调星空。'
    });
    expect(result).toBe('荒原夜景, 主角侧影渺小, 冷色调星空');
  });
});

describe('composeShotMotionPrompt（真实中文数据）', () => {
  it('中文 progression 与英文 motionPrompt 拼接，i2v 追加首帧一致性后缀', () => {
    const result = composeShotMotionPrompt({
      motionPrompt: 'slow dolly-in toward the coffin',
      progression: '缓慢推进',
      shotMode: 'i2v'
    });
    expect(result).toBe(`slow dolly-in toward the coffin, 缓慢推进, ${I2V_MOTION_SUFFIX}`);
  });

  it('中文段重复时去重且 t2v 不追加后缀', () => {
    const result = composeShotMotionPrompt({ motionPrompt: '俯瞰坑底', progression: '俯瞰坑底', shotMode: 't2v' });
    expect(result).toBe('俯瞰坑底');
  });
});

// ---------- 角色一致性注入：characterDescriptions 段（位置在 scenePrompt 与 visualTask 之间） ----------

describe('composeShotImagePrompt（characterDescriptions）', () => {
  it('拼接顺序 scenePrompt → 角色描述（逐条）→ visualTask → stylePrompt', () => {
    const result = composeShotImagePrompt({
      scenePrompt: 'a girl standing by the window',
      characterDescriptions: ['林晚: 银白长发，红瞳，黑色风衣', '阿凛: 短发少年，蓝色卫衣'],
      visualTask: '突出两人对视的瞬间',
      stylePrompt: 'cinematic lighting'
    });
    expect(result).toBe(
      'a girl standing by the window, 林晚: 银白长发，红瞳，黑色风衣, 阿凛: 短发少年，蓝色卫衣, 突出两人对视的瞬间, cinematic lighting'
    );
  });

  it('characterDescriptions 缺省/空数组/含空段时输出与旧版逐字节一致（回归）', () => {
    const base = { scenePrompt: 'night city', visualTask: '霓虹雨夜', stylePrompt: 'cold tone' };
    expect(composeShotImagePrompt(base)).toBe('night city, 霓虹雨夜, cold tone');
    expect(composeShotImagePrompt({ ...base, characterDescriptions: [] })).toBe('night city, 霓虹雨夜, cold tone');
    expect(composeShotImagePrompt({ ...base, characterDescriptions: [null, undefined, '  '] })).toBe(
      'night city, 霓虹雨夜, cold tone'
    );
  });

  it('角色描述与 visualTask 完全一致时去重只保留一次', () => {
    const result = composeShotImagePrompt({
      scenePrompt: 'a lone cabin',
      characterDescriptions: ['林晚: 红瞳'],
      visualTask: '林晚: 红瞳',
      stylePrompt: null
    });
    expect(result).toBe('a lone cabin, 林晚: 红瞳');
  });

  it('描述串首尾分隔标点剥离后再拼接（normalizeSegment 复用）', () => {
    const result = composeShotImagePrompt({
      scenePrompt: 'a lone cabin,',
      characterDescriptions: ['，林晚。'],
      visualTask: null,
      stylePrompt: null
    });
    expect(result).toBe('a lone cabin, 林晚');
  });

  it('真实中文数据：主角色在前，描述与中文风格段拼接顺序不变', () => {
    const result = composeShotImagePrompt({
      scenePrompt: 'ancient bronze coffin hovering over desert, starry sky',
      characterDescriptions: ['林晚: 银白长发，黑色风衣，冷漠气质'],
      visualTask: '青铜古棺悬浮坑底，九点暗芒如眼',
      stylePrompt: '国风玄幻，冷色调，电影感构图'
    });
    expect(result).toBe(
      'ancient bronze coffin hovering over desert, starry sky, 林晚: 银白长发，黑色风衣，冷漠气质, 青铜古棺悬浮坑底，九点暗芒如眼, 国风玄幻，冷色调，电影感构图'
    );
  });
});
