// 圆桌舞台：环形座次的专家卡片 + 中央主席/进度/投票 + 总结报告 + 讨论过程时间线双视图。
import React, { useState } from 'react';
import { Alert, Button, Segmented, Steps } from 'antd';
import { StopOutlined } from '@ant-design/icons';
import type { RoundtableSession } from '../useRoundtableFlow';
import { conclusionColor } from '../useRoundtableFlow';
import { EXPERTS, MODERATOR, STAGE_STEPS } from '../experts';
import { ExpertCard } from './ExpertCard';
import { ReportPanel } from './ReportPanel';
import { TimelineView } from './TimelineView';

interface Props {
  session: RoundtableSession;
  onStop?: () => void;
}

const stageIndex = (stage: string): number => {
  const index = STAGE_STEPS.findIndex((step) => step.key === stage);
  return index < 0 ? 1 : index;
};

const VoteBar: React.FC<{ session: RoundtableSession }> = ({ session }) => {
  const votes = session.votes;
  if (!votes) {
    return null;
  }
  const total = votes.bull + votes.bear + votes.neutral;
  if (total === 0) {
    return null;
  }
  const pct = (count: number) => `${(count / total) * 100}%`;
  return (
    <div className="w-full">
      <div className="flex h-3 rounded-full overflow-hidden bg-[#f0f0f0] vote-bar">
        <div className="vote-segment bg-stock-up" style={{ width: pct(votes.bull) }} />
        <div className="vote-segment bg-text-sub" style={{ width: pct(votes.neutral) }} />
        <div className="vote-segment bg-stock-down" style={{ width: pct(votes.bear) }} />
      </div>
      <div className="flex justify-between text-xs mt-1">
        <span className="text-stock-up">看多 {votes.bull}</span>
        <span className="text-text-sub">中性 {votes.neutral}</span>
        <span className="text-stock-down">看空 {votes.bear}</span>
      </div>
    </div>
  );
};

const CenterSeat: React.FC<{ session: RoundtableSession }> = ({ session }) => {
  const conclusion = session.consensus?.conclusion;
  return (
    <div className="rt-center">
      <div className="rt-center-avatar" style={{ color: MODERATOR.color, background: `${MODERATOR.color}14` }}>
        {MODERATOR.avatar}
      </div>
      <div className="text-sm font-medium mt-1">
        {MODERATOR.name}
        <span className="text-xs text-text-sub ml-1">{MODERATOR.school}</span>
      </div>
      {conclusion ? (
        <div className="rt-conclusion-seal" style={{ borderColor: conclusionColor(conclusion), color: conclusionColor(conclusion) }}>
          {session.consensus?.conclusionLabel}
        </div>
      ) : (
        <div className="text-xs text-text-sub mt-1">
          {session.phase === 'running' ? session.stageLabel || '会议进行中…' : session.stageLabel}
        </div>
      )}
      <div className="w-full mt-3">
        <VoteBar session={session} />
      </div>
    </div>
  );
};

export const RoundtableStage: React.FC<Props> = ({ session, onStop }) => {
  const running = session.phase === 'running';
  const activeRound = session.stageRound || 1;
  const [view, setView] = useState<'table' | 'timeline'>('table');
  const gridArea: Record<string, string> = {
    'stock-trend': '1 / 1 / 2 / 2',
    'stock-momentum': '1 / 3 / 2 / 4',
    'stock-flow': '3 / 1 / 4 / 2',
    'stock-value': '3 / 3 / 4 / 4',
    'stock-risk': '2 / 1 / 3 / 2'
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <Steps
          size="small"
          current={stageIndex(session.stage)}
          items={STAGE_STEPS.map((step) => ({ title: step.label }))}
          className="rt-steps flex-1 min-w-[280px]"
        />
        <div className="flex items-center gap-2">
          <Segmented
            size="small"
            value={view}
            onChange={(value) => setView(value as 'table' | 'timeline')}
            options={[
              { label: '🏛 圆桌视图', value: 'table' },
              { label: '💬 讨论过程', value: 'timeline' }
            ]}
          />
          {running && onStop && (
            <Button size="small" icon={<StopOutlined />} onClick={onStop}>
              断开直播
            </Button>
          )}
        </div>
      </div>

      {session.errorMessage && (
        <Alert type="error" showIcon message={`会议失败：${session.errorMessage}`} />
      )}

      {session.convergence && (
        <Alert
          type={session.convergence.converged ? 'success' : 'info'}
          showIcon
          message={`第 ${session.convergence.round} 轮辩论后：${session.convergence.reason}（立场翻转 ${session.convergence.stanceShift} 人）`}
        />
      )}

      {view === 'table' ? (
        <div className="rt-table">
          {EXPERTS.map((meta) => (
            <div key={meta.code} className="rt-seat" style={{ gridArea: gridArea[meta.code] }}>
              <ExpertCard runtime={session.experts[meta.code]} activeRound={activeRound} />
            </div>
          ))}
          <div className="rt-seat rt-seat-center" style={{ gridArea: '2 / 2 / 3 / 3' }}>
            <CenterSeat session={session} />
          </div>
        </div>
      ) : (
        <div className="max-h-[560px] overflow-y-auto pr-1">
          <TimelineView items={session.timeline} />
        </div>
      )}

      {(session.summaryText || session.phase === 'completed') && (
        <ReportPanel summaryText={session.summaryText} consensus={session.consensus} />
      )}
    </div>
  );
};
