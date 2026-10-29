// SSRF 防护纯函数工具：IP 段判定 / 主机名公网校验 / 响应体限量读取。
// AGENTS 规则 4：IP 段判定与限量读取是纯逻辑（不触网），拆出单测；
// DNS 解析（assertPublicHost 内部）与 HTTP fetch 属网络薄封装，不做单测。
import { lookup } from 'dns/promises';

// ---------- IPv4/IPv6 私网与保留段判定 ----------

const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

const ipv4ToLong = (ip: string): number | null => {
  const match = IPV4_PATTERN.exec(ip);
  if (!match) {
    return null;
  }
  const octets = match.slice(1).map(Number);
  if (octets.some((octet) => octet > 255)) {
    return null;
  }
  // 位运算保持无符号（>>>0）。
  return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
};

// [起始, 结束]（闭区间，长整型）。覆盖环回/私网/链路本地/共享地址/文档与基准段/组播与保留段。
const PRIVATE_IPV4_RANGES: Array<[number, number]> = [
  [0x00000000, 0x00ffffff], // 0.0.0.0/8 本网络
  [0x0a000000, 0x0affffff], // 10.0.0.0/8 私网
  [0x64400000, 0x647fffff], // 100.64.0.0/10 CGNAT 共享地址
  [0x7f000000, 0x7fffffff], // 127.0.0.0/8 环回
  [0xa9fe0000, 0xa9feffff], // 169.254.0.0/16 链路本地（含 169.254.169.254 元数据）
  [0xac100000, 0xac1fffff], // 172.16.0.0/12 私网
  [0xc0000000, 0xc00000ff], // 192.0.0.0/24 IETF 协议保留
  [0xc0000200, 0xc00002ff], // 192.0.2.0/24 TEST-NET-1 文档段
  [0xc0586300, 0xc05863ff], // 192.88.99.0/24 6to4 中继
  [0xc0a80000, 0xc0a8ffff], // 192.168.0.0/16 私网
  [0xc6120000, 0xc613ffff], // 198.18.0.0/15 基准测试
  [0xc6336400, 0xc63364ff], // 198.51.100.0/24 TEST-NET-2 文档段
  [0xcb007100, 0xcb0071ff], // 203.0.113.0/24 TEST-NET-3 文档段
  [0xe0000000, 0xffffffff] // 224.0.0.0/3 组播 + 240.0.0.0/4 保留 + 受限广播
];

const isPrivateIPv4 = (ip: string): boolean => {
  const value = ipv4ToLong(ip);
  if (value === null) {
    return true; // 非法 v4 一律按不公开处理
  }
  return PRIVATE_IPV4_RANGES.some(([start, end]) => value >= start && value <= end);
};

const isPrivateIPv6 = (rawIp: string): boolean => {
  const ip = rawIp.toLowerCase();
  if (ip === '::' || ip === '::1') {
    return true; // 未指定地址 / 环回
  }
  if (ip.startsWith('::ffff:')) {
    // IPv4 映射地址 ::ffff:a.b.c.d → 按内嵌 IPv4 判定
    const embedded = ip.slice('::ffff:'.length);
    return isPrivateIPv4(embedded.includes(':') ? embedded.split(':').pop()! : embedded);
  }
  // 6to4（2002::/16）与 NAT64（64:ff9b::/96）内嵌 IPv4，保守整体拒绝；
  // 文档段 2001:db8::/32、组播 ff00::/8、ULA fc00::/7、链路本地 fe80::/10、
  // 已弃用站点本地 fec0::/10、丢弃段 100::/64。
  return (
    ip.startsWith('2002:') ||
    ip.startsWith('64:ff9b:') ||
    ip.startsWith('2001:db8:') ||
    ip.startsWith('fc') ||
    ip.startsWith('fd') ||
    /^(fe[89abcdef])/.test(ip) ||
    ip.startsWith('ff') ||
    ip.startsWith('100:')
  );
};

/** 判定 IP 是否公网可用（私网/环回/链路本地/保留段/非法值一律返回 false）。 */
export const isPublicIp = (ip: string): boolean => {
  const value = (ip ?? '').trim();
  if (!value) {
    return false;
  }
  return value.includes(':') ? !isPrivateIPv6(value) : !isPrivateIPv4(value);
};

// ---------- 主机名校验（DNS 解析薄封装，不单测） ----------

/**
 * 校验主机名/IP 字面量解析后全部落在公网段；任一地址私有即抛错。
 * 攻击面：环回/私网端口探测、云元数据（169.254.169.254）等。调用方捕获后按下载失败处理。
 */
export const assertPublicHost = async (hostname: string): Promise<void> => {
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (addresses.length === 0) {
    throw new Error(`主机解析不到任何地址: ${hostname}`);
  }
  for (const { address } of addresses) {
    if (!isPublicIp(address)) {
      throw new Error(`主机解析到非公网地址，已拒绝下载: ${hostname} → ${address}`);
    }
  }
};

// ---------- 响应体限量读取 ----------

/**
 * 流式读取响应体，超过 maxBytes 立即中止并返回 null（由调用方按失败处理），
 * 避免超大文件 arrayBuffer 全量入内存。
 */
export const readBodyWithLimit = async (body: ReadableStream<Uint8Array> | null, maxBytes: number): Promise<Buffer | null> => {
  if (!body) {
    return null;
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  if (chunks.length === 0) {
    return null;
  }
  return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
};
