// AI 用量报表页：时间/模型/项目/类型筛选 + 汇总卡 + 三视图（按天/按模型/按项目）+ CSV 导出。
// 一次查询返回三视图（后端单查询聚合），切换 Tab 不重新请求；导出为当前视图行（utils/csv 复用）。
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Button from 'antd/es/button';
import DatePicker from 'antd/es/date-picker';
import Form from 'antd/es/form';
import Select from 'antd/es/select';
import Tabs from 'antd/es/tabs';
import { DownloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs, { Dayjs } from 'dayjs';
import { SelfTable } from '../../components/base/SelfTable';
import { FilterBar } from '../../components/business/FilterBar';
import { PageHeader } from '../../components/business/PageHeader';
import { PagePanel } from '../../components/business/PagePanel';
import { StatCard } from '../../components/business/StatCard';
import { useApiMessage } from '../../hooks/useApiMessage';
import {
  AiModel,
  UsageReportRow,
  UsageReportVo,
  fetchUsageReport
} from '../../api/ai';
import { NovelProjectSummary, listNovelProjects } from '../../api/novelVideo';
import { listModels } from '../../api/ai';
import { downloadCsv } from '../../utils/csv';

const { RangePicker } = DatePicker;

const KIND_OPTIONS = [
  { value: 'chat', label: '对话' },
  { value: 'roundtable', label: '圆桌' },
  { value: 'image', label: '生图' },
  { value: 'video', label: '视频' },
  { value: 'tts', label: '语音合成' }
];

type ReportTab = 'day' | 'model' | 'project';

interface ReportFilterValues {
  range?: [Dayjs, Dayjs];
  modelId?: number;
  projectId?: number;
  kind?: string;
}

// 金额展示：null = 该分组无价/混合币种（后端「未覆盖」口径），显示 —。
const fmtCostCell = (row: UsageReportRow): string =>
  row.cost == null ? '—' : `${row.cost.toFixed(4)} ${row.currency ?? ''}`;

export const UsageReportPage: React.FC = () => {
  const [report, setReport] = useState<UsageReportVo | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<ReportTab>('day');
  const [models, setModels] = useState<AiModel[]>([]);
  const [projects, setProjects] = useState<NovelProjectSummary[]>([]);
  const [form] = Form.useForm<ReportFilterValues>();
  const msg = useApiMessage();

  // 时间预设每次进入页面现算（模块级固化会跨天漂移）。
  const rangePresets = useMemo(
    () => [
      { label: '今天', value: [dayjs().startOf('day'), dayjs().endOf('day')] as [Dayjs, Dayjs] },
      {
        label: '近 7 天',
        value: [dayjs().subtract(6, 'day').startOf('day'), dayjs().endOf('day')] as [Dayjs, Dayjs]
      },
      {
        label: '近 30 天',
        value: [dayjs().subtract(29, 'day').startOf('day'), dayjs().endOf('day')] as [Dayjs, Dayjs]
      }
    ],
    []
  );

  useEffect(() => {
    void listModels().then(setModels).catch(() => undefined);
    void listNovelProjects().then(setProjects).catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const values = await form.validateFields();
      setReport(
        await fetchUsageReport({
          from: values.range?.[0]?.toISOString(),
          to: values.range?.[1]?.toISOString(),
          modelId: values.modelId,
          projectId: values.projectId,
          kind: values.kind
        })
      );
    } finally {
      setLoading(false);
    }
  }, [form]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleReset = useCallback(() => {
    form.resetFields();
    void load();
  }, [form, load]);

  const summary = report?.summary;
  const costText = summary
    ? Object.entries(summary.costByCurrency)
        .map(([currency, cost]) => `${currency} ${cost.toFixed(4)}`)
        .join(' / ') || '—'
    : '—';

  const currentRows: UsageReportRow[] = useMemo(() => {
    if (!report) {
      return [];
    }
    return activeTab === 'day' ? report.byDay : activeTab === 'model' ? report.byModel : report.byProject;
  }, [activeTab, report]);

  const costColumn: ColumnsType<UsageReportRow> = [
    { title: '调用次数', dataIndex: 'calls', key: 'calls', width: 100 },
    { title: 'Token', dataIndex: 'tokens', key: 'tokens', width: 120 },
    { title: '数量（张/秒/字符）', dataIndex: 'unitCount', key: 'unitCount', width: 150 },
    {
      title: '金额',
      key: 'cost',
      width: 160,
      render: (_: unknown, row: UsageReportRow) => fmtCostCell(row)
    }
  ];

  const columnsByTab: Record<ReportTab, ColumnsType<UsageReportRow>> = {
    day: [{ title: '日期', dataIndex: 'day', key: 'day' }, ...costColumn],
    model: [
      { title: '模型', dataIndex: 'modelName', key: 'modelName' },
      ...costColumn
    ],
    project: [
      { title: '制片厂项目', dataIndex: 'projectName', key: 'projectName' },
      ...costColumn
    ]
  };

  const handleExport = useCallback(() => {
    if (!report || currentRows.length === 0) {
      msg.info('当前视图没有可导出的数据');
      return;
    }
    const firstCol: Record<ReportTab, { title: string; pick: (row: UsageReportRow) => string }> = {
      day: { title: '日期', pick: (row) => row.day ?? '' },
      model: { title: '模型', pick: (row) => row.modelName ?? String(row.modelId ?? '未知模型') },
      project: { title: '制片厂项目', pick: (row) => row.projectName ?? String(row.projectId ?? '') }
    };
    const head = firstCol[activeTab];
    downloadCsv(
      `用量报表-${dayjs().format('YYYYMMDD-HHmmss')}.csv`,
      [head.title, '调用次数', 'Token', '数量', '金额', '币种'],
      currentRows.map((row) => [
        head.pick(row),
        row.calls,
        row.tokens,
        row.unitCount,
        row.cost ?? '',
        row.currency ?? ''
      ])
    );
    msg.success(`已导出 ${currentRows.length} 行`);
  }, [activeTab, currentRows, msg, report]);

  return (
    <div className="page-fill">
      <PageHeader
        className="shrink-0"
        title="用量报表"
        actions={
          <Button icon={<DownloadOutlined />} onClick={handleExport}>
            导出 CSV
          </Button>
        }
      />
      <PagePanel className="shrink-0 mb-4">
        <FilterBar<ReportFilterValues> form={form} onSearch={() => void load()} onReset={handleReset} searchLoading={loading}>
          <Form.Item name="range" label="时间范围">
            <RangePicker presets={rangePresets} showTime allowClear />
          </Form.Item>
          <Form.Item name="modelId" label="模型">
            <Select
              allowClear
              placeholder="全部模型"
              options={models.map((model) => ({ value: model.id, label: model.displayName }))}
              className="w-full sm:w-[180px]"
            />
          </Form.Item>
          <Form.Item name="projectId" label="项目">
            <Select
              allowClear
              placeholder="全部项目"
              options={projects.map((project) => ({ value: project.id, label: project.name }))}
              className="w-full sm:w-[180px]"
            />
          </Form.Item>
          <Form.Item name="kind" label="类型">
            <Select allowClear placeholder="全部类型" options={KIND_OPTIONS} className="w-full sm:w-[140px]" />
          </Form.Item>
        </FilterBar>
      </PagePanel>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 shrink-0 mb-4">
        <StatCard title="总调用" value={summary?.calls ?? 0} loading={loading} />
        <StatCard title="总 Token" value={summary?.tokens ?? 0} loading={loading} />
        <StatCard title="总数量（张/秒/字符）" value={summary?.unitCount ?? 0} loading={loading} />
        <StatCard
          title="总成本"
          value={costText}
          loading={loading}
          tip={
            summary && summary.uncoveredCalls > 0
              ? `未覆盖 ${summary.uncoveredCalls} 次调用（无价格行且无兜底价）`
              : undefined
          }
        />
      </div>

      <PagePanel className="flex-1 min-h-0 flex flex-col">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as ReportTab)}
          items={[
            {
              key: 'day',
              label: '按天',
              children: (
                <SelfTable<UsageReportRow>
                  rowKey="day"
                  loading={loading}
                  columns={columnsByTab.day}
                  dataSource={report?.byDay ?? []}
                  pagination={false}
                  fill
                />
              )
            },
            {
              key: 'model',
              label: '按模型',
              children: (
                <SelfTable<UsageReportRow>
                  rowKey={(row) => String(row.modelId ?? 'null')}
                  loading={loading}
                  columns={columnsByTab.model}
                  dataSource={report?.byModel ?? []}
                  pagination={false}
                  fill
                />
              )
            },
            {
              key: 'project',
              label: '按项目',
              children: (
                <SelfTable<UsageReportRow>
                  rowKey="projectId"
                  loading={loading}
                  columns={columnsByTab.project}
                  dataSource={report?.byProject ?? []}
                  pagination={false}
                  fill
                />
              )
            }
          ]}
        />
      </PagePanel>
    </div>
  );
};
