// 角色管理页面提供角色 CRUD 与权限入口。
import React, { useEffect, useState } from 'react';
import Button from 'antd/es/button';
import Form from 'antd/es/form';
import Input from 'antd/es/input';
import Space from 'antd/es/space';
import Tag from 'antd/es/tag';
import { listRoles, createRole, updateRole, deleteRole } from '../../api/roles';
import { Permission } from '../../components/permission/Permission';
import { SelfForm, validateFormValues } from '../../components/base/SelfForm';
import { SelfModal } from '../../components/base/SelfModal';
import { SelfTable } from '../../components/base/SelfTable';
import { ActionCell } from '../../components/business/ActionCell';
import { confirmAction } from '../../components/business/ConfirmAction';
import { PageHeader } from '../../components/business/PageHeader';
import { PagePanel } from '../../components/business/PagePanel';
import { useApiMessage } from '../../hooks/useApiMessage';
import { useFormModal } from '../../hooks/useFormModal';
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
  const [form] = Form.useForm<RoleItem>();
  const msg = useApiMessage();
  const modal = useFormModal<RoleItem>(form);

  const fetchData = async () => {
    try {
      const res = await listRoles(1, 200);
      setData(res.items ?? []);
    } catch {
      msg.error('角色列表加载失败');
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const onSubmit = async () => {
    const values = await validateFormValues(form);
    if (!values) {
      return;
    }
    try {
      if (modal.editing) {
        await updateRole(modal.editing.id, values);
        msg.success('更新成功');
      } else {
        await createRole(values);
        msg.success('创建成功');
      }
      modal.close();
      fetchData();
    } catch (error) {
      msg.errorFrom(error, '操作失败');
    }
  };

  const onDelete = (item: RoleItem) => {
    confirmAction({
      title: '删除角色',
      content: `确认删除角色「${item.name}」？该操作不可恢复。`,
      danger: true,
      onOk: async () => {
        try {
          await deleteRole(item.id);
          msg.success('删除成功');
          fetchData();
        } catch (error) {
          msg.errorFrom(error, '删除失败');
        }
      }
    });
  };

  const onEdit = (item: RoleItem) => {
    modal.openForm(item);
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
        <ActionCell
          record={item}
          items={[
            { key: 'edit', label: '编辑', permission: 'system:role:update', onClick: onEdit },
            {
              key: 'assign',
              label: '功能权限',
              permission: 'system:role:assign',
              onClick: (record: RoleItem) => navigate(`/roles/${record.id}/permissions`, { state: { roleName: record.name } })
            },
            { key: 'delete', label: '删除', danger: true, permission: 'system:role:delete', onClick: onDelete }
          ]}
        />
      )
    }
  ];

  return (
    <div className="page-fill">
      <PageHeader
        className="shrink-0"
        title="角色管理"
        subtitle="管理角色定义与职责边界，功能权限进入独立页面配置，避免列表信息过载。"
        actions={
          <Permission code="system:role:create" mode="disable">
            <Button type="primary" onClick={() => modal.openForm()}>
              新增角色
            </Button>
          </Permission>
        }
      />
      <PagePanel className="flex-1 min-h-0 flex flex-col">
        <SelfTable rowKey="id" columns={columns} dataSource={data} fill />
      </PagePanel>

      <SelfModal title={modal.editing ? '编辑角色' : '新增角色'} open={modal.open} onOk={onSubmit} onCancel={modal.close}>
        <SelfForm form={form}>
          <Form.Item label="角色名称" name="name" rules={[{ required: true, message: '请填写角色名称' }]}>
            <Input />
          </Form.Item>
          {!modal.editing && (
            <Form.Item label="角色编码" name="code" rules={[{ required: true, message: '请填写角色编码' }]}>
              <Input />
            </Form.Item>
          )}
          <Form.Item label="描述" name="description">
            <Input />
          </Form.Item>
        </SelfForm>
      </SelfModal>
    </div>
  );
};
