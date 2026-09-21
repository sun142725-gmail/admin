// 补填占卜主题 DTO（成卦后、解卦前填写）。
import { IsString, MaxLength, MinLength } from 'class-validator';

export class SetTopicDto {
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  topic!: string;
}
