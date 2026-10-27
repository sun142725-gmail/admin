// 选股器页面：按板块选池（市值 Top N）或手填代码，对候选池做 KDJ/MACD 金叉规则扫描。
// 大池扫描由后端分批限流执行（50 任务/批，批间歇 1 秒），前端放宽超时等待结果。
// 「每日扫描」Tab 展示收盘定时扫描的运行历史与命中清单。
import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
  Form,
  Input,
  InputNumber,
  Popconfirm,
  Radio,
  Space,
  Table,
  Tabs,
  Tag,
  Tooltip,
  message
} from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { StarFilled, StarOutlined } from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  BOARD_LABELS,
  ScreenerBoard,
  ScreenerFreq,
  ScreenerIndicator,
  ScreenerMatch,
  ScreenerScanResult,
  scanScreener
} from '../../api/screener';
import { addToWatchlist, listWatchlist, removeFromWatchlist } from '../../api/watchlist';
import { ScreenerRunsPanel } from './components/ScreenerRunsPanel';
import { KlineDrawer, isStockRowClickIgnored } from './components/KlineDrawer';
import { FREQ_LABEL, renderPct, renderSignal } from './components/screener-shared';

/** 把用户粘贴的代码文本拆成代码数组：支持逗号/空格/换行/分号分隔与 600519.SH 后缀。 */
const parseSymbols = (text: string): string[] =>
  text
    .split(/[\s,，;；]+/)
    .map((item) => item.trim())
    .filter(Boolean);

export const ScreenerPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [scanning, setScanning] = useState(false);
  const [result, setResult] = useState<ScreenerScanResult | null>(null);
  // 候选池模式：board=按板块选池（默认），manual=手填代码，watchlist=我的自选，roundtable=圆桌分析过的
  const [poolMode, setPoolMode] = useState<'board' | 'manual' | 'watchlist' | 'roundtable'>(() =>
    searchParams.get('pool') === 'watchlist' ? 'watchlist' : 'board'
  );
  const [boards, setBoards] = useState<ScreenerBoard[]>(['chinext']);
  const [limit, setLimit] = useState(100);
  const [sortBy, setSortBy] = useState<'marketCap' | 'amount' | 'volume' | 'random'>('marketCap');
  const [symbolsText, setSymbolsText] = useState('');
  const [freqs, setFreqs] = useState<ScreenerFreq[]>(['day']);
  const [indicators, setIndicators] = useState<ScreenerIndicator[]>(['kdj', 'macd']);
  const [mode, setMode] = useState<'any' | 'all'>('any');
  const [status, setStatus] = useState<'golden' | 'upcoming' | 'both'>('golden');
  const [withinBars, setWithinBars] = useState(3);
  // 自选收藏状态：结果行星标切换用
  const [favoriteSymbols, setFavoriteSymbols] = useState<Set<string>>(new Set());
  // K 线抽屉：点击命中股票行弹出日K
  const [klineTarget, setKlineTarget] = useState<{ symbol: string; name: string } | null>(null);

  useEffect(() => {
    listWatchlist()
      .then((res) => {
        setFavoriteSymbols(new Set((res.items ?? []).map((item) => item.symbol)));
      })
      .catch(() => undefined);
  }, []);

  const toggleFavorite = async (symbol: string, name: string) => {
    const isFavorite = favoriteSymbols.has(symbol);
    try {
      if (isFavorite) {
        await removeFromWatchlist(symbol);
        setFavoriteSymbols((prev) => {
          const next = new Set(prev);
          next.delete(symbol);
          return next;
        });
        message.success('已移出自选');
      } else {
        await addToWatchlist({ symbol, name: name || symbol });
        setFavoriteSymbols((prev) => new Set(prev).add(symbol));
        message.success('已加入自选');
      }
    } catch (error) {
      message.error(error instanceof Error && error.message ? error.message : '操作失败');
    }
  };

  const dataSource = useMemo<ScreenerMatch[]>(() => result?.matches ?? [], [result]);

  const onScan = async () => {
    const payloadSymbols = poolMode === 'manual' ? parseSymbols(symbolsText) : undefined;
    if (poolMode === 'board' && boards.length === 0) {
      message.warning('请至少选择一个板块');
      return;
    }
    if (poolMode === 'manual' && payloadSymbols?.length === 0) {
      message.warning('请先填入候选股票代码');
      return;
    }
    if (freqs.length === 0 || indicators.length === 0) {
      message.warning('请至少选择一个周期与一个指标');
      return;
    }
    setScanning(true);
    setResult(null);
    try {
      const res = await scanScreener({
        symbols: poolMode === 'manual' ? payloadSymbols : undefined,
        boards: poolMode === 'board' ? boards : undefined,
        limit: poolMode === 'board' ? limit : undefined,
        sortBy: poolMode === 'board' ? sortBy : undefined,
        pool: poolMode === 'watchlist' ? 'watchlist' : poolMode === 'roundtable' ? 'roundtable' : undefined,
        freqs,
        indicators,
        mode,
        status,
        withinBars
      });
      setResult(res);
      if (res.failed > 0) {
        message.info(`扫描完成：${res.scanned} 只成功，${res.failed} 只数据源失败已跳过`);
      }
    } catch (error) {
      message.error(error instanceof Error && error.message ? error.message : '扫描失败，请稍后重试');
    } finally {
      setScanning(false);
    }
  };

  const columns: ColumnsType<ScreenerMatch> = [
    {
      title: '',
      key: 'star',
      width: 50,
      render: (_: unknown, record) => {
        const isFavorite = favoriteSymbols.has(record.symbol);
        // 加自选直接执行；移除需二次确认
        if (isFavorite) {
          return (
            <Popconfirm title="移出自选？" onConfirm={() => toggleFavorite(record.symbol, record.name)}>
              <Button
                type="text"
                size="small"
                aria-label="移出自选"
                icon={<StarFilled style={{ color: '#faad14' }} />}
              />
            </Popconfirm>
          );
        }
        return (
          <Button
            type="text"
            size="small"
            aria-label="加入自选"
            onClick={() => toggleFavorite(record.symbol, record.name)}
            icon={<StarOutlined style={{ color: '#bfbfbf' }} />}
          />
        );
      }
    },
    {
      title: '代码',
      dataIndex: 'symbol',
      width: 110,
      render: (value: string) => <span className="font-mono">{value.toUpperCase()}</span>
    },
    { title: '名称', dataIndex: 'name', width: 120, render: (value: string, record: ScreenerMatch) => (
      <Button type="link" size="small" className="!px-0" onClick={() => setKlineTarget({ symbol: record.symbol, name: value || record.symbol })}>
        {value || '-'}
      </Button>
    ) },
    {
      title: '周期',
      dataIndex: 'freq',
      width: 80,
      render: (value: ScreenerFreq) => <Tag color="blue">{FREQ_LABEL[value]}</Tag>
    },
    { title: '最新价', dataIndex: 'lastClose', width: 100, render: (v: number) => v?.toFixed(2) ?? '-' },
    {
      title: '涨跌幅',
      dataIndex: 'pct1d',
      width: 100,
      render: (v: number | null) =>
        v == null ? '-' : <span style={{ color: v > 0 ? '#cf1322' : v < 0 ? '#3f8600' : undefined }}>{v.toFixed(2)}%</span>
    },
    {
      title: 'KDJ',
      key: 'kdj',
      width: 130,
      render: (_: unknown, record) => renderSignal(record.signals.kdj)
    },
    {
      title: 'MACD',
      key: 'macd',
      width: 130,
      render: (_: unknown, record) => renderSignal(record.signals.macd)
    },
    {
      title: '操作',
      key: 'action',
      width: 130,
      render: (_: unknown, record) => (
        <Button
          size="small"
          type="link"
          onClick={() =>
            navigate(`/stock?symbol=${encodeURIComponent(record.symbol)}&name=${encodeURIComponent(record.name || record.symbol)}`)
          }
        >
          去圆桌分析
        </Button>
      )
    }
  ];

  return (
    <div>
      <div className="page-toolbar">
        <div>
          <div className="page-toolbar-title">选股器</div>
          <div className="page-toolbar-subtitle">
            规则扫描：对候选池逐股检测 KDJ / MACD 金叉与即将金叉，支持日线 / 周线 / 月线。
          </div>
        </div>
      </div>

      <Tabs
        defaultActiveKey={searchParams.get('tab') === 'daily' ? 'daily' : 'manual'}
        items={[
          { key: 'manual', label: '手动扫描', children: <ManualScanPanel /> },
          { key: 'daily', label: '每日扫描', children: <ScreenerRunsPanel favoriteSymbols={favoriteSymbols} onToggleFavorite={toggleFavorite} /> }
        ]}
      />
    </div>
  );

  function ManualScanPanel() {
    return (
      <>
      <Card className="mb-4" size="small">
        <Form layout="vertical">
          <Form.Item label="候选池" className="!mb-3">
            <Radio.Group
              value={poolMode}
              onChange={(e) => setPoolMode(e.target.value)}
              options={[
                { value: 'board', label: '按板块选池' },
                { value: 'watchlist', label: '我的自选' },
                { value: 'roundtable', label: '圆桌分析过的' },
                { value: 'manual', label: '手填代码' }
              ]}
            />
          </Form.Item>

          {poolMode === 'board' ? (
            <Form.Item className="!mb-3">
              <Space wrap size="large">
                <Space>
                  <span>板块：</span>
                  <Checkbox.Group
                    options={(Object.keys(BOARD_LABELS) as ScreenerBoard[]).map((board) => ({
                      value: board,
                      label: BOARD_LABELS[board]
                    }))}
                    value={boards}
                    onChange={(values) => setBoards(values as ScreenerBoard[])}
                  />
                </Space>
                <Space>
                  <span>排序：</span>
                  <Radio.Group
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    optionType="button"
                    buttonStyle="solid"
                    options={[
                      { value: 'marketCap', label: '市值' },
                      { value: 'amount', label: '成交额' },
                      { value: 'volume', label: '成交量' },
                      { value: 'random', label: '随机' }
                    ]}
                  />
                </Space>
                <Space>
                  <Tooltip title="按所选排序从大到小取前 N 只；随机模式从该板块前 800 只活跃股中等概率抽取">
                    <span>候选数量：</span>
                  </Tooltip>
                  <InputNumber min={10} max={500} step={50} value={limit} onChange={(v) => setLimit(v ?? 100)} />
                  <span>只（{sortBy === 'random' ? '随机抽' : 'Top N'}）</span>
                </Space>
              </Space>
              <div className="mt-1 text-xs" style={{ color: '#94a3b8' }}>
                大池扫描由后台分批执行（每批 50 只，批间歇 1 秒），全程约几十秒，请耐心等待；K 线缓存 10
                分钟，重复扫描更快。
              </div>
            </Form.Item>
          ) : poolMode === 'watchlist' ? (
            <Form.Item className="!mb-3">
              <Space>
                <span style={{ color: '#94a3b8' }}>
                  将扫描你自选清单里的全部股票（在「自选股」页面或结果行星标中管理收藏）。
                </span>
                <Button size="small" type="link" onClick={() => navigate('/stock/watchlist')}>
                  管理自选股
                </Button>
              </Space>
            </Form.Item>
          ) : poolMode === 'roundtable' ? (
            <Form.Item className="!mb-3">
              <span style={{ color: '#94a3b8' }}>
                将扫描你在圆桌里分析过的全部个股（跨所有历史会议去重）。
              </span>
            </Form.Item>
          ) : (
            <Form.Item
              className="!mb-3"
              label="候选股票代码（支持 600519 / sh600519 / 600519.SH 混排，空格/逗号/换行分隔，单次最多 50 只）"
            >
              <Input.TextArea
                rows={3}
                value={symbolsText}
                onChange={(e) => setSymbolsText(e.target.value)}
                placeholder={'600519 sh000001\n000001.SZ 300750'}
              />
            </Form.Item>
          )}

          <Space wrap size="large">
            <Space>
              <span>周期：</span>
              <Checkbox.Group
                options={[
                  { value: 'day', label: '日线' },
                  { value: 'week', label: '周线' },
                  { value: 'month', label: '月线' }
                ]}
                value={freqs}
                onChange={(values) => setFreqs(values as ScreenerFreq[])}
              />
            </Space>
            <Space>
              <span>指标：</span>
              <Checkbox.Group
                options={[
                  { value: 'kdj', label: 'KDJ' },
                  { value: 'macd', label: 'MACD' }
                ]}
                value={indicators}
                onChange={(values) => setIndicators(values as ScreenerIndicator[])}
              />
            </Space>
            <Space>
              <span>组合方式：</span>
              <Radio.Group
                value={mode}
                onChange={(e) => setMode(e.target.value)}
                options={[
                  { value: 'any', label: indicators.length > 1 ? '任一命中' : '仅此指标' },
                  { value: 'all', label: '全部命中' }
                ]}
              />
            </Space>
            <Space>
              <span>信号：</span>
              <Radio.Group
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                options={[
                  { value: 'golden', label: '已金叉' },
                  { value: 'upcoming', label: '即将金叉' },
                  { value: 'both', label: '两者都要' }
                ]}
              />
            </Space>
            <Space>
              <Tooltip title="已金叉的回看窗口：最近 N 根 K 线内发生的金叉才算命中">
                <span>金叉回看：</span>
              </Tooltip>
              <InputNumber min={1} max={10} value={withinBars} onChange={(v) => setWithinBars(v ?? 3)} />
              <span>根 K 线内</span>
            </Space>
            <Button type="primary" loading={scanning} onClick={onScan}>
              {scanning ? '扫描中…' : '开始扫描'}
            </Button>
          </Space>
        </Form>
      </Card>

      {result && (
        <Alert
          className="mb-4"
          type={result.matches.length ? 'success' : 'info'}
          showIcon
          message={`候选池「${result.universe}」共 ${result.poolSize} 只：扫描成功 ${result.scanned}，命中 ${
            result.matches.length
          }${result.failed ? `，失败跳过 ${result.failed}` : ''}`}
        />
      )}
      {result && poolMode === 'watchlist' && result.poolSize === 0 && (
        <Alert
          className="mb-4"
          type="warning"
          showIcon
          action={
            <Button size="small" onClick={() => navigate('/stock/watchlist')}>
              去收藏
            </Button>
          }
          message="自选还是空的：先在自选股页面或圆桌/选股结果里点星标收藏几只股票"
        />
      )}
      {scanning && (
        <Alert
          className="mb-4"
          type="warning"
          showIcon
          message="正在分批扫描，大池约需几十秒…（K 线数据缓存 10 分钟，再次扫描会明显加快）"
        />
      )}

      <Table
        rowKey={(record) => `${record.symbol}:${record.freq}`}
        columns={columns}
        dataSource={dataSource}
        loading={scanning}
        onRow={(record) => ({
          onClick: (event) => {
            if (!isStockRowClickIgnored(event)) {
              setKlineTarget({ symbol: record.symbol, name: record.name || record.symbol });
            }
          },
          style: { cursor: 'pointer' }
        })}
        pagination={dataSource.length > 50 ? { pageSize: 50, showTotal: (t) => `共 ${t} 条` } : false}
        size="middle"
        scroll={{ x: 'max-content' }}
        locale={{ emptyText: result ? '没有命中筛选条件的股票' : '选择候选池后点击「开始扫描」' }}
      />
      <KlineDrawer
        open={!!klineTarget}
        symbol={klineTarget?.symbol ?? null}
        name={klineTarget?.name}
        onClose={() => setKlineTarget(null)}
      />
      </>
    );
  }
};
