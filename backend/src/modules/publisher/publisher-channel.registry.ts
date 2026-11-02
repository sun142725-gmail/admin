// 发布通道注册表用于按平台获取通道适配器（对齐 notification-provider.registry 范式）。
import { Injectable } from '@nestjs/common';
import { PUBLISHER_PLATFORMS } from './publisher.types';
import { ManualPublisherChannel } from './channels/manual-publisher.channel';
import { PublisherChannel } from './channels/publisher-channel.interface';

@Injectable()
export class PublisherChannelRegistry {
  private readonly channelMap: Map<string, PublisherChannel>;

  constructor(manualChannel: ManualPublisherChannel) {
    // manual 即所有平台的人工兜底通道：以平台枚举为键全量映射到同一实例
    this.channelMap = new Map<string, PublisherChannel>(
      PUBLISHER_PLATFORMS.map((platform) => [platform, manualChannel])
    );
  }

  getChannel(platform: string): PublisherChannel | undefined {
    return this.channelMap.get(platform);
  }
}
