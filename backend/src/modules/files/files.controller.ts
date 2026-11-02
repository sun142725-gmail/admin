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
// bizType 白名单：子目录与落库归属（novel-bgm = 小说转视频背景音乐，独立 upload-audio 端点固定写入）
const BIZ_TYPES = ['common', 'avatar', 'divination', 'chat', 'notification', 'novel-bgm'] as const;
// 音频上传限制：扩展名白名单 + 10MB（BGM 短曲场景，独立于 upload 的 2MB 图片上限）
const AUDIO_ALLOWED_EXTS = ['.mp3', '.wav'];
const AUDIO_MAX_SIZE = 10 * 1024 * 1024;

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

  /**
   * BGM 音频独立上传端点：不动既有 upload 的 2MB/图片白名单行为，独立 multer 配置——
   * .mp3/.wav 白名单 + 10MB + bizType 固定 'novel-bgm'（落 uploads/novel-bgm/）。
   */
  @Post('upload-audio')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const targetDir = join(uploadDir, 'novel-bgm');
          mkdirSync(targetDir, { recursive: true });
          cb(null, targetDir);
        },
        filename: (_req, file, cb) => {
          cb(null, `${Date.now()}${extname(file.originalname).toLowerCase()}`);
        }
      }),
      limits: { fileSize: AUDIO_MAX_SIZE },
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase();
        if (!AUDIO_ALLOWED_EXTS.includes(ext)) {
          cb(new BadRequestException('音频仅支持 mp3/wav'), false);
          return;
        }
        cb(null, true);
      }
    })
  )
  async uploadAudio(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: RequestUser) {
    if (!file) {
      throw new BadRequestException('请上传音频文件');
    }
    const bizType = 'novel-bgm';
    const storagePath = `/uploads/${bizType}/${file.filename}`;
    const asset = await this.filesService.createAsset({
      bizType,
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
