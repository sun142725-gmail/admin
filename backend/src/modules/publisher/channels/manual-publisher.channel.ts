// manual 通道：人工登记发布结果的兜底通道，纯透传零外呼零依赖；
// 未来平台 API / 浏览器自动化通道实现同一 PublisherChannel 接口即扩展点。
import { Injectable } from '@nestjs/common';
import { PublishInput, PublishResult, PublisherPlatform } from '../publisher.types';
import { PublisherChannel } from './publisher-channel.interface';

@Injectable()
export class ManualPublisherChannel implements PublisherChannel {
  // platform 仅作接口占位：manual 是全部平台的人工兜底，registry 按平台枚举全量映射到本实例
  readonly platform: PublisherPlatform = 'other';

  async publish(input: PublishInput): Promise<PublishResult> {
    return { status: 'published', ...input };
  }
}
