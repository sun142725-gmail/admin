// 通知通道适配器接口定义。
import { NotificationChannelType, NotificationSendRequest, NotificationSendResult } from '../notification.types';

export interface NotificationProvider {
  channelType: NotificationChannelType;
  send(request: NotificationSendRequest): Promise<NotificationSendResult>;
}
