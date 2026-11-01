// 角色卡 DTO：创建 / 更新。范式照抄 novel-video.dto.ts。
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateCharacterCardDto {
  @IsInt()
  projectId!: number;

  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name!: string;

  // 外观描述（性别/年龄/发型/服饰/气质），出图时并入首帧提示词。
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  appearance?: string;

  // 参考图静态路径（files/upload 返回的 /uploads/... 完整路径）；
  // 每项字符串 + 长度上限纵深防御（读盘侧还有 sanitizeImageRelative 限根校验）。
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  referenceImages?: string[];

  // 主角色：注入分镜生图时排最前。
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}

export class UpdateCharacterCardDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  appearance?: string | null;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  referenceImages?: string[];

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;
}
