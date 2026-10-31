// business 层二段确认：
// ① ConfirmPopconfirm 收编行内 Popconfirm（实测 15 处/12 文件）——okText 不设默认，
//    透传 antd locale（zh_CN「确定」）；仅 FlowsPage.tsx:256 / NovelVideoPage.tsx:430 两处
//    现状显式 '删除'，迁移时显式传参。
// ② confirmAction + buildConfirmOptions 收编页面级 Modal.confirm（users/roles/permissions/notification
//    4 文件），danger 开关映射 okButtonProps.danger（UsersPage.tsx:89-103 样板）。
// DictPage.tsx:109,188 无确认直删保持现状（只统一形态，不擅自加确认）。
import React from 'react';
import { Modal, Popconfirm } from 'antd';
import type { ModalFuncProps, PopconfirmProps } from 'antd';

/** Modal.confirm 选项：danger=true 时主按钮 danger（显式 okButtonProps 优先）。 */
export interface ConfirmActionOptions {
  title: React.ReactNode;
  content?: React.ReactNode;
  okText?: string;
  cancelText?: string;
  danger?: boolean;
  onOk?: () => void | Promise<unknown>;
  okButtonProps?: ModalFuncProps['okButtonProps'];
}

/** 纯函数：选项 → ModalFuncProps（合并语义：danger 与 okButtonProps 显式声明均覆盖默认）。 */
export const buildConfirmOptions = (options: ConfirmActionOptions): ModalFuncProps => ({
  title: options.title,
  content: options.content,
  okText: options.okText,
  cancelText: options.cancelText,
  okButtonProps:
    options.okButtonProps ?? (options.danger ? { danger: true } : undefined),
  onOk: options.onOk
});

/** 页面级确认弹窗（替代裸 Modal.confirm 的统一入口）。 */
export const confirmAction = (options: ConfirmActionOptions): void => {
  Modal.confirm(buildConfirmOptions(options));
};

export interface ConfirmPopconfirmProps extends PopconfirmProps {
  /** 确认回调。 */
  onConfirm: () => void | Promise<unknown>;
  children: React.ReactElement;
}

/** 行内二段确认：Popconfirm 薄封装统一入口，okText/cancelText 不设默认（透传 antd locale）。 */
export const ConfirmPopconfirm: React.FC<ConfirmPopconfirmProps> = ({ onConfirm, children, ...rest }) => (
  <Popconfirm {...rest} onConfirm={onConfirm}>
    {children}
  </Popconfirm>
);
