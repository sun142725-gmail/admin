// 更新用户设置 DTO 校验通知开关。
import { IsBoolean } from 'class-validator';

export class UpdateUserSettingsDto {
  @IsBoolean()
  notificationEnabled!: boolean;
}
