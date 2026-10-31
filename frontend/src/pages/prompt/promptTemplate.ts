// 提示词库纯函数模块：不依赖 antd/API 层（node 环境可直测，vitest 环境口径）。
// 模板渲染占位符 {{content}} 口径与图文流水线一致（见 PromptLibraryPage 文件头注释）。

/** 模板渲染纯函数：{{content}} 占位替换。
 *  content 为 undefined/空串/纯空白 → 模板原样返回（「留空则按模板原文生成」）；多处占位全替换。
 *  split/join 实现 replaceAll 语义（前端 tsconfig lib=ES2020 无 String.prototype.replaceAll）。 */
export const renderTemplate = (template: string, content?: string): string =>
  content && content.trim().length > 0 ? template.split('{{content}}').join(content) : template;
