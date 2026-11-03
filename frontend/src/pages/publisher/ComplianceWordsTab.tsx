// 敏感词库 Tab（发布矩阵第四 Tab 内容组件）：词库 CRUD + level/status/keyword 过滤，服务端分页。
// 可见性不在本组件处理：Tab 条目由 PublisherPage 按 compliance:view 条件加入——Permission.hide
// 模式只能让 children 返回 null，控制不了 Tabs 的 label，双重判断只会漂移（UI 契约 §2）。
// 组件内部 CRUD 按钮包 <Permission code="compliance:manage">（无 manage 码可看列表不可写）。
// 懒挂载：antd Tabs 未激活 pane 不渲染 children，首切才拉数据（照 PublisherPage MetricsTab 先例）。
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Button from 'antd/es/button';
import Form from 'antd/es/form';
import Input from 'antd/es/input';
import Select from 'antd/es/select';
import Switch from 'antd/es/switch';
import Tag from 'antd/es/tag';
import { PlusOutlined } from '@ant-design/icons';
import {
  COMPLIANCE_LEVELS,
  COMPLIANCE_LEVEL_LABELS,
  ComplianceWordVo,
  QueryComplianceWordsParams,
  SaveComplianceWordPayload,
  createComplianceWord,
  deleteComplianceWord,
  listComplianceWords,
  updateComplianceWord,
  type ComplianceLevel
} from '../../api/compliance';
import { FilterBar } from '../../components/business/FilterBar';
import { SelfForm } from '../../components/base/SelfForm';
import { SelfModal } from '../../components/base/SelfModal';
import { SelfTable } from '../../components/base/SelfTable';
import { Permission } from '../../components/permission/Permission';
import { useApiMessage } from '../../hooks/useApiMessage';
import { COMPLIANCE_LEVEL_TAG_COLORS } from '../flow/complianceReportUI';

const LEVEL_OPTIONS = COMPLIANCE_LEVELS.map((value) => ({ value, label: COMPLIANCE_LEVEL_LABELS[value] }));

const STATUS_OPTIONS = [
  { value: 1, label: '启用' },
  { value: 0, label: '停用' }
];

interface WordsFilterValues {
  level?: ComplianceLevel;
  status?: 0 | 1;
  keyword?: string;
}

interface WordFormValues {
  word: string;
  level: ComplianceLevel;
  status: boolean;
  suggestion?: string;
  remark?: string;
}

const PAGE_SIZE = 20;

// 词库新建/编辑双模式弹窗（照 PublisherPage AccountModal 范式）：
// 前端 trim 仅 UX；唯一性与查重以后端服务层 trim 为准（修订⑤），422「该敏感词已存在」经 msg.errorFrom 呈现。
const WordModal: React.FC<{
  open: boolean;
  word: ComplianceWordVo | null;
  onCancel: () => void;
  onSaved: () => void;
}> = ({ open, word, onCancel, onSaved }) => {
  const [form] = Form.useForm<WordFormValues>();
  const msg = useApiMessage();
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    form.resetFields();
    form.setFieldsValue({
      word: word?.word ?? '',
      level: word?.level ?? 'block',
      status: (word?.status ?? 1) === 1,
      suggestion: word?.suggestion ?? '',
      remark: word?.remark ?? ''
    });
  }, [open, word, form]);

  const submit = async (values: WordFormValues) => {
    setSaving(true);
    try {
      if (word) {
        // 编辑：word 未改动不传（PATCH「不传不改」，避免与自身唯一键无谓判重）；
        // suggestion/remark 恒传（空串 = 清空，否则后端「不传不改」无法置空）
        const payload: Partial<SaveComplianceWordPayload> = {
          level: values.level,
          status: values.status ? 1 : 0,
          suggestion: values.suggestion?.trim() ?? '',
          remark: values.remark?.trim() ?? ''
        };
        const wordTrimmed = values.word.trim();
        if (wordTrimmed !== word.word) {
          payload.word = wordTrimmed;
        }
        await updateComplianceWord(word.id, payload);
        msg.success('敏感词已更新');
      } else {
        const payload: SaveComplianceWordPayload = {
          word: values.word.trim(),
          level: values.level,
          status: values.status ? 1 : 0
        };
        if (values.suggestion?.trim()) {
          payload.suggestion = values.suggestion.trim();
        }
        if (values.remark?.trim()) {
          payload.remark = values.remark.trim();
        }
        await createComplianceWord(payload);
        msg.success('敏感词已创建');
      }
      onSaved();
      onCancel();
    } catch (error) {
      msg.errorFrom(error, '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SelfModal
      open={open}
      title={word ? '编辑敏感词' : '新建敏感词'}
      onCancel={onCancel}
      onOk={() => void form.submit()}
      confirmLoading={saving}
      destroyOnHidden
    >
      <SelfForm form={form} layout="vertical" onFinish={(values) => void submit(values)}>
        <Form.Item
          name="word"
          label="敏感词"
          rules={[{ required: true, message: '请输入敏感词' }, { max: 64, message: '最长 64 字符' }]}
        >
          <Input placeholder="敏感词原文（入库时自动去除首尾空格）" maxLength={64} />
        </Form.Item>
        <Form.Item name="level" label="级别" rules={[{ required: true, message: '请选择级别' }]}>
          <Select options={LEVEL_OPTIONS} placeholder="请选择级别" />
        </Form.Item>
        <Form.Item name="status" label="状态" valuePropName="checked">
          <Switch checkedChildren="启用" unCheckedChildren="停用" />
        </Form.Item>
        <Form.Item name="suggestion" label="建议词">
          <Input placeholder="replace 级替换建议（可选）" maxLength={64} />
        </Form.Item>
        <Form.Item name="remark" label="备注">
          <Input.TextArea rows={2} maxLength={255} placeholder="备注（可选）" />
        </Form.Item>
      </SelfForm>
    </SelfModal>
  );
};

export const ComplianceWordsTab: React.FC = () => {
  const msg = useApiMessage();
  const [form] = Form.useForm<WordsFilterValues>();
  const [items, setItems] = useState<ComplianceWordVo[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ComplianceWordVo | null>(null);

  // 服务端分页：拉取目标页（显式传参避免闭包陈旧值）；level/status/keyword 全部可选
  const load = useCallback(
    async (targetPage: number, targetPageSize: number) => {
      setLoading(true);
      try {
        const values = form.getFieldsValue();
        const params: QueryComplianceWordsParams = {
          page: targetPage,
          pageSize: targetPageSize,
          ...(values.level ? { level: values.level } : {}),
          ...(values.status === 0 || values.status === 1 ? { status: values.status } : {}),
          ...(values.keyword?.trim() ? { keyword: values.keyword.trim() } : {})
        };
        const result = await listComplianceWords(params);
        setItems(result.items);
        setTotal(result.total);
      } catch (error) {
        msg.errorFrom(error, '敏感词库加载失败');
      } finally {
        setLoading(false);
      }
    },
    [form, msg]
  );

  useEffect(() => {
    void load(1, PAGE_SIZE);
  }, [load]);

  const search = useCallback(() => {
    setPage(1);
    void load(1, pageSize);
  }, [load, pageSize]);

  const reset = useCallback(() => {
    form.resetFields();
    setPage(1);
    void load(1, pageSize);
  }, [form, load, pageSize]);

  const removeWord = useCallback(
    async (row: ComplianceWordVo) => {
      try {
        await deleteComplianceWord(row.id);
        msg.success('敏感词已删除');
        await load(page, pageSize);
      } catch (error) {
        msg.errorFrom(error, '删除失败');
      }
    },
    [load, msg, page, pageSize]
  );

  const columns = useMemo(
    () => [
      { title: '词', dataIndex: 'word', key: 'word' },
      {
        title: '级别',
        dataIndex: 'level',
        key: 'level',
        width: 90,
        render: (v: ComplianceLevel) => <Tag color={COMPLIANCE_LEVEL_TAG_COLORS[v]}>{COMPLIANCE_LEVEL_LABELS[v]}</Tag>
      },
      { title: '状态', dataIndex: 'status', key: 'status', width: 80, render: (v: number) => (v === 1 ? '启用' : '停用') },
      { title: '建议词', dataIndex: 'suggestion', key: 'suggestion', render: (v: string | null) => v || '-' },
      { title: '备注', dataIndex: 'remark', key: 'remark', ellipsis: true, render: (v: string | null) => v || '-' },
      {
        title: '操作',
        key: 'actions',
        width: 130,
        render: (_: unknown, row: ComplianceWordVo) => (
          <Permission code="compliance:manage">
            <>
              <Button
                size="small"
                type="link"
                onClick={() => {
                  setEditing(row);
                  setModalOpen(true);
                }}
              >
                编辑
              </Button>
              <Button size="small" type="link" danger onClick={() => void removeWord(row)}>
                删除
              </Button>
            </>
          </Permission>
        )
      }
    ],
    [removeWord]
  );

  return (
    <div className="flex flex-col gap-3">
      <FilterBar<WordsFilterValues>
        form={form}
        onSearch={search}
        onReset={reset}
        searchLoading={loading}
        actions={
          <Form.Item>
            <Permission code="compliance:manage">
              <Button
                type="primary"
                icon={<PlusOutlined />}
                onClick={() => {
                  setEditing(null);
                  setModalOpen(true);
                }}
              >
                新建敏感词
              </Button>
            </Permission>
          </Form.Item>
        }
      >
        <Form.Item name="level" label="级别">
          <Select allowClear placeholder="全部级别" options={LEVEL_OPTIONS} className="w-full sm:w-[140px]" />
        </Form.Item>
        <Form.Item name="status" label="状态">
          <Select allowClear placeholder="全部状态" options={STATUS_OPTIONS} className="w-full sm:w-[120px]" />
        </Form.Item>
        <Form.Item name="keyword" label="关键词">
          <Input
            allowClear
            placeholder="词模糊（字面子串匹配）"
            maxLength={64}
            className="w-full sm:w-[200px]"
            onPressEnter={search}
          />
        </Form.Item>
      </FilterBar>
      <SelfTable
        rowKey="id"
        loading={loading}
        columns={columns}
        dataSource={items}
        pagination={{
          current: page,
          pageSize,
          total,
          onChange: (nextPage, nextPageSize) => {
            setPage(nextPage);
            setPageSize(nextPageSize);
            void load(nextPage, nextPageSize);
          }
        }}
      />
      <WordModal
        open={modalOpen}
        word={editing}
        onCancel={() => setModalOpen(false)}
        onSaved={() => void load(page, pageSize)}
      />
    </div>
  );
};
