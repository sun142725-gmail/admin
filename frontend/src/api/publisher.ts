// 发布矩阵 API 封装（后端 /api/publisher，JWT + publisher:view/manage 权限）。
// 凭据安全：明文只出不出——create/update 可传 credentials，任何响应只含 credentialMask 脱敏掩码。
import http from './http';

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

export interface PublisherAccountVo {
  id: number;
  platform: PublisherPlatform;
  accountName: string;
  // 脱敏掩码（如 sk-****7890）；明文/密文永不回传
  credentialMask: string | null;
  status: number;
  remark: string | null;
}

export interface SavePublisherAccountPayload {
  platform: PublisherPlatform;
  accountName: string;
  // 编辑时不传 = 不修改凭据
  credentials?: string;
  status?: number;
  remark?: string;
}

export interface VideoPublishRecordVo {
  id: number;
  novelProjectId: number;
  projectName: string | null;
  platform: PublisherPlatform;
  accountId: number | null;
  accountName: string | null;
  title: string | null;
  status: string;
  publishedAt: string;
  receiptUrl: string | null;
  note: string | null;
}

export interface CreateVideoPublishRecordPayload {
  novelProjectId: number;
  platform: PublisherPlatform;
  accountId?: number;
  title?: string;
  publishedAt: string;
  receiptUrl?: string;
  note?: string;
}

export const listPublisherAccounts = () => http.get<never, PublisherAccountVo[]>('/publisher/accounts');

export const createPublisherAccount = (payload: SavePublisherAccountPayload) =>
  http.post<never, PublisherAccountVo>('/publisher/accounts', payload);

export const updatePublisherAccount = (id: number, payload: Partial<SavePublisherAccountPayload>) =>
  http.patch<never, PublisherAccountVo>(`/publisher/accounts/${id}`, payload);

export const deletePublisherAccount = (id: number) =>
  http.delete<never, { success: boolean }>(`/publisher/accounts/${id}`);

export interface QueryPublisherRecordsParams {
  projectId?: number;
  page?: number;
  pageSize?: number;
}

export interface PublisherRecordsPage {
  items: VideoPublishRecordVo[];
  total: number;
  page: number;
  pageSize: number;
}

export const listPublisherRecords = (params: QueryPublisherRecordsParams) =>
  http.get<never, PublisherRecordsPage>('/publisher/records', { params });

export const createPublisherRecord = (payload: CreateVideoPublishRecordPayload) =>
  http.post<never, VideoPublishRecordVo>('/publisher/records', payload);

export const deletePublisherRecord = (id: number) =>
  http.delete<never, { success: boolean }>(`/publisher/records/${id}`);
