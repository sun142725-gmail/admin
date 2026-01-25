// 权限管理页面提供权限码 CRUD。
import React, { useEffect, useState } from 'react';
import { Button, Form, Input, Modal, Space, message } from 'antd';
import { listPermissions, createPermission, updatePermission, deletePermission } from '../../api/permissions';
import { Permission } from '../../components/permission/Permission';
import { AppTable } from '../../components/AppTable';

interface PermissionItem {
  id: number;
  name: string;
  code: string;
  description?: string;
}

export const PermissionsPage: React.FC = () => {
  const [data, setData] = useState<PermissionItem[]>([]);
  const [open, setOpen] = useState(false);
  const [editItem, setEditItem] = useState<PermissionItem | null>(null);
  const [form] = Form.useForm();

  const fetchData = async () => {
    const res = await listPermissions();
    setData(res.items ?? []);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const onCreate = () => {
    setEditItem(null);
    form.resetFields();
    setOpen(true);
  };

  const onEdit = (item: PermissionItem) => {
    setEditItem(item);
    form.setFieldsValue(item);
    setOpen(true);
  };

  const onSubmit = async () => {
    const values = await form.validateFields();
    if (editItem) {
      await updatePermission(editItem.id, values);
      message.success('更新成功');
    } else {
      await createPermission(values);
      message.success('创建成功');
    }
    setOpen(false);
    fetchData();
  };

  const onDelete = async (item: PermissionItem) => {
    await deletePermission(item.id);
    message.success('删除成功');
    fetchData();
  };

  const columns = [
    { title: '权限名称', dataIndex: 'name' },
    { title: '权限码', dataIndex: 'code' },
    { title: '描述', dataIndex: 'description' },
    {
      title: '操作',
      render: (_: unknown, item: PermissionItem) => (
        <Space>
          <Permission code="system:permission:update" mode="disable">
            <Button size="small" onClick={() => onEdit(item)}>
              编辑
            </Button>
          </Permission>
          <Permission code="system:permission:delete" mode="disable">
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
        <Permission code="system:permission:create" mode="disable">
          <Button type="primary" onClick={onCreate}>
            新增权限
          </Button>
        </Permission>
      </Space>
      <AppTable rowKey="id" columns={columns} dataSource={data} />

      <Modal title={editItem ? '编辑权限' : '新增权限'} open={open} onOk={onSubmit} onCancel={() => setOpen(false)}>
        <Form layout="vertical" form={form}>
          <Form.Item label="权限名称" name="name" rules={[{ required: true, message: '请填写权限名称' }]}>
            <Input />
          </Form.Item>
          {!editItem && (
            <Form.Item label="权限码" name="code" rules={[{ required: true, message: '请填写权限码' }]}>
              <Input />
            </Form.Item>
          )}
          <Form.Item label="描述" name="description">
            <Input />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};
