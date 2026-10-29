// 图片提示词库页：风格模板卡片墙（分类筛选 + 模糊搜索 + 复制 Prompt + 新建/编辑）。
// 图文流水线按 category 引用模板，模板正文中 {{content}} 会被场景文本替换。
import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  Empty,
  Form,
  Image,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Tag,
  Typography,
  message
} from 'antd';
import { CopyOutlined, DeleteOutlined, EditOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import {
  PROMPT_CATEGORIES,
  PromptTemplate,
  createPromptTemplate,
  deletePromptTemplate,
  listPromptTemplates,
  updatePromptTemplate
} from '../../api/promptLibrary';

const CATEGORY_COLOR: Record<string, string> = {
  illustrated: 'gold',
  poster: 'purple',
  anime: 'geekblue',
  ui: 'cyan',
  general: 'default'
};

export const PromptLibraryPage: React.FC = () => {
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [loading, setLoading] = useState(false);
  const [category, setCategory] = useState<string | undefined>();
  const [keyword, setKeyword] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<PromptTemplate | null>(null);
  const [form] = Form.useForm();

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setTemplates(
        await listPromptTemplates({ category, keyword: keyword || undefined, take: 100 })
      );
    } catch {
      // http 层已统一提示
    } finally {
      setLoading(false);
    }
  }, [category, keyword]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openCreate = () => {
    setEditing(null);
    form.resetFields();
    form.setFieldsValue({ category: 'illustrated' });
    setModalOpen(true);
  };

  const openEdit = (tpl: PromptTemplate) => {
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
      refresh();
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (tpl: PromptTemplate) => {
    try {
      await deletePromptTemplate(tpl.id);
      message.success('已删除');
      refresh();
    } catch {
      // ignore
    }
  };

  const handleCopy = async (tpl: PromptTemplate) => {
    try {
      await navigator.clipboard.writeText(tpl.template);
      message.success('Prompt 已复制');
    } catch {
      message.warning('复制失败，请手动选择文本');
    }
  };

  return (
    <Card
      title="图片提示词库"
      extra={
        <Space>
          <Select
            allowClear
            placeholder="全部分类"
            style={{ width: 140 }}
            options={PROMPT_CATEGORIES}
            value={category}
            onChange={setCategory}
          />
          <Input.Search
            placeholder="搜索名称/标签"
            style={{ width: 200 }}
            onSearch={setKeyword}
            allowClear
          />
          <Button icon={<ReloadOutlined />} onClick={refresh} loading={loading} />
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新建模板
          </Button>
        </Space>
      }
    >
      {templates.length === 0 && !loading ? (
        <Empty description="还没有提示词模板，点击右上角新建" />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 16 }}>
          {templates.map((tpl) => (
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
                  <div
                    style={{
                      height: 100,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: '#f5f5f5',
                      color: '#bbb',
                      fontSize: 12
                    }}
                  >
                    无示例图
                  </div>
                )
              }
              actions={[
                <CopyOutlined key="copy" onClick={() => handleCopy(tpl)} />,
                <EditOutlined key="edit" onClick={() => openEdit(tpl)} />,
                <Popconfirm key="del" title="确定删除该模板？" onConfirm={() => handleDelete(tpl)}>
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
                      ellipsis={{ rows: 3 }}
                      type="secondary"
                      style={{ fontSize: 12, marginBottom: 4 }}
                    >
                      {tpl.template}
                    </Typography.Paragraph>
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
      )}

      <Modal
        title={editing ? '编辑模板' : '新建模板'}
        open={modalOpen}
        onOk={handleSave}
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
            <Select options={PROMPT_CATEGORIES} />
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
    </Card>
  );
}
