// 发布矩阵类型与平台清单：DTO/service/registry/channel 的单一来源。
export const PUBLISHER_PLATFORMS = ['douyin', 'kuaishou', 'bilibili', 'channels', 'xhs', 'other'] as const;

export type PublisherPlatform = (typeof PUBLISHER_PLATFORMS)[number];

export const PUBLISHER_PLATFORM_LABELS: Record<PublisherPlatform, string> = {
  douyin: '抖音',
  kuaishou: '快手',
  bilibili: 'B站',
  channels: '视频号',
  xhs: '小红书',
  other: '其他'
};

// 通道发布输入：manual 通道透传落库；未来平台 API/浏览器自动化通道按平台语义填充。
export interface PublishInput {
  platform: PublisherPlatform;
  title?: string;
  receiptUrl?: string;
  publishedAt: Date;
  note?: string;
}

export interface PublishResult {
  status: string;
  receiptUrl?: string;
  publishedAt: Date;
}
