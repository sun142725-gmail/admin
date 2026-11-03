// 合规检查报告弹窗：纯展示组件（verdict 结论 / AIGC 检查项 / 敏感词命中明细 / summary 三计数），
// 不持有业务状态。review 场景由 PublishModal 经 footerSlot 注入「仍要登记」主按钮（UI 契约 §5），
// 其余场景（blocked/pass）使用默认 footer「返回修改」。
import React from 'react';
import Button from 'antd/es/button';
import Tag from 'antd/es/tag';
import Typography from 'antd/es/typography';
import { COMPLIANCE_LEVEL_LABELS, type ComplianceReport, type SensitiveHitVo } from '../../api/compliance';
import { SelfModal } from '../../components/base/SelfModal';
import { SelfTable } from '../../components/base/SelfTable';
import { COMPLIANCE_LEVEL_TAG_COLORS, fieldLabel, formatHitPosition, verdictTagMeta } from './complianceReportUI';

export interface ComplianceReportModalProps {
  open: boolean;
  report: ComplianceReport | null;
  onClose: () => void;
  /** review 场景 footer 插槽：PublishModal 注入「仍要登记」+「返回修改」按钮组 */
  footerSlot?: React.ReactNode;
}

export const ComplianceReportModal: React.FC<ComplianceReportModalProps> = ({ open, report, onClose, footerSlot }) => {
  const hitColumns = React.useMemo(
    () => [
      {
        title: '字段',
        dataIndex: 'field',
        key: 'field',
        width: 80,
        render: (v: SensitiveHitVo['field']) => fieldLabel(v)
      },
      { title: '命中词', dataIndex: 'word', key: 'word', width: 120 },
      {
        title: '级别',
        dataIndex: 'level',
        key: 'level',
        width: 80,
        render: (v: SensitiveHitVo['level']) => <Tag color={COMPLIANCE_LEVEL_TAG_COLORS[v]}>{COMPLIANCE_LEVEL_LABELS[v]}</Tag>
      },
      {
        title: '位置',
        key: 'position',
        width: 100,
        render: (_: unknown, row: SensitiveHitVo) => formatHitPosition(row.start, row.end)
      },
      // 上下文为后端 buildContextClip 产出的纯文本（MVP 不做命中片段高亮）
      { title: '上下文', dataIndex: 'context', key: 'context', ellipsis: true },
      { title: '建议词', dataIndex: 'suggestion', key: 'suggestion', width: 100, render: (v: string | null) => v || '-' }
    ],
    []
  );

  return (
    <SelfModal
      open={open}
      title="合规检查报告"
      width="md"
      onCancel={onClose}
      footer={footerSlot ?? (
        <Button type="primary" onClick={onClose}>
          返回修改
        </Button>
      )}
    >
      {report ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Tag color={verdictTagMeta(report.verdict).color}>{verdictTagMeta(report.verdict).text}</Tag>
            <Typography.Text type="secondary" className="text-xs">
              {report.verdictRule}
            </Typography.Text>
          </div>
          <div>
            {report.aigcCheck.declared ? (
              <Typography.Text type="success">已声明AI生成标识：通过</Typography.Text>
            ) : (
              <Typography.Text type="danger">{report.aigcCheck.message}</Typography.Text>
            )}
          </div>
          <SelfTable
            rowKey={(row: SensitiveHitVo) => `${row.field}-${row.start}-${row.word}`}
            loading={false}
            columns={hitColumns}
            dataSource={report.sensitiveHits}
            pagination={false}
            locale={{ emptyText: '未命中敏感词' }}
          />
          <div className="text-xs text-text-sub">
            命中统计：禁用 {report.summary.block} · 待审 {report.summary.review} · 提示 {report.summary.replace}
          </div>
        </div>
      ) : null}
    </SelfModal>
  );
};
