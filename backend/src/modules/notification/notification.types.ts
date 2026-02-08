// 通知模块类型定义与常量。
export const NOTIFICATION_CHANNEL_TYPES = ['inbox', 'feishu'] as const;
export type NotificationChannelType = (typeof NOTIFICATION_CHANNEL_TYPES)[number];

export const NOTIFICATION_VARIABLE_SOURCES = ['user', 'event', 'system', 'custom'] as const;
export type NotificationVariableSource = (typeof NOTIFICATION_VARIABLE_SOURCES)[number];

export const NOTIFICATION_PUBLISH_STATUS = ['pending', 'sending', 'success', 'failed'] as const;
export type NotificationPublishStatus = (typeof NOTIFICATION_PUBLISH_STATUS)[number];

export interface NotificationVariableDefinition {
  key: string;
  label: string;
  source: NotificationVariableSource;
  required?: boolean;
}

export interface NotificationSendMessage {
  recipientId: string;
  title: string;
  content: string;
}

export interface NotificationSendRequest {
  publishId: number;
  channelType: NotificationChannelType;
  messages: NotificationSendMessage[];
}

export interface NotificationSendResult {
  status: NotificationPublishStatus;
  failReason?: string;
  meta?: Record<string, unknown>;
}
