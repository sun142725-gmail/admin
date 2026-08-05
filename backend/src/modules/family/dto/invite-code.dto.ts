// 邀请码 DTO 校验可选有效天数。
import { IsInt, IsOptional, Max, Min } from 'class-validator';

export class InviteCodeDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(30)
  expireDays?: number;
}
