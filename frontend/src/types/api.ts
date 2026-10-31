// 公共接口类型：渐进标注各 api/*.ts 的返回结构，不做全量 API 类型改造。

/** 通用分页返回结构（items + total 口径，与后端 list 接口一致）。 */
export interface PageResult<T> {
  items: T[];
  total: number;
}
