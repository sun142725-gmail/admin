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
    fontFamily: "-apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif",
    // —— 圆角档位锚点（以下均为 antd v5 默认值，渲染零变化；组件级覆写仍在下方 components 段）——
    borderRadiusSM: 4, // 小元素 Tag/Popconfirm
    borderRadius: 8, // 中控件默认（2026-10-31 全局圆角统一 8px）
    borderRadiusLG: 8, // 大容器基准
    // —— 间距四档锚点（Space size 8 种散值归一到 4/8/12/16，types/ui.ts SPACE_SIZE 同源；均为 antd 默认值）——
    marginXXS: 4, // xs：标签/按钮组内
    marginXS: 8, // sm：Space 默认档
    marginSM: 12, // md：表单项间
    margin: 16, // lg：卡片内边距
    marginLG: 24, // xl：区块间
    // —— 字号阶梯与控件高度锚点（均为 antd 默认值；页面标题继续走 global.css text-lg 工具类不动）——
    fontSizeSM: 12, // 辅助/标签
    fontSize: 14, // 正文
    fontSizeLG: 16, // 强调正文
    controlHeight: 32 // 控件高度基准
  },
  components: {
    // 原 CSS：.ant-btn 圆角 12（曾被 antd 默认值压制）+ font-weight 600
    Button: { borderRadius: 8, fontWeight: 600 },
    // 原 CSS：.ant-input/.ant-select/.ant-picker/.ant-input-number 圆角 12 !important
    Input: { borderRadius: 8 },
    Select: { borderRadius: 8 },
    DatePicker: { borderRadius: 8 },
    InputNumber: { borderRadius: 8 },
    // 原 CSS：.ant-card 圆角 20 / 边框 rgba(15,23,42,.06) !important
    Card: { borderRadiusLG: 8, colorBorderSecondary: 'rgba(15, 23, 42, 0.06)' },
    // 原 CSS：.ant-table 圆角 18 / 头部 #f7faff / hover 行背景 !important
    Table: {
      borderRadiusLG: 8,
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
