// 角色参考图安全读取纯函数单测（无 Nest 容器/无网络）：路径归一限根 / MIME 映射 / data URL 拼装。
// readImageAsDataUrl 属薄 IO 封装不测（AGENTS 规则 4）。
import { join, resolve } from 'path';
import {
  extensionToMime,
  sanitizeImageRelative,
  toDataUrl,
  uploadsRoot
} from '../src/modules/flow/novel/character-ref.util';

describe('sanitizeImageRelative', () => {
  it('files/upload 真实返回格式 /uploads/common/x.jpg 归一为 common/x.jpg（防 uploads/uploads/ 双前缀）', () => {
    expect(sanitizeImageRelative('/uploads/common/x.jpg')).toBe('common/x.jpg');
    expect(sanitizeImageRelative('/uploads/novel-video/p1/shot-c1-s1.jpg')).toBe('novel-video/p1/shot-c1-s1.jpg');
  });

  it('正常相对路径原样返回', () => {
    expect(sanitizeImageRelative('common/x.jpg')).toBe('common/x.jpg');
  });

  it('../ 穿越 → null（.. 段显式拒绝 + resolve 限根双防线）', () => {
    expect(sanitizeImageRelative('../../etc/passwd')).toBeNull();
    expect(sanitizeImageRelative('common/../../etc/passwd')).toBeNull();
    expect(sanitizeImageRelative('a/../../b.jpg')).toBeNull();
    expect(sanitizeImageRelative('..\\windows\\win.ini')).toBeNull();
  });

  it('前导 / 的绝对路径（非 /uploads/ 前缀）→ null', () => {
    expect(sanitizeImageRelative('/etc/passwd')).toBeNull();
  });

  it('空串/纯空白 → null', () => {
    expect(sanitizeImageRelative('')).toBeNull();
    expect(sanitizeImageRelative('   ')).toBeNull();
  });

  it('根目录自身（.）→ null（必须指向根内具体文件）', () => {
    expect(sanitizeImageRelative('.')).toBeNull();
  });
});

describe('extensionToMime', () => {
  it('png/jpg/jpeg 映射正确', () => {
    expect(extensionToMime('.png')).toBe('image/png');
    expect(extensionToMime('.jpg')).toBe('image/jpeg');
    expect(extensionToMime('.jpeg')).toBe('image/jpeg');
    expect(extensionToMime('.PNG')).toBe('image/png');
  });

  it('其余扩展名一律 null（部分上游 images/edits 仅认 jpg/png）', () => {
    expect(extensionToMime('.webp')).toBeNull();
    expect(extensionToMime('.gif')).toBeNull();
    expect(extensionToMime('.pdf')).toBeNull();
    expect(extensionToMime('.txt')).toBeNull();
    expect(extensionToMime('')).toBeNull();
  });
});

describe('toDataUrl', () => {
  it('前缀与 base64 内容正确', () => {
    const buffer = Buffer.from('hello');
    expect(toDataUrl('image/png', buffer)).toBe(`data:image/png;base64,${buffer.toString('base64')}`);
    // 'hello' 的 base64 是确定的
    expect(toDataUrl('image/jpeg', buffer)).toBe('data:image/jpeg;base64,aGVsbG8=');
  });
});

describe('sanitizeImageRelative（真实根目录语义）', () => {
  it('归一结果可拼回 uploads 根内的绝对路径', () => {
    const relative = sanitizeImageRelative('/uploads/common/x.jpg');
    expect(relative).not.toBeNull();
    expect(resolve(uploadsRoot(), relative!)).toBe(join(uploadsRoot(), 'common/x.jpg'));
  });
});
