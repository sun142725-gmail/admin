// 字典管理页面提供字典与字典项维护。
import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Drawer, Form, Input, InputNumber, Modal, Space, Switch, message } from 'antd';
import { AppTable } from '../../components/AppTable';
import { Permission } from '../../components/permission/Permission';
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
  const [data, setData] = useState<DictItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState<{ keyword?: string }>({});
  const [open, setOpen] = useState(false);
  const [editItem, setEditItem] = useState<DictItem | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentDict, setCurrentDict] = useState<DictItem | null>(null);
  const [dictItems, setDictItems] = useState<DictItemDetail[]>([]);
  const [itemModalOpen, setItemModalOpen] = useState(false);
  const [currentDictItem, setCurrentDictItem] = useState<DictItemDetail | null>(null);
  const [queryForm] = Form.useForm();
  const [form] = Form.useForm();
  const [itemForm] = Form.useForm();

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await listDicts({ page, pageSize, ...filters });
      setData(res.items ?? []);
      setTotal(res.total ?? 0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [page, pageSize, filters]);

  const onSearch = async () => {
    const values = await queryForm.validateFields();
    setPage(1);
    setFilters({ keyword: values.keyword });
  };

  const onReset = () => {
    queryForm.resetFields();
    setPage(1);
    setFilters({});
  };

  const onCreate = () => {
    setEditItem(null);
    form.resetFields();
    setOpen(true);
  };

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
      message.success('更新成功');
    } else {
      await createDict(payload);
      message.success('创建成功');
    }
    setOpen(false);
    fetchData();
  };

  const onDelete = async (item: DictItem) => {
    await deleteDict(item.id);
    message.success('删除成功');
    fetchData();
  };

  const openDetail = async (item: DictItem) => {
    const detail = await getDictDetail(item.code);
    setCurrentDict(item);
    setDictItems(detail.items ?? []);
    setDrawerOpen(true);
  };

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
        message.error('多语言 JSON 格式不正确');
        return;
      }
    }
    const extra = values.extra
      ? (() => {
          try {
            return JSON.parse(values.extra);
          } catch {
            message.error('扩展字段 JSON 格式不正确');
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
      message.success('字典项已更新');
    } else {
      await createDictItem(currentDict.id, payload);
      message.success('字典项已创建');
    }
    const detail = await getDictDetail(currentDict.code);
    setDictItems(detail.items ?? []);
    setItemModalOpen(false);
  };

  const onDeleteItem = async (item: DictItemDetail) => {
    await deleteDictItem(item.id);
    message.success('字典项已删除');
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
          <Space>
            <Permission code="system:dict:list" mode="disable">
              <Button size="small" onClick={() => openDetail(record)}>
                详情
              </Button>
            </Permission>
            <Permission code="system:dict:update" mode="disable">
              <Button size="small" onClick={() => onEdit(record)}>
                编辑
              </Button>
            </Permission>
            <Permission code="system:dict:delete" mode="disable">
              <Button size="small" danger onClick={() => onDelete(record)}>
                删除
              </Button>
            </Permission>
          </Space>
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
          <Space>
            <Permission code="system:dict:update" mode="disable">
              <Button size="small" onClick={() => openItemModal(record)}>
                编辑
              </Button>
            </Permission>
            <Permission code="system:dict:delete" mode="disable">
              <Button size="small" danger onClick={() => onDeleteItem(record)}>
                删除
              </Button>
            </Permission>
          </Space>
        )
      }
    ],
    [currentDict]
  );

  return (
    <Card title="字典管理">
      <Form layout="inline" form={queryForm} style={{ marginBottom: 16 }}>
        <Form.Item label="关键词" name="keyword">
          <Input placeholder="编码/名称" />
        </Form.Item>
        <Space>
          <Button type="primary" onClick={onSearch}>
            查询
          </Button>
          <Button onClick={onReset}>重置</Button>
        </Space>
      </Form>

      <Space style={{ marginBottom: 16 }}>
        <Permission code="system:dict:create" mode="disable">
          <Button type="primary" onClick={onCreate}>
            新增字典
          </Button>
        </Permission>
      </Space>

      <AppTable
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total,
          onChange: (p, ps) => {
            setPage(p);
            setPageSize(ps);
          }
        }}
      />

      <Modal title={editItem ? '编辑字典' : '新增字典'} open={open} onOk={onSubmit} onCancel={() => setOpen(false)}>
        <Form layout="vertical" form={form}>
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
        </Form>
      </Modal>

      <Drawer
        title={currentDict ? `字典详情 - ${currentDict.name}` : '字典详情'}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={720}
      >
        <Space style={{ marginBottom: 16 }}>
          <Permission code="system:dict:update" mode="disable">
            <Button type="primary" onClick={() => openItemModal()}>
              新增字典项
            </Button>
          </Permission>
        </Space>
        <AppTable rowKey="id" columns={itemColumns} dataSource={dictItems} pagination={false} />
      </Drawer>

      <Modal
        title={currentDictItem ? '编辑字典项' : '新增字典项'}
        open={itemModalOpen}
        onOk={submitItem}
        onCancel={() => setItemModalOpen(false)}
      >
        <Form layout="vertical" form={itemForm}>
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
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item label="状态" name="status" valuePropName="checked" initialValue={true}>
            <Switch checkedChildren="启用" unCheckedChildren="禁用" />
          </Form.Item>
          <Form.Item label="扩展字段 JSON" name="extra">
            <Input.TextArea placeholder='例如 {"color":"red"}' />
          </Form.Item>
        </Form>
      </Modal>
    </Card>
  );
};
