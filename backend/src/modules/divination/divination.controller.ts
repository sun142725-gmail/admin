// 占卜控制器提供创建与查询接口。
import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/interfaces/auth.interface';
import { CreateDivinationDto } from './dto/create-divination.dto';
import { DivinationService } from './divination.service';

@ApiTags('Divinations')
@ApiBearerAuth()
@Controller('divinations')
@UseGuards(JwtAuthGuard)
export class DivinationController {
  constructor(private readonly divinationService: DivinationService) {}

  @Post()
  async create(@Body() dto: CreateDivinationDto, @CurrentUser() user: RequestUser) {
    return this.divinationService.create(dto.topic, user?.id);
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.divinationService.getById(Number(id));
  }
}
