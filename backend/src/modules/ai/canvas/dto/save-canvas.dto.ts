// AI 画布快照保存 DTO：snapshot 必填且必须是对象（结构细节由前端白名单序列化契约保证，
// 后端只做形态与体积兜底；forbidNonWhitelisted 下多余字段在管道层 422）。
import { IsObject } from 'class-validator';

export class SaveCanvasDto {
  // 画布快照：{ version: 1, nodes: [...], viewport: { x, y, zoom } }。
  @IsObject()
  snapshot!: Record<string, unknown>;
}
