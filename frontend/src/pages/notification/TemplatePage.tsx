import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Drawer, Form, Input, Modal, Select, Space, Switch, Tag, message } from 'antd';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { AppTable } from '../../components/AppTable';
import { Permission } from '../../components/permission/Permission';
import {
  createNotificationTemplate,
  deleteNotificationTemplate,
  listNotificationTemplates,
  updateNotificationTemplate
} from '../../api/notification';
import { batchDicts } from '../../api/dict';
import { registerVariableTagBlot, serializeTemplateContent, toEditorVariableHtml } from './quillVariableTag';

interface TemplateVariable {
  key: string;
  label: string;
  source: string;
  required?: boolean;
}

interface TemplateItem {
  id: number;
  code?: string;
  name: string;
  channelTypes: string[];
  content: string;
  variables?: TemplateVariable[];
  status: number;
}

const BUILTIN_VARIABLES: TemplateVariable[] = [
  { key: 'userNickname', label: '用户昵称', source: 'user', required: true },
  { key: 'eventInfo', label: '事件信息', source: 'event' },
  { key: 'systemParam', label: '系统参数', source: 'system' }
];

const SOURCE_COLOR_MAP: Record<string, { color: string; bgColor: string }> = {
  user: { color: '#0958d9', bgColor: '#e6f4ff' },
  event: { color: '#389e0d', bgColor: '#f6ffed' },
  system: { color: '#531dab', bgColor: '#f9f0ff' },
  custom: { color: '#d46b08', bgColor: '#fff7e6' }
};

const DEFAULT_CHANNEL_OPTIONS = [
  { label: '短信', value: 'sms' },
  { label: '邮箱', value: 'email' },
  { label: '站内信', value: 'inbox' },
  { label: '飞书', value: 'feishu' }
];

export const TemplatePage: React.FC = () => {
  const [data, setData] = useState<TemplateItem[]>([]);
  const [open, setOpen] = useState(false);
  const [editItem, setEditItem] = useState<TemplateItem | null>(null);
  const [saving, setSaving] = useState(false);
  const [channelLabelMap, setChannelLabelMap] = useState<Record<string, string>>({});
  const [channelItems, setChannelItems] = useState<Array<{ value: string; label: string }>>([]);
  const [form] = Form.useForm();
  const quillRef = useRef<ReactQuill | null>(null);
  const editorInitRef = useRef(false);
  const contentValue = Form.useWatch('content', form) ?? '';
  const customVariables = Form.useWatch('customVariables', form) ?? [];

  const fetchData = async () => {
    const res = await listNotificationTemplates();
    setData(res.items ?? []);
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    batchDicts({ codes: 'MESSAGE_CHANNEL' })
      .then((data) => {
        const list = (data?.MESSAGE_CHANNEL ?? []) as Array<{ value: string; label: string }>;
        const map: Record<string, string> = {};
        list.forEach((item) => {
          map[item.value] = item.label;
        });
        setChannelLabelMap(map);
        setChannelItems(list);
      })
      .catch(() => {
        setChannelLabelMap({});
        setChannelItems([]);
      });
  }, []);

  const onCreate = () => {
    setEditItem(null);
    form.resetFields();
    form.setFieldsValue({ code: '', channelTypes: ['inbox'], status: true, customVariables: [], content: '' });
    setOpen(true);
  };

  const onEdit = (item: TemplateItem) => {
    setEditItem(item);
    const nextCustomVariables = (item.variables ?? []).filter(
      (variable) => !BUILTIN_VARIABLES.find((builtin) => builtin.key === variable.key)
    );
    form.setFieldsValue({
      code: item.code,
      name: item.name,
      channelTypes: item.channelTypes,
      content: item.content,
      status: item.status === 1,
      customVariables: nextCustomVariables
    });
    setOpen(true);
  };

  const resolveTemplateKey = (item: TemplateItem) => item.code ?? String(item.id);

  const variableList = useMemo(
    () => [...BUILTIN_VARIABLES, ...customVariables.map((item: TemplateVariable) => ({ ...item, source: 'custom' }))],
    [customVariables]
  );

  const variableMetaMap = useMemo(() => {
    return variableList.reduce((acc, item) => {
      acc[item.key] = { label: item.label, source: item.source };
      return acc;
    }, {} as Record<string, { label: string; source: string }>);
  }, [variableList]);

  useEffect(() => {
    if (!open) {
      editorInitRef.current = false;
      return;
    }
    const QuillCtor = (ReactQuill as any).Quill;
    if (QuillCtor) {
      registerVariableTagBlot(QuillCtor);
    }
    const editor = quillRef.current?.getEditor();
    if (!editor || editorInitRef.current) {
      return;
    }
    const rawContent = form.getFieldValue('content') ?? '';
    const html = toEditorVariableHtml(rawContent, variableMetaMap);
    editor.setContents([], 'silent');
    editor.clipboard.dangerouslyPasteHTML(0, html, 'silent');
    form.setFieldValue('content', editor.root.innerHTML);
    editorInitRef.current = true;
  }, [open, variableMetaMap, form]);

  const insertVariable = (variableKey: string) => {
    const editor = quillRef.current?.getEditor();
    const variable = variableList.find((item) => item.key === variableKey);
    if (!editor) {
      const value = form.getFieldValue('content') ?? '';
      form.setFieldsValue({ content: `${value}{{var.${variableKey}}}` });
      return;
    }
    const range = editor.getSelection(true);
    const index = range?.index ?? editor.getLength();
    editor.insertEmbed(index, 'variableTag', {
      key: variableKey,
      label: variable?.label ?? variableKey,
      source: variable?.source ?? 'custom'
    });
    editor.insertText(index + 1, ' ');
    editor.setSelection(index + 2, 0);
    form.setFieldValue('content', editor.root.innerHTML);
  };

  const onSubmit = async () => {
    try {
      const values = await form.validateFields();
      const userVariables = (values.customVariables ?? []).map((item: TemplateVariable) => ({
        ...item,
        source: 'custom'
      }));
      const duplicateKey = userVariables.find((item: TemplateVariable) =>
        BUILTIN_VARIABLES.some((builtin) => builtin.key === item.key)
      );
      if (duplicateKey) {
        message.error(`自定义变量不能使用内置 key: ${duplicateKey.key}`);
        return;
      }
      setSaving(true);
      const payload = {
        code: values.code?.trim(),
        name: values.name,
        channelTypes: values.channelTypes,
        content: serializeTemplateContent(values.content),
        status: values.status ? 1 : 0,
        variables: [...BUILTIN_VARIABLES, ...userVariables]
      };
      if (editItem) {
        await updateNotificationTemplate(resolveTemplateKey(editItem), payload);
        message.success('模板更新成功');
      } else {
        await createNotificationTemplate(payload);
        message.success('模板创建成功');
      }
      setOpen(false);
      fetchData();
    } catch (error) {
      message.error(getErrorMessage(error, '操作失败'));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (item: TemplateItem) => {
    Modal.confirm({
      title: '确认删除模板',
      content: `将删除模板「${item.name}」，是否继续？`,
      okText: '确认删除',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteNotificationTemplate(resolveTemplateKey(item));
          message.success('模板删除成功');
          fetchData();
        } catch (error) {
          message.error(getErrorMessage(error, '删除失败'));
        }
      }
    });
  };

  const onToggleStatus = async (item: TemplateItem) => {
    try {
      await updateNotificationTemplate(item.id, { status: item.status === 1 ? 0 : 1 });
      message.success(item.status === 1 ? '模板已停用' : '模板已启用');
      fetchData();
    } catch (error) {
      message.error(getErrorMessage(error, '更新状态失败'));
    }
  };

  const highlightedPreview = useMemo(() => {
    const escaped = String(contentValue);
    return serializeTemplateContent(escaped).replace(/{{\s*var\.([a-zA-Z][a-zA-Z0-9_]*)\s*}}/g, (match, key) => {
      const variable = variableList.find((item) => item.key === key);
      const style = SOURCE_COLOR_MAP[variable?.source ?? 'custom'] ?? SOURCE_COLOR_MAP.custom;
      return `<span style="display:inline-block;padding:0 8px;border-radius:10px;margin:0 2px;background:${style.bgColor};color:${style.color};border:1px solid ${style.color};font-size:12px;">${match}</span>`;
    });
  }, [contentValue, variableList]);

  const channelOptions = useMemo(
    () => {
      const base = channelItems.length ? channelItems : DEFAULT_CHANNEL_OPTIONS;
      return base.map((item) => ({
        ...item,
        label: channelLabelMap[item.value] ?? item.label
      }));
    },
    [channelItems, channelLabelMap]
  );

  const columns = [
    { title: '模板编码', dataIndex: 'code' },
    { title: '模板名称', dataIndex: 'name' },
    {
      title: '通道',
      dataIndex: 'channelTypes',
      render: (items: string[]) => (
        <Space>
          {items?.map((item) => (
            <Tag key={item}>{channelLabelMap[item] ?? item}</Tag>
          ))}
        </Space>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      render: (value: number) => (value === 1 ? <Tag color="green">启用</Tag> : <Tag>停用</Tag>)
    },
    {
      title: '操作',
      render: (_: unknown, item: TemplateItem) => (
        <Space>
          <Permission code="system:notification:template:update" mode="disable">
            <Button size="small" onClick={() => onEdit(item)}>
              编辑
            </Button>
          </Permission>
          <Permission code="system:notification:template:update" mode="disable">
            <Button size="small" onClick={() => onToggleStatus(item)}>
              {item.status === 1 ? '停用' : '启用'}
            </Button>
          </Permission>
          <Permission code="system:notification:template:delete" mode="disable">
            <Button size="small" danger onClick={() => onDelete(item)}>
              删除
            </Button>
          </Permission>
        </Space>
      )
    }
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Permission code="system:notification:template:create" mode="disable">
          <Button type="primary" onClick={onCreate}>
            新增模板
          </Button>
        </Permission>
      </Space>

      <AppTable rowKey="id" columns={columns} dataSource={data} />

      <Drawer
        title={editItem ? '编辑模板' : '新增模板'}
        open={open}
        onCancel={() => setOpen(false)}
        width="66vw"
        destroyOnHidden
        extra={
          <Space>
            <Button onClick={() => setOpen(false)}>取消</Button>
            <Button type="primary" loading={saving} onClick={onSubmit}>
              确定
            </Button>
          </Space>
        }
      >
        <Form layout="vertical" form={form}>
          <div style={{ display: 'grid', gap: 16 }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>基础设置</div>
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Form.Item
                  label="模板编码"
                  name="code"
                  rules={[
                    {
                      pattern: /^[A-Z][A-Z0-9_]{2,63}$/,
                      message: '仅支持大写字母、数字、下划线，且需以字母开头'
                    }
                  ]}
                >
                  <Input placeholder="如 LOGIN_CODE_EMAIL" />
                </Form.Item>
                <Form.Item label="模板名称" name="name" rules={[{ required: true, message: '请填写模板名称' }]}>
                  <Input />
                </Form.Item>
                <Form.Item label="通道类型" name="channelTypes" rules={[{ required: true, message: '请选择通道类型' }]}>
                  <Select mode="multiple" options={channelOptions} />
                </Form.Item>
                <Form.Item label="模板状态" name="status" valuePropName="checked">
                  <Switch checkedChildren="启用" unCheckedChildren="停用" />
                </Form.Item>
              </Space>
            </div>

            <div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>变量设置</div>
              <Form.Item label="变量标签（点击插入）">
                <Space wrap>
                  {variableList.map((item) => {
                    const style = SOURCE_COLOR_MAP[item.source] ?? SOURCE_COLOR_MAP.custom;
                    return (
                      <Tag
                        key={`${item.source}-${item.key}-${item.label}`}
                        color={item.required ? 'red' : 'default'}
                        style={{ cursor: 'pointer', backgroundColor: style.bgColor, color: style.color }}
                        onClick={() => insertVariable(item.key)}
                      >
                        {item.label}({item.key})
                      </Tag>
                    );
                  })}
                </Space>
              </Form.Item>

              <Form.List name="customVariables">
                {(fields, { add, remove }) => (
                  <div>
                    <Space style={{ marginBottom: 8 }}>
                      <span>自定义变量</span>
                      <Button size="small" onClick={() => add()}>
                        新增变量
                      </Button>
                    </Space>
                    {fields.map(({ key, name, ...restField }) => (
                      <Space key={key} align="baseline" style={{ display: 'flex', marginBottom: 8 }}>
                        <Form.Item
                          {...restField}
                          name={[name, 'key']}
                          rules={[
                            { required: true, message: '请输入变量 key' },
                            { pattern: /^[a-zA-Z][a-zA-Z0-9_]*$/, message: '仅允许字母/数字/下划线' }
                          ]}
                        >
                          <Input placeholder="key" />
                        </Form.Item>
                        <Form.Item
                          {...restField}
                          name={[name, 'label']}
                          rules={[{ required: true, message: '请输入变量名称' }]}
                        >
                          <Input placeholder="名称" />
                        </Form.Item>
                        <Form.Item {...restField} name={[name, 'required']} valuePropName="checked">
                          <Switch checkedChildren="必填" unCheckedChildren="可选" />
                        </Form.Item>
                        <Button danger size="small" onClick={() => remove(name)}>
                          删除
                        </Button>
                      </Space>
                    ))}
                  </div>
                )}
              </Form.List>
            </div>

            <div>
              <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>模板内容</div>
              <Form.Item name="content" rules={[{ required: true, message: '请填写模板内容' }]}>
                <ReactQuill
                  ref={quillRef}
                  theme="snow"
                  value={contentValue}
                  onChange={(value) => form.setFieldValue('content', value)}
                  formats={[
                    'header',
                    'bold',
                    'italic',
                    'underline',
                    'strike',
                    'color',
                    'background',
                    'list',
                    'bullet',
                    'link',
                    'blockquote',
                    'code-block',
                    'variableTag'
                  ]}
                  modules={{
                    toolbar: [
                      [{ header: [1, 2, 3, false] }],
                      ['bold', 'italic', 'underline', 'strike'],
                      [{ color: [] }, { background: [] }],
                      [{ list: 'ordered' }, { list: 'bullet' }],
                      ['link', 'blockquote', 'code-block'],
                      ['clean']
                    ]
                  }}
                />
              </Form.Item>

              <Form.Item label="变量预览">
                <div
                  style={{
                    border: '1px solid #f0f0f0',
                    borderRadius: 6,
                    padding: 12,
                    minHeight: 56
                  }}
                  dangerouslySetInnerHTML={{ __html: highlightedPreview }}
                />
              </Form.Item>
            </div>
          </div>
        </Form>
      </Drawer>
    </div>
  );
};
  const getErrorMessage = (error: unknown, fallback: string) => {
    if (error && typeof error === 'object') {
      const responseMessage = (error as { response?: { data?: { message?: string } } }).response?.data?.message;
      if (responseMessage) {
        return responseMessage;
      }
      const directMessage = (error as { message?: string }).message;
      if (directMessage) {
        return directMessage;
      }
    }
    return fallback;
  };
