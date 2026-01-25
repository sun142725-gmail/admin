// 字典项控制器用于修改与删除字典项。
import { Body, Controller, Delete, Param, Patch, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { Permissions } from '../../common/decorators/permissions.decorator';
import { UpdateDictItemDto } from './dto/update-dict-item.dto';
import { DictService } from './dict.service';

@ApiTags('Dict')
@Controller('dict-items')
export class DictItemsController {
  constructor(private readonly dictService: DictService) {}

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('system:dict:update')
  async update(@Param('id') id: string, @Body() payload: UpdateDictItemDto) {
    return this.dictService.updateItem(Number(id), payload);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @Permissions('system:dict:delete')
  async remove(@Param('id') id: string) {
    return this.dictService.removeItem(Number(id));
  }
}
