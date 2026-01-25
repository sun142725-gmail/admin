// 个人中心控制器提供资料与密码接口。
import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/interfaces/auth.interface';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdatePasswordDto } from './dto/update-password.dto';
import { ProfileService } from './profile.service';

const uploadDir = join(process.cwd(), 'uploads');

@ApiTags('Profile')
@ApiBearerAuth()
@Controller('profile')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ProfileController {
  constructor(private readonly profileService: ProfileService) {}

  @Get()
  @Permissions('system:profile:view')
  async getProfile(@CurrentUser() user: RequestUser) {
    return this.profileService.getProfile(user.id);
  }

  @Patch()
  @Permissions('system:profile:update')
  async updateProfile(@CurrentUser() user: RequestUser, @Body() dto: UpdateProfileDto) {
    return this.profileService.updateProfile(user.id, dto);
  }

  @Post('password')
  @Permissions('system:profile:password')
  async updatePassword(@CurrentUser() user: RequestUser, @Body() dto: UpdatePasswordDto) {
    return this.profileService.updatePassword(user.id, dto);
  }

  @Post('avatar')
  @Permissions('system:profile:avatar')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: uploadDir,
        filename: (_req, file, cb) => {
          const suffix = extname(file.originalname);
          cb(null, `${Date.now()}${suffix}`);
        }
      }),
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowed = ['.png', '.jpg', '.jpeg', '.webp'];
        const ext = extname(file.originalname).toLowerCase();
        if (!allowed.includes(ext)) {
          cb(new Error('仅支持 png/jpg/jpeg/webp'), false);
          return;
        }
        cb(null, true);
      }
    })
  )
  async uploadAvatar(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: RequestUser) {
    const avatarUrl = `/uploads/${file.filename}`;
    return this.profileService.updateProfile(user.id, { avatarUrl });
  }
}
