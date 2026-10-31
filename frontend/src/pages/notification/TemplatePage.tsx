import React, { useEffect, useMemo, useRef, useState } from 'react';
import { sanitizeHtml } from '../../utils/sanitize';
import Button from 'antd/es/button';
import Form from 'antd/es/form';
import Input from 'antd/es/input';
import Select from 'antd/es/select';
import Space from 'antd/es/space';
import Switch from 'antd/es/switch';
import Tag from 'antd/es/tag';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { Permission } from '../../components/permission/Permission';
import { SelfDrawer } from '../../components/base/SelfDrawer';
import { SelfForm } from '../../components/base/SelfForm';
import { SelfTable } from '../../components/base/SelfTable';
import { ActionCell } from '../../components/business/ActionCell';
import { confirmAction } from '../../components/business/ConfirmAction';
import { StatusTag } from '../../components/business/StatusTag';
import { useApiMessage } from '../../hooks/useApiMessage';
import type { StatusMeta } from '../../types/ui';
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

// 双色结构（color+bgColor）StatusMeta 无法承载，按 README 保留页内私有
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

// 状态色刻度表（components/README.md）：启用=green、停用=default（无色，与迁移前写法一致）
const TEMPLATE_STATUS_META: Record<number, StatusMeta> = {
  1: { label: '启用', color: 'green' },
  0: { label: '停用', color: 'default' }
};

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
  const msg = useApiMessage();

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

  // ReactQuill blot 注册与表单回填时序（依赖 open effect）勿动（components/README.md 红线）
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
    editor.deleteText(0, editor.getLength(), 'silent');
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
        msg.error(`自定义变量不能使用内置 key: ${duplicateKey.key}`);
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
        msg.success('模板更新成功');
      } else {
        await createNotificationTemplate(payload);
        msg.success('模板创建成功');
      }
      setOpen(false);
      fetchData();
    } catch (error) {
      msg.errorFrom(error, '操作失败');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = (item: TemplateItem) => {
    confirmAction({
      title: '确认删除模板',
      content: `将删除模板「${item.name}」，是否继续？`,
      okText: '确认删除',
      cancelText: '取消',
      onOk: async () => {
        try {
          await deleteNotificationTemplate(resolveTemplateKey(item));
          msg.success('模板删除成功');
          fetchData();
        } catch (error) {
          msg.errorFrom(error, '删除失败');
        }
      }
    });
  };

  const onToggleStatus = async (item: TemplateItem) => {
    try {
      await updateNotificationTemplate(item.id, { status: item.status === 1 ? 0 : 1 });
      msg.success(item.status === 1 ? '模板已停用' : '模板已启用');
      fetchData();
    } catch (error) {
      msg.errorFrom(error, '更新状态失败');
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
      render: (value: number) => <StatusTag value={value} map={TEMPLATE_STATUS_META} />
    },
    {
      title: '操作',
      render: (_: unknown, item: TemplateItem) => (
        <ActionCell
          record={item}
          items={[
            { key: 'edit', label: '编辑', permission: 'system:notification:template:update', onClick: onEdit },
            {
              key: 'toggle',
              label: item.status === 1 ? '停用' : '启用',
              permission: 'system:notification:template:update',
              onClick: (record: TemplateItem) => void onToggleStatus(record)
            },
            {
              key: 'delete',
              label: '删除',
              danger: true,
              permission: 'system:notification:template:delete',
              onClick: onDelete
            }
          ]}
        />
      )
    }
  ];

  return (
    <div>
      <Space className="mb-4">
        <Permission code="system:notification:template:create" mode="disable">
          <Button type="primary" onClick={onCreate}>
            新增模板
          </Button>
        </Permission>
      </Space>

      <SelfTable rowKey="id" columns={columns} dataSource={data} />

      {/* width="66vw" 为响应式合法特例（components/README.md），SelfDrawer 字符串透传保留 */}
      <SelfDrawer
        title={editItem ? '编辑模板' : '新增模板'}
        open={open}
        onClose={() => setOpen(false)}
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
        <SelfForm form={form}>
          <div className="grid gap-4">
            <div>
              <div className="text-sm font-semibold mb-3">基础设置</div>
              <Space direction="vertical" size={12} className="w-full">
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
              <div className="text-sm font-semibold mb-3">变量设置</div>
              <Form.Item label="变量标签（点击插入）">
                <Space wrap>
                  {variableList.map((item) => {
                    const style = SOURCE_COLOR_MAP[item.source] ?? SOURCE_COLOR_MAP.custom;
                    return (
                      <Tag
                        key={`${item.source}-${item.key}-${item.label}`}
                        color={item.required ? 'red' : 'default'}
                        className="cursor-pointer"
                        style={{ backgroundColor: style.bgColor, color: style.color }}
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
                    <Space className="mb-2">
                      <span>自定义变量</span>
                      <Button size="small" onClick={() => add()}>
                        新增变量
                      </Button>
                    </Space>
                    {fields.map(({ key, name, ...restField }) => (
                      <Space key={key} align="baseline" className="!flex mb-2">
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
              <div className="text-sm font-semibold mb-3">模板内容</div>
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
                  className="preview-box"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(highlightedPreview) }}
                />
              </Form.Item>
            </div>
          </div>
        </SelfForm>
      </SelfDrawer>
    </div>
  );
};
