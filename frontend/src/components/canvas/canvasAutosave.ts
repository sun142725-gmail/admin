// 画布自动保存协议纯逻辑：与 CanvasPage 的 React 生命周期、网络层完全解耦（vitest node 直测，
// 不碰 DOM/网络/React）。覆盖五块：恢复合并（GET 返回前的首屏变更竞态）、自动保存短路裁决
// （恢复在途/恢复失败/幂等回写抑制的决策矩阵）、422 超限识别（超 2MB 静默失败感知）、
// 卸载 flush 的 keepalive 请求体预算。api/ai.ts 的 saveCanvasKeepalive 薄封装复用
// canvasKeepaliveBody（api→components 单向依赖，本文件零 import 无环）；快照结构契约
// 定义在同目录 canvas.helpers.ts，两个画布纯逻辑文件同处内聚。

/** 自动保存失败后的延时重试间隔（ms）：每轮保存链最多重试一次，避免失败风暴。 */
export const AUTOSAVE_RETRY_MS = 5000;

/** 恢复请求失败后的自动重试间隔（ms）：网络抖动自愈一次，重试仍失败才短路自动保存。 */
export const RESTORE_RETRY_MS = 2000;

/** 恢复视口 settle 窗口（ms）：程序化 setViewport（恢复视口）经 d3 transform 同样派发
 *  onMoveEnd（tick 来源），恢复完成后该窗口内的 tick 属幂等回写，忽略；一次手动拖拽手势
 *  通常远大于该窗口，不会误吞真实视口变更。 */
export const VIEWPORT_SETTLE_MS = 500;

/** fetch keepalive 请求体上限：规范 64KB，预留请求头余量。超限快照在卸载 flush 时放弃
 *  （防抖保存正常早已落库，flush 只兜 1.5s 防抖窗口内 / 保存失败后的增量）。 */
export const CANVAS_KEEPALIVE_MAX_BYTES = 63 * 1024;

/** 保存/恢复链节点的最小结构（React Flow Node 的结构子集，泛型保持调用方节点类型不丢）。 */
interface IdLike {
  id: string;
}

/**
 * 恢复合并：restored（服务器快照重建）与 GET 返回前用户已添加的首屏节点（current）合并，
 * 按 id 去重（genNodeId 时间戳+随机，冲突概率可忽略，防御性兜底）、restored 在前。
 * merged=false 表示 current 为空或全部命中恢复集（完全替换，无需触发一次额外保存）。
 */
export const mergeRestoredNodes = <T extends IdLike>(
  restored: T[],
  current: readonly T[]
): { nodes: T[]; merged: boolean } => {
  if (current.length === 0) {
    return { nodes: restored, merged: false };
  }
  const restoredIds = new Set(restored.map((node) => node.id));
  const extras = current.filter((node) => !restoredIds.has(node.id));
  if (extras.length === 0) {
    return { nodes: restored, merged: false };
  }
  return { nodes: [...restored, ...extras], merged: true };
};

/** 自动保存 effect 的短路裁决输入（CanvasPage 三个 ref 的只读快照）。 */
export interface AutosaveGateInput {
  /** 恢复请求在途（GET 未返回，含失败后的重试窗口）：期间任何变更都不得登记快照——
   *  否则「空画布+新节点」经防抖 PUT 无条件覆盖服务器快照（后端 upsert 幂等覆盖），
   *  若覆盖发生在恢复 GET 之后被读取，旧画布内容将不可恢复地丢失。 */
  restoreInFlight: boolean;
  /** 跳过一次保存（首挂载 / 恢复完全替换时的幂等回写抑制）。 */
  skipSaveOnce: boolean;
  /** 恢复最终失败（重试后仍失败）：服务器完整快照前端不可见，禁止整体 PUT 覆盖。 */
  restoreFailed: boolean;
}

/** 自动保存短路裁决结果：consumeSkip=本轮把 skipSaveOnce 消费掉；save=登记快照并防抖保存。 */
export interface AutosaveGateResult {
  consumeSkip: boolean;
  save: boolean;
}

/**
 * 自动保存短路裁决（决策矩阵，与 CanvasPage 的 effect 一一对应）：
 * 1. restoreInFlight 最优先——在途窗口内既不保存也不消费 skip（skip 留给恢复完成后裁决）；
 * 2. 恢复完成后的补保存由恢复出口决定：merged=true 或服务器从未保存过 → skipSaveOnce=false，
 *    在途期间的变更随后续 effect（restoreTick 驱动）正常登记落库；merged=false → 消费 skip；
 * 3. restoreFailed 短路保持：失败期间整体 PUT 一律禁止。
 */
export const autosaveGate = (input: AutosaveGateInput): AutosaveGateResult => {
  if (input.restoreInFlight) {
    return { consumeSkip: false, save: false };
  }
  if (input.skipSaveOnce) {
    return { consumeSkip: true, save: false };
  }
  if (input.restoreFailed) {
    return { consumeSkip: false, save: false };
  }
  return { consumeSkip: false, save: true };
};

/**
 * 422 超限识别：后端 canvas.service save 超 2MB 抛 BadRequest → http-exception.filter 统一映射 422。
 * 自动保存请求体恒为 { snapshot: <object> }（buildCanvasSnapshot 产物），DTO 形态校验
 * （缺失/非对象/多余字段）不可能触发，故自动保存链路上的 422 实际只有超限一种来源。
 * 用结构判定而非 import axios 类型：浏览器与 node 测试环境同口径，避免测试引入 axios 链。
 */
export const isSnapshotTooLargeError = (error: unknown): boolean => {
  if (!error || typeof error !== 'object') {
    return false;
  }
  return (error as { response?: { status?: number } }).response?.status === 422;
};

/**
 * 卸载 flush 请求体：快照包装为 { snapshot } 的 JSON 串，并按 UTF-8 字节数做 keepalive 预算判断
 * （keepalive 上限按字节而非 UTF-16 长度，中文 prompt 每字符 3 字节，必须按编码后字节数判断）。
 * 超预算返回 null：调用方放弃 flush（防抖保存已兜底，超限快照 flush 也发不出去）。
 */
export const canvasKeepaliveBody = (snapshot: object): string | null => {
  const body = JSON.stringify({ snapshot });
  if (new TextEncoder().encode(body).length > CANVAS_KEEPALIVE_MAX_BYTES) {
    return null;
  }
  return body;
};
