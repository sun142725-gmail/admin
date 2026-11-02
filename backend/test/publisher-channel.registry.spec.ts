// 通道注册表纯单测（不依赖网络与 Nest 容器）：
// manual 通道注册于全部平台；未注册平台返回 undefined（service 判 undefined 抛 BadRequest，语义即未注册报错）。
import { ManualPublisherChannel } from '../src/modules/publisher/channels/manual-publisher.channel';
import { PublisherChannelRegistry } from '../src/modules/publisher/publisher-channel.registry';
import { PUBLISHER_PLATFORMS } from '../src/modules/publisher/publisher.types';

describe('PublisherChannelRegistry', () => {
  const manual = new ManualPublisherChannel();
  const registry = new PublisherChannelRegistry(manual);

  it('manual 通道注册于全部平台：getChannel(平台) 返回同一实例', () => {
    expect(PUBLISHER_PLATFORMS).toEqual(['douyin', 'kuaishou', 'bilibili', 'channels', 'xhs', 'other']);
    for (const platform of PUBLISHER_PLATFORMS) {
      expect(registry.getChannel(platform)).toBe(manual);
    }
    expect(registry.getChannel('douyin')).toBe(manual);
  });

  it('未注册平台（weibo）返回 undefined', () => {
    expect(registry.getChannel('weibo')).toBeUndefined();
  });

  it('manual 通道 publish 纯透传：status=published，零外呼', async () => {
    const publishedAt = new Date('2026-01-01T08:00:00Z');
    const result = await manual.publish({
      platform: 'douyin',
      title: '测试作品',
      receiptUrl: 'https://v.douyin.com/xxx',
      publishedAt,
      note: '手动登记'
    });
    expect(result).toEqual({
      status: 'published',
      platform: 'douyin',
      title: '测试作品',
      receiptUrl: 'https://v.douyin.com/xxx',
      publishedAt,
      note: '手动登记'
    });
  });
});
