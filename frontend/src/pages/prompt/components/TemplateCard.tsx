// 模板卡片：纯展示组件（cover/actions/Meta），写操作回调上抛给页面。
// 权限口径与页面一致：无 manage 权限不渲染编辑/删除（antd Card actions 不能放 null 占位，
// 按 canManage 条件拼数组，与 <Permission> 组件同一权限数据源）。
// 2026-10-31：Popconfirm→ConfirmPopconfirm、内联间距/字号→Tailwind（收编进新库）。
import Card from 'antd/es/card';
import Image from 'antd/es/image';
import Space from 'antd/es/space';
import Tag from 'antd/es/tag';
import Typography from 'antd/es/typography';
import { CopyOutlined, DeleteOutlined, EditOutlined, ExportOutlined } from '@ant-design/icons';
import { ConfirmPopconfirm } from '../../../components/business/ConfirmAction';
import { CATEGORY_COLOR, PROMPT_CATEGORIES, PromptLibraryItem } from '../../../api/promptLibrary';

interface TemplateCardProps {
  tpl: PromptLibraryItem;
  canManage: boolean;
  onCopy: (tpl: PromptLibraryItem) => void;
  onEdit: (tpl: PromptLibraryItem) => void;
  onDelete: (tpl: PromptLibraryItem) => void;
}

export const TemplateCard: React.FC<TemplateCardProps> = ({ tpl, canManage, onCopy, onEdit, onDelete }) => (
  <Card
    size="small"
    hoverable
    cover={
      tpl.exampleImageUrl ? (
        <Image
          src={tpl.exampleImageUrl}
          alt={tpl.name}
          className="w-full object-cover max-h-72"
          preview={false}
        />
      ) : (
        <div className="prompt-library-card-placeholder">无示例图</div>
      )
    }
    actions={[
      <CopyOutlined key="copy" onClick={() => onCopy(tpl)} />,
      ...(canManage
        ? [
            <EditOutlined key="edit" onClick={() => onEdit(tpl)} />,
            // 引用保护二段确认：已被流水线引用的模板删除前明示后果（后端无 force 直删 409 兜底）。
            <ConfirmPopconfirm
              key="del"
              title={
                tpl.referenceCount > 0
                  ? `已被流水线引用 ${tpl.referenceCount} 次，删除后相关流水线将回退默认风格`
                  : '确定删除该模板？'
              }
              onConfirm={() => onDelete(tpl)}
            >
              <DeleteOutlined />
            </ConfirmPopconfirm>
          ]
        : [])
    ]}
  >
    <Card.Meta
      title={
        <Space size={4} wrap>
          <span className="text-[13px]">{tpl.name}</span>
          <Tag color={CATEGORY_COLOR[tpl.category] ?? 'default'} className="!mr-0">
            {PROMPT_CATEGORIES.find((c) => c.value === tpl.category)?.label ?? tpl.category}
          </Tag>
        </Space>
      }
      description={
        <>
          <Typography.Paragraph
            ellipsis={{ rows: 3, expandable: true, symbol: '展开全文' }}
            type="secondary"
            className="text-xs !mb-1"
          >
            {tpl.template}
          </Typography.Paragraph>
          <Space size={4} wrap className="mb-0.5">
            {(tpl.source || tpl.sourceModel) && (
              <Typography.Text type="secondary" className="text-[11px]">
                {tpl.source}
                {tpl.sourceModel ? ` · ${tpl.sourceModel}` : ''}
              </Typography.Text>
            )}
            {tpl.sourceUrl && (
              <a href={tpl.sourceUrl} target="_blank" rel="noreferrer" className="text-[11px]">
                查看来源 <ExportOutlined />
              </a>
            )}
          </Space>
          <Space size={4} wrap>
            {tpl.styleTags
              ?.split(',')
              .filter(Boolean)
              .slice(0, 3)
              .map((tag) => (
                <Tag key={tag} className="!text-[11px]">
                  {tag.trim()}
                </Tag>
              ))}
            {/* 口径澄清：仅流水线回调计数（Go 读取即 +1），前端「复制 Prompt」不计数。 */}
            <Typography.Text type="secondary" className="text-[11px]">
              流水线引用 {tpl.referenceCount}
            </Typography.Text>
          </Space>
        </>
      }
    />
  </Card>
);
