// 兼容垫片：AppTable 收编为 base 层 SelfTable，旧路径一行 re-export，14 页既有引用零改动。
// 新代码一律 import components/base/SelfTable；stock 波全仓 grep AppTable 零引用后删除本文件。
export { SelfTable as AppTable } from './base/SelfTable';
