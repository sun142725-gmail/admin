// canvasAutosave 纯函数单测：恢复合并（GET 返回前的首屏变更竞态）/ 自动保存短路裁决矩阵 /
// 422 超限识别 / 卸载 flush 的 keepalive 请求体预算。vitest node 环境（无 jsdom），
// 不碰 DOM/网络/React，与 canvas.helpers.test.ts 同范式。React 生命周期接线（restoreTick
// 驱动 / flush 时机 / ref 读写）在 CanvasPage 内联，不在此覆盖。
import { describe, expect, it } from 'vitest';
import {
  AUTOSAVE_RETRY_MS,
  CANVAS_KEEPALIVE_MAX_BYTES,
  RESTORE_RETRY_MS,
  VIEWPORT_SETTLE_MS,
  autosaveGate,
  canvasKeepaliveBody,
  isSnapshotTooLargeError,
  mergeRestoredNodes
} from './canvasAutosave';

describe('mergeRestoredNodes（恢复合并：晚到的服务器快照 vs 首屏节点）', () => {
  const restored = [
    { id: 'img-1', position: { x: 0, y: 0 } },
    { id: 'note-1', position: { x: 1, y: 1 } }
  ];

  it('首屏无节点：完全替换（merged=false），走「跳过一次幂等回写」路径', () => {
    expect(mergeRestoredNodes(restored, [])).toEqual({ nodes: restored, merged: false });
  });

  it('GET 返回前用户已添加节点：追加合并且 restored 在前（谱系位置稳定）', () => {
    const current = [{ id: 'user-1', position: { x: 9, y: 9 } }];
    const result = mergeRestoredNodes(restored, current);
    expect(result.merged).toBe(true);
    expect(result.nodes.map((node) => node.id)).toEqual(['img-1', 'note-1', 'user-1']);
    expect(result.nodes[2]).toEqual(current[0]);
  });

  it('混合：首屏节点部分命中恢复集、部分新增，只追加新增', () => {
    const current = [
      { id: 'img-1', position: { x: 9, y: 9 } },
      { id: 'user-2', position: { x: 8, y: 8 } }
    ];
    const result = mergeRestoredNodes(restored, current);
    expect(result.merged).toBe(true);
    expect(result.nodes.map((node) => node.id)).toEqual(['img-1', 'note-1', 'user-2']);
  });

  it('首屏节点全部命中恢复集（id 去重）：视为完全替换不重复渲染', () => {
    const current = [
      { id: 'img-1', position: { x: 9, y: 9 } },
      { id: 'note-1', position: { x: 8, y: 8 } }
    ];
    expect(mergeRestoredNodes(restored, current)).toEqual({ nodes: restored, merged: false });
  });

  it('空恢复集 + 非空首屏：全部按新增合并（服务器坏快照解析为空的自愈路径）', () => {
    const current = [{ id: 'user-1', position: { x: 9, y: 9 } }];
    const result = mergeRestoredNodes([], current);
    expect(result.merged).toBe(true);
    expect(result.nodes).toEqual(current);
  });

  it('不改动入参（restored/current 均不被 mutate）', () => {
    const current = [{ id: 'user-1', position: { x: 9, y: 9 } }];
    mergeRestoredNodes(restored, current);
    expect(restored).toHaveLength(2);
    expect(current).toHaveLength(1);
  });
});

describe('autosaveGate（自动保存短路裁决矩阵）', () => {
  it('恢复在途 + 首屏已变更（skip=false）：不登记保存——在途「空画布+新节点」不得抢先覆盖服务器快照', () => {
    // 问题 1 复现断言：挂载即 GET → 用户在恢复返回前添加节点 → 该变更必须被在途短路拦下
    // （修复前无此判定，变更经 1.5s 防抖 PUT 覆盖服务器快照，恢复 GET 晚到即全量丢失）。
    expect(autosaveGate({ restoreInFlight: true, skipSaveOnce: false, restoreFailed: false })).toEqual({
      consumeSkip: false,
      save: false
    });
  });

  it('恢复在途 + skip 待消费：不保存且不消费 skip（skip 留给恢复完成后的 merge 结果裁决）', () => {
    expect(autosaveGate({ restoreInFlight: true, skipSaveOnce: true, restoreFailed: false })).toEqual({
      consumeSkip: false,
      save: false
    });
  });

  it('恢复完成（merged=true 或服务器从未保存）→ skip=false：正常登记保存（在途变更落库）', () => {
    expect(autosaveGate({ restoreInFlight: false, skipSaveOnce: false, restoreFailed: false })).toEqual({
      consumeSkip: false,
      save: true
    });
  });

  it('恢复完成（完全替换 merged=false）→ skip=true：消费 skip 不保存（幂等回写抑制）', () => {
    expect(autosaveGate({ restoreInFlight: false, skipSaveOnce: true, restoreFailed: false })).toEqual({
      consumeSkip: true,
      save: false
    });
  });

  it('恢复最终失败：禁止保存（服务器快照前端不可见，整体 PUT 会覆盖它）', () => {
    expect(autosaveGate({ restoreInFlight: false, skipSaveOnce: false, restoreFailed: true })).toEqual({
      consumeSkip: false,
      save: false
    });
  });

  it('优先级：restoreInFlight 高于 restoreFailed（重试窗口内 failed 未置位也不保存）', () => {
    expect(autosaveGate({ restoreInFlight: true, skipSaveOnce: true, restoreFailed: true })).toEqual({
      consumeSkip: false,
      save: false
    });
  });
});

describe('isSnapshotTooLargeError（422 超限识别：自动保存链路上 422 只有超限一种来源）', () => {
  it('axios 形态 response.status=422 → true', () => {
    expect(isSnapshotTooLargeError({ response: { status: 422 } })).toBe(true);
  });

  it('其他状态码 → false（网络类失败走延时重试路径）', () => {
    expect(isSnapshotTooLargeError({ response: { status: 500 } })).toBe(false);
    expect(isSnapshotTooLargeError({ response: { status: 401 } })).toBe(false);
    expect(isSnapshotTooLargeError({ response: {} })).toBe(false);
  });

  it('无 response（断网/超时）与原始类型 → false', () => {
    expect(isSnapshotTooLargeError(new Error('network error'))).toBe(false);
    expect(isSnapshotTooLargeError({})).toBe(false);
    expect(isSnapshotTooLargeError('422')).toBe(false);
    expect(isSnapshotTooLargeError(null)).toBe(false);
    expect(isSnapshotTooLargeError(undefined)).toBe(false);
  });
});

describe('canvasKeepaliveBody（卸载 flush 请求体与 64KB 预算）', () => {
  it('预算内小快照：返回包装为 { snapshot } 的 JSON 串', () => {
    const snapshot = { version: 1, nodes: [], viewport: { x: 0, y: 0, zoom: 1 } };
    expect(canvasKeepaliveBody(snapshot)).toBe(JSON.stringify({ snapshot }));
  });

  it('预算边界：恰好上限内可用', () => {
    const snapshot = { version: 1, nodes: [], viewport: { x: 0, y: 0, zoom: 1 } };
    // 以 junk 占位把整体推到恰为 CANVAS_KEEPALIVE_MAX_BYTES 字节（ASCII 结构长度动态补偿）：
    // junk 值从 '' 换成 N 个字符，总长差恰为 N
    const withEmptyJunk = JSON.stringify({ snapshot: { ...snapshot, junk: '' } });
    const bounded = { ...snapshot, junk: 'a'.repeat(CANVAS_KEEPALIVE_MAX_BYTES - withEmptyJunk.length) };
    expect(new TextEncoder().encode(JSON.stringify({ snapshot: bounded })).length).toBe(
      CANVAS_KEEPALIVE_MAX_BYTES
    );
    expect(canvasKeepaliveBody(bounded)).not.toBeNull();
  });

  it('超预算（中文按 UTF-8 3 字节/字）：返回 null 放弃 flush（防抖保存已兜底）', () => {
    // '画' UTF-8 3 字节/字：33000 字 ≈ 99KB > 63KB 预算
    const snapshot = { version: 1, nodes: [], viewport: { x: 0, y: 0, zoom: 1 }, junk: '画'.repeat(33000) };
    expect(canvasKeepaliveBody(snapshot)).toBeNull();
  });

  it('UTF-16 长度未超预算但 UTF-8 字节超：必须按字节判定（中文场景回归）', () => {
    const snapshot = { version: 1, nodes: [], viewport: { x: 0, y: 0, zoom: 1 }, junk: '画'.repeat(22000) };
    // 22000 个中文字符：UTF-16 code units ≈ 22080 < 63KB（按长度判断会漏判），
    // UTF-8 字节 ≈ 66076 > 63KB —— keepalive 上限按字节，必须按编码后字节数判定
    expect(JSON.stringify({ snapshot }).length).toBeLessThan(CANVAS_KEEPALIVE_MAX_BYTES);
    expect(canvasKeepaliveBody(snapshot)).toBeNull();
  });
});

describe('时序常量口径', () => {
  it('重试间隔与恢复窗口均为正数毫秒，且保存重试窗口宽于防抖间隔量级', () => {
    expect(AUTOSAVE_RETRY_MS).toBeGreaterThan(0);
    expect(RESTORE_RETRY_MS).toBeGreaterThan(0);
    expect(VIEWPORT_SETTLE_MS).toBeGreaterThan(0);
    expect(AUTOSAVE_RETRY_MS).toBeGreaterThanOrEqual(1000);
    expect(VIEWPORT_SETTLE_MS).toBeLessThan(5000);
  });
});
