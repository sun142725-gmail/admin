// AI 画布快照服务：每用户一行，GET 读 / PUT 幂等覆盖。
// 幂等落库用 repo.upsert(conflictPaths=['userId']) 单语句完成 find-or-insert，
// 规避 findOne→save 两次往返的并发竞态（双 PUT 并发也只留一行）。
import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AiCanvas } from '../../../common/entities/ai-canvas.entity';
import { SaveCanvasDto } from './dto/save-canvas.dto';

/** 快照体积上限：2MB（按 UTF-8 编码后字节数，与前端 canvasAutosave keepalive 预算同口径：
 *  中文每字符 3 字节，按字符数判定会放行实际 ~3 倍体积的中文快照）。请求体 10MB 上限在 main.ts 兜底，先到这里。 */
export const CANVAS_SNAPSHOT_MAX_BYTES = 2 * 1024 * 1024;

export interface CanvasSnapshotVo {
  snapshot: Record<string, unknown> | null;
}

@Injectable()
export class CanvasService {
  constructor(
    @InjectRepository(AiCanvas)
    private readonly canvasRepo: Repository<AiCanvas>
  ) {}

  /** 读取当前用户画布快照；从未保存过返回 snapshot: null（前端按空画布处理）。 */
  async get(userId: number): Promise<CanvasSnapshotVo> {
    const row = await this.canvasRepo.findOne({ where: { userId } });
    return { snapshot: row?.snapshot ?? null };
  }

  /** 保存（幂等覆盖）：超 2MB（UTF-8 字节）抛 BadRequest（项目口径统一映射 422）；返回 { success: true }。 */
  async save(userId: number, dto: SaveCanvasDto): Promise<{ success: boolean }> {
    if (Buffer.byteLength(JSON.stringify(dto.snapshot), 'utf8') > CANVAS_SNAPSHOT_MAX_BYTES) {
      throw new BadRequestException('画布快照超过 2MB 限制');
    }
    // upsert 参数的 QueryDeepPartialEntity 对 json 列（Record<string, unknown> 值类型 unknown）
    // 类型推不进（flow.service 能绕开是因为 dag 是具体接口 FlowDag）；快照结构后端不解读，
    // 保持宽类型 + as never 收窄断言，运行时为同一对象原样序列化入库。
    await this.canvasRepo.upsert({ userId, snapshot: dto.snapshot } as never, ['userId']);
    return { success: true };
  }
}
