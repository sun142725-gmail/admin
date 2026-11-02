// 发布通道适配器接口（对齐 notification providers 范式）。
import { PublishInput, PublishResult, PublisherPlatform } from '../publisher.types';

export interface PublisherChannel {
  readonly platform: PublisherPlatform;
  publish(input: PublishInput): Promise<PublishResult>;
}
