// 模板卡片：纯展示组件（cover/actions/Meta），写操作回调上抛给页面。
// 权限口径与页面一致：无 manage 权限不渲染编辑/删除（antd Card actions 不能放 null 占位，
// 按 canManage 条件拼数组，与 <Permission> 组件同一权限数据源）。
import { Card, Image, Popconfirm, Space, Tag, Typography } from 'antd';
import { CopyOutlined, DeleteOutlined, EditOutlined, ExportOutlined } from '@ant-design/icons';
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
          style={{ height: 160, objectFit: 'cover' }}
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
            <Popconfirm
              key="del"
              title={
                tpl.referenceCount > 0
                  ? `已被流水线引用 ${tpl.referenceCount} 次，删除后相关流水线将回退默认风格`
                  : '确定删除该模板？'
              }
              onConfirm={() => onDelete(tpl)}
            >
              <DeleteOutlined />
            </Popconfirm>
          ]
        : [])
    ]}
  >
    <Card.Meta
      title={
        <Space size={4} wrap>
          <span style={{ fontSize: 13 }}>{tpl.name}</span>
          <Tag color={CATEGORY_COLOR[tpl.category] ?? 'default'} style={{ marginRight: 0 }}>
            {PROMPT_CATEGORIES.find((c) => c.value === tpl.category)?.label ?? tpl.category}
          </Tag>
        </Space>
      }
      description={
        <>
          <Typography.Paragraph
            ellipsis={{ rows: 3, expandable: true, symbol: '展开全文' }}
            type="secondary"
            style={{ fontSize: 12, marginBottom: 4 }}
          >
            {tpl.template}
          </Typography.Paragraph>
          <Space size={4} wrap style={{ marginBottom: 2 }}>
            {(tpl.source || tpl.sourceModel) && (
              <Typography.Text type="secondary" style={{ fontSize: 11 }}>
                {tpl.source}
                {tpl.sourceModel ? ` · ${tpl.sourceModel}` : ''}
              </Typography.Text>
            )}
            {tpl.sourceUrl && (
              <a href={tpl.sourceUrl} target="_blank" rel="noreferrer" style={{ fontSize: 11 }}>
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
                <Tag key={tag} style={{ fontSize: 11 }}>
                  {tag.trim()}
                </Tag>
              ))}
            {/* 口径澄清：仅流水线回调计数（Go 读取即 +1），前端「复制 Prompt」不计数。 */}
            <Typography.Text type="secondary" style={{ fontSize: 11 }}>
              流水线引用 {tpl.referenceCount}
            </Typography.Text>
          </Space>
        </>
      }
    />
  </Card>
);
