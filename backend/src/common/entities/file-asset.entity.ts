// 文件资源实体用于公共上传与业务文件管理。
import { Column, Entity } from 'typeorm';
import { BaseEntity } from './base.entity';

@Entity('file_assets')
export class FileAsset extends BaseEntity {
  @Column({ name: 'biz_type', type: 'varchar', length: 32, default: 'common' })
  bizType!: string;

  @Column({ name: 'storage_provider', type: 'varchar', length: 32, default: 'local' })
  storageProvider!: string;

  @Column({ name: 'storage_path', type: 'varchar', length: 255 })
  storagePath!: string;

  @Column({ name: 'file_name', type: 'varchar', length: 255 })
  fileName!: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 128 })
  mimeType!: string;

  @Column({ name: 'file_size', type: 'int' })
  fileSize!: number;

  @Column({ name: 'file_hash', type: 'varchar', length: 128, nullable: true })
  fileHash?: string;

  @Column({ name: 'uploaded_by', type: 'bigint', nullable: true })
  uploadedBy?: number;
}
