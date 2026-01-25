// 六爻占卜页面提供主题输入、动画展示与结果解读。
import React, { useEffect, useState } from 'react';
import { Button, Card, Descriptions, Form, Input, Space, Typography, message } from 'antd';
import { createDivination } from '../../api/divination';

const { Title, Paragraph } = Typography;

interface LineResult {
  lineIndex: number;
  signStr: string;
  sum: number;
  symbol: string;
  name: string;
}

interface DivinationResult {
  id: number;
  topic: string;
  interpretation: string;
  lines: LineResult[];
}

export const DivinationPage: React.FC = () => {
  const labels = ['初爻', '二爻', '三爻', '四爻', '五爻', '上爻'];
  const [form] = Form.useForm();
  const [result, setResult] = useState<DivinationResult | null>(null);
  const [displayLines, setDisplayLines] = useState<LineResult[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);

  const startDivination = async () => {
    const values = await form.validateFields();
    setResult(null);
    setDisplayLines([]);
    setIsAnimating(true);
    try {
      const data = await createDivination(values.topic);
      setResult(data);
    } catch (error) {
      setIsAnimating(false);
      message.error('占卜失败，请稍后再试');
    }
  };

  useEffect(() => {
    if (!isAnimating || !result) {
      return;
    }
    if (!result.lines || result.lines.length === 0) {
      setIsAnimating(false);
      return;
    }
    let index = 0;
    const timer = setInterval(() => {
      const line = result.lines[index];
      if (!line) {
        setIsAnimating(false);
        clearInterval(timer);
        return;
      }
      setDisplayLines((prev) => [...prev, line]);
      index += 1;
      if (index >= result.lines.length) {
        setIsAnimating(false);
        clearInterval(timer);
      }
    }, 600);
    return () => clearInterval(timer);
  }, [isAnimating, result]);

  const resetAll = () => {
    form.resetFields();
    setResult(null);
    setDisplayLines([]);
    setIsAnimating(false);
  };

  return (
    <div style={{ padding: 24 }}>
      <Card>
        <Title level={2}>易占 — 六爻占卜</Title>
        <Paragraph>输入主题后开始占卜，动画结束后展示解卦结果。</Paragraph>

        <Form layout="vertical" form={form}>
          <Form.Item
            label="占卜主题"
            name="topic"
            rules={[{ required: true, message: '请填写占卜主题' }]}
          >
            <Input placeholder="例如：今年事业走向" maxLength={50} />
          </Form.Item>
        </Form>

        <Space style={{ marginBottom: 16 }}>
          <Button type="primary" onClick={startDivination} disabled={isAnimating}>
            {isAnimating ? '占卜中...' : '开始占卜'}
          </Button>
          <Button onClick={resetAll} disabled={isAnimating}>
            重置
          </Button>
        </Space>

        <Card type="inner" style={{ marginBottom: 16 }}>
          <Title level={4}>占卜过程</Title>
          <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
            <div
              style={{
                width: 120,
                height: 120,
                borderRadius: 16,
                border: '1px dashed #999',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              破碗
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: '50%',
                    border: '1px solid #666',
                    background: isAnimating ? '#ffe58f' : '#f0f0f0',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  铜钱
                </div>
              ))}
            </div>
            <div>{isAnimating ? '摇卦中...' : '等待开始'}</div>
          </div>
        </Card>

        <Title level={4}>逐爻结果（{displayLines.length}/6）</Title>
        {displayLines.filter(Boolean).map((line, index) => (
          <Card size="small" style={{ marginBottom: 8 }} key={line.lineIndex}>
            <div>
              <strong>{labels[index]}:</strong> {line.signStr}（{line.name} {line.symbol}）
            </div>
            <div>组合数字: {line.sum}</div>
          </Card>
        ))}

        {result && !isAnimating && displayLines.length === 6 && (
          <div style={{ marginTop: 16 }}>
            <Title level={4}>本卦汇总</Title>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="六爻组合数字数组">
                {JSON.stringify(result.lines.map((line) => line.sum))}
              </Descriptions.Item>
              <Descriptions.Item label="六爻符号数组">
                {JSON.stringify(result.lines.map((line) => line.symbol))}
              </Descriptions.Item>
              <Descriptions.Item label="六爻名称数组">
                {JSON.stringify(result.lines.map((line) => line.name))}
              </Descriptions.Item>
              <Descriptions.Item label="六爻原始符号串（每爻）">
                {JSON.stringify(result.lines.map((line) => line.signStr))}
              </Descriptions.Item>
            </Descriptions>

            <Card type="inner" style={{ marginTop: 16 }}>
              <Title level={5}>解卦结果</Title>
              <Paragraph>{result.interpretation}</Paragraph>
            </Card>
          </div>
        )}
      </Card>
    </div>
  );
};
