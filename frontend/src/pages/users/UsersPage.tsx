// 用户管理页面提供用户 CRUD 与角色分配。
import React, { useEffect, useMemo, useState } from 'react';
import Button from 'antd/es/button';
import Form from 'antd/es/form';
import Input from 'antd/es/input';
import Select from 'antd/es/select';
import Tag from 'antd/es/tag';
import { listUsers, createUser, updateUser, deleteUser, disableUser, resetPassword, assignRoles } from '../../api/users';
import { listRoles } from '../../api/roles';
import { Permission } from '../../components/permission/Permission';
import { SelfForm, validateFormValues } from '../../components/base/SelfForm';
import { SelfModal } from '../../components/base/SelfModal';
import { SelfTable } from '../../components/base/SelfTable';
import { ActionCell } from '../../components/business/ActionCell';
import { confirmAction } from '../../components/business/ConfirmAction';
import { PageHeader } from '../../components/business/PageHeader';
import { PagePanel } from '../../components/business/PagePanel';
import { StatusTag } from '../../components/business/StatusTag';
import { useApiMessage } from '../../hooks/useApiMessage';
import { useFormModal } from '../../hooks/useFormModal';
import type { StatusMeta } from '../../types/ui';

interface UserItem {
  id: number;
  username: string;
  nickname?: string;
  email?: string;
  status: number;
  roles?: Array<{ id: number; name: string }>;
}

// 状态色刻度表（components/README.md）：启用=green、禁用=default（无色），对齐迁移前写法。
const USER_STATUS_META: Record<number, StatusMeta> = {
  1: { label: '启用', color: 'green' },
  0: { label: '禁用', color: 'default' }
};

export const UsersPage: React.FC = () => {
  const [data, setData] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [roles, setRoles] = useState<Array<{ id: number; name: string }>>([]);
  const [currentUser, setCurrentUser] = useState<UserItem | null>(null);
  const [form] = Form.useForm<UserItem>();
  const [roleForm] = Form.useForm<{ roleIds: number[] }>();
  const msg = useApiMessage();
  const modal = useFormModal<UserItem>(form);
  // 分配角色弹窗现状无 resetFields（打开时 setFieldsValue 全量覆盖 roleIds），reset:false 保持现状
  const roleModal = useFormModal<{ roleIds: number[] }>(roleForm, { reset: false });

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await listUsers();
      setData(res.items);
    } catch {
      msg.error('用户列表加载失败');
    } finally {
      setLoading(false);
    }
  };

  const fetchRoles = async () => {
    const res = await listRoles();
    setRoles(res.items ?? []);
  };

  useEffect(() => {
    fetchData();
    fetchRoles();
  }, []);

  const onSubmit = async () => {
    const values = await validateFormValues(form);
    if (!values) {
      return;
    }
    try {
      if (modal.editing) {
        const { username, ...payload } = values;
        await updateUser(modal.editing.id, payload);
        msg.success('更新成功');
      } else {
        await createUser(values);
        msg.success('创建成功');
      }
      modal.close();
      fetchData();
    } catch (error) {
      msg.errorFrom(error, '操作失败');
    }
  };

  const onDelete = (item: UserItem) => {
    confirmAction({
      title: '删除用户',
      content: `确认删除用户「${item.username}」？该操作不可恢复。`,
      danger: true,
      onOk: async () => {
        try {
          await deleteUser(item.id);
          msg.success('删除成功');
          fetchData();
        } catch (error) {
          msg.errorFrom(error, '删除失败');
        }
      }
    });
  };

  const onDisable = async (item: UserItem) => {
    await disableUser(item.id);
    msg.success('已禁用');
    fetchData();
  };

  const onResetPassword = (item: UserItem) => {
    confirmAction({
      title: '重置密码',
      content: '确认重置为默认密码 123456？',
      onOk: async () => {
        await resetPassword(item.id, { password: '123456' });
        msg.success('已重置密码');
      }
    });
  };

  const onEdit = (item: UserItem) => {
    modal.openForm(item);
  };

  const onAssignRoles = (item: UserItem) => {
    setCurrentUser(item);
    roleForm.setFieldsValue({ roleIds: item.roles?.map((role) => role.id) ?? [] });
    roleModal.openForm();
  };

  const submitRoles = async () => {
    const values = await validateFormValues(roleForm);
    if (!values) {
      return;
    }
    if (!currentUser) {
      return;
    }
    try {
      await assignRoles(currentUser.id, values.roleIds);
      msg.success('角色已更新');
      roleModal.close();
      fetchData();
    } catch (error) {
      msg.errorFrom(error, '角色分配失败');
    }
  };

  const columns = useMemo(
    () => [
      { title: '用户名', dataIndex: 'username' },
      { title: '昵称', dataIndex: 'nickname' },
      { title: '邮箱', dataIndex: 'email' },
      {
        title: '状态',
        dataIndex: 'status',
        render: (value: number) => (
          <StatusTag value={value} map={USER_STATUS_META} fallback={{ label: '禁用', color: 'default' }} />
        )
      },
      {
        title: '角色',
        dataIndex: 'roles',
        render: (rolesData: Array<{ id: number; name: string }>) =>
          rolesData?.map((role) => <Tag key={role.id}>{role.name}</Tag>)
      },
      {
        title: '操作',
        render: (_: unknown, item: UserItem) => (
          <ActionCell
            record={item}
            items={[
              { key: 'edit', label: '编辑', permission: 'system:user:update', onClick: onEdit },
              { key: 'assign', label: '分配角色', permission: 'system:user:assign', onClick: onAssignRoles },
              { key: 'disable', label: '禁用', permission: 'system:user:disable', onClick: onDisable },
              { key: 'reset', label: '重置密码', permission: 'system:user:reset', onClick: onResetPassword },
              { key: 'delete', label: '删除', danger: true, permission: 'system:user:delete', onClick: onDelete }
            ]}
          />
        )
      }
    ],
    [roles]
  );

  return (
    <div>
      <PageHeader
        title="用户管理"
        subtitle="维护后台用户资料、状态与角色绑定关系。"
        actions={
          <Permission code="system:user:create" mode="disable">
            <Button type="primary" onClick={() => modal.openForm()}>
              新增用户
            </Button>
          </Permission>
        }
      />
      <PagePanel>
        <SelfTable rowKey="id" columns={columns} dataSource={data} loading={loading} />
      </PagePanel>

      <SelfModal title={modal.editing ? '编辑用户' : '新增用户'} open={modal.open} onOk={onSubmit} onCancel={modal.close}>
        <SelfForm form={form}>
          <Form.Item label="用户名" name="username" rules={[{ required: true, message: '请填写用户名' }]}>
            <Input disabled={!!modal.editing} />
          </Form.Item>
          {!modal.editing && (
            <Form.Item label="密码" name="password" rules={[{ required: true, message: '请填写密码' }]}>
              <Input.Password />
            </Form.Item>
          )}
          <Form.Item label="昵称" name="nickname">
            <Input />
          </Form.Item>
          <Form.Item label="邮箱" name="email">
            <Input />
          </Form.Item>
        </SelfForm>
      </SelfModal>

      <SelfModal title="分配角色" open={roleModal.open} onOk={submitRoles} onCancel={roleModal.close}>
        <SelfForm form={roleForm}>
          <Form.Item label="角色" name="roleIds" rules={[{ required: true, message: '请选择角色' }]}>
            <Select mode="multiple" options={roles.map((role) => ({ value: role.id, label: role.name }))} />
          </Form.Item>
        </SelfForm>
      </SelfModal>
    </div>
  );
};
