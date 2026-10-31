// validateFormValues 纯逻辑单测：结构类型注入 mock form，不渲染组件（node 环境）。
import { describe, expect, it } from 'vitest';
import { validateFormValues } from './SelfForm';

describe('validateFormValues', () => {
  it('校验通过返回 values', async () => {
    const form = { validateFields: async () => ({ name: '张三', level: 'info' }) };
    await expect(validateFormValues(form)).resolves.toEqual({ name: '张三', level: 'info' });
  });

  it('校验异常（antd reject）吞掉返回 null，对齐 UsersPage onSubmit 样板', async () => {
    const form = {
      validateFields: async () => {
        throw new Error('validation failed');
      }
    };
    await expect(validateFormValues(form)).resolves.toBeNull();
  });

  it('校验异常为非 Error（如 antd 校验对象数组）同样返回 null', async () => {
    const form = {
      validateFields: async () => {
        // antd 实际 reject 的是带 errorFields 的校验对象，非 Error 实例
        throw { errorFields: [{ name: ['name'], errors: ['请填写名称'] }] };
      }
    };
    await expect(validateFormValues(form)).resolves.toBeNull();
  });
});
