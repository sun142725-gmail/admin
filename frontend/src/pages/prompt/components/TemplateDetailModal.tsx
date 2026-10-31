// 模板详情弹窗：示例图大图查看 + 模板正文复制 + 元信息 + 一键生成（文生图/以图换图）+ 设为示例图。
// ⚠️ ImagesPage.tsx（生图页）被并行会话占用禁改：footer「打开生图页」仅做无预填跳转
// （/ai/images 路由不读 location.state），带模板/参考图直达生图的能力以本弹窗内生成为主路径。
// 参考图链路：Upload 仅本地 FileReader 转 data URL（不真实上传）→ generateImages.referenceImages
// → 后端 DTO 校验（4 张上限/MIME 白名单）→ 适配器 images/edits（图生图）。
// 生成结果为 data URL 时隐藏「设为示例图」：exampleImageUrl 列 varchar(500)、DTO @Length(0,500)，
// data URL 必 422；仅 http(s):// 外链与 /uploads/ 本地图可落库。
import { useEffect, useRef, useState } from 'react';
import Button from 'antd/es/button';
import Divider from 'antd/es/divider';
import Empty from 'antd/es/empty';
import Image from 'antd/es/image';
import Input from 'antd/es/input';
import Select from 'antd/es/select';
import Space from 'antd/es/space';
import Tag from 'antd/es/tag';
import Typography from 'antd/es/typography';
import Upload from 'antd/es/upload';
import type { RcFile, UploadChangeParam, UploadFile } from 'antd/es/upload';
import { CopyOutlined, PictureOutlined, UploadOutlined } from '@ant-design/icons';
import { SelfModal } from '../../../components/base/SelfModal';
import { useApiMessage } from '../../../hooks/useApiMessage';
import { generateImages, AiImageRecord } from '../../../api/ai';
import { CATEGORY_COLOR, PROMPT_CATEGORIES, PromptLibraryItem, updatePromptTemplate } from '../../../api/promptLibrary';
import { renderTemplate } from '../promptTemplate';

// 纯函数 re-export：保持「renderTemplate 自组件文件可导入」的 API（实现收拢到 ../promptTemplate，
// 独立纯函数模块不依赖 antd/API 层，vitest node 环境直测无 localStorage 断链）。
export { renderTemplate };

// 与后端 GenerateImageDto @IsIn 及 ImagesPage 完全对齐的四档尺寸。
const SIZE_OPTIONS = [
  { value: '1024x1024', label: '1024×1024 方图' },
  { value: '1792x1024', label: '1792×1024 横图' },
  { value: '1024x1792', label: '1024×1792 竖图' },
  { value: '512x512', label: '512×512 小图' }
];

const REFERENCE_ACCEPT = 'image/png,image/jpeg,image/webp';
const REFERENCE_MAX_COUNT = 4; // 与后端 GenerateImageDto ArrayMaxSize(4) / 适配器 slice(0,4) 对齐
const REFERENCE_MAX_SIZE_MB = 5;
// 可落库为示例图的 URL 形态：http(s) 外链或本地 /uploads/ 路径（data URL 超 varchar(500) 必 422）。
const PERSISTABLE_URL_PATTERN = /^https?:\/\/|^\/uploads\//;

interface TemplateDetailModalProps {
  open: boolean;
  tpl: PromptLibraryItem | null;
  canManage: boolean;
  onClose: () => void;
  /** footer「打开生图页」：无预填跳转 /ai/images（ImagesPage 被并行会话占用禁改，无预填能力）。 */
  onOpenImagesPage: () => void;
  /** 「设为示例图」成功后上抛：页面统一 reloadAll 刷卡片墙（弹窗内大图经 exampleOverride 即时切换）。 */
  onExampleSet: () => void;
}

export const TemplateDetailModal: React.FC<TemplateDetailModalProps> = ({
  open,
  tpl,
  canManage,
  onClose,
  onOpenImagesPage,
  onExampleSet
}) => {
  const [content, setContent] = useState('');
  const [size, setSize] = useState('1024x1024');
  const [refFiles, setRefFiles] = useState<UploadFile[]>([]);
  const [results, setResults] = useState<AiImageRecord[]>([]);
  const [generating, setGenerating] = useState(false);
  // 「设为示例图」独立 pending：防快速连点重复 PATCH（与生成按钮同口径）
  const [examplePendingId, setExamplePendingId] = useState<number | null>(null);
  // 「设为示例图」成功后的本地回显（页面 reload 后列表对象已换新，弹窗持有的 tpl 是旧快照）。
  const [exampleOverride, setExampleOverride] = useState<string | null>(null);
  // uid → data URL 映射（FileReader 异步回填；生成点击时必然已读完，无需 state 触发渲染）。
  const refDataUrlMap = useRef<Record<string, string>>({});
  const msg = useApiMessage();

  // 打开/切换模板即重置生成面板（关闭即弃，与 TemplateEditModal 同口径）。
  useEffect(() => {
    if (!open) {
      return;
    }
    setContent('');
    setSize('1024x1024');
    setRefFiles([]);
    refDataUrlMap.current = {};
    setResults([]);
    setExampleOverride(null);
  }, [open, tpl?.id]);

  if (!tpl) {
    return null;
  }

  const exampleUrl = exampleOverride ?? tpl.exampleImageUrl ?? '';
  const categoryLabel = PROMPT_CATEGORIES.find((c) => c.value === tpl.category)?.label ?? tpl.category;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(tpl.template);
      msg.success('Prompt 已复制');
    } catch {
      msg.warning('复制失败，请手动选择文本');
    }
  };

  // beforeUpload 三态：非法/超限 LIST_IGNORE（不上传不进列表）；合法返回 false 拦自动上传
  // （照 NovelVideoPage 先例），异步 FileReader 转 data URL 存映射，不真实上传。
  const beforeUpload = (file: RcFile): boolean | string => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      msg.warning('参考图仅支持 PNG/JPEG/WebP 格式');
      return Upload.LIST_IGNORE;
    }
    if (file.size > REFERENCE_MAX_SIZE_MB * 1024 * 1024) {
      msg.warning(`单张参考图不能超过 ${REFERENCE_MAX_SIZE_MB}MB`);
      return Upload.LIST_IGNORE;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        refDataUrlMap.current[file.uid] = reader.result;
      }
    };
    reader.readAsDataURL(file);
    return false;
  };

  const handleRefChange = ({ fileList: files }: UploadChangeParam): void => {
    setRefFiles(files);
  };

  // 生成时从映射按当前列表顺序收集（未读完项被过滤）；无参考图返回 undefined 走文生图通道。
  const collectReferenceImages = (): string[] | undefined => {
    const urls = refFiles
      .map((f) => refDataUrlMap.current[f.uid])
      .filter((value): value is string => Boolean(value));
    return urls.length > 0 ? urls : undefined;
  };

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const result = await generateImages({
        prompt: renderTemplate(tpl.template, content),
        size,
        referenceImages: collectReferenceImages()
      });
      setResults(result.images);
      msg.success(`已生成 ${result.images.length} 张图片`);
    } catch (error) {
      // 上游失败文案经 image.service 透出（如中转站不支持 /images/edits 的报错）在此展示。
      msg.errorFrom(error, '生成失败');
    } finally {
      setGenerating(false);
    }
  };

  const handleSetExample = async (itemId: number, url: string) => {
    setExamplePendingId(itemId);
    try {
      await updatePromptTemplate(tpl.id, { exampleImageUrl: url });
      setExampleOverride(url);
      msg.success('已设为示例图');
      onExampleSet();
    } catch (error) {
      msg.errorFrom(error, '设置失败');
    } finally {
      setExamplePendingId(null);
    }
  };

  return (
    <SelfModal
      title={`模板详情 · ${tpl.name}`}
      open={open}
      onCancel={onClose}
      width={900}
      footer={[
        <Button key="images" icon={<PictureOutlined />} onClick={onOpenImagesPage}>
          打开生图页
        </Button>,
        <Button key="close" type="primary" onClick={onClose}>
          关闭
        </Button>
      ]}
    >
      <div className="max-h-[68vh] overflow-y-auto pr-1">
        {/* 示例图大图：点击可开 antd 预览（preview 默认 true，卡片墙是 preview=false 缩略） */}
        {exampleUrl ? (
          <div className="flex justify-center rounded bg-black/5 p-2 dark:bg-white/10">
            <Image src={exampleUrl} alt={tpl.name} className="max-h-[360px] w-auto rounded" />
          </div>
        ) : (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无示例图，生成后可一键设为示例图" />
        )}

        <Divider className="!my-4" />
        <div className="mb-1 flex items-center justify-between">
          <Typography.Text strong>模板正文</Typography.Text>
          <Button size="small" icon={<CopyOutlined />} onClick={() => void handleCopy()}>
            复制 Prompt
          </Button>
        </div>
        <pre className="rounded bg-black/5 p-3 font-mono text-xs whitespace-pre-wrap break-all dark:bg-white/10">
          {tpl.template}
        </pre>

        <Space size={4} wrap className="mt-2">
          <Tag color={CATEGORY_COLOR[tpl.category] ?? 'default'}>{categoryLabel}</Tag>
          {tpl.styleTags
            ?.split(',')
            .filter(Boolean)
            .map((tag) => (
              <Tag key={tag}>{tag.trim()}</Tag>
            ))}
        </Space>
        <div className="mt-1">
          <Typography.Text type="secondary" className="text-[11px]">
            {tpl.source || tpl.sourceModel ? `${tpl.source ?? ''}${tpl.sourceModel ? ` · ${tpl.sourceModel}` : ''} · ` : ''}
            流水线引用 {tpl.referenceCount} 次
          </Typography.Text>
        </div>

        <Divider className="!my-4" />
        <Typography.Text strong>用此模板生成图片</Typography.Text>
        <Input.TextArea
          rows={2}
          className="mt-2"
          maxLength={2000}
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder='填充 {{content}} 占位；留空则按模板原文生成'
        />
        <Space wrap className="mt-2">
          <Select options={SIZE_OPTIONS} value={size} onChange={setSize} className="w-[150px]" />
          <Upload
            accept={REFERENCE_ACCEPT}
            maxCount={REFERENCE_MAX_COUNT}
            multiple
            fileList={refFiles}
            beforeUpload={beforeUpload}
            onChange={handleRefChange}
            onRemove={(file) => {
              delete refDataUrlMap.current[file.uid];
              return true;
            }}
          >
            <Button icon={<UploadOutlined />}>参考图（以图换图，{refFiles.length}/{REFERENCE_MAX_COUNT}）</Button>
          </Upload>
          <Button type="primary" icon={<PictureOutlined />} loading={generating} onClick={() => void handleGenerate()}>
            生成图片
          </Button>
        </Space>
        <Typography.Text type="secondary" className="!text-[11px] block mt-1">
          参考图仅本地转 base64 随请求上传，最多 {REFERENCE_MAX_COUNT} 张、单张 ≤{REFERENCE_MAX_SIZE_MB}MB，PNG/JPEG/WebP
        </Typography.Text>

        {results.length > 0 && (
          <Image.PreviewGroup>
            <div className="mt-3 flex flex-wrap gap-3">
              {results.map((item) => (
                <div key={item.id} className="w-[150px]">
                  <Image src={item.url} alt={`生成结果 ${item.id}`} width={150} className="rounded" />
                  {canManage && PERSISTABLE_URL_PATTERN.test(item.url) && (
                    <Button
                      block
                      size="small"
                      className="mt-1"
                      loading={examplePendingId === item.id}
                      disabled={examplePendingId !== null && examplePendingId !== item.id}
                      onClick={() => void handleSetExample(item.id, item.url)}
                    >
                      设为示例图
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </Image.PreviewGroup>
        )}
      </div>
    </SelfModal>
  );
};
