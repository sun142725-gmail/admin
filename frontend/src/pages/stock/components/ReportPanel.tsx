// 会议纪要报告面板：渲染主席总结（分节样式）+ 结论徽章 + 复制。
import React, { useMemo } from 'react';
import { Alert, Button, Card, message } from 'antd';
import { CopyOutlined } from '@ant-design/icons';
import type { RoundtableConsensus } from '../../../api/stock';
import { conclusionColor } from '../useRoundtableFlow';

interface Props {
  summaryText: string;
  consensus: RoundtableConsensus | null;
}

const renderLine = (line: string, index: number) => {
  const trimmed = line.trim();
  if (!trimmed) {
    return <div key={index} className="h-2" />;
  }
  if (trimmed.startsWith('## ')) {
    return (
      <div key={index} className="report-heading">
        {trimmed.slice(3)}
      </div>
    );
  }
  if (trimmed.startsWith('【结论】')) {
    return (
      <div key={index} className="report-conclusion-line">
        {trimmed}
      </div>
    );
  }
  if (trimmed.startsWith('>')) {
    return (
      <div key={index} className="report-quote">
        {trimmed.replace(/^>\s*/, '')}
      </div>
    );
  }
  return <div key={index}>{trimmed}</div>;
};

export const ReportPanel: React.FC<Props> = ({ summaryText, consensus }) => {
  const lines = useMemo(() => summaryText.split('\n'), [summaryText]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(summaryText);
      message.success('会议纪要已复制');
    } catch {
      message.error('复制失败，请手动选择文本复制');
    }
  };

  if (!summaryText) {
    return null;
  }

  return (
    <Card
      title={
        <span>
          📜 会议纪要
          {consensus && (
            <span
              className="rt-conclusion-seal ml-2"
              style={{ borderColor: conclusionColor(consensus.conclusion), color: conclusionColor(consensus.conclusion) }}
            >
              {consensus.conclusionLabel}
            </span>
          )}
        </span>
      }
      extra={
        <Button size="small" icon={<CopyOutlined />} onClick={copy}>
          复制
        </Button>
      }
      className="report-card"
    >
      {consensus?.engine?.degraded && (
        <Alert
          type="warning"
          showIcon
          className="mb-3"
          message={`渠道波动：${consensus.engine.localCount}/${consensus.engine.llmCount + consensus.engine.localCount} 次发言由本地规则引擎补位${
            consensus.engine.debateSkipped ? '（辩论轮已跳过）' : ''
          }`}
        />
      )}
      <div className="report-body text-sm leading-6">{lines.map(renderLine)}</div>
    </Card>
  );
};
