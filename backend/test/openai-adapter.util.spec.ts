// OpenAI 兼容适配器纯函数单测：imageEdits 参考图文件名按 MIME 定扩展名（小而快，不起容器）。
import { extensionForMime } from '../src/modules/ai/core/adapters/openai-compatible.adapter';

describe('extensionForMime', () => {
  it('image/png → png', () => {
    expect(extensionForMime('image/png')).toBe('png');
  });

  it('image/jpeg → jpg（参考图文件名不再一律 .png）', () => {
    expect(extensionForMime('image/jpeg')).toBe('jpg');
    expect(extensionForMime('image/jpg')).toBe('jpg');
  });

  it('image/webp → webp', () => {
    expect(extensionForMime('image/webp')).toBe('webp');
  });

  it('未知/缺失 MIME 兜底 png', () => {
    expect(extensionForMime('application/octet-stream')).toBe('png');
    expect(extensionForMime(undefined)).toBe('png');
    expect(extensionForMime('')).toBe('png');
  });
});
