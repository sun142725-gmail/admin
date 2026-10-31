// create/edit 双态弹窗单入口：openForm(record?) 内部统一「reset→setFieldsValue→open」时序。
// 对齐 UsersPage.tsx:51-63 样板（onCreate/onEdit 两分支合一）；editItem 注释（:59）即 reset 防残留理由。
// ⚠reset 默认 true（antd5「关闭即重置」规范）；DictPage.tsx:86-90/:122-134 现状无 resetFields，
// 迁移时显式传 reset:false 保持现状（「补 reset」单列为后续可选行为修复）。
import { useCallback, useState } from 'react';
import type { FormInstance } from 'antd';

export interface UseFormModalOptions {
  /** 打开前是否 resetFields 防残留（默认 true；DictPage 特例传 false 保持现状）。 */
  reset?: boolean;
}

export interface UseFormModalResult<T extends object> {
  open: boolean;
  /** 当前编辑对象（null = 新建态）。 */
  editing: T | null;
  /** 统一入口：openForm() 新建、openForm(record) 编辑。 */
  openForm: (record?: T) => void;
  close: () => void;
  setOpen: (open: boolean) => void;
}

export const useFormModal = <T extends object = Record<string, unknown>>(
  form: FormInstance,
  options?: UseFormModalOptions
): UseFormModalResult<T> => {
  const reset = options?.reset ?? true;
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<T | null>(null);

  const openForm = useCallback(
    (record?: T) => {
      setEditing(record ?? null);
      if (reset) {
        form.resetFields();
      }
      if (record) {
        form.setFieldsValue(record);
      }
      setOpen(true);
    },
    [form, reset]
  );

  const close = useCallback(() => setOpen(false), []);

  return { open, editing, openForm, close, setOpen };
};
