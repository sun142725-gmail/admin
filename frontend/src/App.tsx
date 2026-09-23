// 应用根组件负责挂载路由。
import React from 'react';
import { ConfigProvider } from 'antd';
import type { ThemeConfig } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';

/**
 * 全局主题 token：与 styles/global.css 的设计变量对齐（视觉零变化）。
 * 组件级 token 替代原 global.css 中的 antd !important 覆写（规范：禁止全局 !important）。
 */
const theme: ThemeConfig = {
  token: {
    colorPrimary: '#1677ff',
    colorInfo: '#1677ff',
    fontFamily: "-apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif"
  },
  components: {
    // 原 CSS：.ant-btn 圆角 12（曾被 antd 默认值压制）+ font-weight 600
    Button: { borderRadius: 12, fontWeight: 600 },
    // 原 CSS：.ant-input/.ant-select/.ant-picker/.ant-input-number 圆角 12 !important
    Input: { borderRadius: 12 },
    Select: { borderRadius: 12 },
    DatePicker: { borderRadius: 12 },
    InputNumber: { borderRadius: 12 },
    // 原 CSS：.ant-card 圆角 20 / 边框 rgba(15,23,42,.06) !important
    Card: { borderRadiusLG: 20, colorBorderSecondary: 'rgba(15, 23, 42, 0.06)' },
    // 原 CSS：.ant-table 圆角 18 / 头部 #f7faff / hover 行背景 !important
    Table: {
      borderRadiusLG: 18,
      headerBg: '#f7faff',
      headerColor: '#1a1a1a',
      rowHoverBg: 'rgba(22, 119, 255, 0.03)'
    }
  }
};

export const App: React.FC = () => (
  <ConfigProvider locale={zhCN} theme={theme}>
    <RouterProvider router={router} />
  </ConfigProvider>
);
