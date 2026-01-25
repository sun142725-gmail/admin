// 解卦请求 DTO 用于校验输入数据。
import { ArrayMinSize, IsArray, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class LineDto {
  @IsString()
  signStr!: string;

  @IsString()
  symbol!: string;

  @IsString()
  name!: string;

  @IsOptional()
  sum?: number;
}

export class InterpretDto {
  @IsOptional()
  @IsString()
  topic?: string;

  @IsArray()
  @ArrayMinSize(6)
  @ValidateNested({ each: true })
  @Type(() => LineDto)
  lines!: LineDto[];
}
