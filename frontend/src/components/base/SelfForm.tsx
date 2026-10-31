// base 层表单薄封装：layout='vertical' 默认（可覆盖），其余 FormProps 全量透传。
// 提交封装 validateFormValues：校验异常吞掉返回 null，对齐 pages/users/UsersPage.tsx:65-71 样板。
import React from 'react';
import { Form } from 'antd';
import type { FormInstance, FormProps } from 'antd';

// antd Form 包装类型要求 children?: ReactNode（排除 RenderProps 函数形态），
// 收编对象均为 JSX children，此处同步收窄以兼容 spread 透传。
export type SelfFormProps<T extends object> = Omit<FormProps<T>, 'children'> & {
  children?: React.ReactNode;
};

export const SelfForm = <T extends object = Record<string, unknown>>(
  props: SelfFormProps<T>
): React.ReactElement => {
  const { layout, children, ...rest } = props;
  return <Form {...rest} layout={layout ?? 'vertical'}>{children}</Form>;
};

/**
 * 提交封装：await form.validateFields() 校验不通过时 antd reject，此处吞掉返回 null。
 * 用法：const values = await validateFormValues(form); if (!values) return;
 * 入参用结构类型（Pick）而非完整 FormInstance，便于 node 环境单测注入 mock。
 */
export const validateFormValues = async <T extends object>(
  form: Pick<FormInstance<T>, 'validateFields'>
): Promise<T | null> => {
  try {
    return (await form.validateFields()) as T;
  } catch {
    return null;
  }
};
