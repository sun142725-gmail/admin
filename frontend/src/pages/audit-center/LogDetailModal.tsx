// 日志详情弹窗：字段行 + HTTP 捕获快照 + JSON 视图（从 AuditCenterPage.tsx:283-297/:661-842/:1013-1056 拆出，行为零改动）。
import React from 'react';
import Button from 'antd/es/button';
import Space from 'antd/es/space';
import { CopyOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { SelfModal } from '../../components/base/SelfModal';
import { JsonView } from '../../components/JsonView';
import { parseUserAgent } from '../../utils/ua';
import type { LogEventType, LogItem } from '../../api/logCenter';

type AuditItem = LogItem;

// 文本字段若本身就是 JSON（审计 detail 等自由文本），解析后走 JSON 视图展示
const parseMaybeJson = (text?: string): unknown | undefined => {
  if (!text) {
    return undefined;
  }
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return undefined;
  }
  try {
    return JSON.parse(trimmed);
  } catch {
    return undefined;
  }
};

const formatTime = (value?: string) => {
  if (!value) {
    return '-';
  }
  return dayjs(value).format('YYYY-MM-DD HH:mm:ss');
};

interface LogDetailModalProps {
  detail: AuditItem | null;
  loading: boolean;
  /** 详情行类型：主文件按 isListTab(activeTab) 归一后传入（非列表页签回退 'error'）。 */
  type: 'audit' | LogEventType;
  sourceLabelMap: Record<string, string>;
  onClose: () => void;
  onTrace: (traceId: string) => void;
  /** 复制到剪贴板（含成功/失败消息），主文件传入统一实现。 */
  onCopy: (text: string, tip?: string) => void;
  onNavigateSession: (sessionId: string, source?: string) => void;
}

export const LogDetailModal: React.FC<LogDetailModalProps> = ({
  detail,
  loading,
  type,
  sourceLabelMap,
  onClose,
  onTrace,
  onCopy,
  onNavigateSession
}) => {
  const formatSource = (value?: string) => {
    if (!value) {
      return '-';
    }
    return sourceLabelMap[value] ?? value;
  };

  // 字段行：值 + 可选复制按钮
  const FieldRow: React.FC<{ label: string; copyText?: string; children: React.ReactNode }> = ({
    label,
    copyText,
    children
  }) => (
    <p className="break-all">
      {label}: {children}
      {copyText && (
        <Button type="link" size="small" onClick={() => onCopy(copyText)}>
          复制
        </Button>
      )}
    </p>
  );

  const detailRows = (rowType: 'audit' | LogEventType, item: AuditItem) => {
    if (rowType === 'audit') {
      const detailJson = parseMaybeJson(item.detail);
      return (
        <>
          <FieldRow label="用户" copyText={item.userId != null ? String(item.userId) : undefined}>
            {item.userId ?? '-'}
          </FieldRow>
          <FieldRow label="模块">{item.module ?? '-'}</FieldRow>
          <FieldRow label="动作">{item.action ?? '-'}</FieldRow>
          <FieldRow label="IP" copyText={item.ip}>
            {item.ip ?? '-'}
          </FieldRow>
          {item.traceId && (
            <FieldRow label="TraceId" copyText={item.traceId}>
              {item.traceId}
            </FieldRow>
          )}
          <FieldRow label="时间">{formatTime(item.createdAt)}</FieldRow>
          {detailJson !== undefined ? (
            <div>
              详情（JSON）:
              <JsonView value={detailJson} />
            </div>
          ) : (
            <FieldRow label="详情">{item.detail ?? '-'}</FieldRow>
          )}
        </>
      );
    }
    // API 捕获（慢请求/失败请求带完整请求与响应快照）结构化展示
    const metaRequest = item.meta?.request as
      | { method?: string; host?: string; url?: string; query?: unknown; headers?: unknown; body?: unknown }
      | undefined;
    const metaResponse = item.meta?.response as
      | { status?: number; duration?: number; headers?: unknown; body?: unknown }
      | undefined;
    const hasCapture = Boolean(metaRequest || metaResponse);
    // 环境拆行：前端/错误事件读注入的 meta.env；打点等老数据回退解析 userAgent（无屏幕/语言/版本）
    const metaEnv = item.meta?.env as
      | {
          browser?: string;
          browserVersion?: string;
          os?: string;
          osVersion?: string;
          device?: string;
          model?: string;
          screen?: string;
          language?: string;
          appVersion?: string;
        }
      | undefined;
    const uaInfo = !metaEnv && item.userAgent ? parseUserAgent(item.userAgent) : null;
    const envRows: Array<[string, string]> = [];
    if (metaEnv) {
      if (metaEnv.browser) {
        envRows.push(['浏览器', metaEnv.browserVersion ? `${metaEnv.browser} ${metaEnv.browserVersion}` : metaEnv.browser]);
      }
      if (metaEnv.os) {
        envRows.push(['操作系统', metaEnv.osVersion ? `${metaEnv.os} ${metaEnv.osVersion}` : metaEnv.os]);
      }
      if (metaEnv.model) {
        envRows.push(['机型', metaEnv.model]);
      }
      if (metaEnv.device) {
        envRows.push(['设备', metaEnv.device]);
      }
      if (metaEnv.screen) {
        envRows.push(['屏幕', metaEnv.screen]);
      }
      if (metaEnv.language) {
        envRows.push(['语言', metaEnv.language]);
      }
      if (metaEnv.appVersion) {
        envRows.push(['版本', metaEnv.appVersion]);
      }
    }
    return (
      <>
        <FieldRow label="用户" copyText={item.userId != null ? String(item.userId) : undefined}>
          {item.userId ?? '-'}
        </FieldRow>
        <FieldRow label="TraceId" copyText={item.traceId}>
          {item.traceId ?? '-'}
        </FieldRow>
        <FieldRow label="SessionId" copyText={item.sessionId}>
          {item.sessionId ?? '-'}
        </FieldRow>
        <FieldRow label="来源">{formatSource(item.source)}</FieldRow>
        <FieldRow label="时间">{formatTime(item.createdAt)}</FieldRow>
        {'pageCode' in item && <FieldRow label="页面码">{item.pageCode ?? '-'}</FieldRow>}
        {'path' in item && (
          <FieldRow label="路径" copyText={item.path}>
            {item.path ?? '-'}
          </FieldRow>
        )}
        {envRows.length > 0 ? (
          <>
            {envRows.map(([label, value]) => (
              <FieldRow key={label} label={label}>
                {value}
              </FieldRow>
            ))}
          </>
        ) : uaInfo ? (
          <>
            <FieldRow label="Useragent" copyText={item.userAgent}>
              {item.userAgent}
            </FieldRow>
            <FieldRow label="浏览器">
              {uaInfo.browserVersion ? `${uaInfo.browser} ${uaInfo.browserVersion}` : uaInfo.browser}
            </FieldRow>
            <FieldRow label="操作系统">
              {uaInfo.osVersion ? `${uaInfo.os} ${uaInfo.osVersion}` : uaInfo.os}
            </FieldRow>
            {uaInfo.model && <FieldRow label="机型">{uaInfo.model}</FieldRow>}
            <FieldRow label="设备">{uaInfo.device}</FieldRow>
          </>
        ) : (
          'userAgent' in item && <FieldRow label="Useragent">-</FieldRow>
        )}
        {'referrer' in item && <FieldRow label="Referrer">{item.referrer ?? '-'}</FieldRow>}
        {'level' in item && <FieldRow label="级别">{item.level ?? '-'}</FieldRow>}
        {'category' in item && <FieldRow label="分类">{item.category ?? '-'}</FieldRow>}
        {'message' in item && (
          <FieldRow label="消息" copyText={item.message}>
            {item.message ?? '-'}
          </FieldRow>
        )}
        {metaRequest && (
          <div className="mt-2">
            {`请求 ${metaRequest.method ?? ''} ${metaRequest.url ?? ''}`.trim()}
            {metaRequest.host ? `（${metaRequest.host}）` : ''}:
            {metaRequest.query !== undefined && (
              <div>
                Query:
                <JsonView value={metaRequest.query} maxHeight={120} />
              </div>
            )}
            {metaRequest.headers !== undefined && (
              <div>
                请求头:
                <JsonView value={metaRequest.headers} maxHeight={160} />
              </div>
            )}
            {metaRequest.body !== undefined && (
              <div>
                请求体:
                <JsonView value={metaRequest.body} maxHeight={200} />
              </div>
            )}
          </div>
        )}
        {metaResponse && (
          <div className="mt-2">
            {`响应${metaResponse.status != null ? ` ${metaResponse.status}` : ''}${
              metaResponse.duration != null ? ` · ${metaResponse.duration}ms` : ''
            }:`}
            {metaResponse.headers !== undefined && (
              <div>
                响应头:
                <JsonView value={metaResponse.headers} maxHeight={160} />
              </div>
            )}
            {metaResponse.body !== undefined && <JsonView value={metaResponse.body} maxHeight={220} />}
          </div>
        )}
        {Boolean(item.stack) && (
          <div>
            堆栈:
            <pre className="log-detail-pre">{item.stack}</pre>
          </div>
        )}
        {item.meta && !hasCapture && (
          <div>
            元数据（JSON）:
            <JsonView value={item.meta} />
          </div>
        )}
      </>
    );
  };

  return (
    <SelfModal
      title="日志详情"
      open={!!detail || loading}
      onCancel={onClose}
      footer={null}
      confirmLoading={loading}
    >
      {loading && !detail ? (
        <p>加载中…</p>
      ) : (
        detail && (
          <div>
            <Space className="mb-2" wrap>
              <Button
                size="small"
                icon={<CopyOutlined />}
                onClick={() => onCopy(JSON.stringify(detail, null, 2), '已复制整条 JSON')}
              >
                复制整条 JSON
              </Button>
              {detail.traceId && (
                <Button size="small" onClick={() => onTrace(detail.traceId!)}>
                  查看链路
                </Button>
              )}
              {detail.sessionId && (
                <Button
                  size="small"
                  onClick={() => onNavigateSession(detail.sessionId!, detail.source)}
                >
                  会话链路
                </Button>
              )}
            </Space>
            {detailRows(type, detail)}
          </div>
        )
      )}
    </SelfModal>
  );
};
