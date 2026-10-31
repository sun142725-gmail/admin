// canvas.helpers 纯函数单测：空位探测 / 图片尺寸换算 / data 序列化白名单 / 快照构建解析。
// vitest node 环境（无 jsdom），与 MediaPreview.test.ts 同范式；不碰 DOM/网络。
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_NODE_SIZE,
  DEFAULT_STEP_X,
  DEFAULT_STEP_Y,
  buildCanvasSnapshot,
  deserializeNodeData,
  imageSizeToNode,
  nextNodePosition,
  parseCanvasSnapshot,
  serializeNodeData
} from './canvas.helpers';

describe('nextNodePosition（空位探测）', () => {
  it('空画布：首候选 = center 减半宽高（视觉居中落点）', () => {
    expect(nextNodePosition([], { x: 500, y: 400 }, { width: 200, height: 100 })).toEqual({ x: 400, y: 350 });
  });

  it('单冲突：按默认步长（280×320）向右下步进一格', () => {
    // 首候选与现有节点（同尺寸同位置）必然相交 → 步进一格
    const existing = [{ position: { x: 400, y: 350 }, width: 200, height: 100 }];
    expect(nextNodePosition(existing, { x: 500, y: 400 }, { width: 200, height: 100 })).toEqual({
      x: 400 + DEFAULT_STEP_X,
      y: 350 + DEFAULT_STEP_Y
    });
  });

  it('连环占满：继续向右下多步探测直到空位', () => {
    const first = { x: 400, y: 350 };
    const size = { width: 200, height: 100 };
    const existing = [
      { position: first, width: 200, height: 100 },
      { position: { x: first.x + DEFAULT_STEP_X, y: first.y + DEFAULT_STEP_Y }, width: 200, height: 100 }
    ];
    expect(nextNodePosition(existing, { x: 500, y: 400 }, size)).toEqual({
      x: first.x + 2 * DEFAULT_STEP_X,
      y: first.y + 2 * DEFAULT_STEP_Y
    });
  });

  it('现有节点缺尺寸：走 DEFAULT_NODE_SIZE 兜底不崩', () => {
    const existing = [{ position: { x: 400, y: 350 } }];
    // 兜底盒 240×200 与候选（200×100）相交 → 步进
    const next = nextNodePosition(existing, { x: 500, y: 400 }, { width: 200, height: 100 });
    expect(next).toEqual({ x: 400 + DEFAULT_STEP_X, y: 350 + DEFAULT_STEP_Y });
  });

  it('自定义步长与缓冲间距生效', () => {
    const existing = [{ position: { x: 400, y: 350 }, width: 200, height: 100 }];
    const next = nextNodePosition(existing, { x: 500, y: 400 }, { width: 200, height: 100 }, {
      stepX: 300,
      stepY: 400
    });
    expect(next).toEqual({ x: 700, y: 750 });
  });

  it('边缘贴合（相切不算相交）不触发步进', () => {
    // 候选右边缘 600 = 现有左边缘 600，AABB 严格小于判定 → 不相交
    const existing = [{ position: { x: 600, y: 0 }, width: 100, height: 100 }];
    const next = nextNodePosition(existing, { x: 500, y: 50 }, { width: 200, height: 100 }, { margin: 0 });
    expect(next).toEqual({ x: 400, y: 0 });
  });
});

describe('imageSizeToNode（图片尺寸换算）', () => {
  it('正常等比缩放到默认节点宽 240', () => {
    expect(imageSizeToNode(1024, 1024)).toEqual({ width: 240, height: 240 });
    expect(imageSizeToNode(1792, 1024)).toEqual({ width: 240, height: 137 });
    expect(imageSizeToNode(1024, 1792)).toEqual({ width: 240, height: 420 });
  });

  it('自定义节点宽生效', () => {
    expect(imageSizeToNode(1000, 500, 200)).toEqual({ width: 200, height: 100 });
  });

  it('宽或高 ≤0 / 非有限数返回 null（调用方回退默认比例）', () => {
    expect(imageSizeToNode(0, 100)).toBeNull();
    expect(imageSizeToNode(100, 0)).toBeNull();
    expect(imageSizeToNode(-10, 100)).toBeNull();
    expect(imageSizeToNode(Number.NaN, 100)).toBeNull();
    expect(imageSizeToNode(Number.POSITIVE_INFINITY, 100)).toBeNull();
  });

  it('超高图（高/宽 > 4）按 4 封顶', () => {
    expect(imageSizeToNode(100, 1000)).toEqual({ width: 240, height: 960 });
  });
});

describe('serializeNodeData / deserializeNodeData（data 白名单契约）', () => {
  it('纯数据字段全保留，函数/ReactNode 运行时字段剥离', () => {
    const onDelete = () => undefined;
    // footer 模拟页面注入的 ReactNode（任意非白名单值，key 不在白名单即被剥离，不依赖值类型）。
    const data = {
      url: '/uploads/ai-images/a.jpg',
      width: 240,
      height: 240,
      prompt: '一只猫',
      size: '1024x1024',
      onDelete,
      footer: { $$typeof: 'react.element' }
    };
    const serialized = serializeNodeData(data as unknown as Record<string, unknown>);
    expect(serialized).toEqual({
      url: '/uploads/ai-images/a.jpg',
      width: 240,
      height: 240,
      prompt: '一只猫',
      size: '1024x1024'
    });
    expect('onDelete' in serialized).toBe(false);
    expect('footer' in serialized).toBe(false);
  });

  it('便签字段（text/color）保留；未知字段不透传', () => {
    expect(serializeNodeData({ text: '备忘', color: '#fff7b8', hacked: true, callback: () => 1 })).toEqual({
      text: '备忘',
      color: '#fff7b8'
    });
  });

  it('undefined 值字段不落快照', () => {
    expect(serializeNodeData({ url: '/a.jpg', prompt: undefined })).toEqual({ url: '/a.jpg' });
  });

  it('deserializeNodeData：image/note 各按类型白名单过滤', () => {
    expect(
      deserializeNodeData('image', { url: '/a.jpg', text: '脏字段', width: 240, onDelete: () => undefined })
    ).toEqual({ url: '/a.jpg', width: 240 });
    expect(deserializeNodeData('note', { text: 'x', url: '/dirty.jpg', color: '#fff7b8' })).toEqual({
      text: 'x',
      color: '#fff7b8'
    });
  });

  it('deserializeNodeData：未知类型返回 null（恢复时丢弃）', () => {
    expect(deserializeNodeData('unknown', { a: 1 })).toBeNull();
  });
});

describe('buildCanvasSnapshot（快照构建）', () => {
  it('白名单序列化 + viewport 拷贝', () => {
    const snapshot = buildCanvasSnapshot(
      [
        {
          id: 'img-1',
          type: 'image',
          position: { x: 10, y: 20 },
          data: { url: '/a.jpg', width: 240, footer: { $$typeof: 'react.element' } }
        },
        { id: 'note-1', type: 'note', position: { x: 0, y: 0 }, data: { text: '备注' } }
      ],
      { x: 5, y: 6, zoom: 1.25 }
    );
    expect(snapshot).toEqual({
      version: 1,
      nodes: [
        { id: 'img-1', type: 'image', position: { x: 10, y: 20 }, data: { url: '/a.jpg', width: 240 } },
        { id: 'note-1', type: 'note', position: { x: 0, y: 0 }, data: { text: '备注' } }
      ],
      viewport: { x: 5, y: 6, zoom: 1.25 }
    });
  });

  it('无 url 的 image 节点（loading 残留）不落快照；缺 type 归为 default', () => {
    const snapshot = buildCanvasSnapshot(
      [
        { id: 'img-loading', type: 'image', position: { x: 0, y: 0 }, data: { loading: true } },
        { id: 'img-bad', type: 'image', position: { x: 0, y: 0 }, data: { url: '' } },
        { id: 'mystery', position: { x: 1, y: 1 }, data: {} }
      ],
      { x: 0, y: 0, zoom: 1 }
    );
    expect(snapshot.nodes.map((node) => node.id)).toEqual(['mystery']);
    expect(snapshot.nodes[0].type).toBe('default');
  });
});

describe('parseCanvasSnapshot（快照解析容错）', () => {
  it('合法快照原样解析', () => {
    const raw = {
      version: 1,
      nodes: [{ id: 'img-1', type: 'image', position: { x: 1, y: 2 }, data: { url: '/a.jpg' } }],
      viewport: { x: 3, y: 4, zoom: 0.8 }
    };
    expect(parseCanvasSnapshot(raw)).toEqual(raw);
  });

  it('整体结构不合法返回 null', () => {
    expect(parseCanvasSnapshot(null)).toBeNull();
    expect(parseCanvasSnapshot('x')).toBeNull();
    expect(parseCanvasSnapshot([])).toBeNull();
    expect(parseCanvasSnapshot({})).toBeNull();
    expect(parseCanvasSnapshot({ version: 2, nodes: [], viewport: { x: 0, y: 0, zoom: 1 } })).toBeNull();
    expect(parseCanvasSnapshot({ version: 1, nodes: 'not-array', viewport: { x: 0, y: 0, zoom: 1 } })).toBeNull();
  });

  it('坏节点逐项跳过（缺 id / position 非法 / data 非对象），好节点保留', () => {
    const parsed = parseCanvasSnapshot({
      version: 1,
      nodes: [
        { type: 'image', position: { x: 0, y: 0 }, data: {} },
        { id: '', type: 'image', position: { x: 0, y: 0 }, data: {} },
        { id: 'no-position', type: 'image', data: {} },
        { id: 'bad-position', position: { x: 'a', y: 0 }, data: {} },
        { id: 'bad-data', position: { x: 0, y: 0 }, data: 'oops' },
        null,
        { id: 'good', type: 'note', position: { x: 5, y: 5 }, data: { text: 'ok' } }
      ],
      viewport: { x: 0, y: 0, zoom: 1 }
    });
    expect(parsed!.nodes).toHaveLength(1);
    expect(parsed!.nodes[0]).toEqual({ id: 'good', type: 'note', position: { x: 5, y: 5 }, data: { text: 'ok' } });
  });

  it('viewport 缺失/非法回退默认视口；缺 type 归 default、缺 data 归空对象', () => {
    const parsed = parseCanvasSnapshot({
      version: 1,
      nodes: [{ id: 'n1', position: { x: 1, y: 1 } }]
    });
    expect(parsed!.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
    expect(parsed!.nodes[0]).toEqual({ id: 'n1', type: 'default', position: { x: 1, y: 1 }, data: {} });
  });
});

// DEFAULT_NODE_SIZE 被探测函数引用，导入校验防误删（兜底契约）。
describe('DEFAULT_NODE_SIZE', () => {
  it('兜底盒存在且为正数尺寸', () => {
    expect(DEFAULT_NODE_SIZE.width).toBeGreaterThan(0);
    expect(DEFAULT_NODE_SIZE.height).toBeGreaterThan(0);
  });
});
