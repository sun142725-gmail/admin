// AI 生图画布页：生成结果作为图片节点铺在无限画布上，选中任意图片节点「以此图续画」
// （自动转 data URL 作 referenceImages 走图生图通道，新节点邻接摆放形成生成谱系），
// 提示词模板/便签可贴图旁；整块画布 1.5s 防抖自动保存、进入原样恢复。
// 节点 data 序列化契约与组件复用说明见 components/canvas/README.md。
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Card, Input, Select, Space, Tag, Typography } from 'antd';
import { PictureOutlined, PlusOutlined } from '@ant-design/icons';
import type { Node, NodeTypes, OnMoveEnd, ReactFlowInstance, Viewport } from '@xyflow/react';
import { useNodesState } from '@xyflow/react';
import { InfiniteCanvas } from '../../components/canvas/InfiniteCanvas';
import { ImageNode, type ImageNodeData } from '../../components/canvas/nodes/ImageNode';
import { NoteNode, NOTE_COLORS, type NoteNodeData } from '../../components/canvas/nodes/NoteNode';
import {
  DEFAULT_NODE_SIZE,
  type CanvasBox,
  type CanvasSnapshot,
  buildCanvasSnapshot,
  deserializeNodeData,
  imageSizeToNode,
  nextNodePosition,
  parseCanvasSnapshot
} from '../../components/canvas/canvas.helpers';
import { PageHeader } from '../../components/business/PageHeader';
import { useApiMessage } from '../../hooks/useApiMessage';
import { generateImages, loadCanvas, saveCanvas, saveCanvasKeepalive } from '../../api/ai';
import {
  AUTOSAVE_RETRY_MS,
  RESTORE_RETRY_MS,
  VIEWPORT_SETTLE_MS,
  autosaveGate,
  isSnapshotTooLargeError,
  mergeRestoredNodes
} from '../../components/canvas/canvasAutosave';
import { listPromptImages, type PromptLibraryItem } from '../../api/promptLibrary';
import { renderTemplate } from '../prompt/promptTemplate';

/** 画布节点联合类型：image（生成图）+ note（便签）。 */
type CanvasNode = Node<ImageNodeData, 'image'> | Node<NoteNodeData, 'note'>;

// 节点类型注册表：模块级常量（每渲染新建引用会让 React Flow 重建节点渲染树）。
// NodeProps 泛型收窄与 NodeTypes 宽接口的逆变差异在此收口（React Flow 官方注册表为运行时映射）。
const nodeTypes = {
  image: ImageNode,
  note: NoteNode
} as NodeTypes;

const genNodeId = (type: string) => `${type}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** 生成尺寸枚举：与后端 GenerateImageDto.size（image.dto.ts @IsIn 四值）和 ImagesPage 文案同口径。 */
const SIZE_OPTIONS = [
  { value: '1024x1024', label: '1024×1024 方图' },
  { value: '1792x1024', label: '1792×1024 横图' },
  { value: '1024x1792', label: '1024×1792 竖图' },
  { value: '512x512', label: '512×512 小图' }
];

/** 提示词硬上限：后端 GenerateImageDto.prompt @MaxLength(2000)（越界 422），前端预检同口径。 */
const PROMPT_MAX_LENGTH = 2000;

/** 自动保存防抖间隔（ms）。 */
const AUTOSAVE_DEBOUNCE_MS = 1500;

/** 同源 /uploads 短路径 → data URL（后端 referenceImages 白名单只收 data:image/*;base64，
 *  jpg 落盘 blob.type=image/jpeg 命中白名单；画布节点只有短路径，转码后才能续画）。 */
const fetchAsDataUrl = async (url: string): Promise<string> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`参考图读取失败（HTTP ${response.status}）`);
  }
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('参考图编码失败'));
    reader.readAsDataURL(blob);
  });
};

export const CanvasPage: React.FC = () => {
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode>([]);
  const [templates, setTemplates] = useState<PromptLibraryItem[]>([]);
  const [templateId, setTemplateId] = useState<number>();
  const [content, setContent] = useState('');
  const [size, setSize] = useState<string>('1024x1024');
  const [generating, setGenerating] = useState(false);
  // 续画来源节点 id：footer「以此图续画」设置；面板 Tag 可取消。空 = 普通文生图。
  const [repaintSourceId, setRepaintSourceId] = useState<string>();
  // 视口变更触发自动保存的计数器（onMoveEnd 才更新，拖拽平移结束不刷屏）。
  const [viewportTick, setViewportTick] = useState(0);
  const msg = useApiMessage();

  const wrapperRef = useRef<HTMLDivElement>(null);
  const instanceRef = useRef<ReactFlowInstance<CanvasNode>>();
  // 恢复视口与画布实例就绪存在竞态：任一方晚到都由另一方补恢复。
  const pendingViewportRef = useRef<Viewport>();
  const viewportRef = useRef<Viewport>({ x: 0, y: 0, zoom: 1 });
  // 恢复写入期间跳过一次自动保存（避免「进入页面即回写」的无意义请求）；
  // 恢复发生合并（首屏节点并入）时置 false，让合并后的快照正常落库。
  const skipSaveOnceRef = useRef(true);
  // 实时 nodes 镜像：恢复合并判定需在 restore 异步回调里读最新 nodes（effect 闭包是挂载时旧值）。
  const nodesRef = useRef<CanvasNode[]>([]);
  // 待保存快照（最新未落库内容）：防抖窗口内即登记，供失败延时重试与卸载/切页 flush 随时取用。
  const pendingSnapshotRef = useRef<CanvasSnapshot>();
  // 保存失败延时重试 timer：跨 effect 生命周期（失败 promise 的回调可能晚于下一次 effect 运行）。
  const saveRetryTimerRef = useRef<ReturnType<typeof setTimeout>>();
  // 恢复请求在途（GET 未返回，含失败后的重试窗口）：期间变更不登记快照——否则「空画布+新节点」
  // 经防抖 PUT 无条件覆盖服务器快照（后端 upsert 幂等覆盖），若覆盖后重试 GET / 慢 GET 才被
  // 处理，旧画布内容在 UI 与服务器同时丢失且不再触发回写。恢复完成后由 merge 结果决定是否
  // 补一次完整保存（restoreTick 驱动），代价仅是首屏变更落库延迟 1-2 秒。
  const restoreInFlightRef = useRef(true);
  // 恢复出口信号：成功 / 服务器从未保存 / 最终失败各出口 +1，驱动自动保存 effect 重新裁决一次
  // （「从未保存」出口无 setNodes，在途窗口变更的落库全靠它补触发）。
  const [restoreTick, setRestoreTick] = useState(0);
  // 恢复失败短路：loadCanvas 失败期间禁用自动保存——此时服务器完整快照前端不可见，
  // 任何整体 PUT（空画布+新节点）都会把它无条件覆盖（后端 upsert 幂等覆盖）。
  const restoreFailedRef = useRef(false);
  // 恢复视口 settle 窗口起点：程序化 setViewport 会派发 onMoveEnd，窗口内 tick 属幂等回写。
  const restoreCompletedAtRef = useRef(0);
  // 422 超限提示一次性标记：连续超限时避免重复刷屏，成功保存后重置。
  const snapshotTooLargeNotifiedRef = useRef(false);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);

  // —— 节点操作（setNodes 回调式，引用稳定，供恢复注入的闭包长期持有） ——
  const removeNodeById = useCallback(
    (id: string) => {
      setNodes((nds) => nds.filter((node) => node.id !== id));
    },
    [setNodes]
  );

  const updateNoteText = useCallback(
    (id: string, text: string) => {
      setNodes((nds) =>
        nds.map((node) => (node.id === id ? ({ ...node, data: { ...node.data, text } } as CanvasNode) : node))
      );
    },
    [setNodes]
  );

  const repaintFooter = useCallback(
    (id: string) => (
      <Button size="small" block onClick={() => setRepaintSourceId(id)}>
        以此图续画
      </Button>
    ),
    []
  );

  // —— 恢复：loadCanvas → parseCanvasSnapshot → 按 type 重建注入运行时回调 ——
  // 在途窗口（GET 未返回，含失败重试）置 restoreInFlightRef 短路自动保存：在途「空画布+新节点」
  // 的防抖 PUT 会抢先覆盖服务器快照，慢 GET / 重试 GET 再读到被覆盖快照即全量丢失。
  // 失败自动重试一次（网络抖动自愈）；重试仍失败置 restoreFailedRef 短路自动保存并提示：
  // 此时服务器完整快照在前端不可见，继续自动保存会用「空画布+新节点」整体 PUT 覆盖它
  // （后端 upsert 无条件覆盖，旧画布永久丢失）。出路 = 稍后刷新页面重试恢复（成功即自动解除短路）。
  useEffect(() => {
    let cancelled = false;
    let restoreRetryTimer: ReturnType<typeof setTimeout> | undefined;

    const restore = async (isRetry = false): Promise<void> => {
      restoreInFlightRef.current = true;
      try {
        const vo = await loadCanvas();
        if (cancelled) {
          return;
        }
        const parsed = parseCanvasSnapshot(vo.snapshot);
        if (!parsed) {
          skipSaveOnceRef.current = false; // 服务器从未保存过：空画布正常自动保存
          restoreInFlightRef.current = false;
          // 无 setNodes 触发：在途窗口内的首屏变更由 restoreTick 驱动 effect 补保存。
          setRestoreTick((tick) => tick + 1);
          return;
        }
        const restored = parsed.nodes.flatMap<CanvasNode>((sn) => {
          const data = deserializeNodeData(sn.type, sn.data);
          if (!data) {
            return [];
          }
          if (sn.type === 'image') {
            // 双保险：快照层已丢弃无 url 残留，这里再拦手工改库等异常来源。
            const url = data.url;
            if (typeof url !== 'string' || url.length === 0) {
              return [];
            }
            const imageData = { ...data } as ImageNodeData;
            imageData.onDelete = () => removeNodeById(sn.id);
            imageData.footer = repaintFooter(sn.id);
            return [{ id: sn.id, type: 'image', position: sn.position, data: imageData } as CanvasNode];
          }
          if (sn.type === 'note') {
            const noteData = { ...data } as NoteNodeData;
            noteData.onChange = (text) => updateNoteText(sn.id, text);
            noteData.onDelete = () => removeNodeById(sn.id);
            return [{ id: sn.id, type: 'note', position: sn.position, data: noteData } as CanvasNode];
          }
          return [];
        });
        // 快速连续变更竞态：GET 返回前用户可能已添加节点（首屏窗口）。函数式合并替代整体
        // 替换（restored 在前、按 id 去重），晚到的服务器快照不再覆盖首屏节点。
        // skipSaveOnceRef 按「是否发生合并」决定：完全替换跳过一次幂等回写；发生合并则让
        // setNodes 正常触发自动保存（merged 快照需要落库）。判定用 nodesRef 近似值即可：
        // 与实时 updater 的毫秒级窗口误差方向无害（多一次幂等回写 / 由 flush 兜底）。
        const expected = mergeRestoredNodes(restored, nodesRef.current);
        skipSaveOnceRef.current = !expected.merged;
        setNodes((nds) => mergeRestoredNodes(restored, nds).nodes);
        restoreInFlightRef.current = false;
        restoreFailedRef.current = false;
        restoreCompletedAtRef.current = Date.now();
        // 在途窗口变更（merged=true 时随 setNodes、merged=false 时随本 tick）由 effect 裁决落库。
        setRestoreTick((tick) => tick + 1);
        const viewport = { ...parsed.viewport };
        if (instanceRef.current) {
          void instanceRef.current.setViewport(viewport);
        } else {
          pendingViewportRef.current = viewport;
        }
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (!isRetry) {
          restoreRetryTimer = setTimeout(() => {
            void restore(true);
          }, RESTORE_RETRY_MS);
          return;
        }
        restoreInFlightRef.current = false;
        restoreFailedRef.current = true;
        setRestoreTick((tick) => tick + 1);
        msg.errorFrom(error, '画布恢复失败，自动保存已暂停以免覆盖服务器画布，请稍后刷新页面重试');
      }
    };
    void restore();
    return () => {
      cancelled = true;
      if (restoreRetryTimer !== undefined) {
        clearTimeout(restoreRetryTimer);
      }
    };
    // 仅首挂载恢复一次；依赖闭包均为引用稳定回调。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // —— 保存执行：成功清待保存快照；422 超限提示一次并放弃（重试必然再 422）；
  // 网络类失败保留待保存快照（卸载 flush 兜底）并延时重试一次最新快照 ——
  // 此前失败纯静默：失败后若用户不再变更（含切页），待保存内容再无落库机会 = 数据丢失。
  const persistSnapshot = useCallback(
    async (snapshot: CanvasSnapshot, allowRetry = true): Promise<void> => {
      try {
        await saveCanvas(snapshot);
        if (pendingSnapshotRef.current === snapshot) {
          pendingSnapshotRef.current = undefined;
        }
        snapshotTooLargeNotifiedRef.current = false;
      } catch (error) {
        if (isSnapshotTooLargeError(error)) {
          if (pendingSnapshotRef.current === snapshot) {
            pendingSnapshotRef.current = undefined;
          }
          if (!snapshotTooLargeNotifiedRef.current) {
            snapshotTooLargeNotifiedRef.current = true;
            msg.error('画布快照超过 2MB 上限，自动保存失败；请删除部分图片/便签后再编辑');
          }
          return;
        }
        if (allowRetry && pendingSnapshotRef.current) {
          saveRetryTimerRef.current = setTimeout(() => {
            saveRetryTimerRef.current = undefined;
            const latest = pendingSnapshotRef.current;
            // 重试取最新待保存快照（期间的新变更优先），不再叠加重试：失败等下一次变更或卸载 flush。
            if (latest) {
              void persistSnapshot(latest, false);
            }
          }, AUTOSAVE_RETRY_MS);
        }
      }
    },
    [msg]
  );

  // —— 自动保存：nodes 变化 / 视口移动 / 恢复出口（restoreTick）后防抖落库 ——
  useEffect(() => {
    // 短路裁决（决策矩阵见 canvasAutosave.autosaveGate）：恢复在途不登记（恢复完成后由
    // merge 结果决定是否补一次完整保存）；skip 幂等回写抑制；恢复失败禁止整体 PUT。
    const gate = autosaveGate({
      restoreInFlight: restoreInFlightRef.current,
      skipSaveOnce: skipSaveOnceRef.current,
      restoreFailed: restoreFailedRef.current
    });
    if (gate.consumeSkip) {
      skipSaveOnceRef.current = false;
    }
    if (!gate.save) {
      return;
    }
    // 防抖窗口内即登记待保存快照：任意时刻切页/刷新/失败重试都拿得到最新待落库内容。
    const snapshot = buildCanvasSnapshot(nodes, viewportRef.current);
    pendingSnapshotRef.current = snapshot;
    const timer = setTimeout(() => void persistSnapshot(snapshot), AUTOSAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [nodes, viewportTick, restoreTick, persistSnapshot]);

  // 卸载清重试 timer（防抖 timer 由自动保存 effect 的 cleanup 清理）。
  useEffect(
    () => () => {
      if (saveRetryTimerRef.current !== undefined) {
        clearTimeout(saveRetryTimerRef.current);
      }
    },
    []
  );

  // —— 卸载/切页 flush：SPA 路由切页同样卸载本组件（防抖 timer 被 cleanup 丢弃），
  // 刷新/关标签页则触发 pagehide/visibilitychange(hidden)。三个时机都把待保存快照用
  // fetch keepalive 同步补发（axios 无 keepalive，卸载期普通 XHR/fetch 会被浏览器取消；
  // keepalive 请求一旦发出即由浏览器保证尽力投递，不受组件卸载影响）。
  useEffect(() => {
    const flushPendingSnapshot = () => {
      const snapshot = pendingSnapshotRef.current;
      if (!snapshot) {
        return;
      }
      // 取走即互斥：刷新/关标签页时 visibilitychange(hidden) 与 pagehide 先后触发只发一次；
      // SPA 卸载兜底同理（三时机共用）。超 keepalive 预算被放弃时同样视为已消费（发不出去）。
      pendingSnapshotRef.current = undefined;
      saveCanvasKeepalive(snapshot);
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flushPendingSnapshot();
      }
    };
    window.addEventListener('pagehide', flushPendingSnapshot);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flushPendingSnapshot);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      // SPA 路由切页不触发 pagehide：组件卸载时同步 flush 兜底。
      flushPendingSnapshot();
    };
  }, []);

  // —— 提示词模板列表（一次性拉取；失败不阻塞画布，下拉空态可见） ——
  // 跨模块权限依赖：本请求走 GET /prompt-library（prompt-library.controller，需 flow:prompt:view），
  // 而画布页面自身权限是 ai:canvas:view（seed.service 权限/菜单矩阵）。仅有画布权限的角色
  // 该请求 403，被下方 catch 静默降级为下拉空态——手输提示词生成不受影响；
  // 给角色配置画布权限时建议搭配授 flow:prompt:view 以启用模板下拉。
  useEffect(() => {
    let cancelled = false;
    listPromptImages({ page: 1, pageSize: 100 })
      .then((result) => {
        if (!cancelled) {
          setTemplates(result.items);
        }
      })
      .catch(() => {
        // 模板加载失败仅表现为下拉空态，画布手输提示词不受影响。
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleInit = useCallback((instance: ReactFlowInstance<CanvasNode>) => {
    instanceRef.current = instance;
    const pending = pendingViewportRef.current;
    if (pending) {
      pendingViewportRef.current = undefined;
      void instance.setViewport({ ...pending });
    }
  }, []);

  const handleMoveEnd: OnMoveEnd = useCallback((_event, viewport) => {
    viewportRef.current = { ...viewport };
    // 程序化 setViewport（恢复视口，含 handleInit 补恢复）经 d3 transform 同样派发 moveEnd：
    // 恢复完成 VIEWPORT_SETTLE_MS 内的 tick 属幂等回写，忽略（视口值已实时进 viewportRef，
    // 内容不丢；窗口内完成一次手动拖拽手势实际不可能，即便发生也由下一次变更/flush 带上视口）。
    if (Date.now() - restoreCompletedAtRef.current < VIEWPORT_SETTLE_MS) {
      return;
    }
    setViewportTick((tick) => tick + 1);
  }, []);

  /** 当前视口中心对应的画布坐标（新节点视觉居中落点）。 */
  const viewCenter = useCallback((): { x: number; y: number } => {
    const rect = wrapperRef.current?.getBoundingClientRect();
    const instance = instanceRef.current;
    if (!rect || !instance) {
      return { x: 0, y: 0 };
    }
    return instance.screenToFlowPosition({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 });
  }, []);

  /** 节点几何盒（用于空位探测）；note/缺尺寸节点由 nextNodePosition 兜底。 */
  const nodeBox = useCallback((node: CanvasNode): CanvasBox => {
    const data = node.data as ImageNodeData;
    return {
      position: node.position,
      width: typeof data.width === 'number' && data.width > 0 ? data.width : undefined,
      height: typeof data.height === 'number' && data.height > 0 ? data.height : undefined
    };
  }, []);

  const repaintSource = repaintSourceId
    ? nodes.find((node) => node.id === repaintSourceId && node.type === 'image')
    : undefined;

  // —— 生成链：loading 节点占位 → generateImages（续画带参考图）→ 回填 / 失败移除 ——
  const handleGenerate = async () => {
    if (generating) {
      return;
    }
    const template = templates.find((item) => item.id === templateId);
    const finalPrompt = template ? renderTemplate(template.template, content || undefined) : content.trim();
    if (!finalPrompt) {
      msg.warning('请输入提示词或选择模板');
      return;
    }
    if (finalPrompt.length > PROMPT_MAX_LENGTH) {
      msg.error(`合成提示词 ${finalPrompt.length} 字，超过 ${PROMPT_MAX_LENGTH} 字上限，请精简内容或更换模板`);
      return;
    }

    // 续画链：来源图 → data URL；来源已被删除则降级为普通生成。
    const sourceNode = repaintSourceId && repaintSource ? repaintSource : undefined;
    if (repaintSourceId && !sourceNode) {
      msg.warning('续画来源图片已被删除，已切回普通生成');
      setRepaintSourceId(undefined);
    }
    const referenceImages: string[] = [];
    if (sourceNode) {
      try {
        referenceImages.push(await fetchAsDataUrl((sourceNode.data as ImageNodeData).url));
      } catch (error) {
        msg.errorFrom(error, '参考图读取失败，已终止续画');
        return;
      }
    }

    const [sizeWidth, sizeHeight] = size.split('x').map(Number);
    const seedSize = imageSizeToNode(sizeWidth, sizeHeight) ?? { width: 240, height: 240 };
    // 落点：普通生成取视口中心；续画取来源节点右下邻接位（首候选即邻接，被占自动步进）。
    const center = sourceNode
      ? {
          x:
            sourceNode.position.x +
            ((sourceNode.data as ImageNodeData).width ?? DEFAULT_NODE_SIZE.width) +
            seedSize.width / 2 +
            80,
          y:
            sourceNode.position.y +
            ((sourceNode.data as ImageNodeData).height ?? DEFAULT_NODE_SIZE.height) +
            seedSize.height / 2 +
            80
        }
      : viewCenter();
    const nodeId = genNodeId('image');
    const position = nextNodePosition(nodes.map(nodeBox), center, seedSize);

    setNodes((nds) => [
      ...nds,
      {
        id: nodeId,
        type: 'image',
        position,
        data: {
          url: '',
          loading: true,
          width: seedSize.width,
          height: seedSize.height,
          prompt: finalPrompt,
          size,
          onDelete: () => removeNodeById(nodeId),
          footer: repaintFooter(nodeId)
        }
      } as CanvasNode
    ]);
    setGenerating(true);
    try {
      const result = await generateImages({
        prompt: finalPrompt,
        size,
        count: 1,
        referenceImages: referenceImages.length > 0 ? referenceImages : undefined
      });
      const image = result.images[0];
      if (!image?.url) {
        throw new Error('生图服务未返回图片');
      }
      // 尺寸比例来自请求参数（与后端实际生成一致），恢复快照无需再探测图片。
      const dims = imageSizeToNode(sizeWidth, sizeHeight) ?? seedSize;
      setNodes((nds) =>
        nds.map((node) =>
          node.id === nodeId
            ? ({
                ...node,
                data: { ...node.data, url: image.url, loading: false, width: dims.width, height: dims.height }
              } as CanvasNode)
            : node
        )
      );
      msg.success(sourceNode ? '续画完成，已邻接放置' : '已生成 1 张图片');
    } catch (error) {
      // 失败移除占位节点（快照层也不会保存无 url 残留，双保险）。
      removeNodeById(nodeId);
      msg.errorFrom(error, '生图失败，请检查是否已配置 image 能力模型');
    } finally {
      setGenerating(false);
    }
  };

  // —— 添加便签：视口中心空位，颜色按现有便签数轮换 ——
  const handleAddNote = () => {
    const noteSize = { width: 200, height: 120 };
    const position = nextNodePosition(nodes.map(nodeBox), viewCenter(), noteSize);
    const nodeId = genNodeId('note');
    const noteCount = nodes.filter((node) => node.type === 'note').length;
    const color = NOTE_COLORS[noteCount % NOTE_COLORS.length];
    setNodes((nds) => [
      ...nds,
      {
        id: nodeId,
        type: 'note',
        position,
        data: {
          text: '',
          color,
          onChange: (text) => updateNoteText(nodeId, text),
          onDelete: () => removeNodeById(nodeId)
        }
      } as CanvasNode
    ]);
  };

  const selectedTemplate = templates.find((item) => item.id === templateId);

  return (
    // 根节点显式高度：.app-page-panel 只是 min-height 的普通块容器（global.css:380-387），flex 子级
    // 撑不出 React Flow 需要的确定高度，同仓先例 ChatPage.tsx:283 h-[calc(100vh-116px)] 口径。
    // 预算：header 56 + content-inner 上下 padding 48 + page-panel 上下 padding 24 + PageHeader ≈46 → 176。
    <div className="flex flex-col h-[calc(100vh-176px)]">
      <PageHeader
        title="AI 生图画布"
        subtitle="生成结果铺在无限画布上，点「以此图续画」成谱系；画布自动保存，下次进入原样恢复"
      />
      <div
        ref={wrapperRef}
        className="flex-1 min-h-0 overflow-hidden rounded-2xl border border-slate-100 bg-white"
      >
        <InfiniteCanvas
          nodes={nodes}
          onNodesChange={onNodesChange}
          nodeTypes={nodeTypes}
          onInit={handleInit}
          onMoveEnd={handleMoveEnd}
        >
          <Card
            size="small"
            className="w-[360px] shadow-lg"
            styles={{ body: { padding: 12 } }}
            title="生成面板"
          >
            <Space direction="vertical" size={8} className="w-full">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                className="w-full"
                placeholder="提示词模板（可选，来自提示词库）"
                value={templateId}
                onChange={(value) => setTemplateId(value)}
                options={templates.map((item) => ({ value: item.id, label: item.name }))}
                notFoundContent="暂无模板"
              />
              {selectedTemplate ? (
                <Typography.Paragraph
                  type="secondary"
                  className="!mb-0 text-xs"
                  ellipsis={{ rows: 2, tooltip: selectedTemplate.template }}
                >
                  {selectedTemplate.template}
                </Typography.Paragraph>
              ) : null}
              <Input.TextArea
                rows={3}
                maxLength={PROMPT_MAX_LENGTH}
                showCount
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder={
                  selectedTemplate ? '填充 {{content}} 占位；留空则按模板原文生成' : '描述你想要的画面…'
                }
              />
              <div className="flex items-center justify-between gap-2">
                <Select className="w-[150px]" options={SIZE_OPTIONS} value={size} onChange={setSize} />
                <Button
                  type="primary"
                  icon={<PictureOutlined />}
                  loading={generating}
                  onClick={() => void handleGenerate()}
                >
                  {repaintSource ? '续画生成' : '生成'}
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <Button size="small" icon={<PlusOutlined />} onClick={handleAddNote}>
                  添加便签
                </Button>
                {repaintSourceId ? (
                  <Tag
                    closable
                    color="blue"
                    className="!m-0"
                    onClose={() => setRepaintSourceId(undefined)}
                  >
                    续画模式：将参考所选图片
                  </Tag>
                ) : null}
              </div>
            </Space>
          </Card>
        </InfiniteCanvas>
      </div>
    </div>
  );
};
