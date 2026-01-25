// 新建占卜 DTO 用于校验主题。
import { IsString, MinLength } from 'class-validator';

export class CreateDivinationDto {
  @IsString()
  @MinLength(1)
  topic!: string;
}
