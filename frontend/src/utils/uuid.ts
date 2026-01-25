const getCrypto = (): Crypto | undefined => {
  if (typeof globalThis === 'undefined') {
    return undefined;
  }
  return globalThis.crypto;
};

const randomBytes = (len: number): Uint8Array => {
  const cryptoObj = getCrypto();
  if (cryptoObj?.getRandomValues) {
    const bytes = new Uint8Array(len);
    cryptoObj.getRandomValues(bytes);
    return bytes;
  }
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return bytes;
};

const bytesToHex = (bytes: Uint8Array): string => {
  const hex: string[] = [];
  bytes.forEach((b) => {
    hex.push(b.toString(16).padStart(2, '0'));
  });
  return hex.join('');
};

const formatUuidV4 = (bytes: Uint8Array): string => {
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytesToHex(bytes);
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
};

export const uuid = (): string => {
  const cryptoObj = getCrypto();
  if (cryptoObj?.randomUUID) {
    return cryptoObj.randomUUID();
  }
  return formatUuidV4(randomBytes(16));
};
