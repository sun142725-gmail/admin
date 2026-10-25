// 微服务转发注册表：新接一个下游服务时在这里登记一条即可，无需改动控制器。
// 目标地址支持携带基路径（如 http://host:8081/api/v1），
// 前端请求 /api/svc/<name>/<rest> 会被转发到 <target>/<rest>。
export interface ProxyServiceDefinition {
  /** 服务名，即路由前缀 /api/svc/:name/* */
  name: string;
  /** 目标地址的环境变量名（优先级高于 defaultTarget） */
  targetEnv: string;
  /** 未配置环境变量时的默认目标地址 */
  defaultTarget: string;
  /** 上游超时（毫秒）；0 表示不限时（SSE / 长任务场景），缺省用 PROXY_DEFAULT_TIMEOUT_MS */
  timeoutMs?: number;
  description: string;
}

/** 全局默认超时；超时判定的是"拿到上游响应头"的耗时，不限制响应体流式回传。 */
export const PROXY_DEFAULT_TIMEOUT_MS = Number(process.env.PROXY_DEFAULT_TIMEOUT_MS ?? 60000);

export const PROXY_SERVICES: ProxyServiceDefinition[] = [
  {
    name: 'core',
    targetEnv: 'PROXY_CORE_TARGET',
    defaultTarget: 'http://127.0.0.1:8081/api/v1',
    // 脚手架含 SSE 流式示例故不限时；接入真实业务后按需收紧（长任务建议改为 taskId 异步模式）
    timeoutMs: 0,
    description: 'Go 核心服务（标准脚手架，暂无业务）'
  }
];
