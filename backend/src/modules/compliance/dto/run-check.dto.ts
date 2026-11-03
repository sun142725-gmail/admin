// 执行检查链 DTO：只读不落库。aigcDeclared 必填（不传 → ValidationPipe 拦截 400→422，
// 前端契约：aigcDeclared 由前端恒显式传布尔，不依赖缺省）；
// 文案字段全部可选、长度上限设防（sqlite varchar 限长不生效，照 publisher.service.ts:247 口径）。
// description/tags 本期发布记录表无对应列，为契约预留字段。
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

export class RunComplianceCheckDto {
  @IsOptional()
  @IsString()
  @Length(0, 255)
  title?: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  description?: string;

  @IsOptional()
  @IsString()
  @Length(0, 500)
  tags?: string;

  @IsOptional()
  @IsString()
  @Length(0, 2000)
  note?: string;

  // AIGC 生成标识声明：平台强制红线，必填布尔
  @IsBoolean()
  aigcDeclared!: boolean;
}
