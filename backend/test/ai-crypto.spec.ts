// 加密工具单测：加解密回环、格式错误、脱敏。
import { decryptSecret, encryptSecret, maskSecret } from '../src/modules/ai/core/crypto.util';

describe('AI crypto util', () => {
  beforeAll(() => {
    process.env.AI_ENCRYPTION_KEY = 'unit-test-secret-key';
  });

  it('should encrypt and decrypt roundtrip', () => {
    const plain = 'sk-test-1234567890abcdef';
    const cipher = encryptSecret(plain);
    expect(cipher).not.toContain(plain);
    expect(decryptSecret(cipher)).toBe(plain);
  });

  it('should produce different ciphertext per call (random iv)', () => {
    expect(encryptSecret('same')).not.toBe(encryptSecret('same'));
  });

  it('should throw on malformed payload', () => {
    expect(() => decryptSecret('bad-format')).toThrow();
  });

  it('should mask secret keeping head and tail', () => {
    expect(maskSecret('sk-1234567890abcd')).toBe('sk-****abcd');
    expect(maskSecret('short')).toBe('****');
  });
});
