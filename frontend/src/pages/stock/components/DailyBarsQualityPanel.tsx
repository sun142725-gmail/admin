// 数据质量面板（选股器页第三 Tab 内容）：日线行情库覆盖概览 + 明细探针（缺口/异常/除权跳变）+ 手动补抓。
// 库的消费方（指标计算/未来回测）与数据来源（自选+候选池）同属选股器域，挂 ScreenerPage 复用既有
// Tabs 容器：零新路由/零 resource 变更（照合规词库挂 /publisher Tab 先例）。
// 懒挂载：antd Tabs 未激活 pane 不渲染 children，首切才拉数据（照 ComplianceWordsTab 先例）。
// 不轮询：trigger 后台执行无 run 表，成功/冲突文案走 dailyBarsUI 常量，进度看后端日志（UI 契约交互细节）。
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Button from 'antd/es/button';
import Segmented from 'antd/es/segmented';
import Space from 'antd/es/space';
import Tag from 'antd/es/tag';
import type { ColumnsType } from 'antd/es/table';
import type { TableRowSelection } from 'antd/es/table/interface';
import { ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons';
import {
  getBarsQualityDetail,
  getBarsQualityOverview,
  triggerDailyBarsBackfill,
  type BarsAnomalyItem,
  type BarsPoolFilter,
  type BarsQualityDetailItem,
  type BarsQualityOverviewItem,
  type BarsSuspiciousJump,
  type BarsWeekdayGap,
  type BarsQualityUniverse,
  type TriggerDailyBarsPayload
} from '../../../api/dailyBars';
import { SelfTable } from '../../../components/base/SelfTable';
import { ConfirmPopconfirm } from '../../../components/business/ConfirmAction';
import { PageHeader } from '../../../components/business/PageHeader';
import { useApiMessage } from '../../../hooks/useApiMessage';
import {
  GAP_HINT_TEXT,
  TRIGGER_CONFLICT_TEXT,
  TRIGGER_STARTED_TEXT,
  anomalyTagMeta,
  gapMeta,
  staleDaysTagMeta
} from '../dailyBarsUI';

const PAGE_SIZE = 20;
// 明细探针单次上限：后端 symbols 校验 1~20 个
const DETAIL_MAX_SYMBOLS = 20;
// trigger 显式 symbols 上限：后端校验 ≤50 个
const TRIGGER_MAX_SYMBOLS = 50;

const POOL_OPTIONS: Array<{ label: string; value: BarsPoolFilter }> = [
  { label: '全部', value: 'all' },
  { label: '自选', value: 'watchlist' },
  { label: '候选池', value: 'screener' }
];

// 明细三块表合并多标的行：补 symbol 列（单行 rowKey 用唯一业务键，禁 index）
interface GapRow extends BarsWeekdayGap {
  symbol: string;
}
interface AnomalyRow extends BarsAnomalyItem {
  symbol: string;
}
interface JumpRow extends BarsSuspiciousJump {
  symbol: string;
}

// 409（运行中冲突）识别：http 层 HTTP 错误分支 reject 的是含 response 的原始 axios error
const isConflictError = (error: unknown): boolean =>
  (error as { response?: { status?: number } } | null | undefined)?.response?.status === 409;

export const DailyBarsQualityPanel: React.FC = () => {
  const msg = useApiMessage();
  const [pool, setPool] = useState<BarsPoolFilter>('all');
  const [items, setItems] = useState<BarsQualityOverviewItem[]>([]);
  const [total, setTotal] = useState(0);
  const [universe, setUniverse] = useState<BarsQualityUniverse | null>(null);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  // 勾选标的：概览行勾选后探针明细 / 全量重抓（preserveSelectedRowKeys 跨页保留）
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);
  const [triggering, setTriggering] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailLoaded, setDetailLoaded] = useState(false);
  const [detailItems, setDetailItems] = useState<BarsQualityDetailItem[]>([]);

  const loadOverview = useCallback(
    async (targetPage: number, targetPageSize: number, targetPool: BarsPoolFilter) => {
      setLoading(true);
      try {
        const res = await getBarsQualityOverview({ pool: targetPool, page: targetPage, pageSize: targetPageSize });
        setItems(Array.isArray(res?.items) ? res.items : []);
        setTotal(res?.total ?? 0);
        setUniverse(res?.universe ?? null);
      } catch (error) {
        msg.errorFrom(error, '质量概览加载失败');
      } finally {
        setLoading(false);
      }
    },
    [msg]
  );

  useEffect(() => {
    void loadOverview(1, PAGE_SIZE, 'all');
  }, [loadOverview]);

  const changePool = (next: BarsPoolFilter) => {
    setPool(next);
    // 池口径变了，跨页保留的勾选语义随之失效，一并清空
    setSelectedRowKeys([]);
    setPage(1);
    void loadOverview(1, pageSize, next);
  };

  const selectedSymbols = useMemo(
    () => selectedRowKeys.filter((key): key is string => typeof key === 'string'),
    [selectedRowKeys]
  );

  // 探针明细：失败 message.error 不阻塞概览（UI 契约交互细节）
  const loadDetail = useCallback(
    async (symbols: string[]) => {
      if (!symbols.length) {
        return;
      }
      setDetailLoading(true);
      try {
        const res = await getBarsQualityDetail(symbols.slice(0, DETAIL_MAX_SYMBOLS));
        setDetailItems(Array.isArray(res?.items) ? res.items : []);
        setDetailLoaded(true);
      } catch {
        msg.error('探针明细加载失败');
      } finally {
        setDetailLoading(false);
      }
    },
    [msg]
  );

  // 手动补抓：成功 TRIGGER_STARTED_TEXT / 409 TRIGGER_CONFLICT_TEXT，其余 errorFrom；
  // trigger 期间按钮 loading，不轮询（无 run 表，如实不做进度轮询）
  const onTrigger = useCallback(
    async (payload: TriggerDailyBarsPayload) => {
      setTriggering(true);
      try {
        await triggerDailyBarsBackfill(payload);
        msg.success(TRIGGER_STARTED_TEXT);
      } catch (error) {
        if (isConflictError(error)) {
          msg.error(TRIGGER_CONFLICT_TEXT);
        } else {
          msg.errorFrom(error, '补抓触发失败');
        }
      } finally {
        setTriggering(false);
      }
    },
    [msg]
  );

  const rowSelection: TableRowSelection<BarsQualityOverviewItem> = useMemo(
    () => ({
      selectedRowKeys,
      preserveSelectedRowKeys: true,
      onChange: (keys) => setSelectedRowKeys(keys)
    }),
    [selectedRowKeys]
  );

  const overviewColumns = useMemo<ColumnsType<BarsQualityOverviewItem>>(
    () => [
      {
        title: '代码',
        dataIndex: 'symbol',
        width: 110,
        render: (v: string) => <span className="font-mono">{v.toUpperCase()}</span>
      },
      { title: '名称', dataIndex: 'name', width: 140, render: (v: string) => v || '-' },
      { title: 'K线根数', dataIndex: 'barCount', width: 100 },
      { title: '首日', dataIndex: 'firstDate', width: 110, render: (v: string | null) => v || '-' },
      { title: '末日', dataIndex: 'lastDate', width: 110, render: (v: string | null) => v || '-' },
      {
        title: '停更天数',
        dataIndex: 'staleDays',
        width: 110,
        render: (v: number, record: BarsQualityOverviewItem) => {
          // 空库标的（barCount=0）后端 lastDate=null 且 staleDays 恒 0（daily-bars.service.ts:408-410），
          // 此时无「已最新/停更」语义，显 '-' 防止误标绿
          if (record.barCount === 0) {
            return '-';
          }
          const meta = staleDaysTagMeta(v);
          // 三态：=0 绿「已最新」；1~7 无 Tag 只显数字；>7 橙「停更 N 天」
          return meta ? <Tag color={meta.color}>{meta.text}</Tag> : v;
        }
      }
    ],
    []
  );

  const gapColumns = useMemo<ColumnsType<GapRow>>(
    () => [
      {
        title: '代码',
        dataIndex: 'symbol',
        width: 110,
        render: (v: string) => <span className="font-mono">{v.toUpperCase()}</span>
      },
      { title: '缺口起', dataIndex: 'from', width: 120 },
      { title: '缺口止', dataIndex: 'to', width: 120 },
      { title: '跳过工作日', dataIndex: 'skippedWeekdays', width: 110 },
      {
        title: '标记',
        key: 'flag',
        width: 210,
        render: (_: unknown, row: GapRow) => {
          // 窗口外缺口 → purple Tag；窗口内缺口 null 不渲染额外 Tag
          const meta = gapMeta(row);
          return meta ? <Tag color={meta.color}>{meta.text}</Tag> : null;
        }
      }
    ],
    []
  );

  const anomalyColumns = useMemo<ColumnsType<AnomalyRow>>(
    () => [
      {
        title: '代码',
        dataIndex: 'symbol',
        width: 110,
        render: (v: string) => <span className="font-mono">{v.toUpperCase()}</span>
      },
      { title: '交易日', dataIndex: 'tradeDate', width: 120 },
      {
        title: '异常码',
        dataIndex: 'codes',
        render: (codes: AnomalyRow['codes']) => (
          <Space size={4} wrap>
            {codes.map((code) => {
              const meta = anomalyTagMeta(code);
              return (
                <Tag key={code} color={meta.color}>
                  {meta.text}
                </Tag>
              );
            })}
          </Space>
        )
      }
    ],
    []
  );

  const jumpColumns = useMemo<ColumnsType<JumpRow>>(
    () => [
      {
        title: '代码',
        dataIndex: 'symbol',
        width: 110,
        render: (v: string) => <span className="font-mono">{v.toUpperCase()}</span>
      },
      { title: '交易日', dataIndex: 'tradeDate', width: 120 },
      {
        title: '相邻收盘变动',
        dataIndex: 'pct',
        width: 120,
        // 除权 seam/脏数据标记，刻意不做涨跌配色以免误导（除权缺口≠下跌）
        render: (v: number) => `${v.toFixed(2)}%`
      }
    ],
    []
  );

  const gapRows = useMemo<GapRow[]>(
    () => detailItems.flatMap((item) => item.weekdayGaps.map((gap) => ({ ...gap, symbol: item.symbol }))),
    [detailItems]
  );
  const anomalyRows = useMemo<AnomalyRow[]>(
    () => detailItems.flatMap((item) => item.anomalies.map((row) => ({ ...row, symbol: item.symbol }))),
    [detailItems]
  );
  const jumpRows = useMemo<JumpRow[]>(
    () => detailItems.flatMap((item) => item.suspiciousJumps.map((row) => ({ ...row, symbol: item.symbol }))),
    [detailItems]
  );

  const detailOverflow = selectedSymbols.length > DETAIL_MAX_SYMBOLS;
  const fullOverflow = selectedSymbols.length > TRIGGER_MAX_SYMBOLS;
  const noSelection = selectedSymbols.length === 0;

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        title="日线行情库"
        subtitle="自选 + 候选池命中标的的日线 K 线落地库：每交易日盘后自动增量补抓，此处按需探针覆盖与质量，支持手动补抓。"
        actions={
          <Space wrap>
            <Segmented
              value={pool}
              onChange={(value) => changePool(value as BarsPoolFilter)}
              options={POOL_OPTIONS}
            />
            <Button size="small" icon={<ReloadOutlined />} onClick={() => void loadOverview(page, pageSize, pool)}>
              刷新
            </Button>
            <ConfirmPopconfirm title="对全宇宙增量补抓一轮？（串行限流执行，进度看后端日志）" onConfirm={() => void onTrigger({})}>
              <Button type="primary" size="small" icon={<ThunderboltOutlined />} loading={triggering}>
                手动补抓
              </Button>
            </ConfirmPopconfirm>
          </Space>
        }
      />

      {universe && (
        <div className="text-xs text-text-sub">
          当前宇宙：自选 {universe.watchlistSymbols} 只 · 候选池命中 {universe.screenerSymbols} 只 · 库内日线{' '}
          {universe.barsTotal} 根 · 共 {total} 只标的
        </div>
      )}

      <SelfTable
        rowKey="symbol"
        size="middle"
        loading={loading}
        columns={overviewColumns}
        dataSource={items}
        rowSelection={rowSelection}
        pagination={{
          current: page,
          pageSize,
          total,
          onChange: (nextPage, nextPageSize) => {
            setPage(nextPage);
            setPageSize(nextPageSize);
            void loadOverview(nextPage, nextPageSize, pool);
          }
        }}
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: '行情库还没有数据：点击「手动补抓」或等盘后定时抓取' }}
      />

      <Space wrap>
        <Button
          size="small"
          type="primary"
          disabled={noSelection || detailOverflow}
          loading={detailLoading}
          onClick={() => void loadDetail(selectedSymbols)}
        >
          探针明细{selectedSymbols.length ? `（已选 ${selectedSymbols.length}）` : ''}
        </Button>
        <ConfirmPopconfirm
          title={`全量重抓所选 ${selectedSymbols.length} 只？（先抓成功后删+事务；存量超 1000 根的标的会截短到 1000 根）`}
          onConfirm={() => void onTrigger({ symbols: selectedSymbols.slice(0, TRIGGER_MAX_SYMBOLS), full: true })}
        >
          <Button size="small" danger disabled={noSelection || fullOverflow} loading={triggering}>
            全量重抓所选
          </Button>
        </ConfirmPopconfirm>
        {(detailOverflow || fullOverflow) && (
          <span className="text-xs text-text-sub">明细探针单次最多 20 只 / 全量重抓单次最多 50 只，请取消部分勾选</span>
        )}
      </Space>

      {detailLoaded && (
        <div className="flex flex-col gap-4">
          <div>
            <div className="mb-2 text-sm font-medium">
              工作日缺口（已探针 {detailItems.length} 只标的）
              <span className="ml-2 text-xs text-text-sub">{GAP_HINT_TEXT}</span>
            </div>
            <SelfTable
              rowKey={(row: GapRow) => `${row.symbol}:${row.from}:${row.to}`}
              size="small"
              loading={detailLoading}
              columns={gapColumns}
              dataSource={gapRows}
              pagination={gapRows.length > 50 ? { pageSize: 50, pageSizeOptions: ['10', '20', '50', '100'], showTotal: (t) => `共 ${t} 条` } : false}
              scroll={{ x: 'max-content' }}
              locale={{ emptyText: '没有工作日缺口（或未勾选标的）' }}
            />
          </div>
          <div>
            <div className="mb-2 text-sm font-medium">单根异常</div>
            <SelfTable
              rowKey={(row: AnomalyRow) => `${row.symbol}:${row.tradeDate}`}
              size="small"
              loading={detailLoading}
              columns={anomalyColumns}
              dataSource={anomalyRows}
              pagination={anomalyRows.length > 50 ? { pageSize: 50, pageSizeOptions: ['10', '20', '50', '100'], showTotal: (t) => `共 ${t} 条` } : false}
              scroll={{ x: 'max-content' }}
              locale={{ emptyText: '没有异常行（0=停牌占位由零成交量标注）' }}
            />
          </div>
          <div>
            <div className="mb-2 text-sm font-medium">疑似除权跳变</div>
            <SelfTable
              rowKey={(row: JumpRow) => `${row.symbol}:${row.tradeDate}`}
              size="small"
              loading={detailLoading}
              columns={jumpColumns}
              dataSource={jumpRows}
              pagination={jumpRows.length > 50 ? { pageSize: 50, pageSizeOptions: ['10', '20', '50', '100'], showTotal: (t) => `共 ${t} 条` } : false}
              scroll={{ x: 'max-content' }}
              locale={{ emptyText: '没有疑似除权跳变（相邻收盘变动超阈值才标记）' }}
            />
          </div>
        </div>
      )}
    </div>
  );
};
