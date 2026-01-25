// 前端入口负责渲染 React 应用。
import React from 'react';
import ReactDOM from 'react-dom/client';
import { Provider } from 'react-redux';
import { App } from './App';
import { store } from './store';
import { enqueueLogEvent } from './utils/logBatcher';
import 'antd/dist/reset.css';
import './styles/global.css';

window.addEventListener('error', (event) => {
  enqueueLogEvent({
    type: 'error',
    payload: {
      message: event.message,
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
      message: 'UnhandledRejection',
      stack: event.reason?.stack,
      meta: {
        reason: event.reason
      }
    }
  });
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <App />
    </Provider>
  </React.StrictMode>
);
