// 富文本 HTML 统一消毒：通知模板等场景服务端渲染的 HTML 会在页面注入，
// 模板变量一旦包含用户可控内容即成 XSS 注入点（token 存于 localStorage，被注入即可被窃取）。
import DOMPurify from 'dompurify';

export const sanitizeHtml = (html: string | undefined | null): string =>
  DOMPurify.sanitize(html ?? '');
