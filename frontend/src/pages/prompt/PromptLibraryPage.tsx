// 图片提示词库页（布局壳）：卡片墙 + 筛选栏 + 分页 + 编辑/同步弹窗组合。
// 状态机收拢在 usePromptLibrary hook，卡片/编辑弹窗/同步弹窗在 components/ 下——
// 本文件只做布局与回调接线（2026-10 组件化重构，原 475 行单文件拆分）。
// 图文流水线按 category 引用模板，模板正文中 {{content}} 会被场景文本替换。
// 权限口径：查看 flow:prompt:view，写操作（新建/编辑/删除/批量同步）flow:prompt:manage，
// 与后端统一控制器 /prompt-library、菜单(/prompts) 同码。
// 2026-10-31：Card title+extra 骨架收编为 PageHeader（components/README.md 点名收编写法）。
import { useState } from 'react';
import Button from 'antd/es/button';
import Empty from 'antd/es/empty';
import Input from 'antd/es/input';
import Pagination from 'antd/es/pagination';
import Select from 'antd/es/select';
import Space from 'antd/es/space';
import Typography from 'antd/es/typography';
import { PlusOutlined, ReloadOutlined, SyncOutlined } from '@ant-design/icons';
import { Permission } from '../../components/permission/Permission';
import { PageHeader } from '../../components/business/PageHeader';
import { useApiMessage } from '../../hooks/useApiMessage';
import { useAppSelector } from '../../store/hooks';
import { PromptLibraryItem, deletePromptTemplate } from '../../api/promptLibrary';
import { usePromptLibrary } from './usePromptLibrary';
import { TemplateCard } from './components/TemplateCard';
import { TemplateEditModal } from './components/TemplateEditModal';
import { TemplateSyncModal } from './components/TemplateSyncModal';
import '../flow/flow-pages.css';

export const PromptLibraryPage: React.FC = () => {
  const lib = usePromptLibrary();
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<PromptLibraryItem | null>(null);
  const [syncOpen, setSyncOpen] = useState(false);
  // 写权限（新建/编辑/删除/同步）：与 Permission 组件同一数据源（profile.permissions）。
  const canManage = useAppSelector((state) =>
    (state.auth.profile?.permissions ?? []).includes('flow:prompt:manage')
  );
  const msg = useApiMessage();

  const openCreate = () => {
    setEditing(null);
    setEditOpen(true);
  };

  const openEdit = (tpl: PromptLibraryItem) => {
    setEditing(tpl);
    setEditOpen(true);
  };

  const handleDelete = async (tpl: PromptLibraryItem) => {
    try {
      // 卡片 Popconfirm 对引用>0 已弹警示，确认即带 force=true 二段删除；
      // 若引用数在渲染后变化（竞态），后端 409 兜底在此转为错误提示。
      await deletePromptTemplate(tpl.id, tpl.referenceCount > 0 || undefined);
      msg.success('已删除');
      await lib.reloadAll();
    } catch (error) {
      msg.errorFrom(error, '删除失败');
    }
  };

  const handleCopy = async (tpl: PromptLibraryItem) => {
    try {
      await navigator.clipboard.writeText(tpl.template);
      msg.success('Prompt 已复制');
    } catch {
      msg.warning('复制失败，请手动选择文本');
    }
  };

  return (
    <div>
      <PageHeader
        title="图片提示词库"
        actions={
          <Space wrap>
            <Select
              allowClear
              placeholder="全部类型"
              className="w-[130px]"
              options={lib.categoryOptions}
              value={lib.query.category}
              onChange={lib.changeCategory}
            />
            <Select
              allowClear
              showSearch
              placeholder="来源工具"
              className="w-[130px]"
              options={lib.sourceToolOptions}
              value={lib.query.sourceTool}
              onChange={lib.changeSourceTool}
            />
            <Input.Search
              placeholder="搜索名称/正文/标签"
              style={{ width: 200 }}
              onSearch={lib.searchKeyword}
              allowClear
            />
            <Button icon={<ReloadOutlined />} onClick={() => void lib.reloadAll()} loading={lib.loading} />
            <Permission code="flow:prompt:manage">
              <Button icon={<SyncOutlined />} onClick={() => setSyncOpen(true)}>
                批量同步
              </Button>
            </Permission>
            <Permission code="flow:prompt:manage">
              <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
                新建模板
              </Button>
            </Permission>
          </Space>
        }
      />

      <div className="prompt-library-stats">
        <Typography.Text type="secondary" className="text-xs">
          已收录 {lib.stats ? lib.stats.total : '—'} 条 / 当前展示 {lib.total} 条
        </Typography.Text>
      </div>

      {lib.items.length === 0 && !lib.loading ? (
        <Empty description="还没有提示词，点击右上角新建或批量同步导入" />
      ) : (
        <>
          <div className="prompt-library-grid">
            {lib.items.map((tpl) => (
              <TemplateCard
                key={tpl.id}
                tpl={tpl}
                canManage={canManage}
                onCopy={(target) => void handleCopy(target)}
                onEdit={openEdit}
                onDelete={(target) => void handleDelete(target)}
              />
            ))}
          </div>
          <div className="prompt-library-pagination">
            <Pagination
              current={lib.query.page}
              pageSize={lib.query.pageSize}
              total={lib.total}
              showSizeChanger
              pageSizeOptions={[12, 20, 40, 60]}
              showTotal={(count) => `共 ${count} 条`}
              onChange={lib.changePage}
            />
          </div>
        </>
      )}

      <TemplateEditModal
        open={editOpen}
        editing={editing}
        categoryOptions={lib.categoryOptions}
        onCancel={() => setEditOpen(false)}
        onSaved={() => {
          setEditOpen(false);
          void lib.reloadAll();
        }}
      />
      <TemplateSyncModal
        open={syncOpen}
        onCancel={() => setSyncOpen(false)}
        onSynced={() => {
          setSyncOpen(false);
          void lib.reloadFromFirstPage();
        }}
      />
    </div>
  );
};
