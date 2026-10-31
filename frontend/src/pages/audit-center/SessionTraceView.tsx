// 会话链路视图：按 SessionId + 来源还原一个用户会话的完整请求流（PV/API/错误/服务端 5xx），
// 按天分组折叠，点击某一天展开当天全部事件，每条可下钻详情。
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Button from 'antd/es/button';
import Card from 'antd/es/card';
import Collapse from 'antd/es/collapse';
import { Col } from 'antd/es/grid';
import Empty from 'antd/es/empty';
import Input from 'antd/es/input';
import { Row } from 'antd/es/grid';
import Select from 'antd/es/select';
import Space from 'antd/es/space';
import Spin from 'antd/es/spin';
import Statistic from 'antd/es/statistic';
import Tag from 'antd/es/tag';
import dayjs from 'dayjs';
import { getSessionTrace, LogEventType, LogItem, TraceResult } from '../../api/logCenter';
import { SelfTable } from '../../components/base/SelfTable';
import { useApiMessage } from '../../hooks/useApiMessage';

type SessionEntry = { type: LogEventType; item: LogItem };

interface Props {
  sourceOptions: Array<{ value: string; label: string }>;
  onShowDetail: (type: LogEventType, item: LogItem) => void;
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

const LEVEL_COLOR: Record<string, string> = {
  debug: 'default',
  info: 'blue',
  warn: 'orange',
  error: 'red'
};

export const SessionTraceView: React.FC<Props> = ({ sourceOptions, onShowDetail }) => {
  const [sessionId, setSessionId] = useState('');
  const [source, setSource] = useState<string | undefined>();
  const [days, setDays] = useState(7);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<(TraceResult & { days: number }) | null>(null);
  const [searched, setSearched] = useState(false);
  const msg = useApiMessage();

  const fetchTrace = useCallback(
    async (targetId: string, targetSource?: string) => {
      if (!targetId.trim()) {
        msg.warning('请输入 SessionId');
        return;
      }
      setLoading(true);
      try {
        const res = await getSessionTrace(targetId.trim(), { source: targetSource, days });
        setResult(res);
        setSearched(true);
      } catch {
        msg.error('会话链路查询失败，请稍后重试');
      } finally {
        setLoading(false);
      }
    },
    [days, msg]
  );

  // 支持详情弹窗/外部链接带 sessionId 深链直达
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const deepId = params.get('sessionId');
    if (deepId) {
      setSessionId(deepId);
      const deepSource = params.get('source') ?? undefined;
      if (deepSource) {
        setSource(deepSource);
      }
      void fetchTrace(deepId, deepSource);
    }
    // 仅挂载时消费一次深链
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const entries = useMemo<SessionEntry[]>(() => {
    if (!result) {
      return [];
    }
    return [
      ...result.track.map((item) => ({ type: 'track' as const, item: item as unknown as LogItem })),
      ...result.frontend.map((item) => ({ type: 'frontend' as const, item: item as unknown as LogItem })),
      ...result.error.map((item) => ({ type: 'error' as const, item: item as unknown as LogItem }))
    ].sort((a, b) => new Date(b.item.createdAt).getTime() - new Date(a.item.createdAt).getTime());
  }, [result]);

  // 按天分组（保持时间倒序），天头展示数量与错误数，点击展开当天明细
  const dayGroups = useMemo(() => {
    const map = new Map<string, SessionEntry[]>();
    entries.forEach((entry) => {
      const day = dayjs(entry.item.createdAt).format('YYYY-MM-DD');
      const list = map.get(day);
      if (list) {
        list.push(entry);
      } else {
        map.set(day, [entry]);
      }
    });
    return Array.from(map.entries());
  }, [entries]);

  const entryTypeTag = (entry: SessionEntry) => {
    if (entry.type === 'error') {
      return <Tag color="red">错误</Tag>;
    }
    if (entry.type === 'track') {
      return <Tag color="green">打点</Tag>;
    }
    const level = entry.item.level ?? 'info';
    return <Tag color={LEVEL_COLOR[level] ?? 'blue'}>{entry.item.category === 'api' ? 'API' : '前端'}</Tag>;
  };

  const dayColumns = [
    { title: '时间', key: 'time', width: 100, render: (_: unknown, entry: SessionEntry) => dayjs(entry.item.createdAt).format('HH:mm:ss') },
    { title: '类型', key: 'type', width: 80, render: (_: unknown, entry: SessionEntry) => entryTypeTag(entry) },
    {
      title: '内容',
      key: 'content',
      render: (_: unknown, entry: SessionEntry) => (
        <span className="break-all">
          {entry.type === 'track'
            ? `${entry.item.pageCode ?? ''} ${entry.item.path ?? ''}`.trim() || '-'
            : entry.item.message}
        </span>
      )
    },
    { title: '来源', key: 'source', width: 100, render: (_: unknown, entry: SessionEntry) => entry.item.source ?? '-' },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: unknown, entry: SessionEntry) => (
        <Button type="link" size="small" className="!px-0" onClick={() => onShowDetail(entry.type, entry.item)}>
          详情
        </Button>
      )
    }
  ];

  const pvCount = result?.track.length ?? 0;
  const errorCount = result?.error.length ?? 0;

  return (
    <div>
      <div className="page-filter-card">
        <Space wrap size={8}>
          <Input
            placeholder="SessionId"
            maxLength={128}
            className="w-full sm:!w-[320px]"
            value={sessionId}
            allowClear
            onChange={(e) => setSessionId(e.target.value)}
            onPressEnter={() => void fetchTrace(sessionId, source)}
          />
          <Select
            placeholder="来源"
            allowClear
            className="w-full sm:w-[120px]"
            options={sourceOptions}
            value={source}
            onChange={(value) => setSource(value)}
          />
          <Select
            className="w-full sm:w-[110px]"
            value={days}
            onChange={(value) => setDays(value)}
            options={[1, 3, 7, 14].map((value) => ({ value, label: `最近${value}天` }))}
          />
          <Button type="primary" loading={loading} onClick={() => void fetchTrace(sessionId, source)}>
            查询链路
          </Button>
        </Space>
      </div>

      {loading && !result ? (
        <div className="py-12 text-center">
          <Spin />
        </div>
      ) : !searched ? (
        <Card size="small">
          <Empty description="输入 SessionId 查询该会话的完整请求流（支持在日志详情弹窗点击「会话链路」直达）" />
        </Card>
      ) : (
        <>
          <Card size="small" className="mb-3">
            <Row gutter={16}>
              <Col span={6}>
                <Statistic title="事件总数" value={entries.length} />
              </Col>
              <Col span={6}>
                <Statistic title="PV（打点）" value={pvCount} />
              </Col>
              <Col span={6}>
                <Statistic title="错误" value={errorCount} valueStyle={errorCount > 0 ? { color: 'var(--color-log-error)' } : undefined} />
              </Col>
              <Col span={6}>
                <Statistic
                  title="时间范围"
                  value={
                    entries.length
                      ? `${dayjs(entries[entries.length - 1].item.createdAt).format('MM-DD HH:mm')} ~ ${dayjs(entries[0].item.createdAt).format('MM-DD HH:mm')}`
                      : '-'
                  }
                  valueStyle={{ fontSize: 16 }}
                />
              </Col>
            </Row>
          </Card>
          {dayGroups.length ? (
            <Collapse
              defaultActiveKey={dayGroups.slice(0, 1).map(([day]) => day)}
              items={dayGroups.map(([day, list]) => {
                const dayErrors = list.filter((entry) => entry.type === 'error').length;
                const weekday = WEEKDAYS[dayjs(day).day()];
                return {
                  key: day,
                  label: (
                    <Space size={8} wrap>
                      <span>
                        {day} {weekday}
                      </span>
                      <Tag>{`共 ${list.length} 条`}</Tag>
                      {dayErrors > 0 && <Tag color="red">{`错误 ${dayErrors}`}</Tag>}
                    </Space>
                  ),
                  children: (
                    <SelfTable
                      size="small"
                      rowKey={(entry: SessionEntry) => `${entry.type}-${entry.item.id}`}
                      columns={dayColumns}
                      dataSource={list}
                      pagination={{ pageSize: 50, hideOnSinglePage: true, showSizeChanger: false, showTotal: (total) => `共 ${total} 条` }}
                    />
                  )
                };
              })}
            />
          ) : (
            <Card size="small">
              <Empty description="该 SessionId 在窗口内没有日志（注意保留期限制，超期数据已被清理）" />
            </Card>
          )}
        </>
      )}
    </div>
  );
};
