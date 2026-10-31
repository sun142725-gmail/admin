// 日志概览面板：趋势/Top 聚合/来源分布统计，点击 Top 项可下钻到对应日志 Tab。
import React, { useEffect, useMemo, useState } from 'react';
import Card from 'antd/es/card';
import { Col } from 'antd/es/grid';
import Radio from 'antd/es/radio';
import { Row } from 'antd/es/grid';
import Statistic from 'antd/es/statistic';
import Tag from 'antd/es/tag';
import ReactECharts from 'echarts-for-react';
import { getLogStats, LogStats } from '../../api/logCenter';
import { useApiMessage } from '../../hooks/useApiMessage';

type JumpTab = 'track' | 'frontend' | 'error';

interface Props {
  onJump: (tab: JumpTab, filters: Record<string, unknown>) => void;
}

const DAY_OPTIONS = [1, 3, 7, 14, 30].map((value) => ({ value, label: `${value}天` }));

// 概览图表统一高度（5 处 ReactECharts 同值，避免散写漂移）
const CHART_HEIGHT = 260;

const sourceLabel = (source: string | null) =>
  source === 'server' ? '服务端' : source === 'web' ? 'Web' : source ?? '未知';

const sumTrend = (trend?: Array<{ count: number }>) =>
  (trend ?? []).reduce((sum, row) => sum + Number(row.count), 0);

export const OverviewPanel: React.FC<Props> = ({ onJump }) => {
  const [days, setDays] = useState(7);
  const [stats, setStats] = useState<LogStats | null>(null);
  const msg = useApiMessage();

  useEffect(() => {
    let cancelled = false;
    getLogStats(days)
      .then((res) => {
        if (!cancelled) {
          setStats(res);
        }
      })
      .catch(() => {
        msg.error('统计加载失败，请稍后重试');
      });
    return () => {
      cancelled = true;
    };
  }, [days, msg]);

  const serverErrorCount = useMemo(
    () =>
      (stats?.errorBySource ?? []).find((row) => row.source === 'server')?.count ?? 0,
    [stats]
  );

  // 横向条形图通用配置：类目轴放左侧、标签超宽截断
  const topBarOption = (categories: string[], values: number[]) => ({
    grid: { left: 8, right: 24, top: 8, bottom: 8, containLabel: true },
    tooltip: { trigger: 'axis' as const },
    xAxis: { type: 'value' as const, minInterval: 1 },
    yAxis: {
      type: 'category' as const,
      data: categories,
      inverse: true,
      axisLabel: { width: 150, overflow: 'truncate' as const, fontSize: 11 }
    },
    series: [
      {
        type: 'bar' as const,
        data: values,
        barMaxWidth: 18,
        itemStyle: { borderRadius: [0, 4, 4, 0] }
      }
    ]
  });

  // echarts-for-react 的点击事件走 onEvents；Top 图各自绑定下钻
  const topErrorsChart = stats && stats.topErrors.length > 0 && (
    <ReactECharts
      style={{ height: CHART_HEIGHT }}
      option={topBarOption(
        stats.topErrors.map((row) => row.message),
        stats.topErrors.map((row) => Number(row.count))
      )}
      onEvents={{
        click: (params: { name?: string }) => {
          if (params.name) {
            onJump('error', { keyword: params.name });
          }
        }
      }}
    />
  );

  const topPagesChart = stats && stats.topPages.length > 0 && (
    <ReactECharts
      style={{ height: CHART_HEIGHT }}
      option={topBarOption(
        stats.topPages.map((row) => row.pageCode),
        stats.topPages.map((row) => Number(row.count))
      )}
      onEvents={{
        click: (params: { name?: string }) => {
          if (params.name) {
            onJump('track', { pageCode: params.name });
          }
        }
      }}
    />
  );

  const topSlowChart = stats && stats.topSlowRequests.length > 0 && (
    <ReactECharts
      style={{ height: CHART_HEIGHT }}
      option={topBarOption(
        stats.topSlowRequests.map((row) => row.message),
        stats.topSlowRequests.map((row) => Number(row.count))
      )}
      onEvents={{
        click: (params: { name?: string }) => {
          if (params.name) {
            onJump('frontend', { keyword: params.name });
          }
        }
      }}
    />
  );

  const trendOption = (
    series: Array<{ name: string; type: 'line' | 'bar'; color: string; data: Array<{ day: string; count: number }> }>
  ) => {
    // 多系列类目轴取并集，缺失的天补 0，避免各表数据错位
    const daySet = new Set<string>();
    series.forEach((s) => s.data.forEach((row) => daySet.add(row.day)));
    const axis = Array.from(daySet).sort();
    return {
      grid: { left: 8, right: 16, top: 32, bottom: 8, containLabel: true },
      tooltip: { trigger: 'axis' as const },
      legend: { top: 0 },
      xAxis: { type: 'category' as const, data: axis },
      yAxis: { type: 'value' as const, minInterval: 1 },
      series: series.map((s) => {
        const byDay = new Map(s.data.map((row) => [row.day, Number(row.count)]));
        return {
          name: s.name,
          type: s.type,
          itemStyle: { color: s.color },
          barMaxWidth: 18,
          smooth: true,
          showSymbol: false,
          data: axis.map((day) => byDay.get(day) ?? 0)
        };
      })
    };
  };

  return (
    <div className="app-page-flat">
      <div className="page-filter-card flex justify-end">
        <Radio.Group optionType="button" options={DAY_OPTIONS} value={days} onChange={(e) => setDays(e.target.value)} />
      </div>
      <Card size="small" className="mb-3">
        <Row gutter={16}>
          <Col span={6}>
            <Statistic title="PV 总量" value={sumTrend(stats?.pvTrend)} loading={!stats} />
          </Col>
          <Col span={6}>
            <Statistic title="前端日志" value={sumTrend(stats?.frontendTrend)} loading={!stats} />
          </Col>
          <Col span={6}>
            <Statistic title="错误总数" value={sumTrend(stats?.errorTrend)} loading={!stats} />
          </Col>
          <Col span={6}>
            <Statistic
              title="服务端错误(5xx)"
              value={Number(serverErrorCount)}
              valueStyle={Number(serverErrorCount) > 0 ? { color: 'var(--color-log-error)' } : undefined}
              loading={!stats}
            />
          </Col>
        </Row>
      </Card>
      <Row gutter={12}>
        <Col span={12}>
          <Card size="small" title="错误趋势">
            {stats && <ReactECharts style={{ height: CHART_HEIGHT }} option={trendOption([{ name: '错误', type: 'line', color: '#cf1322', data: stats.errorTrend }])} />}
          {/* #cf1322 与 global.css --color-log-error 同值；ECharts canvas 不解析 CSS var()，保留字面量 */}
          </Card>
        </Col>
        <Col span={12}>
          <Card size="small" title="PV / 前端日志趋势">
            {stats && (
              <ReactECharts
                style={{ height: CHART_HEIGHT }}
                option={trendOption([
                  { name: 'PV', type: 'bar', color: '#1677ff', data: stats.pvTrend },
                  { name: '前端日志', type: 'line', color: '#722ed1', data: stats.frontendTrend }
                ])}
              />
            )}
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" title="错误 Top 10（点击下钻）">
            {topErrorsChart ?? <span>窗口内暂无错误</span>}
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" title="页面 PV Top 10（点击下钻）">
            {topPagesChart}
          </Card>
        </Col>
        <Col span={8}>
          <Card size="small" title="慢请求 Top 10（点击下钻）">
            {topSlowChart}
          </Card>
        </Col>
        <Col span={24}>
          <Card size="small" title="错误来源分布">
            {(stats?.errorBySource ?? []).length > 0 ? (
              (stats?.errorBySource ?? []).map((row) => (
                <Tag key={row.source ?? 'none'} color={row.source === 'server' ? 'red' : 'blue'}>
                  {sourceLabel(row.source)}: {row.count}
                </Tag>
              ))
            ) : (
              <span>窗口内暂无错误</span>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
};
