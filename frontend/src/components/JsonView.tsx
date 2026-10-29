// JSON 视图组件：语法高亮展示 JSON 并支持一键复制，用于日志详情里的 meta/detail 字段。
import React, { useMemo, useState } from 'react';
import { Button, message } from 'antd';
import { CopyOutlined } from '@ant-design/icons';

const TOKEN_RE = /("(?:\\.|[^"\\])*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;

// 正则分词渲染：key/字符串/布尔/null/数字各配色，其余字符原样输出。
// 依赖 JSON.stringify 的规范输出（key 与字符串必带双引号），无歧义。
const highlight = (json: string): React.ReactNode[] => {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;
  for (const match of json.matchAll(TOKEN_RE)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      nodes.push(json.slice(lastIndex, index));
    }
    const [raw, str, colon, bool, num] = match;
    if (str && colon) {
      nodes.push(
        <span key={key++} style={{ color: '#7c3aed' }}>
          {str}
        </span>,
        colon
      );
    } else if (str) {
      nodes.push(
        <span key={key++} style={{ color: '#0f766e' }}>
          {str}
        </span>
      );
    } else if (bool) {
      nodes.push(
        <span key={key++} style={{ color: '#d97706' }}>
          {bool}
        </span>
      );
    } else if (num) {
      nodes.push(
        <span key={key++} style={{ color: '#2563eb' }}>
          {num}
        </span>
      );
    } else {
      nodes.push(raw);
    }
    lastIndex = index + raw.length;
  }
  if (lastIndex < json.length) {
    nodes.push(json.slice(lastIndex));
  }
  return nodes;
};

interface JsonViewProps {
  value: unknown;
  maxHeight?: number;
}

export const JsonView: React.FC<JsonViewProps> = ({ value, maxHeight = 240 }) => {
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => {
    try {
      return JSON.stringify(value, null, 2) ?? 'null';
    } catch {
      // 循环引用等极端数据退化为 String 展示，不让详情页白屏
      return String(value);
    }
  }, [value]);
  const nodes = useMemo(() => highlight(text), [text]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      message.error('复制失败，请手动选择复制');
    }
  };

  return (
    <div className="json-view-wrap">
      <Button size="small" type="text" icon={<CopyOutlined />} onClick={copy} className="json-view-copy">
        {copied ? '已复制' : '复制'}
      </Button>
      <pre className="json-view-pre" style={{ maxHeight }}>
        {nodes}
      </pre>
    </div>
  );
};
