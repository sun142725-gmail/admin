// 大事纪核心标记 DTO 校验目标核心状态。
import { IsBoolean } from 'class-validator';

export class ToggleMilestoneCoreDto {
  @IsBoolean()
  isCore!: boolean;
}
