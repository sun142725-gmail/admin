// classifyMedia / splitMediaOutputs 纯函数单测：扩展名分流口径与 flowRunUI.tsx:44-46 一致。
import { describe, expect, it } from 'vitest';
import { classifyMedia, isPreviewableUrl, splitMediaOutputs } from './MediaPreview';

describe('classifyMedia', () => {
  it('视频扩展名（mp4/mov/webm/m3u8，含查询串）', () => {
    expect(classifyMedia('/uploads/a.mp4')).toBe('video');
    expect(classifyMedia('https://cdn.example.com/a.mov')).toBe('video');
    expect(classifyMedia('https://cdn.example.com/a.webm?t=1')).toBe('video');
    expect(classifyMedia('/uploads/a.m3u8')).toBe('video');
  });

  it('图片扩展名（png/jpe?g/gif/webp/bmp）', () => {
    expect(classifyMedia('/uploads/a.png')).toBe('image');
    expect(classifyMedia('/uploads/a.jpeg')).toBe('image');
    expect(classifyMedia('/uploads/a.jpg')).toBe('image');
    expect(classifyMedia('https://cdn.example.com/a.webp')).toBe('image');
  });

  it('音频扩展名（mp3/wav/ogg/flac/m4a）', () => {
    expect(classifyMedia('/uploads/a.mp3')).toBe('audio');
    expect(classifyMedia('/uploads/a.m4a')).toBe('audio');
  });

  it('大小写不敏感', () => {
    expect(classifyMedia('/uploads/A.MP4')).toBe('video');
    expect(classifyMedia('/uploads/a.PNG')).toBe('image');
  });

  it('非媒体扩展名返回 null', () => {
    expect(classifyMedia('/uploads/a.txt')).toBeNull();
    expect(classifyMedia('/uploads/a.json')).toBeNull();
  });

  it('判定顺序 video 优先于 image（与 flowRunUI 原口径一致）', () => {
    // 同一 URL 不可能同时命中两组扩展名，此处锁定顺序语义：先 video 后 image 后 audio
    expect(classifyMedia('/uploads/x.mp4')).toBe('video');
    expect(classifyMedia('/uploads/x.png')).toBe('image');
  });
});

describe('isPreviewableUrl', () => {
  it('仅 http(s) 与 /uploads/ 相对路径可预览', () => {
    expect(isPreviewableUrl('https://cdn.example.com/a.mp4')).toBe(true);
    expect(isPreviewableUrl('http://example.com/a.mp4')).toBe(true);
    expect(isPreviewableUrl('/uploads/a.mp4')).toBe(true);
    expect(isPreviewableUrl('data:image/png;base64,xxx')).toBe(false);
    expect(isPreviewableUrl('blob:xyz')).toBe(false);
    expect(isPreviewableUrl('a.mp4')).toBe(false);
  });
});

describe('splitMediaOutputs', () => {
  it('媒体键分流到 medias，其余进 rest', () => {
    const { medias, rest } = splitMediaOutputs({
      video: '/uploads/a.mp4',
      audio: '/uploads/a.mp3',
      image: '/uploads/a.png',
      model: 'demo',
      tokens: 1024,
      detail: { seed: 42 }
    });
    expect(medias).toEqual([
      { key: 'video', kind: 'video', url: '/uploads/a.mp4' },
      { key: 'audio', kind: 'audio', url: '/uploads/a.mp3' },
      { key: 'image', kind: 'image', url: '/uploads/a.png' }
    ]);
    expect(rest).toEqual([
      ['model', 'demo'],
      ['tokens', 1024],
      ['detail', { seed: 42 }]
    ]);
  });

  it('不可预览地址（非 http/uploads）即使扩展名匹配也进 rest', () => {
    const { medias, rest } = splitMediaOutputs({ blob: 'blob:abc.mp4' });
    expect(medias).toEqual([]);
    expect(rest).toEqual([['blob', 'blob:abc.mp4']]);
  });

  it('null/空对象返回双空', () => {
    expect(splitMediaOutputs(null)).toEqual({ medias: [], rest: [] });
    expect(splitMediaOutputs({})).toEqual({ medias: [], rest: [] });
  });
});
