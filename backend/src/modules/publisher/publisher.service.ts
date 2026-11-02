// 发布矩阵服务：平台账号管理（凭据加密落库）与发布记录登记（manual 通道）。
// 安全红线：凭据仅加密落库，任何响应出口统一走 toAccountVo 白名单，密文与明文永不回传。
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { PublisherAccount } from '../../common/entities/publisher-account.entity';
import { VideoPublishRecord } from '../../common/entities/video-publish-record.entity';
import { NovelProject } from '../../common/entities/novel-project.entity';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { CreateRecordDto } from './dto/create-record.dto';
import { QueryRecordsDto } from './dto/query-records.dto';
import { PublisherChannelRegistry } from './publisher-channel.registry';
import { PublisherPlatform } from './publisher.types';
import { decryptSecret, encryptSecret, isEncryptionConfigured, maskSecret } from '../ai/core/crypto.util';

@Injectable()
export class PublisherService {
  constructor(
    @InjectRepository(PublisherAccount)
    private readonly accountRepo: Repository<PublisherAccount>,
    @InjectRepository(VideoPublishRecord)
    private readonly recordRepo: Repository<VideoPublishRecord>,
    @InjectRepository(NovelProject)
    private readonly projectRepo: Repository<NovelProject>,
    private readonly channelRegistry: PublisherChannelRegistry
  ) {}

  async listAccounts() {
    const accounts = await this.accountRepo.find({ order: { id: 'DESC' } });
    return accounts.map((item) => this.toAccountVo(item));
  }

  async createAccount(payload: CreateAccountDto) {
    const account = this.accountRepo.create({
      platform: payload.platform,
      accountName: payload.accountName.trim(),
      status: payload.status ?? 1,
      remark: payload.remark ?? null,
      credentialsEncrypted: payload.credentials ? encryptSecret(payload.credentials) : null
    });
    try {
      const saved = await this.accountRepo.save(account);
      // repo.save 返回完整实体（含密文列），响应面必须收口到 VO 白名单
      return this.toAccountVo(saved);
    } catch (error) {
      throw this.mapUniqueConflict(error, '同名账号已存在于该平台');
    }
  }

  async updateAccount(id: number, payload: UpdateAccountDto) {
    const account = await this.accountRepo.findOne({ where: { id } });
    if (!account) {
      throw new NotFoundException('账号不存在');
    }
    if (payload.platform !== undefined) {
      account.platform = payload.platform;
    }
    if (payload.accountName !== undefined) {
      account.accountName = payload.accountName.trim();
    }
    if (payload.status !== undefined) {
      account.status = payload.status;
    }
    if (payload.remark !== undefined) {
      account.remark = payload.remark;
    }
    // credentials 不传/传空串 = 不修改；仅传非空串才重加密覆盖
    if (payload.credentials) {
      account.credentialsEncrypted = encryptSecret(payload.credentials);
    }
    try {
      const saved = await this.accountRepo.save(account);
      return this.toAccountVo(saved);
    } catch (error) {
      throw this.mapUniqueConflict(error, '同名账号已存在于该平台');
    }
  }

  async removeAccount(id: number) {
    const account = await this.accountRepo.findOne({ where: { id } });
    if (!account) {
      throw new NotFoundException('账号不存在');
    }
    const usedCount = await this.recordRepo.count({ where: { accountId: id } });
    if (usedCount > 0) {
      throw new BadRequestException('该账号已被发布记录引用，建议停用');
    }
    await this.accountRepo.delete({ id });
    return true;
  }

  async createRecord(payload: CreateRecordDto) {
    const project = await this.projectRepo.findOne({ where: { id: payload.projectId } });
    if (!project) {
      throw new NotFoundException('项目不存在');
    }
    if (payload.accountId) {
      const account = await this.accountRepo.findOne({ where: { id: payload.accountId } });
      if (!account || account.status !== 1) {
        throw new BadRequestException('发布账号不存在或已停用');
      }
    }
    const channel = this.channelRegistry.getChannel(payload.platform);
    if (!channel) {
      throw new BadRequestException('该平台暂无发布通道');
    }
    const result = await channel.publish({
      platform: payload.platform as PublisherPlatform,
      title: payload.title,
      receiptUrl: payload.receiptUrl,
      publishedAt: new Date(payload.publishedAt),
      note: payload.note
    });
    return this.recordRepo.save(
      this.recordRepo.create({
        novelProjectId: payload.projectId,
        platform: payload.platform,
        accountId: payload.accountId ?? null,
        title: payload.title ?? null,
        status: result.status,
        publishedAt: result.publishedAt,
        receiptUrl: result.receiptUrl ?? null,
        note: payload.note ?? null
      })
    );
  }

  async listRecords(query: QueryRecordsDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const qb = this.recordRepo
      .createQueryBuilder('record')
      .leftJoin(NovelProject, 'project', 'project.id = record.novelProjectId')
      .leftJoin(PublisherAccount, 'account', 'account.id = record.accountId')
      .addSelect('project.name', 'projectName')
      .addSelect('account.accountName', 'accountName');
    if (query.projectId !== undefined) {
      qb.andWhere('record.novelProjectId = :projectId', { projectId: query.projectId });
      // 注意：QueryBuilder 条件用实体属性名（TypeORM 映射到列），写 DB 列名在 sqlite 下直接 no such column
    }
    qb.orderBy('record.publishedAt', 'DESC').skip((page - 1) * pageSize).take(pageSize);
    const { entities, raw } = await qb.getRawAndEntities();
    const items = entities.map((entity, index) => ({
      ...entity,
      projectName: raw[index]?.projectName ?? null,
      accountName: raw[index]?.accountName ?? null
    }));
    const total = await this.recordRepo.count(
      query.projectId !== undefined ? { where: { novelProjectId: query.projectId } } : {}
    );
    return { items, total, page, pageSize };
  }

  async removeRecord(id: number) {
    const record = await this.recordRepo.findOne({ where: { id } });
    if (!record) {
      throw new NotFoundException('发布记录不存在');
    }
    await this.recordRepo.delete({ id });
    return true;
  }

  // 账号 VO 白名单映射：仅 id/platform/accountName/credentialMask/status/remark，
  // create/update/list 全部出口统一走它，杜绝 repo.save 完整实体（含密文列）直传响应。
  private toAccountVo(entity: PublisherAccount) {
    return {
      id: entity.id,
      platform: entity.platform,
      accountName: entity.accountName,
      credentialMask: this.buildCredentialMask(entity.credentialsEncrypted),
      status: entity.status,
      remark: entity.remark ?? null
    };
  }

  private buildCredentialMask(encrypted?: string | null): string | null {
    if (!encrypted || !isEncryptionConfigured()) {
      return null;
    }
    try {
      return maskSecret(decryptSecret(encrypted));
    } catch {
      // 密钥轮换/密文损坏等解密失败兜底：掩码降级为 null，不中断列表
      return null;
    }
  }

  // 唯一索引冲突转客户端错误：顺序重复与 Promise.all 并发两条路径都被该 catch 兜住
  // （sqlite 报 UNIQUE constraint failed，mysql 报 Duplicate entry / ER_DUP_ENTRY，宽匹配跨库兼容）。
  // Nest 语义 400 经全局异常过滤器统一映射为 422（http-exception.filter.ts 项目约定）。
  private mapUniqueConflict(error: unknown, message: string): unknown {
    const text = error instanceof Error ? error.message : String(error);
    if (error instanceof QueryFailedError && /UNIQUE|Duplicate|ER_DUP_ENTRY/i.test(text)) {
      return new BadRequestException(message);
    }
    return error;
  }
}
