// 角色管理页面提供角色 CRUD 与权限入口。
import React, { useEffect, useState } from 'react';
import { Button, Form, Input, Modal, Space, Tag, message } from 'antd';
import { listRoles, createRole, updateRole, deleteRole } from '../../api/roles';
import { Permission } from '../../components/permission/Permission';
import { AppTable } from '../../components/AppTable';
import { useNavigate } from 'react-router-dom';

interface RoleItem {
  id: number;
  name: string;
  code: string;
  description?: string;
  permissions?: Array<{ id: number; name: string }>;
}

export const RolesPage: React.FC = () => {
  const navigate = useNavigate();
  const [data, setData] = useState<RoleItem[]>([]);
  const [open, setOpen] = useState(false);
  const [editItem, setEditItem] = useState<RoleItem | null>(null);
  const [form] = Form.useForm();

  const fetchData = async () => {
    const res = await listRoles(1, 200);
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

  const columns = [
    { title: '角色名称', dataIndex: 'name' },
    { title: '角色编码', dataIndex: 'code' },
    { title: '描述', dataIndex: 'description' },
    {
      title: '权限概览',
      dataIndex: 'permissions',
      width: 220,
      render: (items: Array<{ id: number; name: string }>) => (
        <Space size={[8, 8]} wrap>
          <Tag color="blue">{items?.length ?? 0} 项权限</Tag>
          {items?.slice(0, 2).map((item) => <Tag key={item.id}>{item.name}</Tag>)}
          {(items?.length ?? 0) > 2 && <Tag>+{(items?.length ?? 0) - 2}</Tag>}
        </Space>
      )
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
            <Button
              size="small"
              onClick={() => navigate(`/roles/${item.id}/permissions`, { state: { roleName: item.name } })}
            >
              功能权限
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
      <div className="page-toolbar">
        <div>
          <div className="page-toolbar-title">角色管理</div>
          <div className="page-toolbar-subtitle">管理角色定义与职责边界，功能权限进入独立页面配置，避免列表信息过载。</div>
        </div>
        <div className="page-actions">
          <Permission code="system:role:create" mode="disable">
            <Button type="primary" onClick={onCreate}>
              新增角色
            </Button>
          </Permission>
        </div>
      </div>
      <div className="page-table-card">
        <AppTable rowKey="id" columns={columns} dataSource={data} />
      </div>

      <Modal
        className="app-form-modal"
        title={editItem ? '编辑角色' : '新增角色'}
        open={open}
        onOk={onSubmit}
        onCancel={() => setOpen(false)}
      >
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
    </div>
  );
};
