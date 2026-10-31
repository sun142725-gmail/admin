// 统一错误文案提取纯函数：axios response.data.message → Error.message → fallback。
// 口径对齐 api/http.ts:209-210（reject 的是 new Error(payload?.message ?? '请求失败')），
// 语义逐字对齐 pages/home/HomePage.tsx:212-224 与 pages/notification/TemplatePage.tsx:468 的两份私有副本。

export const getErrorMessage = (error: unknown, fallback: string): string => {
  if (error && typeof error === 'object') {
    const responseMessage = (error as { response?: { data?: { message?: string } } }).response?.data?.message;
    if (responseMessage) {
      return responseMessage;
    }
    const directMessage = (error as { message?: string }).message;
    if (directMessage) {
      return directMessage;
    }
  }
  return fallback;
};
