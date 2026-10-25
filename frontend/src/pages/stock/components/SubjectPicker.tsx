// 分析对象选择器：类型切换 + 联想搜索（按当前类型过滤）+ 实时快照卡片。
import React, { useEffect, useRef, useState } from 'react';
import { AutoComplete, Card, Input, Segmented, Tag } from 'antd';
import {
  searchMarket,
  fetchQuotes,
  QuoteSnapshot,
  SearchItem,
  SectorItem,
  SubjectType
} from '../../../api/stock';

export interface SubjectSelection {
  subjectType: SubjectType;
  /** stock/index: sh600519；sector: BK0475（东财）或 new_xxx（新浪）；market: 空。 */
  symbol: string;
  name: string;
}

interface Props {
  value: SubjectSelection;
  onChange: (next: SubjectSelection) => void;
  disabled?: boolean;
}

interface SearchOption {
  value: string;
  label: React.ReactNode;
  item: { type: SubjectType; symbol: string; name: string };
}

// 指数快捷项（搜索为空或无结果时兜底展示）。
const INDEX_PRESETS: SearchOption[] = [
  { symbol: 'sh000001', name: '上证指数' },
  { symbol: 'sz399001', name: '深证成指' },
  { symbol: 'sz399006', name: '创业板指' },
  { symbol: 'sh000688', name: '科创50' }
].map((item) => ({
  value: `${item.name}（${item.symbol}）`,
  label: (
    <span className="flex justify-between">
      <span>
        {item.name} <span className="text-text-sub text-xs">{item.symbol}</span>
      </span>
      <Tag color="purple">指数</Tag>
    </span>
  ),
  item: { type: 'index', symbol: item.symbol, name: item.name }
}));

export const SubjectPicker: React.FC<Props> = ({ value, onChange, disabled }) => {
  const [options, setOptions] = useState<SearchOption[]>([]);
  const [snapshot, setSnapshot] = useState<QuoteSnapshot | null>(null);
  const [keyword, setKeyword] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 快照轮询：选中个股/指数/大盘后 15 秒刷新一次。
  useEffect(() => {
    setSnapshot(null);
    const symbol =
      value.subjectType === 'market' ? 'sh000001' : value.subjectType === 'sector' ? '' : value.symbol;
    if (!symbol) {
      return;
    }
    let stopped = false;
    const load = async () => {
      try {
        const quotes = await fetchQuotes([symbol]);
        if (!stopped) {
          setSnapshot(quotes[0] ?? null);
        }
      } catch {
        // 行情不可用时静默。
      }
    };
    void load();
    const timer = setInterval(load, 15000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [value.symbol, value.subjectType]);

  useEffect(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    if (!keyword.trim()) {
      setOptions(value.subjectType === 'index' ? INDEX_PRESETS : []);
      return;
    }
    timerRef.current = setTimeout(async () => {
      try {
        const result = await searchMarket(keyword.trim());
        // 按当前类型过滤：板块 tab 只出板块；个股/指数 tab 只出对应证券。
        let filtered: SearchOption[];
        if (value.subjectType === 'sector') {
          filtered = result.sectors.map((item: SectorItem) => ({
            value: `${item.name}（${item.code}）`,
            label: (
              <span className="flex justify-between">
                <span>
                  {item.name} <span className="text-text-sub text-xs">{item.code}</span>
                </span>
                {item.pct != null ? (
                  <Tag color={item.pct >= 0 ? 'red' : 'green'}>
                    {item.pct >= 0 ? '+' : ''}
                    {item.pct}%
                  </Tag>
                ) : (
                  <Tag>板块</Tag>
                )}
              </span>
            ),
            item: { type: 'sector', symbol: item.code, name: item.name }
          }));
        } else if (value.subjectType === 'index') {
          filtered = result.stocks
            .filter((item: SearchItem) => item.type === 'index')
            .map(toStockOption);
          if (filtered.length === 0) {
            filtered = INDEX_PRESETS.filter((preset) => preset.item.name.includes(keyword.trim()));
          }
        } else {
          filtered = result.stocks
            .filter((item: SearchItem) => item.type === 'stock')
            .map(toStockOption);
        }
        setOptions(filtered);
      } catch {
        setOptions([]);
      }
    }, 300);
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keyword, value.subjectType]);

  const handleSelect = (_value: string, option: SearchOption) => {
    setKeyword('');
    setOptions([]);
    onChange({ subjectType: option.item.type, symbol: option.item.symbol, name: option.item.name });
  };

  const up = (snapshot?.changePct ?? 0) >= 0;
  const placeholder =
    value.subjectType === 'sector'
      ? '输入板块名称搜索，如：银行、机器人'
      : value.subjectType === 'index'
        ? '输入指数名称，或直接选择下方常用指数'
        : '输入名称/代码/拼音首字母，如：贵州茅台、600519、gzmt';

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <Segmented
        value={value.subjectType}
        disabled={disabled}
        onChange={(next) => {
          const type = next as SubjectType;
          if (type === 'market') {
            onChange({ subjectType: 'market', symbol: '', name: 'A股大盘' });
          } else if (type === 'index') {
            onChange({ subjectType: 'index', symbol: 'sh000001', name: '上证指数' });
          } else {
            onChange({ subjectType: type, symbol: '', name: '' });
          }
        }}
        options={[
          { label: '大盘', value: 'market' },
          { label: '指数', value: 'index' },
          { label: '板块', value: 'sector' },
          { label: '个股', value: 'stock' }
        ]}
      />
      {value.subjectType !== 'market' && (
        <div className="w-full sm:w-80">
          <AutoComplete
            value={keyword}
            disabled={disabled}
            options={options}
            onSearch={setKeyword}
            onSelect={handleSelect}
            popupMatchSelectWidth={340}
            notFoundContent={
              keyword.trim() ? (
                <span className="text-xs text-text-sub">
                  未找到匹配的{value.subjectType === 'sector' ? '板块' : '证券'}
                  {value.subjectType === 'sector'
                    ? '，试试同义词（如"金融"、"有色"）或稍后再试'
                    : '，试试完整名称、六位代码或拼音首字母'}
                </span>
              ) : undefined
            }
          >
            <Input.Search placeholder={placeholder} allowClear />
          </AutoComplete>
          {value.symbol && (
            <div className="text-xs text-text-sub mt-1">
              当前对象：{value.name || value.symbol}（{value.symbol}）
            </div>
          )}
        </div>
      )}
      {snapshot && (
        <Card size="small" className="flex-1 quote-snapshot" styles={{ body: { padding: '8px 14px' } }}>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
            <span className="font-medium">
              {snapshot.name}
              <span className="text-text-sub text-xs ml-1">{snapshot.symbol}</span>
            </span>
            <span className="text-xl font-semibold" style={{ color: up ? '#f5222d' : '#16a34a' }}>
              {snapshot.price.toFixed(2)}
            </span>
            <span style={{ color: up ? '#f5222d' : '#16a34a' }}>
              {up ? '+' : ''}
              {snapshot.change?.toFixed(2)}（{up ? '+' : ''}
              {snapshot.changePct?.toFixed(2)}%）
            </span>
            <span className="text-xs text-text-sub">
              开 {snapshot.open?.toFixed(2)}｜高 {snapshot.high?.toFixed(2)}｜低 {snapshot.low?.toFixed(2)}｜昨收{' '}
              {snapshot.prevClose?.toFixed(2)}
              {snapshot.turnover != null && <>｜换手 {snapshot.turnover}%</>}
              {snapshot.pe != null && <>｜PE {snapshot.pe}</>}
              {snapshot.pb != null && <>｜PB {snapshot.pb}</>}
              {snapshot.totalMarketCap != null && <>｜市值 {snapshot.totalMarketCap}亿</>}
            </span>
          </div>
        </Card>
      )}
    </div>
  );
};

function toStockOption(item: SearchItem): SearchOption {
  return {
    value: `${item.name}（${item.symbol}）`,
    label: (
      <span className="flex justify-between">
        <span>
          {item.name} <span className="text-text-sub text-xs">{item.symbol}</span>
        </span>
        <Tag color={item.type === 'index' ? 'purple' : 'blue'}>{item.type === 'index' ? '指数' : '个股'}</Tag>
      </span>
    ),
    item: { type: item.type, symbol: item.symbol, name: item.name }
  };
}
