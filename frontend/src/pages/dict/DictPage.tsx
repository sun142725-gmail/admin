// 字典管理页面提供字典与字典项维护。
import React, { useMemo, useState } from 'react';
import Button from 'antd/es/button';
import Form from 'antd/es/form';
import Input from 'antd/es/input';
import InputNumber from 'antd/es/input-number';
import Space from 'antd/es/space';
import Switch from 'antd/es/switch';
import { SelfDrawer } from '../../components/base/SelfDrawer';
import { SelfForm } from '../../components/base/SelfForm';
import { SelfModal } from '../../components/base/SelfModal';
import { SelfTable } from '../../components/base/SelfTable';
import { ActionCell } from '../../components/business/ActionCell';
import { FilterBar } from '../../components/business/FilterBar';
import { PageHeader } from '../../components/business/PageHeader';
import { PagePanel } from '../../components/business/PagePanel';
import { Permission } from '../../components/permission/Permission';
import { useApiMessage } from '../../hooks/useApiMessage';
import { useTableQuery } from '../../hooks/useTableQuery';
import {
  createDict,
  createDictItem,
  deleteDict,
  deleteDictItem,
  getDictDetail,
  listDicts,
  updateDict,
  updateDictItem
} from '../../api/dict';

interface DictItem {
  id: number;
  code: string;
  name: string;
  description?: string;
  status: number;
}

interface DictItemDetail {
  id: number;
  value: string;
  label: string;
  labelI18n?: Record<string, string>;
  sortOrder: number;
  status: number;
  extra?: Record<string, unknown>;
}

export const DictPage: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [editItem, setEditItem] = useState<DictItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentDict, setCurrentDict] = useState<DictItem | null>(null);
  const [dictItems, setDictItems] = useState<DictItemDetail[]>([]);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [currentDictItem, setCurrentDictItem] = useState<DictItemDetail | null>(null);
  const [queryForm] = Form.useForm<{ keyword?: string }>();
  const [form] = Form.useForm();
  const [itemForm] = Form.useForm();
  const msg = useApiMessage();

  const table = useTableQuery<DictItem, { keyword?: string }>({
    fetcher: ({ page, pageSize, filters }) => listDicts({ page, pageSize, ...filters })
  });

  const onSearch = async () => {
    const values = await queryForm.validateFields();
    table.search({ keyword: values.keyword });
  };

  const onReset = () => {
    queryForm.resetFields();
    table.reset();
  };

  const onCreate = () => {
    setEditItem(null);
    form.resetFields();
    setOpen(true);
  };

  // 现状无 resetFields（setFieldsValue 直接覆盖全部表单字段），保持原时序零改动
  const onEdit = (item: DictItem) => {
    setEditItem(item);
    form.setFieldsValue({ ...item, status: item.status === 1 });
    setOpen(true);
  };

  const onSubmit = async () => {
    const values = await form.validateFields();
    const payload = {
      ...values,
      status: values.status ? 1 : 0
    };
    if (editItem) {
      await updateDict(editItem.id, payload);
      msg.success('更新成功');
    } else {
      await createDict(payload);
      msg.success('创建成功');
    }
    setOpen(false);
    table.reload();
  };

  const onDelete = async (item: DictItem) => {
    await deleteDict(item.id);
    msg.success('删除成功');
    table.reload();
  };

  const openDetail = async (item: DictItem) => {
    const detail = await getDictDetail(item.code);
    setCurrentDict(item);
    setDictItems(detail.items ?? []);
    setDrawerOpen(true);
  };

  // 现状无 resetFields（setFieldsValue 覆盖各字段），保持原时序零改动
  const openItemModal = (item?: DictItemDetail) => {
    setCurrentDictItem(item ?? null);
    const labelI18n = item?.labelI18n ?? {};
    itemForm.setFieldsValue({
      value: item?.value,
      label: item?.label,
      labelEn: labelI18n['en-US'] ?? labelI18n.en,
      labelI18n: Object.keys(labelI18n).length ? JSON.stringify(labelI18n, null, 2) : undefined,
      sortOrder: item?.sortOrder ?? 0,
      status: item ? item.status === 1 : true,
      extra: item?.extra ? JSON.stringify(item.extra, null, 2) : undefined
    });
    setItemModalOpen(true);
  };

  const submitItem = async () => {
    const values = await itemForm.validateFields();
    const labelI18n: Record<string, string> = {};
    if (values.labelEn) {
      labelI18n['en-US'] = values.labelEn;
    }
    if (values.labelI18n) {
      try {
        const parsed = JSON.parse(values.labelI18n);
        Object.assign(labelI18n, parsed);
      } catch {
        msg.error('多语言 JSON 格式不正确');
        return;
      }
    }
    const extra = values.extra
      ? (() => {
          try {
            return JSON.parse(values.extra);
          } catch {
            msg.error('扩展字段 JSON 格式不正确');
            return null;
          }
        })()
      : undefined;
    if (extra === null) {
      return;
    }
    const payload = {
      value: values.value,
      label: values.label,
      labelI18n: Object.keys(labelI18n).length ? labelI18n : undefined,
      sortOrder: values.sortOrder ?? 0,
      status: values.status ? 1 : 0,
      extra
    };
    if (!currentDict) {
      return;
    }
    if (currentDictItem) {
      await updateDictItem(currentDictItem.id, payload);
      msg.success('字典项已更新');
    } else {
      await createDictItem(currentDict.id, payload);
      msg.success('字典项已创建');
    }
    const detail = await getDictDetail(currentDict.code);
    setDictItems(detail.items ?? []);
    setItemModalOpen(false);
  };

  const onDeleteItem = async (item: DictItemDetail) => {
    await deleteDictItem(item.id);
    msg.success('字典项已删除');
    if (currentDict) {
      const detail = await getDictDetail(currentDict.code);
      setDictItems(detail.items ?? []);
    }
  };

  const columns = useMemo(
    () => [
      { title: '编码', dataIndex: 'code' },
      { title: '名称', dataIndex: 'name' },
      { title: '描述', dataIndex: 'description' },
      {
        title: '状态',
        dataIndex: 'status',
        render: (value: number) => (value === 1 ? '启用' : '禁用')
      },
      {
        title: '操作',
        render: (_: unknown, record: DictItem) => (
          <ActionCell
            record={record}
            items={[
              { key: 'detail', label: '详情', permission: 'system:dict:list', onClick: openDetail },
              { key: 'edit', label: '编辑', permission: 'system:dict:update', onClick: onEdit },
              { key: 'delete', label: '删除', danger: true, permission: 'system:dict:delete', onClick: onDelete }
            ]}
          />
        )
      }
    ],
    []
  );

  const itemColumns = useMemo(
    () => [
      { title: '值', dataIndex: 'value' },
      { title: '标签', dataIndex: 'label' },
      { title: '排序', dataIndex: 'sortOrder' },
      {
        title: '状态',
        dataIndex: 'status',
        render: (value: number) => (value === 1 ? '启用' : '禁用')
      },
      {
        title: '操作',
        render: (_: unknown, record: DictItemDetail) => (
          <ActionCell
            record={record}
            items={[
              { key: 'edit', label: '编辑', permission: 'system:dict:update', onClick: openItemModal },
              {
                key: 'delete',
                label: '删除',
                danger: true,
                permission: 'system:dict:delete',
                onClick: (item: DictItemDetail) => onDeleteItem(item)
              }
            ]}
          />
        )
      }
    ],
    [currentDict]
  );

  return (
    <div>
      <PageHeader
        title="字典管理"
        subtitle="维护枚举字典、多语言标签与扩展属性，供前后端统一复用。"
        actions={
          <Permission code="system:dict:create" mode="disable">
            <Button type="primary" onClick={onCreate}>
              新增字典
            </Button>
          </Permission>
        }
      />

      <FilterBar form={queryForm} onSearch={onSearch} onReset={onReset}>
        <Form.Item label="关键词" name="keyword">
          <Input placeholder="编码/名称" />
        </Form.Item>
      </FilterBar>

      <PagePanel>
        <SelfTable rowKey="id" columns={columns} dataSource={table.data} loading={table.loading} pagination={table.pagination} />
      </PagePanel>

      <SelfModal title={editItem ? '编辑字典' : '新增字典'} open={open} onOk={onSubmit} onCancel={() => setOpen(false)}>
        <SelfForm form={form}>
          {!editItem && (
            <Form.Item
              label="字典编码"
              name="code"
              rules={[{ required: true, message: '请填写字典编码' }]}
            >
              <Input />
            </Form.Item>
          )}
          <Form.Item
            label="字典名称"
            name="name"
            rules={[{ required: true, message: '请填写字典名称' }]}
          >
            <Input />
          </Form.Item>
          <Form.Item label="描述" name="description">
            <Input />
          </Form.Item>
          <Form.Item label="状态" name="status" valuePropName="checked" initialValue={true}>
            <Switch checkedChildren="启用" unCheckedChildren="禁用" />
          </Form.Item>
        </SelfForm>
      </SelfModal>

      <SelfDrawer
        title={currentDict ? `字典详情 - ${currentDict.name}` : '字典详情'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width="lg"
      >
        <Space className="mb-4">
          <Permission code="system:dict:update" mode="disable">
            <Button type="primary" onClick={() => openItemModal()}>
              新增字典项
            </Button>
          </Permission>
        </Space>
        <SelfTable rowKey="id" columns={itemColumns} dataSource={dictItems} pagination={false} />
      </SelfDrawer>

      <SelfModal
        title={currentDictItem ? '编辑字典项' : '新增字典项'}
        open={itemModalOpen}
        onOk={submitItem}
        onCancel={() => setItemModalOpen(false)}
      >
        <SelfForm form={itemForm}>
          <Form.Item label="值" name="value" rules={[{ required: true, message: '请填写字典值' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="标签" name="label" rules={[{ required: true, message: '请填写字典标签' }]}>
            <Input />
          </Form.Item>
          <Form.Item label="英文标签" name="labelEn">
            <Input />
          </Form.Item>
          <Form.Item label="多语言 JSON" name="labelI18n">
            <Input.TextArea placeholder='例如 {"en-US":"Enabled","ja-JP":"有効"}' />
          </Form.Item>
          <Form.Item label="排序" name="sortOrder">
            <InputNumber min={0} className="w-full" />
          </Form.Item>
          <Form.Item label="状态" name="status" valuePropName="checked" initialValue={true}>
            <Switch checkedChildren="启用" unCheckedChildren="禁用" />
          </Form.Item>
          <Form.Item label="扩展字段 JSON" name="extra">
            <Input.TextArea placeholder='例如 {"color":"red"}' />
          </Form.Item>
        </SelfForm>
      </SelfModal>
    </div>
  );
};
