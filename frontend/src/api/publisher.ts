// 发布矩阵 API 封装（后端 /api/publisher，JWT + publisher:view/manage 权限）。
// 凭据安全：明文只出不出——create/update 可传 credentials，任何响应只含 credentialMask 脱敏掩码。
import axios from 'axios';
import http from './http';
import { store } from '../store';

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

// ---- 数据回流指标（平台按日数据 CSV 导入 / 模板 / 明细）----

export interface PlatformMetricVo {
  id: number;
  novelProjectId: number;
  projectName: string | null;
  platform: PublisherPlatform;
  // ISO 字符串（后端统一存 UTC 零点）
  metricDate: string;
  videoId: string;
  views: number;
  likes: number;
  comments: number;
  follows: number;
  remark: string | null;
  // isHot 不入 VO：由前端 utils/metrics.ts 同口径纯函数计算，避免双端口径漂移
}

export interface QueryPlatformMetricsParams {
  projectId?: number;
  platform?: PublisherPlatform;
  from?: string;
  to?: string;
}

export const listPlatformMetrics = (params: QueryPlatformMetricsParams) =>
  http.get<never, PlatformMetricVo[]>('/publisher/metrics', { params });

export interface MetricRejectedRow {
  line: number;
  reason: string;
}

export interface ImportPlatformMetricsResult {
  received: number;
  inserted: number;
  updated: number;
  rejected: MetricRejectedRow[];
}

// axios 自动 multipart（FormData），JSON envelope 正常解包
export const importPlatformMetrics = (formData: FormData) =>
  http.post<never, ImportPlatformMetricsResult>('/publisher/metrics/import', formData);

// 模板下载不能走 http 封装：http.ts 响应拦截器对所有响应做 payload?.code!==0 检查，
// blob 无 code 字段会被误判 reject——裸 axios 直取 Blob 后走 createObjectURL 落盘
// （照 http.ts:229 裸 axios 先例与 utils/csv.ts downloadCsv 落盘模式）。
export const downloadMetricsTemplate = async (): Promise<void> => {
  const response = await axios.get('/api/publisher/metrics/template', {
    responseType: 'blob',
    headers: { Authorization: `Bearer ${store.getState().auth.accessToken}` }
  });
  const blob = new Blob([response.data as BlobPart], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'publisher-metrics-template.csv';
  anchor.click();
  URL.revokeObjectURL(url);
};
