// 文件控制器提供公共上传接口。
import {
  BadRequestException,
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Body
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { mkdirSync } from 'fs';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequestUser } from '../../common/interfaces/auth.interface';
import { FilesService } from './files.service';

const uploadDir = join(process.cwd(), 'uploads');
// bizType 白名单：子目录与落库归属
const BIZ_TYPES = ['common', 'avatar', 'divination', 'chat', 'notification'] as const;

@ApiTags('Files')
@ApiBearerAuth()
@Controller('files')
@UseGuards(JwtAuthGuard)
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  @Post('upload')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (req, _file, cb) => {
          // 防路径穿越：multipart 字段顺序不保证，这里先做格式校验（非法回落 common）；
          // 枚举校验在控制器方法体内执行（届时 body 必定完整）
          const raw = String(req.body?.bizType ?? 'common');
          const bizType = /^[a-zA-Z0-9_-]{1,24}$/.test(raw) ? raw : 'common';
          const targetDir = join(uploadDir, bizType);
          mkdirSync(targetDir, { recursive: true });
          cb(null, targetDir);
        },
        filename: (_req, file, cb) => {
          const suffix = extname(file.originalname);
          cb(null, `${Date.now()}${suffix}`);
        }
      }),
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase();
        const allowed = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.pdf'];
        if (!allowed.includes(ext)) {
          cb(new Error('文件类型不支持'), false);
          return;
        }
        cb(null, true);
      }
    })
  )
  async upload(
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: RequestUser,
    @Body('bizType') bizType?: string
  ) {
    const resolvedBizType = bizType ?? 'common';
    if (!BIZ_TYPES.includes(resolvedBizType as (typeof BIZ_TYPES)[number])) {
      throw new BadRequestException(`bizType 仅支持：${BIZ_TYPES.join('、')}`);
    }
    const storagePath = `/uploads/${resolvedBizType}/${file.filename}`;
    const asset = await this.filesService.createAsset({
      bizType: resolvedBizType,
      storagePath,
      fileName: file.originalname,
      mimeType: file.mimetype,
      fileSize: file.size,
      uploadedBy: user.id
    });
    return {
      id: asset.id,
      url: storagePath
    };
  }
}
