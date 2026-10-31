// 无限画布纯函数 helpers：不碰 DOM/网络，node 环境可直测（vitest 口径，与 MediaPreview 同范式）。
// 覆盖四块：空位探测（nextNodePosition）、图片尺寸换算（imageSizeToNode）、
// 节点 data 序列化白名单（serializeNodeData/deserializeNodeData）、快照构建/解析
// （buildCanvasSnapshot/parseCanvasSnapshot）。data 序列化契约详见同目录 README.md。

/** 节点几何盒：position 必有；width/height 缺省时由探测函数用 DEFAULT_NODE_SIZE 兜底。 */
export interface CanvasBox {
  position: { x: number; y: number };
  width?: number;
  height?: number;
}

/** 缺尺寸节点的兜底盒（与 ImageNode 默认渲染宽 240 同量级）。 */
export const DEFAULT_NODE_SIZE = { width: 240, height: 200 };

/** 空位探测网格步长：候选位被占时向右下步进（对角线瀑布，生成谱系自然错开）。 */
export const DEFAULT_STEP_X = 280;
export const DEFAULT_STEP_Y = 320;

/** 探测安全上限：防全部占满时死循环（画布无限，实际到不了）。 */
const MAX_PROBE_ROUNDS = 1000;

/** 两矩形 AABB 是否相交（各含 margin 缓冲，边缘贴合不算相交）。 */
const boxesOverlap = (
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
  margin: number
): boolean =>
  a.x < b.x + b.width + margin &&
  a.x + a.width + margin > b.x &&
  a.y < b.y + b.height + margin &&
  a.y + a.height + margin > b.y;

export interface NextPositionOptions {
  stepX?: number;
  stepY?: number;
  /** 碰撞缓冲间距（px），默认 24。 */
  margin?: number;
}

/** 空位探测：首候选 = center 减半宽高（视觉居中落点）；与现有节点 AABB 相交则
 *  按网格步长向右下循环探测空位（第 i 轮候选 = 首候选 + i×步长，对角线错开）。
 *  现有节点缺尺寸走 DEFAULT_NODE_SIZE 兜底；探测超上限返回最后候选。 */
export const nextNodePosition = (
  existing: CanvasBox[],
  center: { x: number; y: number },
  size: { width: number; height: number },
  opts?: NextPositionOptions
): { x: number; y: number } => {
  const stepX = opts?.stepX ?? DEFAULT_STEP_X;
  const stepY = opts?.stepY ?? DEFAULT_STEP_Y;
  const margin = opts?.margin ?? 24;
  const first = {
    x: center.x - size.width / 2,
    y: center.y - size.height / 2
  };
  let candidate = { ...first };
  for (let round = 0; round < MAX_PROBE_ROUNDS; round += 1) {
    // 候选盒必须带上自身尺寸参与 AABB 判定（candidate 只存落点，宽高来自 size 参数）。
    const hit = existing.some((box) =>
      boxesOverlap(
        { x: candidate.x, y: candidate.y, width: size.width, height: size.height },
        {
          x: box.position.x,
          y: box.position.y,
          width: box.width ?? DEFAULT_NODE_SIZE.width,
          height: box.height ?? DEFAULT_NODE_SIZE.height
        },
        margin
      )
    );
    if (!hit) {
      return candidate;
    }
    candidate = {
      x: first.x + (round + 1) * stepX,
      y: first.y + (round + 1) * stepY
    };
  }
  return candidate;
};

/** 图片节点渲染宽（与 ImageNode 默认渲染一致，恢复快照无需再探测图片）。 */
export const IMAGE_NODE_WIDTH = 240;

/** 超高图封顶比例：渲染高/宽最大 4（竖长图不至于一个节点撑满视口）。 */
const MAX_ASPECT_RATIO = 4;

/** 自然尺寸 → 节点渲染尺寸：等比缩放到 nodeWidth 宽；
 *  宽或高 ≤0 / 非有限数返回 null（调用方回退默认比例）；超高图高按 4:1 封顶。 */
export const imageSizeToNode = (
  naturalWidth: number,
  naturalHeight: number,
  nodeWidth = IMAGE_NODE_WIDTH
): { width: number; height: number } | null => {
  if (
    !Number.isFinite(naturalWidth) ||
    !Number.isFinite(naturalHeight) ||
    naturalWidth <= 0 ||
    naturalHeight <= 0
  ) {
    return null;
  }
  const ratio = naturalHeight / naturalWidth;
  return { width: nodeWidth, height: Math.round(nodeWidth * Math.min(ratio, MAX_ASPECT_RATIO)) };
};

// ---------- 节点 data 序列化白名单（契约而非偶然：不依赖 JSON.stringify 静默丢函数） ----------
// 白名单只收纯数据字段；onDelete/footer/onChange 等页面注入的运行时字段（函数/ReactNode）
// 一律不落快照，恢复时由页面按 node.type 重建注入（见 README「节点 data 序列化契约」）。
const IMAGE_DATA_KEYS = ['url', 'loading', 'width', 'height', 'prompt', 'size'] as const;
const NOTE_DATA_KEYS = ['text', 'color'] as const;
const SERIALIZABLE_DATA_KEYS = new Set<string>([...IMAGE_DATA_KEYS, ...NOTE_DATA_KEYS]);

/** 序列化节点 data：仅透传白名单纯数据字段（image + note 并集），未知字段与运行时注入字段剥离。 */
export const serializeNodeData = (data: Record<string, unknown>): Record<string, unknown> => {
  const out: Record<string, unknown> = {};
  for (const key of SERIALIZABLE_DATA_KEYS) {
    if (key in data && data[key] !== undefined) {
      out[key] = data[key];
    }
  }
  return out;
};

/** 反序列化：按节点类型白名单过滤（防快照被篡改塞入脏字段），未知类型返回 null（调用方丢弃该节点）。 */
export const deserializeNodeData = (
  type: string,
  data: Record<string, unknown>
): Record<string, unknown> | null => {
  const keys: readonly string[] | null =
    type === 'image' ? IMAGE_DATA_KEYS : type === 'note' ? NOTE_DATA_KEYS : null;
  if (!keys) {
    return null;
  }
  const out: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in data && data[key] !== undefined) {
      out[key] = data[key];
    }
  }
  return out;
};

// ---------- 快照结构（与后端 ai_canvases.snapshot、前端 CanvasPage 对齐） ----------
// 结构：{ version: 1, nodes: [{ id, type, position, data }], viewport: { x, y, zoom } }，
// data 只含白名单纯数据字段；viewport 与 nodes 平级分开（自动保存分别更新，互不干扰）。

export interface CanvasSnapshotNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, unknown>;
}

export interface CanvasSnapshot {
  version: 1;
  nodes: CanvasSnapshotNode[];
  viewport: { x: number; y: number; zoom: number };
}

/** 快照输入节点的最小形状（React Flow Node 的结构子集，data 可缺省）。 */
export interface SnapshotSourceNode {
  id: string;
  type?: string;
  position: { x: number; y: number };
  data?: Record<string, unknown>;
}

/** 快照构建：白名单序列化 data + 丢弃无 url 的 image 节点（生成中/失败残留不落快照）。 */
export const buildCanvasSnapshot = (
  nodes: SnapshotSourceNode[],
  viewport: { x: number; y: number; zoom: number }
): CanvasSnapshot => ({
  version: 1,
  nodes: nodes
    .map<CanvasSnapshotNode>((node) => ({
      id: node.id,
      type: node.type ?? 'default',
      position: { x: node.position.x, y: node.position.y },
      data: serializeNodeData(node.data ?? {})
    }))
    // image 节点必须已带非空 url：loading 残留（无 url / url 空串）直接跳过
    .filter((node) => node.type !== 'image' || (typeof node.data.url === 'string' && node.data.url.length > 0)),
  viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom }
});

/** 快照解析（恢复容错）：version/nodes 结构校验，坏项跳过；viewport 缺失回退默认；
 *  整体结构不合法返回 null（调用方按空画布处理）。 */
export const parseCanvasSnapshot = (raw: unknown): CanvasSnapshot | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const record = raw as Record<string, unknown>;
  if (record.version !== 1 || !Array.isArray(record.nodes)) {
    return null;
  }
  const nodes: CanvasSnapshotNode[] = [];
  for (const item of record.nodes) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      continue;
    }
    const node = item as Record<string, unknown>;
    if (typeof node.id !== 'string' || node.id.length === 0) {
      continue;
    }
    const position = node.position as Record<string, unknown> | undefined;
    if (
      !position ||
      typeof position !== 'object' ||
      Array.isArray(position) ||
      typeof position.x !== 'number' ||
      typeof position.y !== 'number'
    ) {
      continue;
    }
    if (node.data !== undefined && (typeof node.data !== 'object' || node.data === null || Array.isArray(node.data))) {
      continue;
    }
    nodes.push({
      id: node.id,
      type: typeof node.type === 'string' && node.type.length > 0 ? node.type : 'default',
      position: { x: position.x, y: position.y },
      data: (node.data ?? {}) as Record<string, unknown>
    });
  }
  const viewport = record.viewport as Record<string, unknown> | undefined;
  const safeViewport =
    viewport &&
    typeof viewport === 'object' &&
    !Array.isArray(viewport) &&
    typeof viewport.x === 'number' &&
    typeof viewport.y === 'number' &&
    typeof viewport.zoom === 'number'
      ? { x: viewport.x, y: viewport.y, zoom: viewport.zoom }
      : { x: 0, y: 0, zoom: 1 };
  return { version: 1, nodes, viewport: safeViewport };
};
