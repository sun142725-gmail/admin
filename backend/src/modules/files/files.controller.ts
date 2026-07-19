// 文件控制器提供公共上传接口。
import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Body,
  Req
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
          const bizType = String(req.body?.bizType ?? 'common');
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
    const storagePath = `/uploads/${bizType ?? 'common'}/${file.filename}`;
    const asset = await this.filesService.createAsset({
      bizType: bizType ?? 'common',
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
