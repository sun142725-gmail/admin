// 讨论过程时间线：按轮次分组完整呈现各轮观点流（实时流式 + 历史回放共用）。
import React from 'react';
import { Tag } from 'antd';
import type { TimelineItem } from '../useRoundtableFlow';
import { STANCE_LABEL, expertOf } from '../experts';

/** 把 @专家名 等标记做轻量高亮。 */
const renderText = (text: string) => {
  const parts = text.split(/(@[\u4e00-\u9fa5A-Za-z·]{1,12})/g);
  return parts.map((part, index) => {
    if (/^@/.test(part)) {
      return (
        <span key={index} className="mention-highlight">
          {part}
        </span>
      );
    }
    return <span key={index}>{part}</span>;
  });
};

export const TimelineView: React.FC<{ items: TimelineItem[] }> = ({ items }) => {
  if (items.length === 0) {
    return <div className="text-xs text-text-sub py-4 text-center">尚未开始发言</div>;
  }
  // 按轮次分组：独立分析 / 辩论 R2、R3…，组间有分隔与标题。
  const groups: Array<{ round: number; items: TimelineItem[] }> = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.round === item.round) {
      last.items.push(item);
    } else {
      groups.push({ round: item.round, items: [item] });
    }
  }
  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) => (
        <div key={group.round}>
          <div className="timeline-group-header">
            <span className="timeline-group-badge">R{group.round}</span>
            <span className="text-xs text-text-sub">
              {group.round <= 1 ? '第一轮 · 独立分析（并行）' : `辩论 · 第 ${group.round} 轮（串行互相质疑）`}
            </span>
            <span className="timeline-group-line" />
          </div>
          <div className="timeline-list">
            {group.items.map((item) => (
              <TimelineEntry key={item.key} item={item} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

const TimelineEntry: React.FC<{ item: TimelineItem }> = ({ item }) => {
  const meta = expertOf(item.code);
  const stance = item.stance;
  return (
    <div className={`timeline-item ${item.speaking ? 'timeline-item-speaking' : ''}`}>
      <div className="timeline-marker" style={{ background: meta.color }} />
      <div className="timeline-body">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium">
            {meta.avatar} {item.name}
            <span className="text-xs text-text-sub ml-1">{item.school}</span>
          </span>
          {stance ? (
            <Tag
              color={stance.direction === 'bull' ? 'red' : stance.direction === 'bear' ? 'green' : 'default'}
              style={{ marginInlineEnd: 0 }}
            >
              {STANCE_LABEL[stance.direction]} · {stance.confidence}
            </Tag>
          ) : item.failed ? (
            <Tag color="error" style={{ marginInlineEnd: 0 }}>
              离线
            </Tag>
          ) : (
            item.speaking && (
              <Tag color="processing" style={{ marginInlineEnd: 0 }}>
                发言中…
              </Tag>
            )
          )}
        </div>
        <div className="timeline-text text-sm leading-6">
          {renderText(item.text || (item.speaking ? '正在思考…' : ''))}
          {item.speaking && <span className="caret-blink">▍</span>}
        </div>
      </div>
    </div>
  );
};
