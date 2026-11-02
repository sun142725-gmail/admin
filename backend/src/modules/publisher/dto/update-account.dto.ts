// 更新平台账号 DTO：credentials 不传=不修改，传非空串=重加密覆盖。
import { IsIn, IsOptional, IsString, Length } from 'class-validator';
import { PUBLISHER_PLATFORMS } from '../publisher.types';

export class UpdateAccountDto {
  @IsOptional()
  @IsIn(PUBLISHER_PLATFORMS)
  platform?: string;

  @IsOptional()
  @Length(1, 128)
  accountName?: string;

  @IsOptional()
  @IsString()
  credentials?: string;

  @IsOptional()
  @IsIn([0, 1])
  status?: number;

  @IsOptional()
  @Length(0, 255)
  remark?: string;
}
