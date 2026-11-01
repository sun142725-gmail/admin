// 封面合成弹窗：底图三选（分镜首帧 / 单镜重出首帧 / 本地上传）+ 标题副标题文字合成。
// canvas 绘制：底图按自然尺寸铺满（补充要求：导出尺寸随底图，不做固定档裁剪），
// 文字布局走 coverTextLayout 纯函数（measureText 与绘制同 ctx 同字体族，折行与渲染同源），
// 白字黑描边；导出超 files/upload 2MB 上限时按 coverExport 档位降质重导（PNG→JPEG/缩档），
// 上传 → PATCH coverUrl 落库。
// 字体栈与 global.css body 一致（纯系统字体，无 webfont 加载时序问题）。
import { useEffect, useMemo, useRef, useState } from 'react';
import Alert from 'antd/es/alert';
import Button from 'antd/es/button';
import Col from 'antd/es/col';
import Form from 'antd/es/form';
import Input from 'antd/es/input';
import InputNumber from 'antd/es/input-number';
import Radio from 'antd/es/radio';
import Row from 'antd/es/row';
import Select from 'antd/es/select';
import Space from 'antd/es/space';
import Switch from 'antd/es/switch';
import Typography from 'antd/es/typography';
import Upload from 'antd/es/upload';
import { UploadOutlined } from '@ant-design/icons';
import { regenerateNovelShot, updateNovelProject, NovelShotVo } from '../../api/novelVideo';
import { uploadFile } from '../../api/files';
import { SelfForm } from '../../components/base/SelfForm';
import { SelfModal } from '../../components/base/SelfModal';
import { computeCoverLayout, type CoverTextPosition } from './coverTextLayout';
import {
  coverExportCandidates,
  MAX_COVER_UPLOAD_BYTES,
  pickCoverExportCandidate,
  type CoverExportMeasured
} from './coverExport';

export interface CoverComposerModalProps {
  open: boolean;
  projectId: number;
  projectName: string;
  shots: NovelShotVo[];
  onCancel: () => void;
  onSaved: (coverUrl: string) => void;
  onError: (error: unknown) => void;
}

interface CoverFormValues {
  title: string;
  subtitle?: string;
  position: CoverTextPosition;
  titleFontSize: number;
  subtitleFontSize: number;
  outline: boolean;
}

// 与 global.css body 字体栈一致：canvas 缺省 10px sans-serif 跨平台中文渲染不一致，
// 显式同源字体族保证折行估算与绘制一致，且纯系统字体无 document.fonts 时序问题。
const CANVAS_FONT_STACK = "-apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif";

export const CoverComposerModal: React.FC<CoverComposerModalProps> = ({
  open,
  projectId,
  projectName,
  shots,
  onCancel,
  onSaved,
  onError
}) => {
  const [form] = Form.useForm<CoverFormValues>();
  const [sourceMode, setSourceMode] = useState<'shot' | 'regenerate' | 'upload'>('shot');
  const [baseImageUrl, setBaseImageUrl] = useState<string | null>(null);
  const [shotId, setShotId] = useState<number | undefined>(undefined);
  const [regenerating, setRegenerating] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [imageReady, setImageReady] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const shotsWithImage = useMemo(() => shots.filter((shot) => Boolean(shot.imageUrl)), [shots]);

  // onError 经 ref 间接调用：调用方常传渲染体内联箭头函数（父页每 5s 轮询重渲染都产生新引用），
  // 若直接进 effect 依赖会让底图加载 effect 反复重跑（重复加载 IO + canvas 清空重绘闪烁）。
  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  // 打开时重置：底图默认第一个有首帧的分镜，标题默认项目名。
  useEffect(() => {
    if (!open) {
      return;
    }
    const firstShot = shots.find((shot) => shot.imageUrl);
    setSourceMode(firstShot ? 'shot' : 'upload');
    setBaseImageUrl(firstShot?.imageUrl ?? null);
    setShotId(firstShot?.id);
    setImageReady(false);
    setNaturalSize(null);
    imageRef.current = null;
    form.resetFields();
    form.setFieldsValue({
      title: projectName,
      subtitle: undefined,
      position: 'bottom',
      titleFontSize: 96,
      subtitleFontSize: 44,
      outline: true
    });
  }, [open, shots, projectName, form]);

  // 底图加载：/uploads 同源（vite 代理），canvas 不 tainted；记录自然尺寸供绘制与导出。
  // 依赖仅 [open, baseImageUrl]：onError 经 ref 取用（见 onErrorRef 注释），
  // 父页轮询重渲染不再触发重复加载与重绘。
  useEffect(() => {
    if (!open || !baseImageUrl) {
      setImageReady(false);
      setNaturalSize(null);
      imageRef.current = null;
      return;
    }
    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      // 仅宽高变化时更新：同尺寸新对象会连带触发绘制 effect 全量重绘（clearRect 闪烁）。
      setNaturalSize((prev) =>
        prev && prev.width === img.naturalWidth && prev.height === img.naturalHeight
          ? prev
          : { width: img.naturalWidth, height: img.naturalHeight }
      );
      setImageReady(true);
    };
    img.onerror = () => {
      imageRef.current = null;
      setImageReady(false);
      onErrorRef.current(new Error('底图加载失败，请换一张或重新上传'));
    };
    img.src = baseImageUrl;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [open, baseImageUrl]);

  // 表单值监听：任一字段变化即重绘。
  const formValues = Form.useWatch([], form);

  // canvas 合成：底图自然尺寸铺满 + 文字布局纯函数输出逐行绘制（白字黑描边）。
  // 依赖底图就绪与表单值；measureText 与绘制同 ctx 同字体族，折行估算与渲染同源。
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!open || !canvas || !img || !imageReady || !naturalSize) {
      return;
    }
    canvas.width = naturalSize.width;
    canvas.height = naturalSize.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, naturalSize.width, naturalSize.height);
    const measureText = (text: string, fontSize: number) => {
      ctx.font = `${fontSize}px ${CANVAS_FONT_STACK}`;
      return ctx.measureText(text).width;
    };
    const lines = computeCoverLayout({
      title: formValues?.title ?? '',
      subtitle: formValues?.subtitle,
      width: canvas.width,
      height: canvas.height,
      position: formValues?.position ?? 'bottom',
      titleFontSize: formValues?.titleFontSize ?? 96,
      subtitleFontSize: formValues?.subtitleFontSize ?? 44,
      measureText
    });
    ctx.textBaseline = 'top';
    for (const line of lines) {
      ctx.font = `${line.fontSize}px ${CANVAS_FONT_STACK}`;
      if (formValues?.outline) {
        ctx.lineWidth = Math.max(2, line.fontSize * 0.08);
        ctx.strokeStyle = 'rgba(0,0,0,0.85)';
        ctx.lineJoin = 'round';
        ctx.strokeText(line.text, line.x, line.y);
      }
      ctx.fillStyle = '#ffffff';
      ctx.fillText(line.text, line.x, line.y);
    }
  }, [open, imageReady, naturalSize, formValues, baseImageUrl]);

  // 单镜重出首帧：同步长任务（timeout 0），完成后以新首帧为底图。
  const regenerateAsBase = async () => {
    if (!shotId) {
      return;
    }
    setRegenerating(true);
    try {
      const updated = await regenerateNovelShot(projectId, shotId, 'image');
      if (updated.imageUrl) {
        setBaseImageUrl(updated.imageUrl);
      }
    } catch (error) {
      onError(error);
    } finally {
      setRegenerating(false);
    }
  };

  /**
   * 按档位序列导出封面 blob：PNG 原尺寸优先；超 files/upload 2MB 上限时依次降质
   * （JPEG 质量档 → 缩档重绘 × 质量档），找到首个不超限的档即用，全超限兜底最小档。
   * 选档决策在 coverExport 纯函数（有单测），这里只做 canvas 渲染 IO。
   */
  const exportCoverBlob = async (canvas: HTMLCanvasElement): Promise<{ blob: Blob; ext: 'png' | 'jpg' }> => {
    const measured: Array<CoverExportMeasured & { blob: Blob }> = [];
    for (const candidate of coverExportCandidates()) {
      let target: HTMLCanvasElement = canvas;
      if (candidate.scale < 1) {
        const scaled = document.createElement('canvas');
        scaled.width = Math.max(1, Math.round(canvas.width * candidate.scale));
        scaled.height = Math.max(1, Math.round(canvas.height * candidate.scale));
        const scaledCtx = scaled.getContext('2d');
        if (!scaledCtx) {
          continue;
        }
        scaledCtx.drawImage(canvas, 0, 0, scaled.width, scaled.height);
        target = scaled;
      }
      const type = candidate.quality === null ? 'image/png' : 'image/jpeg';
      const blob = await new Promise<Blob | null>((resolve) =>
        target.toBlob(resolve, type, candidate.quality ?? undefined)
      );
      if (!blob) {
        continue;
      }
      measured.push({ candidate, bytes: blob.size, blob });
      if (blob.size <= MAX_COVER_UPLOAD_BYTES) {
        break; // 首个不超限档即用，与 pickCoverExportCandidate 的 find 语义一致
      }
    }
    const chosen = pickCoverExportCandidate(measured);
    if (!chosen) {
      throw new Error('封面导出失败');
    }
    return { blob: chosen.blob, ext: chosen.candidate.quality === null ? 'png' : 'jpg' };
  };

  // 导出（超上传上限自动降质重导）→ 上传 → PATCH coverUrl。
  const submit = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !imageReady || !naturalSize) {
      onError(new Error('请先选择或上传底图'));
      return;
    }
    await form.validateFields();
    setExporting(true);
    try {
      const { blob, ext } = await exportCoverBlob(canvas);
      const file = new File([blob], `cover-${projectId}-${Date.now()}.${ext}`, {
        type: ext === 'png' ? 'image/png' : 'image/jpeg'
      });
      const uploaded = await uploadFile(file);
      await updateNovelProject(projectId, { coverUrl: uploaded.url });
      onSaved(uploaded.url);
    } catch (error) {
      onError(error);
    } finally {
      setExporting(false);
    }
  };

  return (
    <SelfModal
      title="生成封面"
      open={open}
      onCancel={onCancel}
      onOk={() => void submit()}
      okText="合成并保存封面"
      confirmLoading={exporting}
      width={720}
      destroyOnHidden
    >
      <div className="mb-3 rounded-lg bg-[var(--app-bg)] p-3">
        <canvas ref={canvasRef} className="mx-auto block max-h-[300px] max-w-full rounded-lg" />
        {!imageReady && (
          <div className="flex h-[200px] items-center justify-center text-xs text-[#bbb]">
            选择底图后在这里预览合成效果
          </div>
        )}
      </div>
      <SelfForm form={form} requiredMark={false}>
        <Form.Item label="底图" required>
          <Radio.Group
            value={sourceMode}
            onChange={(event) => setSourceMode(event.target.value)}
            options={[
              { value: 'shot', label: '分镜首帧', disabled: shotsWithImage.length === 0 },
              { value: 'regenerate', label: '重出首帧' },
              { value: 'upload', label: '本地上传' }
            ]}
          />
        </Form.Item>
        {sourceMode === 'shot' && (
          <Form.Item label="选用分镜">
            <Select
              className="w-full"
              placeholder="选择已出图的分镜"
              value={shotId}
              onChange={(id) => {
                setShotId(id);
                const shot = shots.find((item) => item.id === id);
                if (shot?.imageUrl) {
                  setBaseImageUrl(shot.imageUrl);
                }
              }}
              options={shotsWithImage.map((shot) => ({
                value: shot.id,
                label: `#${shot.idx} ${(shot.narration || shot.motionPrompt || '').slice(0, 24)}`
              }))}
            />
          </Form.Item>
        )}
        {sourceMode === 'regenerate' && (
          <Form.Item label="重出首帧" extra="用生图模型重出该分镜首帧（含角色参考注入），完成后自动作为底图">
            <Space>
              <Select
                className="w-56"
                placeholder="选择分镜"
                value={shotId}
                onChange={(id) => setShotId(id)}
                options={shots.map((shot) => ({
                  value: shot.id,
                  label: `#${shot.idx} ${(shot.narration || shot.motionPrompt || '').slice(0, 24)}`
                }))}
              />
              <Button loading={regenerating} disabled={!shotId} onClick={() => void regenerateAsBase()}>
                重出首帧
              </Button>
            </Space>
          </Form.Item>
        )}
        {sourceMode === 'upload' && (
          <Form.Item label="上传底图" extra="仅支持 jpg/png；上传后作为封面底图">
            <Upload
              accept="image/jpeg,image/png"
              showUploadList={false}
              beforeUpload={(file) => {
                void uploadFile(file)
                  .then((uploaded) => setBaseImageUrl(uploaded.url))
                  .catch(onError);
                return false;
              }}
            >
              <Button icon={<UploadOutlined />}>选择图片</Button>
            </Upload>
          </Form.Item>
        )}
        <Form.Item
          name="title"
          label="标题"
          rules={[{ required: true, message: '请输入标题' }]}
          extra="超宽自动折行，水平居中"
        >
          <Input maxLength={40} placeholder="封面主标题" />
        </Form.Item>
        <Form.Item name="subtitle" label="副标题（可选）">
          <Input maxLength={60} placeholder="如：第一集 · 雪夜独行" />
        </Form.Item>
        <Row gutter={12}>
          <Col span={6}>
            <Form.Item name="titleFontSize" label="标题字号">
              <InputNumber min={24} max={400} className="w-full" />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="subtitleFontSize" label="副标题字号">
              <InputNumber min={12} max={200} className="w-full" />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="position" label="文字位置">
              <Select
                options={[
                  { value: 'bottom', label: '底部' },
                  { value: 'top', label: '顶部' }
                ]}
              />
            </Form.Item>
          </Col>
          <Col span={6}>
            <Form.Item name="outline" label="描边" valuePropName="checked">
              <Switch checkedChildren="开" unCheckedChildren="关" />
            </Form.Item>
          </Col>
        </Row>
      </SelfForm>
      <Alert
        type="info"
        showIcon
        className="text-xs"
        message="合成尺寸取底图自然尺寸，导出超过 2MB 时自动降质（JPEG/缩档）后上传并设为项目封面。"
      />
      <Typography.Paragraph type="secondary" className="!mb-0 mt-2 text-[11px]">
        提示：重出首帧走单镜重生成（含角色参考），不改动分镜的既有产物状态之外的任何配置。
      </Typography.Paragraph>
    </SelfModal>
  );
};
