// 前端入口负责渲染 React 应用。
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { App } from './App';
import { store } from './store';
import { enqueueLogEvent, registerFlushHooks } from './utils/logBatcher';
import 'antd/dist/reset.css';
import './styles/global.css';

window.addEventListener('error', (event) => {
  // 资源加载失败（script/img）没有 message，从 target 提取来源
  const target = event.target as { src?: string; href?: string } | null;
  enqueueLogEvent({
    type: 'error',
    payload: {
      message: event.message || (target?.src || target?.href ? `资源加载失败: ${target.src ?? target.href}` : '未知错误'),
      stack: event.error?.stack,
      meta: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno
      }
    }
  });
});

window.addEventListener('unhandledrejection', (event) => {
  enqueueLogEvent({
    type: 'error',
    payload: {
      message: `UnhandledRejection: ${typeof event.reason === 'string' ? event.reason : event.reason?.message ?? '未知原因'}`,
      stack: event.reason?.stack,
      meta: {
        reason: event.reason instanceof Error ? undefined : event.reason
      }
    }
  });
});

// 页面隐藏/关闭时兜底冲刷日志队列
registerFlushHooks();

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>
);
