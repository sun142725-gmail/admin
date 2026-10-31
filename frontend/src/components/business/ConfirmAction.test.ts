// buildConfirmOptions 纯函数单测：danger→okButtonProps 合并语义与字段透传。
import { describe, expect, it } from 'vitest';
import { buildConfirmOptions } from './ConfirmAction';

describe('buildConfirmOptions', () => {
  it('danger:true 映射 okButtonProps.danger（UsersPage 删除确认样板）', () => {
    const options = buildConfirmOptions({ title: '删除用户', content: '该操作不可恢复。', danger: true });
    expect(options.title).toBe('删除用户');
    expect(options.content).toBe('该操作不可恢复。');
    expect(options.okButtonProps).toEqual({ danger: true });
  });

  it('不传 danger 时 okButtonProps 为 undefined（UsersPage 重置密码样板：非危险确认）', () => {
    const options = buildConfirmOptions({ title: '重置密码' });
    expect(options.okButtonProps).toBeUndefined();
  });

  it('显式 okButtonProps 优先于 danger 推导', () => {
    const options = buildConfirmOptions({ title: 't', danger: true, okButtonProps: { danger: false } });
    expect(options.okButtonProps).toEqual({ danger: false });
  });

  it('onOk/okText/cancelText 原样透传', async () => {
    let called = false;
    const onOk = async () => {
      called = true;
    };
    const options = buildConfirmOptions({ title: 't', okText: '删除', cancelText: '取消', onOk });
    expect(options.okText).toBe('删除');
    expect(options.cancelText).toBe('取消');
    await options.onOk?.();
    expect(called).toBe(true);
  });
});
