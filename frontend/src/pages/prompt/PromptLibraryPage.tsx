// 图片提示词库页：风格模板卡片墙（分类/来源工具筛选 + 模糊搜索 + 复制 Prompt + 新建/编辑/批量同步）。
// 图文流水线按 category 引用模板，模板正文中 {{content}} 会被场景文本替换。
// 浏览走 /prompt-library（分页 + 细粒度权限 flow:prompt:view），增删改走 /prompt-templates CRUD。
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Button,
  Card,
  Empty,
  Form,
  Image,
  Input,
  Modal,
  Pagination,
  Popconfirm,
  Select,
  Space,
  Tag,
  Typography,
  message
} from 'antd';
import { CopyOutlined, DeleteOutlined, EditOutlined, ExportOutlined, PlusOutlined, ReloadOutlined, SyncOutlined } from '@ant-design/icons';
import { Permission } from '../../components/permission/Permission';
import {
  PROMPT_CATEGORIES,
  PromptImageVo,
  PromptLibraryStatsVo,
  SyncPromptImageItem,
  createPromptTemplate,
  deletePromptTemplate,
  listPromptImages,
  promptLibraryStats,
  syncPromptImages,
  updatePromptTemplate
} from '../../api/promptLibrary';
import '../flow/flow-pages.css';

const CATEGORY_COLOR: Record<string, string> = {
  illustrated: 'gold',
  poster: 'purple',
  anime: 'geekblue',
  ui: 'cyan',
  general: 'default'
};

interface TemplateFormValues {
  name: string;
  category: string;
  styleTags?: string;
  template: string;
  negativePrompt?: string;
  exampleImageUrl?: string;
  source?: string;
}

interface SyncFormValues {
  category?: string;
  sourceTool?: string;
  prompts: string;
}

// 同步单次上限与后端 SyncPromptTemplatesDto（ArrayMaxSize(200)）对齐。
const SYNC_MAX_ITEMS = 200;

export const PromptLibraryPage: React.FC = () => {
  const [items, setItems] = useState<PromptImageVo[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<PromptLibraryStatsVo | null>(null);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState<string | undefined>();
  const [sourceTool, setSourceTool] = useState<string | undefined>();
  const [keyword, setKeyword] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<PromptImageVo | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [form] = Form.useForm<TemplateFormValues>();
  const [syncForm] = Form.useForm<SyncFormValues>();

  // 分类来源：固定枚举 + 库里实际出现的分类（同步允许自由扩展，stats.byCategory 是精确口径）。
  const categoryOptions = useMemo(() => {
    const known = new Map(PROMPT_CATEGORIES.map((item) => [item.value, item]));
    (stats?.byCategory ?? []).forEach(({ category: key }) => {
      if (!known.has(key)) {
        known.set(key, { value: key, label: key });
      }
    });
    return [...known.values()];
  }, [stats]);

  // 来源工具选项从已加载条目累积（后端暂无 distinct 来源统计接口）。
  const [sourceToolOptions, setSourceToolOptions] = useState<Array<{ value: string; label: string }>>([]);
  const collectSourceTools = useCallback((rows: PromptImageVo[]) => {
    setSourceToolOptions((prev) => {
      const known = new Map(prev.map((item) => [item.value, item]));
      rows.forEach((row) => {
        const tool = (row.source ?? '').trim();
        if (tool && !known.has(tool)) {
          known.set(tool, { value: tool, label: tool });
        }
      });
      return [...known.values()];
    });
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await listPromptImages({
        category,
        sourceTool,
        keyword: keyword || undefined,
        page,
        pageSize
      });
      setItems(result.items);
      setTotal(result.total);
      collectSourceTools(result.items);
    } catch {
      // http 层已统一提示
    } finally {
      setLoading(false);
    }
  }, [category, sourceTool, keyword, page, pageSize, collectSourceTools]);

  const refreshStats = useCallback(async () => {
    try {
      setStats(await promptLibraryStats());
    } catch {
      // 统计失败不阻塞列表
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    void refreshStats();
  }, [refreshStats]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ category: 'illustrated' });
    setModalOpen(true);
  };

  const openEdit = (tpl: PromptImageVo) => {
    setEditing(tpl);
    form.setFieldsValue({
      name: tpl.name,
      category: tpl.category,
      styleTags: tpl.styleTags ?? undefined,
      template: tpl.template,
      negativePrompt: tpl.negativePrompt ?? undefined,
      exampleImageUrl: tpl.exampleImageUrl ?? undefined,
      source: tpl.source ?? undefined
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    const values = await form.validateFields();
    setSaving(true);
    try {
      if (editing) {
        await updatePromptTemplate(editing.id, values);
        message.success('模板已更新');
      } else {
        await createPromptTemplate(values);
        message.success('模板已创建');
      }
      setModalOpen(false);
      void refresh();
      void refreshStats();
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (tpl: PromptImageVo) => {
    try {
      await deletePromptTemplate(tpl.id);
      message.success('已删除');
      void refresh();
      void refreshStats();
    } catch {
      // ignore
    }
  };

  const handleCopy = async (tpl: PromptImageVo) => {
    try {
      await navigator.clipboard.writeText(tpl.template);
      message.success('Prompt 已复制');
    } catch {
      message.warning('复制失败，请手动选择文本');
    }
  };

  // 批量同步（幂等）：每行一个 Prompt，重复正文自动跳过。
  const handleSync = async () => {
    const values = await syncForm.validateFields();
    const prompts = values.prompts
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (prompts.length === 0) {
      message.warning('请粘贴至少一条 Prompt');
      return;
    }
    if (prompts.length > SYNC_MAX_ITEMS) {
      message.warning(`单次最多 ${SYNC_MAX_ITEMS} 条，已截取前 ${SYNC_MAX_ITEMS} 条`);
    }
    const payload: SyncPromptImageItem[] = prompts.slice(0, SYNC_MAX_ITEMS).map((prompt) => ({
      prompt,
      category: values.category?.trim() || undefined,
      sourceTool: values.sourceTool?.trim() || undefined
    }));
    setSyncing(true);
    try {
      const result = await syncPromptImages(payload);
      message.success(`同步完成：新增 ${result.inserted}，跳过 ${result.skipped}（共提交 ${result.received} 条）`);
      setSyncOpen(false);
      syncForm.resetFields();
      setPage(1);
      void refresh();
      void refreshStats();
    } catch {
      // ignore
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card
      title="图片提示词库"
      extra={
        <Space wrap>
          <Select
            allowClear
            placeholder="全部类型"
            style={{ width: 130 }}
            options={categoryOptions}
            value={category}
            onChange={(value) => {
              setCategory(value);
              setPage(1);
            }}
          />
          <Select
            allowClear
            showSearch
            placeholder="来源工具"
            style={{ width: 130 }}
            options={sourceToolOptions}
            value={sourceTool}
            onChange={(value) => {
              setSourceTool(value);
              setPage(1);
            }}
          />
          <Input.Search
            placeholder="搜索名称/正文"
            style={{ width: 200 }}
            onSearch={(value) => {
              setKeyword(value.trim());
              setPage(1);
            }}
            allowClear
          />
          <Button icon={<ReloadOutlined />} onClick={() => void refresh()} loading={loading} />
          <Permission code="flow:prompt:manage">
            <Button icon={<SyncOutlined />} onClick={() => setSyncOpen(true)}>
              批量同步
            </Button>
          </Permission>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建模板
          </Button>
        </Space>
      }
    >
      <div className="prompt-library-stats">
        <Typography.Text type="secondary" style={{ fontSize: 12 }}>
          已收录 {stats ? stats.total : '—'} 条 / 当前展示 {total} 条
        </Typography.Text>
      </div>

      {items.length === 0 && !loading ? (
        <Empty description="还没有提示词，点击右上角新建或批量同步导入" />
      ) : (
        <>
          <div className="prompt-library-grid">
            {items.map((tpl) => (
              <Card
                key={tpl.id}
                size="small"
                hoverable
                cover={
                  tpl.exampleImageUrl ? (
                    <Image
                      src={tpl.exampleImageUrl}
                      alt={tpl.name}
                      style={{ height: 160, objectFit: 'cover' }}
                      preview={false}
                    />
                  ) : (
                    <div className="prompt-library-card-placeholder">无示例图</div>
                  )
                }
                actions={[
                  <CopyOutlined key="copy" onClick={() => void handleCopy(tpl)} />,
                  <EditOutlined key="edit" onClick={() => openEdit(tpl)} />,
                  <Popconfirm key="del" title="确定删除该模板？" onConfirm={() => void handleDelete(tpl)}>
                    <DeleteOutlined />
                  </Popconfirm>
                ]}
              >
                <Card.Meta
                  title={
                    <Space size={4} wrap>
                      <span style={{ fontSize: 13 }}>{tpl.name}</span>
                      <Tag color={CATEGORY_COLOR[tpl.category] ?? 'default'} style={{ marginRight: 0 }}>
                        {PROMPT_CATEGORIES.find((c) => c.value === tpl.category)?.label ?? tpl.category}
                      </Tag>
                    </Space>
                  }
                  description={
                    <>
                      <Typography.Paragraph
                        ellipsis={{ rows: 3, expandable: true, symbol: '展开全文' }}
                        type="secondary"
                        style={{ fontSize: 12, marginBottom: 4 }}
                      >
                        {tpl.template}
                      </Typography.Paragraph>
                      <Space size={4} wrap style={{ marginBottom: 2 }}>
                        {(tpl.source || tpl.sourceModel) && (
                          <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                            {tpl.source}
                            {tpl.sourceModel ? ` · ${tpl.sourceModel}` : ''}
                          </Typography.Text>
                        )}
                        {tpl.sourceUrl && (
                          <a href={tpl.sourceUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>
                            查看来源 <ExportOutlined />
                          </a>
                        )}
                      </Space>
                      <Space size={4} wrap>
                        {tpl.styleTags
                          ?.split(',')
                          .filter(Boolean)
                          .slice(0, 3)
                          .map((tag) => (
                            <Tag key={tag} style={{ fontSize: 11 }}>
                              {tag.trim()}
                            </Tag>
                          ))}
                        <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                          引用 {tpl.referenceCount}
                        </Typography.Text>
                      </Space>
                    </>
                  }
                />
              </Card>
            ))}
          </div>
          <div className="prompt-library-pagination">
            <Pagination
              current={page}
              pageSize={pageSize}
              total={total}
              showSizeChanger
              pageSizeOptions={[12, 20, 40, 60]}
              showTotal={(count) => `共 ${count} 条`}
              onChange={(next, nextSize) => {
                setPage(nextSize !== pageSize ? 1 : next);
                setPageSize(nextSize);
              }}
            />
          </div>
        </>
      )}

      <Modal
        title={editing ? '编辑模板' : '新建模板'}
        open={modalOpen}
        onOk={() => void handleSave()}
        onCancel={() => setModalOpen(false)}
        confirmLoading={saving}
        okText="保存"
        width={640}
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="模板名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder="如：水彩绘本插画" maxLength={128} />
          </Form.Item>
          <Form.Item name="category" label="风格分类" rules={[{ required: true, message: '请选择分类' }]}>
            <Select options={categoryOptions} />
          </Form.Item>
          <Form.Item name="styleTags" label="风格标签（逗号分隔）">
            <Input placeholder="水彩,手绘,温暖" maxLength={255} />
          </Form.Item>
          <Form.Item
            name="template"
            label="Prompt 模板"
            rules={[{ required: true, message: '请输入模板正文' }]}
            extra="支持 {{content}} 占位，流水线生图时会替换为分幕内容"
          >
            <Input.TextArea rows={4} maxLength={8000} showCount />
          </Form.Item>
          <Form.Item name="negativePrompt" label="反向提示词（可选）">
            <Input.TextArea rows={2} maxLength={2000} />
          </Form.Item>
          <Form.Item name="exampleImageUrl" label="示例图 URL（可选）">
            <Input placeholder="https://..." maxLength={500} />
          </Form.Item>
          <Form.Item name="source" label="来源（可选）">
            <Input placeholder="原创 / 复刻自 xxx" maxLength={64} />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title="批量同步提示词"
        open={syncOpen}
        onOk={() => void handleSync()}
        onCancel={() => setSyncOpen(false)}
        confirmLoading={syncing}
        okText="开始同步"
        width={640}
      >
        <Form form={syncForm} layout="vertical">
          <Form.Item name="category" label="统一分类（可选，默认 general）">
            <Input placeholder="如：anime" maxLength={64} />
          </Form.Item>
          <Form.Item name="sourceTool" label="统一来源工具（可选）">
            <Input placeholder="如：midjourney / novelai" maxLength={64} />
          </Form.Item>
          <Form.Item
            name="prompts"
            label={`Prompt 列表（每行一条，单次最多 ${SYNC_MAX_ITEMS} 条）`}
            rules={[{ required: true, message: '请粘贴 Prompt，每行一条' }]}
            extra="按正文去重（sha256 幂等），重复提交只会计入跳过，不会产生重复条目"
          >
            <Input.TextArea rows={10} placeholder={'一条完整 Prompt 独占一行\n第二条 Prompt…'} maxLength={200000} />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
}
