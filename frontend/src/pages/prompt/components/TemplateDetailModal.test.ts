// renderTemplate 纯函数单测：{{content}} 占位替换语义。
// 实现收拢在 ../promptTemplate（纯函数模块不依赖 antd/API 层，node 环境直测无 localStorage 断链）；
// TemplateDetailModal.tsx re-export 同名函数保持「自组件文件可导入」的 API。
import { describe, expect, it } from 'vitest';
import { renderTemplate } from '../promptTemplate';

describe('renderTemplate', () => {
  it('content 为 undefined/空串/纯空白 → 模板原样返回', () => {
    expect(renderTemplate('水彩插画：{{content}}')).toBe('水彩插画：{{content}}');
    expect(renderTemplate('水彩插画：{{content}}', '')).toBe('水彩插画：{{content}}');
    expect(renderTemplate('水彩插画：{{content}}', '   ')).toBe('水彩插画：{{content}}');
  });

  it('单个 {{content}} 占位被替换', () => {
    expect(renderTemplate('水彩插画：{{content}}', '一只猫')).toBe('水彩插画：一只猫');
  });

  it('多处 {{content}} 全部替换（replaceAll 语义）', () => {
    expect(renderTemplate('{{content}}，风格参考 {{content}}', '星空')).toBe('星空，风格参考 星空');
  });

  it('模板无占位符时 content 传入不影响返回', () => {
    expect(renderTemplate('固定正文的模板', '任意内容')).toBe('固定正文的模板');
  });
});
