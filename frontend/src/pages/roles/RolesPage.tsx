// 角色管理页面提供角色 CRUD 与权限分配。
import React, { useEffect, useState } from 'react';
import { Button, Form, Input, Modal, Space, Tag, message, Select } from 'antd';
import { listRoles, createRole, updateRole, deleteRole, assignPermissions } from '../../api/roles';
import { listPermissions } from '../../api/permissions';
import { Permission } from '../../components/permission/Permission';
import { AppTable } from '../../components/AppTable';

interface RoleItem {
  id: number;
  name: string;
  code: string;
  description?: string;
  permissions?: Array<{ id: number; name: string }>;
}

export const RolesPage: React.FC = () => {
  const [data, setData] = useState<RoleItem[]>([]);
  const [open, setOpen] = useState(false);
  const [editItem, setEditItem] = useState<RoleItem | null>(null);
  const [permissions, setPermissions] = useState<Array<{ id: number; name: string }>>([]);
  const [permModalOpen, setPermModalOpen] = useState(false);
  const [currentRole, setCurrentRole] = useState<RoleItem | null>(null);
  const [form] = Form.useForm();
  const [permForm] = Form.useForm();

  const fetchData = async () => {
    const res = await listRoles();
    setData(res.items ?? []);
  };

  const fetchPermissions = async () => {
    const res = await listPermissions();
    setPermissions(res.items ?? []);
  };

  useEffect(() => {
    fetchData();
    fetchPermissions();
  }, []);

  const onCreate = () => {
    setEditItem(null);
    form.resetFields();
    setOpen(true);
  };

  const onEdit = (item: RoleItem) => {
    setEditItem(item);
    form.setFieldsValue(item);
    setOpen(true);
  };

  const onSubmit = async () => {
    const values = await form.validateFields();
    if (editItem) {
      await updateRole(editItem.id, values);
      message.success('更新成功');
    } else {
      await createRole(values);
      message.success('创建成功');
    }
    setOpen(false);
    fetchData();
  };

  const onDelete = async (item: RoleItem) => {
    await deleteRole(item.id);
    message.success('删除成功');
    fetchData();
  };

  const onAssign = (item: RoleItem) => {
    setCurrentRole(item);
    permForm.setFieldsValue({
      permissionIds: item.permissions?.map((permission) => permission.id) ?? []
    });
    setPermModalOpen(true);
  };

  const submitPermissions = async () => {
    const values = await permForm.validateFields();
    if (!currentRole) {
      return;
    }
    await assignPermissions(currentRole.id, values.permissionIds);
    message.success('权限已更新');
    setPermModalOpen(false);
    fetchData();
  };

  const columns = [
    { title: '角色名称', dataIndex: 'name' },
    { title: '角色编码', dataIndex: 'code' },
    { title: '描述', dataIndex: 'description' },
    {
      title: '权限',
      dataIndex: 'permissions',
      render: (items: Array<{ id: number; name: string }>) =>
        items?.map((item) => <Tag key={item.id}>{item.name}</Tag>)
    },
    {
      title: '操作',
      render: (_: unknown, item: RoleItem) => (
        <Space>
          <Permission code="system:role:update" mode="disable">
            <Button size="small" onClick={() => onEdit(item)}>
              编辑
            </Button>
          </Permission>
          <Permission code="system:role:assign" mode="disable">
            <Button size="small" onClick={() => onAssign(item)}>
              分配权限
            </Button>
          </Permission>
          <Permission code="system:role:delete" mode="disable">
            <Button size="small" danger onClick={() => onDelete(item)}>
              删除
            </Button>
          </Permission>
        </Space>
      )
    }
  ];

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Permission code="system:role:create" mode="disable">
          <Button type="primary" onClick={onCreate}>
            新增角色
          </Button>
        </Permission>
      </Space>
      <AppTable rowKey="id" columns={columns} dataSource={data} />

      <Modal title={editItem ? '编辑角色' : '新增角色'} open={open} onOk={onSubmit} onCancel={() => setOpen(false)}>
        <Form layout="vertical" form={form}>
          <Form.Item label="角色名称" name="name" rules={[{ required: true, message: '请填写角色名称' }]}>
            <Input />
          </Form.Item>
          {!editItem && (
            <Form.Item label="角色编码" name="code" rules={[{ required: true, message: '请填写角色编码' }]}>
              <Input />
            </Form.Item>
          )}
          <Form.Item label="描述" name="description">
            <Input />
          </Form.Item>
        </Form>
      </Modal>

      <Modal title="分配权限" open={permModalOpen} onOk={submitPermissions} onCancel={() => setPermModalOpen(false)}>
        <Form layout="vertical" form={permForm}>
          <Form.Item label="权限" name="permissionIds" rules={[{ required: true, message: '请选择权限' }]}>
            <Select
              mode="multiple"
              options={permissions.map((permission) => ({
                value: permission.id,
                label: permission.name
              }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
