// AI 生图 DTO。
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

export class GenerateImageDto {
  @IsOptional()
  @IsInt()
  modelId?: number;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  prompt!: string;

  @IsOptional()
  @IsIn(['1024x1024', '512x512', '1792x1024', '1024x1792'])
  size?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  count?: number;
}
