// 统一消息封装：success/error/warning/info/loading + errorFrom（getErrorMessage 组合）。
// 收编 33 文件 149 处 message.* 直调：内部仍用 antd 静态 message（与现状挂载点一致，视觉零变化），
// 文案与分支由调用方逐字保持；errorFrom 收编 `error instanceof Error && error.message ? error.message : 'xx'`
// 样板（UsersPage.tsx:84 等 43 处）与两份私有 getErrorMessage 副本。
// notification.* 直调全仓 0 处，无需封装。
import { useMemo } from 'react';
import { message } from 'antd';
import { getErrorMessage } from '../utils/errorMessage';

export interface ApiMessageApi {
  success: (content: string) => void;
  error: (content: string) => void;
  /** 未知异常兜底：提取文案失败时用 fallback（默认「操作失败」）。 */
  errorFrom: (error: unknown, fallback?: string) => void;
  warning: (content: string) => void;
  info: (content: string) => void;
  loading: (content: string) => void;
}

export const useApiMessage = (): ApiMessageApi =>
  useMemo<ApiMessageApi>(
    () => ({
      success: (content) => {
        void message.success(content);
      },
      error: (content) => {
        void message.error(content);
      },
      errorFrom: (error, fallback) => {
        void message.error(getErrorMessage(error, fallback ?? '操作失败'));
      },
      warning: (content) => {
        void message.warning(content);
      },
      info: (content) => {
        void message.info(content);
      },
      loading: (content) => {
        void message.loading(content);
      }
    }),
    []
  );
