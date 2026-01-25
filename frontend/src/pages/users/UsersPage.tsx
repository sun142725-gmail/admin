// 用户管理页面提供用户 CRUD 与角色分配。
import React, { useEffect, useMemo, useState } from 'react';
import { Button, Form, Input, Modal, Space, Tag, message, Select } from 'antd';
import { listUsers, createUser, updateUser, deleteUser, disableUser, resetPassword, assignRoles } from '../../api/users';
import { listRoles } from '../../api/roles';
import { Permission } from '../../components/permission/Permission';
import { AppTable } from '../../components/AppTable';

interface UserItem {
  id: number;
  username: string;
  nickname?: string;
  email?: string;
  status: number;
  roles?: Array<{ id: number; name: string }>;
}

export const UsersPage: React.FC = () => {
  const [data, setData] = useState<UserItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [editItem, setEditItem] = useState<UserItem | null>(null);
  const [roles, setRoles] = useState<Array<{ id: number; name: string }>>([]);
  const [roleModalOpen, setRoleModalOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<UserItem | null>(null);
  const [form] = Form.useForm();
  const [roleForm] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await listUsers();
      setData(res.items);
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

  const onCreate = () => {
    setEditItem(null);
    form.resetFields();
    setOpen(true);
  };

  const onEdit = (item: UserItem) => {
    setEditItem(item);
    form.setFieldsValue(item);
    setOpen(true);
  };

  const onSubmit = async () => {
    const values = await form.validateFields();
    if (editItem) {
      const { username, ...payload } = values;
      await updateUser(editItem.id, payload);
      message.success('更新成功');
    } else {
      await createUser(values);
      message.success('创建成功');
    }
    setOpen(false);
    fetchData();
  };

  const onDelete = async (item: UserItem) => {
    await deleteUser(item.id);
    message.success('删除成功');
    fetchData();
  };

  const onDisable = async (item: UserItem) => {
    await disableUser(item.id);
    message.success('已禁用');
    fetchData();
  };

  const onResetPassword = async (item: UserItem) => {
    Modal.confirm({
      title: '重置密码',
      content: '确认重置为默认密码 123456？',
      onOk: async () => {
        await resetPassword(item.id, { password: '123456' });
        message.success('已重置密码');
      }
    });
  };

  const onAssignRoles = (item: UserItem) => {
    setCurrentUser(item);
    roleForm.setFieldsValue({ roleIds: item.roles?.map((role) => role.id) ?? [] });
    setRoleModalOpen(true);
  };

  const submitRoles = async () => {
    const values = await roleForm.validateFields();
    if (!currentUser) {
      return;
    }
    await assignRoles(currentUser.id, values.roleIds);
    message.success('角色已更新');
    setRoleModalOpen(false);
    fetchData();
  };

  const columns = useMemo(
    () => [
      { title: '用户名', dataIndex: 'username' },
      { title: '昵称', dataIndex: 'nickname' },
      { title: '邮箱', dataIndex: 'email' },
      {
        title: '状态',
        dataIndex: 'status',
        render: (value: number) => (value === 1 ? <Tag color="green">启用</Tag> : <Tag>禁用</Tag>)
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
          <Space>
            <Permission code="system:user:update" mode="disable">
              <Button size="small" onClick={() => onEdit(item)}>
                编辑
              </Button>
            </Permission>
            <Permission code="system:user:assign" mode="disable">
              <Button size="small" onClick={() => onAssignRoles(item)}>
                分配角色
              </Button>
            </Permission>
            <Permission code="system:user:disable" mode="disable">
              <Button size="small" onClick={() => onDisable(item)}>
                禁用
              </Button>
            </Permission>
            <Permission code="system:user:reset" mode="disable">
              <Button size="small" onClick={() => onResetPassword(item)}>
                重置密码
              </Button>
            </Permission>
            <Permission code="system:user:delete" mode="disable">
              <Button size="small" danger onClick={() => onDelete(item)}>
                删除
              </Button>
            </Permission>
          </Space>
        )
      }
    ],
    [roles]
  );

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Permission code="system:user:create" mode="disable">
          <Button type="primary" onClick={onCreate}>
            新增用户
          </Button>
        </Permission>
      </Space>
      <AppTable rowKey="id" columns={columns} dataSource={data} loading={loading} />

      <Modal title={editItem ? '编辑用户' : '新增用户'} open={open} onOk={onSubmit} onCancel={() => setOpen(false)}>
        <Form layout="vertical" form={form}>
          <Form.Item label="用户名" name="username" rules={[{ required: true, message: '请填写用户名' }]}>
            <Input disabled={!!editItem} />
          </Form.Item>
          {!editItem && (
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
        </Form>
      </Modal>

      <Modal title="分配角色" open={roleModalOpen} onOk={submitRoles} onCancel={() => setRoleModalOpen(false)}>
        <Form layout="vertical" form={roleForm}>
          <Form.Item label="角色" name="roleIds" rules={[{ required: true, message: '请选择角色' }]}>
            <Select mode="multiple" options={roles.map((role) => ({ value: role.id, label: role.name }))} />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
