// 右侧配置面板：按节点类型渲染表单（受控回写画布数据），模板字段支持一键插入上游变量。
import { useCallback, useMemo } from 'react';
import { Button, Form, Input, InputNumber, Popover, Radio, Select, Slider, Space, Tag, message } from 'antd';
import { DeleteOutlined, PlusOutlined, ThunderboltOutlined } from '@ant-design/icons';
import type { AiModel } from '../../../api/ai';
import type { FlowCanvasNode } from './FlowNodeCard';
import { nodeMetaByKey, outputFieldsOf } from './nodeMeta';

interface NodeConfigPanelProps {
  node: FlowCanvasNode;
  upstream: FlowCanvasNode[];
  models: AiModel[];
  canManageModels: boolean;
  canExecute: boolean;
  /** inline=编辑器右侧内联面板（默认）；drawer=窄屏浮层抽屉内。 */
  variant?: 'inline' | 'drawer';
  onChange: (patch: { name?: string; config?: Record<string, unknown> }) => void;
  onDelete: () => void;
  onTrialRun: () => void;
}

interface FormValues {
  name?: string;
  systemPrompt?: string;
  prompt?: string;
  outputFormat?: string;
  temperature?: number;
  modelId?: number;
  size?: string;
  count?: number;
  firstFrame?: string;
  seconds?: number;
  method?: string;
  url?: string;
  headers?: string;
  body?: string;
  timeoutMs?: number;
  text?: string;
  variables?: Array<{ name?: string; label?: string; defaultValue?: string; required?: number }>;
  fields?: Array<{ key?: string; value?: string }>;
}

const MODEL_CAPABILITY: Record<string, string> = { llm: 'chat', image: 'image', video: 'video' };
const SIZE_OPTIONS = ['1024x1024', '1280x720', '720x1280', '1664x928'].map((value) => ({ value }));

export const NodeConfigPanel: React.FC<NodeConfigPanelProps> = ({
  node,
  upstream,
  models,
  canManageModels,
  canExecute,
  variant = 'inline',
  onChange,
  onDelete,
  onTrialRun
}) => {
  const [form] = Form.useForm<FormValues>();
  const flowType = node.data.flowType ?? 'llm';
  const meta = nodeMetaByKey(flowType);
  const Icon = meta?.icon;

  // 可用上游变量：{ 节点名, 引用列表 {{nodeId.field}} }。
  const varGroups = useMemo(
    () =>
      upstream
        .filter((item) => (item.data.flowType ?? '') !== 'note')
        .map((item) => {
          const fields = outputFieldsOf(item.data.flowType ?? '', item.data.config);
          return {
            nodeId: item.id,
            nodeName: item.data.name || item.id,
            refs: fields.map((field) => ({ ref: `{{${item.id}.${field}}}`, field }))
          };
        }),
    [upstream]
  );

  // 表单值 → 节点配置（headers 文本 → 对象；name 单独回写不进 config）。
  const commit = useCallback(
    (_: unknown, values: FormValues) => {
      const { name, headers, ...rest } = values;
      const config: Record<string, unknown> = { ...node.data.config, ...rest };
      if (typeof headers === 'string') {
        try {
          config.headers = headers.trim() ? JSON.parse(headers) : {};
        } catch {
          delete config.headers; // 非法 JSON 不回写，保留原值
        }
      }
      onChange({ name, config });
    },
    [node.data.config, onChange]
  );

  const insertVariable = useCallback(
    (fieldName: keyof FormValues, ref: string) => {
      const current = (form.getFieldValue(fieldName) as string | undefined) ?? '';
      form.setFieldValue(fieldName, `${current}${current && !current.endsWith(' ') ? ' ' : ''}${ref}`);
      commit({}, form.getFieldsValue() as FormValues);
      message.info(`已插入 ${ref}`);
    },
    [form, commit]
  );

  // 变量插入弹层：挂在模板字段的 addonAfter。
  const varPopover = useCallback(
    (fieldName: keyof FormValues) => (
      <Popover
        trigger="click"
        placement="leftTop"
        content={
          <div style={{ maxWidth: 260 }}>
            {varGroups.length === 0 && <div style={{ color: '#999', fontSize: 12 }}>暂无上游节点</div>}
            {varGroups.map((group) => (
              <div key={group.nodeId} style={{ marginBottom: 6 }}>
                <div style={{ fontSize: 12, color: '#666', marginBottom: 2 }}>{group.nodeName}</div>
                <Space size={[4, 4]} wrap>
                  {group.refs.map((item) => (
                    <Tag
                      key={item.ref}
                      className="flow-var-tag"
                      color="blue"
                      onClick={() => insertVariable(fieldName, item.ref)}
                    >
                      {item.field}
                    </Tag>
                  ))}
                </Space>
              </div>
            ))}
          </div>
        }
      >
        <Button size="small" type="text" style={{ pointerEvents: 'auto' }}>
          插入变量
        </Button>
      </Popover>
    ),
    [insertVariable, varGroups]
  );

  const modelOptions = useMemo(() => {
    const capability = MODEL_CAPABILITY[flowType];
    if (!capability) {
      return [];
    }
    return models
      .filter((model) => model.capabilities?.includes(capability) && model.status === 1)
      .map((model) => ({ value: model.id, label: model.displayName }));
  }, [models, flowType]);

  const initialValues = useMemo((): FormValues => {
    const config = node.data.config ?? {};
    return {
      name: node.data.name,
      ...config,
      headers:
        typeof config.headers === 'object' && config.headers !== null
          ? JSON.stringify(config.headers, null, 2)
          : typeof config.headers === 'string'
            ? config.headers
            : '{}'
    } as FormValues;
  }, [node.data]);

  if (!meta) {
    return <div style={{ padding: 16, color: '#999' }}>未知节点类型：{flowType}</div>;
  }

  return (
    <div className={`flow-config-panel${variant === 'drawer' ? ' in-drawer' : ''}`}>
      <div className="flow-config-panel-header">
        {Icon && (
          <span className="flow-node-card-icon" style={{ background: meta.color }}>
            <Icon />
          </span>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>{meta.label}节点</div>
          <div style={{ fontSize: 11, color: 'var(--text-sub)' }}>{meta.description}</div>
        </div>
        {flowType !== 'note' && flowType !== 'start' && canExecute && (
          <Button size="small" icon={<ThunderboltOutlined />} onClick={onTrialRun}>
            试运行
          </Button>
        )}
      </div>
      <div className="flow-config-panel-body">
        <Form
          key={node.id}
          form={form}
          layout="vertical"
          size="small"
          initialValues={initialValues}
          onValuesChange={commit}
        >
          <Form.Item name="name" label="节点名称" rules={[{ required: true, message: '请输入名称' }]}>
            <Input placeholder={meta.defaultName} maxLength={40} />
          </Form.Item>

          {flowType === 'start' && (
            <Form.List name="variables">
              {(fields, { add, remove }) => (
                <>
                  {fields.map((field) => (
                    <Space key={field.key} align="baseline" style={{ display: 'flex', marginBottom: 4 }}>
                      <Form.Item
                        name={[field.name, 'name']}
                        rules={[{ required: true, message: '变量名' }]}
                        style={{ margin: 0 }}
                      >
                        <Input placeholder="变量名" style={{ width: 90 }} />
                      </Form.Item>
                      <Form.Item name={[field.name, 'label']} style={{ margin: 0 }}>
                        <Input placeholder="显示名" style={{ width: 90 }} />
                      </Form.Item>
                      <Form.Item name={[field.name, 'defaultValue']} style={{ margin: 0 }}>
                        <Input placeholder="默认值" style={{ width: 110 }} />
                      </Form.Item>
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => remove(field.name)}
                      />
                    </Space>
                  ))}
                  <Button
                    type="dashed"
                    block
                    icon={<PlusOutlined />}
                    onClick={() => add({ name: '', label: '', defaultValue: '' })}
                  >
                    添加变量
                  </Button>
                </>
              )}
            </Form.List>
          )}

          {flowType === 'llm' && (
            <>
              {canManageModels && modelOptions.length > 0 && (
                <Form.Item name="modelId" label="指定模型（可选，默认按能力自动路由）">
                  <Select allowClear placeholder="自动路由" options={modelOptions} />
                </Form.Item>
              )}
              <Form.Item name="systemPrompt" label="系统提示词">
                <Input.TextArea rows={3} placeholder="设定角色与输出要求" />
              </Form.Item>
              <Form.Item
                name="prompt"
                label={<Space size={2}>提示词模板{varPopover('prompt')}</Space>}
                rules={[{ required: true, message: '请输入提示词' }]}
              >
                <Input.TextArea rows={4} placeholder="如：{{start.topic}}" />
              </Form.Item>
              <Form.Item name="outputFormat" label="输出格式">
                <Radio.Group
                  options={[
                    { value: 'text', label: '文本' },
                    { value: 'json', label: 'JSON（字段可被下游引用）' }
                  ]}
                />
              </Form.Item>
              <Form.Item name="temperature" label="多样性">
                <Slider min={0} max={2} step={0.1} />
              </Form.Item>
            </>
          )}

          {flowType === 'image' && (
            <>
              {canManageModels && modelOptions.length > 0 && (
                <Form.Item name="modelId" label="指定模型（可选）">
                  <Select allowClear placeholder="自动路由" options={modelOptions} />
                </Form.Item>
              )}
              <Form.Item
                name="prompt"
                label={<Space size={2}>提示词模板{varPopover('prompt')}</Space>}
                rules={[{ required: true, message: '请输入提示词' }]}
              >
                <Input.TextArea rows={4} placeholder="如：{{storyboard.firstFramePrompt}}" />
              </Form.Item>
              <Form.Item name="size" label="尺寸">
                <Select allowClear options={SIZE_OPTIONS} placeholder="默认 1024x1024" />
              </Form.Item>
              <Form.Item name="count" label="生成张数">
                <InputNumber min={1} max={4} />
              </Form.Item>
            </>
          )}

          {flowType === 'video' && (
            <>
              {canManageModels && modelOptions.length > 0 && (
                <Form.Item name="modelId" label="指定模型（可选）">
                  <Select allowClear placeholder="自动路由" options={modelOptions} />
                </Form.Item>
              )}
              <Form.Item
                name="prompt"
                label={<Space size={2}>运动/内容提示词{varPopover('prompt')}</Space>}
                rules={[{ required: true, message: '请输入提示词' }]}
              >
                <Input.TextArea rows={3} placeholder="如：{{storyboard.motionPrompt}}" />
              </Form.Item>
              <Form.Item
                name="firstFrame"
                label="首帧图 URL（图生视频，可空）"
                extra="引用上游生图输出，如 {{firstFrame.url}}"
              >
                <Input placeholder="{{节点ID.url}}" addonAfter={varPopover('firstFrame')} />
              </Form.Item>
              <Form.Item name="seconds" label="时长（秒）">
                <InputNumber min={1} max={60} />
              </Form.Item>
              <Form.Item name="size" label="分辨率（如 1280x720，可空）">
                <Input placeholder="跟随上游/默认" />
              </Form.Item>
            </>
          )}

          {flowType === 'http' && (
            <>
              <Form.Item name="method" label="请求方法">
                <Select
                  options={['GET', 'POST', 'PUT', 'DELETE', 'PATCH'].map((value) => ({ value }))}
                />
              </Form.Item>
              <Form.Item name="url" label="URL" rules={[{ required: true, message: '请输入 URL' }]}>
                <Input placeholder="https://..." addonAfter={varPopover('url')} />
              </Form.Item>
              <Form.Item name="headers" label="请求头（JSON）">
                <Input.TextArea rows={3} placeholder='{"Authorization": "Bearer ..."}' />
              </Form.Item>
              <Form.Item
                name="body"
                label={<Space size={2}>请求体模板（JSON/文本）{varPopover('body')}</Space>}
              >
                <Input.TextArea rows={3} placeholder='{"key": "{{node.field}}"}' />
              </Form.Item>
              <Form.Item name="timeoutMs" label="超时（毫秒）">
                <InputNumber min={1000} max={60000} step={1000} />
              </Form.Item>
            </>
          )}

          {flowType === 'delay' && (
            <Form.Item name="seconds" label="等待秒数" rules={[{ required: true }]}>
              <InputNumber min={0} max={300} />
            </Form.Item>
          )}

          {flowType === 'end' && (
            <Form.List name="fields">
              {(fields, { add, remove }) => (
                <>
                  {fields.map((field) => (
                    <Space key={field.key} align="baseline" style={{ display: 'flex', marginBottom: 4 }}>
                      <Form.Item
                        name={[field.name, 'key']}
                        rules={[{ required: true, message: '字段名' }]}
                        style={{ margin: 0 }}
                      >
                        <Input placeholder="字段名" style={{ width: 100 }} />
                      </Form.Item>
                      <Form.Item
                        name={[field.name, 'value']}
                        rules={[{ required: true, message: '取值' }]}
                        style={{ margin: 0 }}
                      >
                        <Input placeholder="{{nodeId.field}}" style={{ width: 150 }} />
                      </Form.Item>
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => remove(field.name)}
                      />
                    </Space>
                  ))}
                  <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add({ key: '', value: '' })}>
                    添加产物字段
                  </Button>
                </>
              )}
            </Form.List>
          )}

          {flowType === 'note' && (
            <Form.Item name="text" label="备注内容">
              <Input.TextArea rows={4} />
            </Form.Item>
          )}
        </Form>
        <Button danger block icon={<DeleteOutlined />} onClick={onDelete} style={{ marginTop: 8 }}>
          删除节点
        </Button>
      </div>
    </div>
  );
};
