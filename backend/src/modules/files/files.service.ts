// 文件服务负责公共上传后的元数据落库。
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FileAsset } from '../../common/entities/file-asset.entity';

@Injectable()
export class FilesService {
  constructor(
    @InjectRepository(FileAsset)
    private readonly fileAssetRepo: Repository<FileAsset>
  ) {}

  async createAsset(payload: Partial<FileAsset>) {
    return this.fileAssetRepo.save(this.fileAssetRepo.create(payload));
  }
}
