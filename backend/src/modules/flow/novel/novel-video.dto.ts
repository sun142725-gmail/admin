// 小说转视频 DTO。
// config 嵌套校验说明：NovelPipelineConfigDto 全字段 @IsOptional——config 是「任意子集 + 默认合并」
// 语义（创建缺省合并 DEFAULT_NOVEL_CONFIG，更新 {...project.config, ...dto.config} 浅合并），
// 前端只传变更字段；字段级约束（范围/枚举）在子集校验时仍然生效。
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNumber, IsObject, IsOptional, IsString, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';

export class NovelPipelineConfigDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  shotsPerChapter?: number;

  @IsOptional()
  @IsInt()
  @Min(3)
  @Max(10)
  videoSeconds?: number;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  imageSize?: string;

  @IsOptional()
  @IsString()
  @MaxLength(32)
  videoSize?: string;

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

  // 成片画幅（缺省回落 imageSize/videoSize 旧行为）。
  @IsOptional()
  @IsIn(['16:9', '9:16', '1:1'])
  aspect?: '16:9' | '9:16' | '1:1';

  // BGM 音频静态路径（/uploads/novel-bgm/...，files/upload-audio 上传）；空串 = 不加 BGM。
  @IsOptional()
  @IsString()
  @MaxLength(255)
  bgmUrl?: string;

  // 字幕烧录样式预设档（none = 不烧录）。
  @IsOptional()
  @IsIn(['default', 'big', 'none'])
  subtitleStyle?: string;

  // BGM 音量 0-1（ducking 侧链输入音量）。
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  bgmVolume?: number;
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
  @ValidateNested()
  @Type(() => NovelPipelineConfigDto)
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

  // 作品封面静态路径（前端 canvas 合成后经 files/upload 上传得到）；不传保持原值，空串归 null 清除。
  @IsOptional()
  @IsString()
  @MaxLength(500)
  coverUrl?: string | null;

  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => NovelPipelineConfigDto)
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
