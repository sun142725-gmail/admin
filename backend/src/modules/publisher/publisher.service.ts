// 发布矩阵服务：平台账号管理（凭据加密落库）、发布记录登记（manual 通道）与数据回流指标导入。
// 安全红线：凭据仅加密落库，任何响应出口统一走 toAccountVo 白名单，密文与明文永不回传。
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryFailedError, Repository } from 'typeorm';
import { PublisherAccount } from '../../common/entities/publisher-account.entity';
import { VideoPublishRecord } from '../../common/entities/video-publish-record.entity';
import { VideoPlatformMetric } from '../../common/entities/video-platform-metric.entity';
import { NovelProject } from '../../common/entities/novel-project.entity';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { CreateRecordDto } from './dto/create-record.dto';
import { QueryRecordsDto } from './dto/query-records.dto';
import { QueryMetricsDto } from './dto/query-metrics.dto';
import { PublisherChannelRegistry } from './publisher-channel.registry';
import { PUBLISHER_PLATFORMS, PublisherPlatform } from './publisher.types';
import { parseCsvContent } from './metrics/csv-parse.util';
import { decryptSecret, encryptSecret, isEncryptionConfigured, maskSecret } from '../ai/core/crypto.util';

// 导入协议表头：模板下载与导入校验共用单一来源（顺序敏感，与模板文件一致）
const METRIC_TEMPLATE_HEADER = [
  'project_id',
  'platform',
  'date',
  'video_id',
  'views',
  'likes',
  'comments',
  'follows',
  'remark'
] as const;

// int 列上限：超出在 MySQL 严格模式 1406 → 500，导入层前置设防记 rejected
const MAX_INT32 = 2147483647;

@Injectable()
export class PublisherService {
  private readonly logger = new Logger(PublisherService.name);

  constructor(
    @InjectRepository(PublisherAccount)
    private readonly accountRepo: Repository<PublisherAccount>,
    @InjectRepository(VideoPublishRecord)
    private readonly recordRepo: Repository<VideoPublishRecord>,
    @InjectRepository(VideoPlatformMetric)
    private readonly metricRepo: Repository<VideoPlatformMetric>,
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

  // ---- 数据回流指标（CSV 导入 / 模板下载 / 明细查询）----

  // 模板 CSV：带 BOM（Excel 直开不乱码，与前端 utils/csv.ts 导出口径一致）+ 一行合法示例
  buildTemplateCsv(): string {
    const sample = ['1', 'douyin', '2026-11-01', 'video-001', '12000', '800', '120', '30', '示例备注'].join(',');
    return `\uFEFF${METRIC_TEMPLATE_HEADER.join(',')}\r\n${sample}`;
  }

  async importMetrics(file?: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('请上传 CSV 文件');
    }
    const parsed = parseCsvContent(file.buffer.toString('utf8'));
    const headerMatches =
      parsed.header.length === METRIC_TEMPLATE_HEADER.length &&
      METRIC_TEMPLATE_HEADER.every((name, index) => parsed.header[index] === name);
    if (!headerMatches) {
      throw new BadRequestException('CSV 表头与模板不一致，请先下载模板后按模板列顺序填写');
    }

    // 账面恒平：received = inserted + updated + rejected.length，每行恰好落一个桶
    const rejected: Array<{ line: number; reason: string }> = [...parsed.errors];
    const received = parsed.rows.length + parsed.errors.length;

    // 行级校验（长度上限前置设防：sqlite varchar 限长不生效、MySQL 严格模式 1406 → 500）
    interface ValidMetricRow {
      line: number;
      projectId: number;
      platform: string;
      date: string;
      videoId: string;
      views: number;
      likes: number;
      comments: number;
      follows: number;
      remark: string | null;
    }
    const validRows: ValidMetricRow[] = [];
    for (const row of parsed.rows) {
      const cells = row.cells;
      const projectIdRaw = (cells[0] ?? '').trim();
      if (!/^\d+$/.test(projectIdRaw)) {
        rejected.push({ line: row.line, reason: 'project_id 必须为非负整数' });
        continue;
      }
      const projectId = Number(projectIdRaw);
      const platform = (cells[1] ?? '').trim();
      if (!(PUBLISHER_PLATFORMS as readonly string[]).includes(platform)) {
        rejected.push({ line: row.line, reason: `platform 须为：${PUBLISHER_PLATFORMS.join('/')}` });
        continue;
      }
      const date = (cells[2] ?? '').trim();
      if (!PublisherService.isValidDate(date)) {
        rejected.push({ line: row.line, reason: 'date 必须为合法日期（YYYY-MM-DD，如 2026-02-30 非法）' });
        continue;
      }
      // video_id 允许空串占位（按日整作汇总无单视频维度）；有值时 ≤128
      const videoId = (cells[3] ?? '').trim();
      if (videoId.length > 128) {
        rejected.push({ line: row.line, reason: 'video_id 最长 128 字符' });
        continue;
      }
      const metricLabels = ['views', 'likes', 'comments', 'follows'] as const;
      const metricValues: number[] = [];
      let metricInvalid = false;
      for (let i = 0; i < metricLabels.length; i += 1) {
        const raw = (cells[4 + i] ?? '').trim();
        const value = Number(raw);
        if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value > MAX_INT32) {
          rejected.push({ line: row.line, reason: `${metricLabels[i]} 必须为非负整数（≤ ${MAX_INT32}）` });
          metricInvalid = true;
          break;
        }
        metricValues.push(value);
      }
      if (metricInvalid) {
        continue;
      }
      const remark = (cells[8] ?? '').trim();
      if (remark.length > 255) {
        rejected.push({ line: row.line, reason: 'remark 最长 255 字符' });
        continue;
      }
      validRows.push({
        line: row.line,
        projectId,
        platform,
        date,
        videoId,
        views: metricValues[0],
        likes: metricValues[1],
        comments: metricValues[2],
        follows: metricValues[3],
        remark: remark || null
      });
    }

    // 项目存在性批量校验（照 createRecord 单查语义收敛为一次 In 查询）
    const projectIds = [...new Set(validRows.map((row) => row.projectId))];
    const existingProjects = projectIds.length
      ? await this.projectRepo.find({ where: { id: In(projectIds) } })
      : [];
    const existingIds = new Set(existingProjects.map((project) => project.id));
    const upsertRows = validRows.filter((row) => {
      if (!existingIds.has(row.projectId)) {
        rejected.push({ line: row.line, reason: '项目不存在' });
        return false;
      }
      return true;
    });

    // 串行逐行 upsert：每行独立 try/catch（不整批事务），任何行失败都收敛进 rejected 不中断整批
    let inserted = 0;
    let updated = 0;
    for (const row of upsertRows) {
      const metricDate = new Date(`${row.date}T00:00:00.000Z`);
      const uniqueWhere = {
        novelProjectId: row.projectId,
        platform: row.platform,
        metricDate,
        videoId: row.videoId
      };
      const values = {
        views: row.views,
        likes: row.likes,
        comments: row.comments,
        follows: row.follows,
        remark: row.remark
      };
      try {
        const existing = await this.metricRepo.findOne({ where: uniqueWhere });
        if (!existing) {
          await this.metricRepo.save(this.metricRepo.create({ ...uniqueWhere, ...values }));
          inserted += 1;
        } else {
          // 同键覆盖：逐字段更新（幂等语义——同作品同平台同日期覆盖不重复插入）
          existing.views = values.views;
          existing.likes = values.likes;
          existing.comments = values.comments;
          existing.follows = values.follows;
          existing.remark = values.remark;
          await this.metricRepo.save(existing);
          updated += 1;
        }
      } catch (error) {
        // check-then-insert 竞态（并发导入同键）命中唯一索引 → 按唯一键 update 重试一次
        const isUniqueConflict = error instanceof QueryFailedError && /UNIQUE|Duplicate|ER_DUP_ENTRY/i.test(error.message);
        if (isUniqueConflict) {
          try {
            const result = await this.metricRepo.update(uniqueWhere, values);
            if (result.affected) {
              updated += 1;
            } else {
              // affected=0：重试窗口内行又被删（当前无删除入口，防御性兜底转插入）
              await this.metricRepo.save(this.metricRepo.create({ ...uniqueWhere, ...values }));
              inserted += 1;
            }
          } catch (retryError) {
            // 错误原文（含表名/驱动细节）只落服务端日志；前端 rejected 仅回固定文案，不外泄底层细节
            this.logger.error(
              `指标导入第 ${row.line} 行唯一冲突重试仍失败：${PublisherService.summarizeError(retryError)}`
            );
            rejected.push({ line: row.line, reason: '数据库写入失败，请联系管理员' });
          }
        } else {
          this.logger.error(`指标导入第 ${row.line} 行写入失败：${PublisherService.summarizeError(error)}`);
          rejected.push({ line: row.line, reason: '数据库写入失败，请联系管理员' });
        }
      }
    }

    return { received, inserted, updated, rejected };
  }

  // 明细查询：join novel_projects 取作品名；from/to 均转对应日期 UTC 零点（to 含当天：fromZero <= metricDate <= toZero）；
  // 不分页——前端聚合汇总卡需要全量明细（v1 口径，量级 = 作品×平台×天数）
  async listMetrics(query: QueryMetricsDto) {
    const qb = this.metricRepo
      .createQueryBuilder('metric')
      .leftJoin(NovelProject, 'project', 'project.id = metric.novelProjectId')
      .addSelect('project.name', 'projectName');
    if (query.projectId !== undefined) {
      // QueryBuilder 条件用实体属性名（TypeORM 映射到列），写 DB 列名在 sqlite 下直接 no such column
      qb.andWhere('metric.novelProjectId = :projectId', { projectId: query.projectId });
    }
    if (query.platform !== undefined) {
      qb.andWhere('metric.platform = :platform', { platform: query.platform });
    }
    if (query.from !== undefined) {
      qb.andWhere('metric.metricDate >= :from', { from: new Date(`${query.from}T00:00:00.000Z`) });
    }
    if (query.to !== undefined) {
      qb.andWhere('metric.metricDate <= :to', { to: new Date(`${query.to}T00:00:00.000Z`) });
    }
    qb.orderBy('metric.metricDate', 'ASC');
    const { entities, raw } = await qb.getRawAndEntities();
    return entities.map((entity, index) => ({
      ...entity,
      projectName: raw[index]?.projectName ?? null
    }));
  }

  // YYYY-MM-DD 合法性（含真实日历：2026-02-30 判非法）
  private static isValidDate(value: string): boolean {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) {
      return false;
    }
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1) {
      return false;
    }
    return day <= new Date(Date.UTC(year, month, 0)).getUTCDate();
  }

  private static summarizeError(error: unknown): string {
    const text = error instanceof Error ? error.message : String(error);
    return text.length > 120 ? `${text.slice(0, 120)}…` : text;
  }
}
