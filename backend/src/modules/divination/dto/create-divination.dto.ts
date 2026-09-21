// 新建占卜 DTO：主题改为可选（先摇卦、解卦前补填）。
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateDivinationDto {
  @IsOptional()
  @IsString()
  @MaxLength(50)
  topic?: string;
}
