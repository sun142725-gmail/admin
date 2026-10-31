// 表头列设置：弹出面板勾选要展示的列，选择由调用方持久化（localStorage 按页签记忆）。
import React from 'react';
import { Button, Checkbox, Popover, Space } from 'antd';
import { SettingOutlined } from '@ant-design/icons';

export interface ColumnOption {
  key: string;
  label: string;
}

interface Props {
  options: ColumnOption[];
  visible: string[];
  onChange: (keys: string[]) => void;
  onReset: () => void;
}

export const ColumnSettings: React.FC<Props> = ({ options, visible, onChange, onReset }) => {
  const content = (
    <div style={{ width: 170 }}>
      <Space direction="vertical" style={{ width: '100%' }} size={8}>
        <Checkbox.Group
          value={visible}
          onChange={(values) => onChange(values as string[])}
          options={options.map((option) => ({ value: option.key, label: option.label }))}
          style={{ display: 'flex', flexDirection: 'column', gap: 4 }}
        />
        <Button size="small" block onClick={onReset}>
          恢复默认
        </Button>
      </Space>
    </div>
  );
  return (
    <Popover content={content} title="表头列设置" trigger="click" placement="bottomRight">
      <Button size="small" icon={<SettingOutlined />}>
        表头
      </Button>
    </Popover>
  );
};
