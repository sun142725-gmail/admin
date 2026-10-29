// 小说转视频 DTO。
import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class NovelPipelineConfigDto {
  @IsInt()
  @Min(1)
  @Max(6)
  shotsPerChapter!: number;

  @IsInt()
  @Min(3)
  @Max(10)
  videoSeconds!: number;

  @IsString()
  @MaxLength(32)
  imageSize!: string;

  @IsString()
  @MaxLength(32)
  videoSize!: string;

  @IsOptional()
  @IsInt()
  storyboardModelId?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  ttsVoice?: string;

  @IsOptional()
  @IsInt()
  ttsModelId?: number;
}

export class CreateNovelProjectDto {
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name!: string;

  // 小说原文（粘贴文本或前端读取 txt 后传入）。
  @IsString()
  @MinLength(20)
  @MaxLength(200000)
  text!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  stylePrompt?: string;

  @IsOptional()
  @IsObject()
  config?: Partial<NovelPipelineConfigDto>;
}

export class UpdateNovelProjectDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  stylePrompt?: string;

  @IsOptional()
  @IsObject()
  config?: Partial<NovelPipelineConfigDto>;
}

// 单镜创作控制：锁定原文（旁白不被 AI 改写）/ 视觉任务 / 推进方式 / 生成模式 / 首帧锁定。
export class UpdateShotDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  lockedSourceText?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  visualTask?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  progression?: string | null;

  // i2v = 用首帧图生视频；t2v = 纯文生视频。
  @IsOptional()
  @IsIn(['i2v', 't2v'])
  shotMode?: string;

  @IsOptional()
  @IsBoolean()
  firstFrameLocked?: boolean;

  // 旁白/台词（配音与字幕依据）；不传保持原值，传 null 清空。
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  narration?: string | null;
}

// 单镜重生成步骤：image 首帧 / video 片段 / audio 配音。
export class RegenerateShotDto {
  @IsIn(['image', 'video', 'audio'])
  step!: 'image' | 'video' | 'audio';
}
