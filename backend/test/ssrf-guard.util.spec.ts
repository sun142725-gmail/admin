// SSRF 防护纯函数单测：IP 段判定（isPublicIp）与响应体限量读取（readBodyWithLimit）。
// 网络部分（dns 解析 / fetch）为薄封装不做单测（AGENTS 规则 4），由 prompt-library e2e
// 的内网 imageUrl 用例端到端覆盖。
import { isPublicIp, readBodyWithLimit } from '../src/modules/prompt-library/ssrf-guard.util';

const streamFrom = (chunks: string[]): ReadableStream<Uint8Array> =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    }
  });

describe('isPublicIp：私网/环回/链路本地/保留段判定', () => {
  it.each([
    ['8.8.8.8', '公网 DNS'],
    ['1.1.1.1', '公网'],
    ['172.15.255.255', '172.16/12 下界外'],
    ['172.32.0.1', '172.16/12 上界外'],
    ['100.63.255.255', 'CGNAT 下界外'],
    ['100.128.0.1', 'CGNAT 上界外'],
    ['169.255.0.1', '链路本地上界外'],
    ['198.20.0.1', '基准测试段外'],
    ['9.9.9.9', '公网']
  ])('公网 IPv4 %s（%s）→ true', (ip) => {
    expect(isPublicIp(ip)).toBe(true);
  });

  it.each([
    ['0.0.0.0', '本网络'],
    ['10.1.2.3', '私网 10/8'],
    ['100.64.0.1', 'CGNAT'],
    ['127.0.0.1', '环回'],
    ['169.254.169.254', '云元数据'],
    ['172.16.0.1', '私网 172.16/12'],
    ['172.31.255.255', '私网 172.16/12 上界'],
    ['192.0.0.1', 'IETF 保留'],
    ['192.0.2.1', 'TEST-NET-1'],
    ['192.168.1.1', '私网 192.168/16'],
    ['198.18.0.1', '基准测试'],
    ['198.51.100.7', 'TEST-NET-2'],
    ['203.0.113.9', 'TEST-NET-3'],
    ['224.0.0.1', '组播'],
    ['240.0.0.1', '保留段'],
    ['255.255.255.255', '受限广播']
  ])('私有/保留 IPv4 %s（%s）→ false', (ip) => {
    expect(isPublicIp(ip)).toBe(false);
  });

  it.each([
    ['::', '未指定'],
    ['::1', '环回'],
    ['fe80::1', '链路本地'],
    ['feb0::1', '链路本地上界内'],
    ['fec0::1', '已弃用站点本地'],
    ['fc00::1', 'ULA'],
    ['fd12:3456::1', 'ULA'],
    ['ff02::1', '组播'],
    ['2001:db8::1', '文档段'],
    ['2002:0a00:0001::', '6to4 内嵌私网'],
    ['64:ff9b::808:808', 'NAT64'],
    ['100::1', '丢弃段'],
    ['::ffff:127.0.0.1', 'IPv4 映射环回'],
    ['::ffff:10.0.0.1', 'IPv4 映射私网']
  ])('私有/保留 IPv6 %s（%s）→ false', (ip) => {
    expect(isPublicIp(ip)).toBe(false);
  });

  it.each([
    ['2606:4700:4700::1111', '公网 v6'],
    ['2001:4860:4860::8888', '公网 v6'],
    ['::ffff:8.8.8.8', 'IPv4 映射公网']
  ])('公网 IPv6 %s（%s）→ true', (ip) => {
    expect(isPublicIp(ip)).toBe(true);
  });

  it.each([['', '空串'], ['abc', '非 IP'], ['999.999.999.999', '非法八位组'], ['1.2.3', '段数不足']])(
    '非法输入 %s（%s）→ false（按不可公开处理）',
    (ip) => {
      expect(isPublicIp(ip)).toBe(false);
    }
  );
});

describe('readBodyWithLimit：响应体限量读取', () => {
  it('body 为 null → null', async () => {
    await expect(readBodyWithLimit(null, 1024)).resolves.toBeNull();
  });

  it('未超限 → 返回完整内容', async () => {
    const buffer = await readBodyWithLimit(streamFrom(['hello ', 'world']), 1024);
    expect(buffer!.toString('utf8')).toBe('hello world');
  });

  it('超过上限 → 立即中止返回 null（不整量入内存）', async () => {
    const buffer = await readBodyWithLimit(streamFrom(['a'.repeat(600), 'b'.repeat(600)]), 1024);
    expect(buffer).toBeNull();
  });

  it('恰好等于上限 → 正常返回（仅严格大于才拒绝）', async () => {
    const buffer = await readBodyWithLimit(streamFrom(['a'.repeat(1024)]), 1024);
    expect(buffer!.length).toBe(1024);
  });

  it('空流 → null', async () => {
    await expect(readBodyWithLimit(streamFrom([]), 1024)).resolves.toBeNull();
  });
});
