// 认证控制器提供登录、刷新与用户信息接口。
import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { SendCodeDto } from './dto/send-code.dto';
import { CodeLoginDto } from './dto/code-login.dto';
import { CodeResetPasswordDto } from './dto/code-reset-password.dto';
import { AuthService } from './auth.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/interfaces/auth.interface';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto.username, dto.password, req.ip);
  }

  @Post('code/send')
  async sendCode(@Body() dto: SendCodeDto, @Req() req: Request) {
    return this.authService.sendCode(dto.scene, dto.channel, dto.target, req.ip);
  }

  @Post('code/login')
  async codeLogin(@Body() dto: CodeLoginDto, @Req() req: Request) {
    return this.authService.codeLogin(dto.channel, dto.target, dto.code, req.ip);
  }

  @Post('code/reset-password')
  async codeResetPassword(@Body() dto: CodeResetPasswordDto, @Req() req: Request) {
    return this.authService.codeResetPassword(dto.channel, dto.target, dto.code, dto.newPassword, req.ip);
  }

  @Post('refresh')
  async refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.authService.refresh(dto.refreshToken, req.ip);
  }

  @Post('logout')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async logout(@CurrentUser() user: RequestUser, @Req() req: Request) {
    return this.authService.logout(user.id, req.ip);
  }

  @Get('profile')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  async profile(@CurrentUser() user: RequestUser) {
    return this.authService.profile(user.id);
  }
}
