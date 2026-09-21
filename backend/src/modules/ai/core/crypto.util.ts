// AES-256-GCM 加解密工具：渠道 API Key 落库加密，密钥取环境变量 AI_ENCRYPTION_KEY。
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const loadKey = (): Buffer => createHash('sha256').update(process.env.AI_ENCRYPTION_KEY ?? '').digest();

export const isEncryptionConfigured = (): boolean => Boolean(process.env.AI_ENCRYPTION_KEY);

/** 加密：返回 iv:tag:cipher 三段十六进制。 */
export const encryptSecret = (plain: string): string => {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', loadKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return [iv.toString('hex'), cipher.getAuthTag().toString('hex'), encrypted.toString('hex')].join(':');
};

/** 解密：格式或密钥不符时抛错。 */
export const decryptSecret = (payload: string): string => {
  const [ivHex, tagHex, dataHex] = payload.split(':');
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error('密文格式不合法');
  }
  const decipher = createDecipheriv('aes-256-gcm', loadKey(), Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]).toString('utf8');
};

/** 脱敏展示：保留前 3 后 4。 */
export const maskSecret = (plain: string): string => {
  if (plain.length <= 8) {
    return '****';
  }
  return `${plain.slice(0, 3)}****${plain.slice(-4)}`;
};
