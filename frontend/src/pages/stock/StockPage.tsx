// 股市圆桌主页面：分析台（选对象 → 看行情 → 召集会议）+ 会议记录。
import React, { useCallback, useEffect, useState } from 'react';
import { Button, Card, Input, Segmented, Select, Tooltip, message } from 'antd';
import { ThunderboltOutlined } from '@ant-design/icons';
import type { InputProps } from 'antd';
import { useSearchParams } from 'react-router-dom';
import { Permission } from '../../components/permission/Permission';
import { KlineResult, RoundtableMode, StockModelOption, fetchKline, fetchStockModels } from '../../api/stock';
import { SubjectPicker, SubjectSelection } from './components/SubjectPicker';
import { WatchStarButton } from './components/WatchStarButton';
import { KlineChart } from './components/KlineChart';
import { RoundtableStage } from './components/RoundtableStage';
import { HistoryTable } from './components/HistoryTable';
import { useRoundtableFlow } from './useRoundtableFlow';
import { EXPERTS, MODERATOR } from './experts';
import './stock.css';

const MODE_OPTIONS = [
  { label: '快速（独立+总结）', value: 'quick' },
  { label: '标准（+1轮辩论）', value: 'standard' },
  { label: '深度（+2轮辩论）', value: 'deep' }
];

// 个股/指数 sh/sz 六位代码，或板块（东财 BKxxxx / 新浪 new_xxx）。
const SECTOR_SYMBOL_RE = /^(BK\d{4,6}|new_[a-z0-9_]+)$/i;
const SECURITY_SYMBOL_RE = /^(sh|sz)\d{6}$/;

export const StockPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<'stage' | 'history'>('stage');
  // 深链支持：/stock?symbol=sh600519&name=贵州茅台（选股结果"去圆桌分析"跳转）
  const [subject, setSubject] = useState<SubjectSelection>(() => {
    const deepLinkSymbol = searchParams.get('symbol');
    if (deepLinkSymbol && SECURITY_SYMBOL_RE.test(deepLinkSymbol.toLowerCase())) {
      return {
        subjectType: 'stock',
        symbol: deepLinkSymbol.toLowerCase(),
        name: searchParams.get('name') || deepLinkSymbol
      };
    }
    return { subjectType: 'market', symbol: '', name: 'A股大盘' };
  });
  const [question, setQuestion] = useState('');
  const [mode, setMode] = useState<RoundtableMode>('standard');
  const [models, setModels] = useState<StockModelOption[]>([]);
  const [modelId, setModelId] = useState<number | undefined>(undefined);
  const [kline, setKline] = useState<KlineResult | null>(null);
  const [klineLoading, setKlineLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const { session, start, stop, restore } = useRoundtableFlow();

  // K 线对象：板块走东财 BK 体系（新浪板块无 K 线源）。
  const klineSymbol =
    subject.subjectType === 'market'
      ? 'sh000001'
      : subject.subjectType === 'sector'
        ? /^BK/i.test(subject.symbol)
          ? subject.symbol
          : ''
        : subject.symbol;

  useEffect(() => {
    if (!klineSymbol) {
      setKline(null);
      return;
    }
    let stopped = false;
    setKlineLoading(true);
    fetchKline(klineSymbol)
      .then((result) => {
        if (!stopped && result.items.length > 0) {
          setKline(result);
        } else if (!stopped) {
          setKline(null);
        }
      })
      .catch(() => {
        if (!stopped) {
          setKline(null);
        }
      })
      .finally(() => {
        if (!stopped) {
          setKlineLoading(false);
        }
      });
    return () => {
      stopped = true;
    };
  }, [klineSymbol]);

  const canStart =
    session.phase !== 'running' &&
    (subject.subjectType === 'market' ||
      (subject.subjectType === 'sector' && SECTOR_SYMBOL_RE.test(subject.symbol)) ||
      ((subject.subjectType === 'stock' || subject.subjectType === 'index') &&
        SECURITY_SYMBOL_RE.test(subject.symbol)));

  const handleStart = useCallback(async () => {
    if (!canStart) {
      return;
    }
    const error = await start(
      {
        subjectType: subject.subjectType,
        symbol: subject.symbol || undefined,
        question: question.trim() || undefined,
        mode,
        modelId
      },
      subject.name
    );
    if (error) {
      message.error(`发起会议失败：${error}`);
      return;
    }
    setTab('stage');
    setRefreshKey((key) => key + 1);
  }, [canStart, mode, modelId, question, start, subject]);

  // 模型下拉数据（加载一次，失败静默：仅少一个可选项）。
  useEffect(() => {
    let stopped = false;
    fetchStockModels()
      .then((rows) => {
        if (!stopped) {
          setModels(rows);
        }
      })
      .catch(() => undefined);
    return () => {
      stopped = true;
    };
  }, []);

  // 输入法组合确认（keyCode 229）不触发，避免中文输入选词误发起。
  const handleQuestionPressEnter: InputProps['onPressEnter'] = (event) => {
    if ((event as unknown as KeyboardEvent).isComposing) {
      return;
    }
    void handleStart();
  };

  const handleReplay = useCallback(
    async (id: number) => {
      try {
        await restore(id);
        setTab('stage');
      } catch (error) {
        message.error(error instanceof Error ? error.message : '载入会议记录失败');
      }
    },
    [restore]
  );

  const running = session.phase === 'running';
  const showStagePanel = session.phase !== 'idle' || running;

  const startButton = (
    <Permission code="stock:roundtable:use">
      <Button
        type="primary"
        icon={<ThunderboltOutlined />}
        loading={running}
        disabled={!canStart}
        onClick={() => void handleStart()}
      >
        {running ? '会议进行中…' : '召集圆桌会议'}
      </Button>
    </Permission>
  );

  return (
    <div className="flex flex-col gap-4">
      <Card
        title="🎯 股市圆桌 · 多专家智能分析"
        extra={
          <Segmented
            value={tab}
            onChange={(value) => setTab(value as 'stage' | 'history')}
            options={[
              { label: '分析台', value: 'stage' },
              { label: '会议记录', value: 'history' }
            ]}
          />
        }
      >
        {tab === 'stage' ? (
          <div className="flex flex-col gap-3">
            <SubjectPicker value={subject} onChange={setSubject} disabled={running} />
            <div className="flex flex-wrap items-center gap-2">
              {subject.subjectType === 'stock' && subject.symbol && (
                <WatchStarButton symbol={subject.symbol} name={subject.name} />
              )}
              <Input
                className="flex-1 min-w-[220px]"
                placeholder="想让专家们重点关注什么？（可选，回车直接开会）"
                value={question}
                maxLength={200}
                disabled={running}
                onChange={(event) => setQuestion(event.target.value)}
                onPressEnter={handleQuestionPressEnter}
              />
              <Select className="w-40" value={mode} disabled={running} options={MODE_OPTIONS} onChange={setMode} />
              {models.length > 0 && (
                <Select
                  className="w-44"
                  value={modelId}
                  disabled={running}
                  placeholder="模型：自动"
                  allowClear
                  onChange={(value) => setModelId(value ?? undefined)}
                  options={[
                    ...models.map((item) => ({
                      label: item.displayName,
                      value: item.id
                    }))
                  ]}
                />
              )}
              {canStart || running ? (
                startButton
              ) : (
                <Tooltip title="请先在上方搜索并选择分析对象">{startButton}</Tooltip>
              )}
            </div>
            <div className="text-xs text-text-sub">
              五位专家并行独立分析 → 交叉辩论互相质疑（立场收敛后停止）→ 主席裁决产出纪要。仅供学习研究参考，不构成投资建议。
            </div>
          </div>
        ) : (
          <div className="text-xs text-text-sub">
            在上方「分析台」可发起新会议；点击记录的「回放」查看完整讨论过程与纪要。
          </div>
        )}
      </Card>

      {tab === 'stage' && (
        <>
          {kline && !running && !showStagePanel && (
            <Card loading={klineLoading} styles={{ body: { padding: '12px 16px' } }}>
              <KlineChart result={kline} />
            </Card>
          )}
          {kline && !running && showStagePanel && (
            <Card
              size="small"
              styles={{ body: { padding: '12px 16px' } }}
              title={<span className="text-sm">{kline.name || subject.name} · 日K</span>}
            >
              <KlineChart result={kline} height={380} />
            </Card>
          )}
          {showStagePanel ? (
            <Card
              title={`🏛 ${session.subjectName || subject.name || '圆桌会议'} · 会议现场`}
              extra={
                <span className="text-xs text-text-sub">
                  {session.id ? `会议 #${session.id}` : ''}
                  {session.consensus?.engine && !session.consensus.engine.degraded
                    ? ` · ${session.consensus.engine.models.join('、')}`
                    : ''}
                </span>
              }
            >
              <RoundtableStage session={session} onStop={stop} />
            </Card>
          ) : (
            <Card className="rt-empty-state">
              <div className="flex flex-col items-center gap-3 py-6">
                <div className="flex items-center gap-4 flex-wrap justify-center">
                  {EXPERTS.map((meta) => (
                    <span key={meta.code} className="expert-avatar" style={{ background: `${meta.color}1a`, color: meta.color, width: 46, height: 46, fontSize: 24 }} title={`${meta.school}·${meta.name}`}>
                      {meta.avatar}
                    </span>
                  ))}
                  <span className="expert-avatar" style={{ background: `${MODERATOR.color}14`, color: MODERATOR.color, width: 46, height: 46, fontSize: 24 }} title={`${MODERATOR.school}·${MODERATOR.name}`}>
                    {MODERATOR.avatar}
                  </span>
                </div>
                <div className="text-sm text-text-main font-medium py-1">五位专家已就座，等待召集</div>
                <div className="text-xs text-text-sub">
                  选择上方分析对象（大盘 / 指数 / 板块 / 个股），点击「召集圆桌会议」即可开始
                </div>
              </div>
            </Card>
          )}
        </>
      )}

      {tab === 'history' && <HistoryTable onReplay={(id) => void handleReplay(id)} refreshKey={refreshKey} />}
    </div>
  );
};
