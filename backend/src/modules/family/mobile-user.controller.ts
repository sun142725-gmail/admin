// 移动端用户控制器提供个人资料与设置接口。
import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/interfaces/auth.interface';
import { FamilyService } from './family.service';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';
import { UpdateUserSettingsDto } from './dto/update-user-settings.dto';

@ApiTags('Mobile User')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('user')
export class MobileUserController {
  constructor(private readonly familyService: FamilyService) {}

  @Put('profile')
  updateProfile(@CurrentUser() user: RequestUser, @Body() dto: UpdateUserProfileDto) {
    return this.familyService.updateUserProfile(user.id, dto);
  }

  @Get('settings')
  settings(@CurrentUser() user: RequestUser) {
    return this.familyService.settings(user.id);
  }

  @Put('settings')
  updateSettings(@CurrentUser() user: RequestUser, @Body() dto: UpdateUserSettingsDto) {
    return this.familyService.updateSettings(user.id, dto.notificationEnabled);
  }
}
