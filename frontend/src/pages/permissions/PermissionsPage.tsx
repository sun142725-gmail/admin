// 权限管理页面提供权限码 CRUD。
import React, { useEffect, useState } from 'react';
import Button from 'antd/es/button';
import Form from 'antd/es/form';
import Input from 'antd/es/input';
import { listPermissions, createPermission, updatePermission, deletePermission } from '../../api/permissions';
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

interface PermissionItem {
  id: number;
  name: string;
  code: string;
  description?: string;
}

export const PermissionsPage: React.FC = () => {
  const [data, setData] = useState<PermissionItem[]>([]);
  const [form] = Form.useForm<PermissionItem>();
  const msg = useApiMessage();
  const modal = useFormModal<PermissionItem>(form);

  const fetchData = async () => {
    try {
      const res = await listPermissions();
      setData(res.items ?? []);
    } catch {
      msg.error('权限列表加载失败');
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const onEdit = (item: PermissionItem) => {
    modal.openForm(item);
  };

  const onSubmit = async () => {
    const values = await validateFormValues(form);
    if (!values) {
      return;
    }
    try {
      if (modal.editing) {
        await updatePermission(modal.editing.id, values);
        msg.success('更新成功');
      } else {
        await createPermission(values);
        msg.success('创建成功');
      }
      modal.close();
      fetchData();
    } catch (error) {
      msg.errorFrom(error, '操作失败');
    }
  };

  const onDelete = (item: PermissionItem) => {
    confirmAction({
      title: '删除权限',
      content: `确认删除权限「${item.name}」？该操作不可恢复。`,
      danger: true,
      onOk: async () => {
        try {
          await deletePermission(item.id);
          msg.success('删除成功');
          fetchData();
        } catch (error) {
          msg.errorFrom(error, '删除失败');
        }
      }
    });
  };

  const columns = [
    { title: '权限名称', dataIndex: 'name' },
    { title: '权限码', dataIndex: 'code' },
    { title: '描述', dataIndex: 'description' },
    {
      title: '操作',
      render: (_: unknown, item: PermissionItem) => (
        <ActionCell
          record={item}
          items={[
            { key: 'edit', label: '编辑', permission: 'system:permission:update', onClick: onEdit },
            { key: 'delete', label: '删除', danger: true, permission: 'system:permission:delete', onClick: onDelete }
          ]}
        />
      )
    }
  ];

  return (
    <div className="page-fill">
      <PageHeader
        className="shrink-0"
        title="权限管理"
        subtitle="统一维护权限名称、权限码与描述，供角色与菜单引用。"
        actions={
          <Permission code="system:permission:create" mode="disable">
            <Button type="primary" onClick={() => modal.openForm()}>
              新增权限
            </Button>
          </Permission>
        }
      />
      <PagePanel className="flex-1 min-h-0 flex flex-col">
        <SelfTable rowKey="id" columns={columns} dataSource={data} fill />
      </PagePanel>

      <SelfModal title={modal.editing ? '编辑权限' : '新增权限'} open={modal.open} onOk={onSubmit} onCancel={modal.close}>
        <SelfForm form={form}>
          <Form.Item label="权限名称" name="name" rules={[{ required: true, message: '请填写权限名称' }]}>
            <Input />
          </Form.Item>
          {!modal.editing && (
            <Form.Item label="权限码" name="code" rules={[{ required: true, message: '请填写权限码' }]}>
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
