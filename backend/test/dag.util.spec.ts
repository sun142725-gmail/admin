// dag.util 纯函数单测：节点 ID 白名单（路径穿越防护）。
// 节点 ID 会被拼进落盘路径（node-handlers.writeNodeUpload: `tts/${id}-<ts>.mp3`），
// parseGraph 必须在解析期拦截 `../`、`/` 等字符。不依赖网络与 Nest 容器。
import { parseGraph, DagValidationError } from '../src/modules/flow/engine/dag.util';

// 最小合法画布：start → end（id 校验发生在结构校验的节点循环内，非法 id 会先于 start 校验抛出）。
const buildDag = (nodeIds: string[], edges: Array<{ source: string; target: string }> = []) => ({
  nodes: nodeIds.map((id, index) => ({
    id,
    type: index === 0 ? 'start' : 'end',
    data: { name: id, config: {} }
  })),
  edges: edges.map(({ source, target }) => ({ id: `${source}->${target}`, source, target }))
});

const validDag = () =>
  buildDag(['start1', 'end1'], [{ source: 'start1', target: 'end1' }]);

describe('parseGraph 节点 ID 白名单（路径穿越防护）', () => {
  it('合法 id（字母/数字/下划线/连字符，含前端 genNodeId 形态）正常解析', () => {
    const dag = {
      nodes: [
        { id: 'start-1_ab', type: 'start', data: { name: '开始', config: {} } },
        { id: 'tts0', type: 'tts', data: { name: '配音', config: {} } },
        { id: 'end1', type: 'end', data: { name: '结束', config: {} } }
      ],
      edges: [
        { id: 'e1', source: 'start-1_ab', target: 'tts0' },
        { id: 'e2', source: 'tts0', target: 'end1' }
      ]
    };
    const graph = parseGraph(dag);
    expect(graph.nodeById.get('tts0')?.type).toBe('tts');
    expect(graph.levels).toHaveLength(3);
  });

  it.each([
    ['../../evil', '相对路径穿越'],
    ['tts/x', '子目录穿越'],
    ['..', '纯上跳'],
    ['..\\evil', '反斜杠穿越'],
    ['', '空字符串'],
    ['有空格', '空格'],
    ['节点中文', '非 ASCII'],
    ['a'.repeat(65), '超长（>64 位）']
  ])('非法 id「%s」（%s）抛 DagValidationError', (badId) => {
    expect(() => parseGraph(buildDag([badId]))).toThrow(DagValidationError);
    expect(() => parseGraph(buildDag([badId]))).toThrow(/节点 ID 仅允许字母\/数字\/下划线\/连字符/);
  });

  it('64 位合法 id 放行（白名单上限）', () => {
    const longId = 'n'.repeat(64);
    expect(() => parseGraph(buildDag([longId]))).not.toThrow(DagValidationError);
  });

  it('节点 ID 重复仍报重复错误（原有校验不受白名单影响）', () => {
    expect(() => parseGraph(buildDag(['dup', 'dup']))).toThrow('节点 ID 重复: dup');
  });
});
