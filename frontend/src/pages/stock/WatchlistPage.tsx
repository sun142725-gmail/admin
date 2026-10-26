// 自选股页面：收藏清单 + 实时行情快照 + 快捷入口（圆桌分析 / 选股扫描）。
import React, { useEffect, useMemo, useState } from 'react';
import { Button, Input, Popconfirm, Space, Table, Tag, Tooltip, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { StarFilled, StarOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
  WatchlistItem,
  addToWatchlist,
  listWatchlist,
  removeFromWatchlist
} from '../../api/watchlist';
import { fetchQuotes } from '../../api/stock';

interface QuoteRow {
  symbol: string;
  name?: string;
  price?: number | null;
  pct?: number | null;
}

export const WatchlistPage: React.FC = () => {
  const navigate = useNavigate();
  const [items, setItems] = useState<WatchlistItem[]>([]);
  const [quotes, setQuotes] = useState<Record<string, QuoteRow>>({});
  const [loading, setLoading] = useState(false);
  const [addSymbol, setAddSymbol] = useState('');
  const [adding, setAdding] = useState(false);
  const favoriteSymbols = useMemo(() => new Set(items.map((item) => item.symbol)), [items]);

  const loadWatchlist = async () => {
    setLoading(true);
    try {
      const res = await listWatchlist();
      setItems(res.items ?? []);
    } catch {
      message.error('自选股加载失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWatchlist();
  }, []);

  // 实时快照：腾讯批量接口一次最多 20 只，分批取
  useEffect(() => {
    if (!items.length) {
      setQuotes({});
      return;
    }
    let stopped = false;
    const symbols = items.map((item) => item.symbol);
    (async () => {
      const merged: Record<string, QuoteRow> = {};
      for (let i = 0; i < symbols.length; i += 20) {
        try {
          const batch = await fetchQuotes(symbols.slice(i, i + 20));
          if (stopped) {
            return;
          }
          batch.forEach((row) => {
            merged[row.symbol] = { symbol: row.symbol, name: row.name, price: row.price, pct: row.changePct };
          });
        } catch {
          // 快照失败不阻断页面，价格列显示 "-"
        }
      }
      if (!stopped) {
        setQuotes(merged);
      }
    })();
    return () => {
      stopped = true;
    };
  }, [items]);

  // 从粘贴文本解析代码（支持 600519 / 600519.SH / sh600519）
  const parseSymbol = (text: string): { symbol: string; name: string } | null => {
    const token = text.trim().toLowerCase();
    const suffixed = /^(\d{6})\.(sh|sz)$/.exec(token);
    const bare = /^\d{6}$/.test(token) ? token : null;
    const code = suffixed ? suffixed[1] : bare;
    if (!code) {
      return null;
    }
    const exchange = suffixed ? suffixed[2] : code.startsWith('6') ? 'sh' : 'sz';
    return { symbol: `${exchange}${code}`, name: code };
  };

  const onAdd = async () => {
    const parsed = parseSymbol(addSymbol);
    if (!parsed) {
      message.warning('请输入 6 位股票代码（如 600519 / 300750.SZ）');
      return;
    }
    if (favoriteSymbols.has(parsed.symbol)) {
      message.info('该股票已在自选中');
      return;
    }
    setAdding(true);
    try {
      // 先查实时行情拿真实名称，查不到再用代码占位（自选页展示以行情快照为准）
      let name = parsed.name;
      try {
        const [quote] = await fetchQuotes([parsed.symbol]);
        if (quote?.name) {
          name = quote.name;
        }
      } catch {
        // 行情失败不阻断收藏
      }
      await addToWatchlist({ symbol: parsed.symbol, name });
      setAddSymbol('');
      await loadWatchlist();
    } catch (error) {
      message.error(error instanceof Error && error.message ? error.message : '添加失败');
    } finally {
      setAdding(false);
    }
  };

  const onRemove = async (symbol: string) => {
    try {
      await removeFromWatchlist(symbol);
      message.success('已移出自选');
      loadWatchlist();
    } catch (error) {
      message.error(error instanceof Error && error.message ? error.message : '移除失败');
    }
  };

  const dataSource = useMemo(
    () =>
      items.map((item) => ({
        ...item,
        quote: quotes[item.symbol]
      })),
    [items, quotes]
  );

  const columns: ColumnsType<(typeof dataSource)[number]> = [
    {
      title: '',
      key: 'star',
      width: 50,
      render: (_: unknown, record) => (
        <Popconfirm title="移出自选？" onConfirm={() => onRemove(record.symbol)}>
          <Button
            type="text"
            size="small"
            aria-label="移出自选"
            icon={<StarFilled style={{ color: '#faad14' }} />}
          />
        </Popconfirm>
      )
    },
    {
      title: '代码',
      dataIndex: 'symbol',
      width: 110,
      render: (v: string) => <span className="font-mono">{v.toUpperCase()}</span>
    },
    {
      title: '名称',
      key: 'name',
      width: 120,
      render: (_: unknown, record) => {
        const q = record.quote;
        const known = q?.name && q.name !== record.symbol;
        return known ? q.name : record.name;
      }
    },
    {
      title: '现价',
      key: 'price',
      width: 100,
      render: (_: unknown, record) => record.quote?.price?.toFixed(2) ?? '-'
    },
    {
      title: '涨跌幅',
      key: 'pct',
      width: 100,
      render: (_: unknown, record) => {
        const v = record.quote?.pct;
        if (v == null) {
          return '-';
        }
        return <span style={{ color: v > 0 ? '#cf1322' : v < 0 ? '#3f8600' : undefined }}>{v.toFixed(2)}%</span>;
      }
    },
    { title: '备注', dataIndex: 'note', render: (v: string | null) => v || '-' },
    {
      title: '收藏时间',
      dataIndex: 'createdAt',
      width: 170,
      render: (v: string) => new Date(v).toLocaleString('zh-CN', { hour12: false })
    },
    {
      title: '操作',
      key: 'action',
      width: 220,
      render: (_: unknown, record) => (
        <Space>
          <Button
            size="small"
            type="link"
            onClick={() =>
              navigate(`/stock?symbol=${encodeURIComponent(record.symbol)}&name=${encodeURIComponent(record.name)}`)
            }
          >
            去圆桌分析
          </Button>
          <Button size="small" type="link" onClick={() => navigate('/stock/screener?pool=watchlist')}>
            去选股扫描
          </Button>
          <Popconfirm title="确认移出自选？" onConfirm={() => onRemove(record.symbol)}>
            <Button size="small" type="link" danger>
              移除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ];

  return (
    <div>
      <div className="page-toolbar">
        <div>
          <div className="page-toolbar-title">自选股</div>
          <div className="page-toolbar-subtitle">收藏关注的股票，可作为选股器候选池，一键发起圆桌分析。</div>
        </div>
        <Space>
          <Input
            style={{ width: 220 }}
            placeholder="输入代码添加，如 600519"
            value={addSymbol}
            onChange={(e) => setAddSymbol(e.target.value)}
            onPressEnter={onAdd}
            maxLength={16}
          />
          <Button type="primary" loading={adding} onClick={onAdd} icon={<StarOutlined />}>
            添加自选
          </Button>
          <Tooltip title="在圆桌分析页与选股结果里点星标也能收藏">
            <Tag>提示</Tag>
          </Tooltip>
        </Space>
      </div>

      <div className="page-table-card">
        <Table
          rowKey="id"
          columns={columns}
          dataSource={dataSource}
          loading={loading}
          pagination={items.length > 50 ? { pageSize: 50, showTotal: (t) => `共 ${t} 只` } : false}
          size="middle"
          scroll={{ x: 'max-content' }}
          locale={{ emptyText: '还没有自选股：在上方输入代码，或在圆桌/选股结果里点星标收藏' }}
        />
      </div>
    </div>
  );
};
