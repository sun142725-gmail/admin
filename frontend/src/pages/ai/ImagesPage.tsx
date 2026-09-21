// AI 生图页：文生图表单 + 结果墙 + 历史记录。
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Empty, Form, Input, InputNumber, Select, Space, message } from 'antd';
import { PictureOutlined } from '@ant-design/icons';
import { AppTable } from '../../components/AppTable';
import { AiImageRecord, AiModel, generateImages, listImageHistory, listModels } from '../../api/ai';

interface ImageFormValues {
  modelId?: number;
  prompt: string;
  size?: string;
  count?: number;
}

export const ImagesPage: React.FC = () => {
  const [imageModels, setImageModels] = useState<AiModel[]>([]);
  const [history, setHistory] = useState<AiImageRecord[]>([]);
  const [generating, setGenerating] = useState(false);
  const [lastImages, setLastImages] = useState<AiImageRecord[]>([]);
  const [form] = Form.useForm<ImageFormValues>();

  const load = useCallback(async () => {
    const [modelList, historyList] = await Promise.all([listModels(), listImageHistory()]);
    setImageModels(modelList.filter((item) => item.status === 1 && item.capabilities.includes('image')));
    setHistory(historyList);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = useCallback(async () => {
    const values = await form.validateFields();
    setGenerating(true);
    try {
      const result = await generateImages(values);
      setLastImages(result.images);
      message.success(`已生成 ${result.images.length} 张图片`);
      await load();
    } catch {
      message.error('生图失败，请检查是否已配置 image 能力模型');
    } finally {
      setGenerating(false);
    }
  }, [form, load]);

  const historyColumns = useMemo(
    () => [
      { title: '提示词', dataIndex: 'prompt', key: 'prompt', ellipsis: true },
      { title: '尺寸', dataIndex: 'size', key: 'size', width: 110 },
      {
        title: '图片',
        dataIndex: 'url',
        key: 'url',
        width: 120,
        render: (url: string) => (
          <a href={url} target="_blank" rel="noreferrer">
            <img src={url} alt="generated" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8 }} />
          </a>
        )
      },
      { title: '时间', dataIndex: 'createdAt', key: 'createdAt', width: 180 }
    ],
    []
  );

  return (
    <Space direction="vertical" size={12} style={{ width: '100%' }}>
      <Card title="文生图" styles={{ body: { padding: 12 } }}>
        {imageModels.length === 0 ? (
          <Empty description="暂无 image 能力模型，请先在模型管理里注册并挂载生图渠道" imageStyle={{ height: 48 }} />
        ) : (
          <Form form={form} layout="vertical" initialValues={{ size: '1024x1024', count: 1 }} style={{ maxWidth: 720 }}>
            <Form.Item name="modelId" label="模型（留空用第一个可用生图模型）">
              <Select
                allowClear
                options={imageModels.map((item) => ({ value: item.id, label: `${item.displayName}（${item.modelKey}）` }))}
                placeholder="自动选择"
              />
            </Form.Item>
            <Form.Item name="prompt" label="提示词" rules={[{ required: true, message: '请输入提示词' }]}>
              <Input.TextArea rows={3} maxLength={2000} showCount placeholder="描述你想要的画面…" />
            </Form.Item>
            <Space size="large">
              <Form.Item name="size" label="尺寸">
                <Select
                  style={{ width: 150 }}
                  options={[
                    { value: '1024x1024', label: '1024×1024 方图' },
                    { value: '1792x1024', label: '1792×1024 横图' },
                    { value: '1024x1792', label: '1024×1792 竖图' },
                    { value: '512x512', label: '512×512 小图' }
                  ]}
                />
              </Form.Item>
              <Form.Item name="count" label="数量">
                <InputNumber min={1} max={4} style={{ width: 100 }} />
              </Form.Item>
              <Form.Item label=" ">
                <Button type="primary" icon={<PictureOutlined />} loading={generating} onClick={() => void submit()}>
                  生成
                </Button>
              </Form.Item>
            </Space>
          </Form>
        )}
      </Card>

      {lastImages.length > 0 && (
        <Card title="本次结果" styles={{ body: { padding: 12 } }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            {lastImages.map((image) => (
              <a key={image.id} href={image.url} target="_blank" rel="noreferrer">
                <img
                  src={image.url}
                  alt={image.prompt}
                  style={{ width: 220, borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.12)' }}
                />
              </a>
            ))}
          </div>
        </Card>
      )}

      <Card title="历史记录" styles={{ body: { padding: 12 } }}>
        <AppTable<AiImageRecord> rowKey="id" columns={historyColumns} dataSource={history} pagination={{ pageSize: 10 }} />
      </Card>
    </Space>
  );
};
