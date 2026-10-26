// 自选股服务：用户收藏清单的增删查（每人上限 100 只）。
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StockWatchlist } from '../../common/entities/stock-watchlist.entity';
import { WatchlistAddDto } from './dto/watchlist.dto';

// 单用户自选上限：足够个人研究使用，也防止无限膨胀
const MAX_WATCHLIST_SIZE = 100;

@Injectable()
export class WatchlistService {
  constructor(
    @InjectRepository(StockWatchlist)
    private readonly watchRepo: Repository<StockWatchlist>
  ) {}

  async list(userId: number): Promise<StockWatchlist[]> {
    return this.watchRepo.find({ where: { userId }, order: { id: 'DESC' } });
  }

  async add(userId: number, dto: WatchlistAddDto): Promise<StockWatchlist> {
    const existing = await this.watchRepo.findOne({ where: { userId, symbol: dto.symbol } });
    if (existing) {
      // 幂等：重复收藏直接返回已有记录（前端星标切换由 delete 负责）
      return existing;
    }
    const count = await this.watchRepo.count({ where: { userId } });
    if (count >= MAX_WATCHLIST_SIZE) {
      throw new BadRequestException(`自选股最多 ${MAX_WATCHLIST_SIZE} 只，请先移除部分股票`);
    }
    const created = await this.watchRepo.save(
      this.watchRepo.create({ userId, symbol: dto.symbol, name: dto.name.trim(), note: dto.note })
    );
    return created;
  }

  async remove(userId: number, symbol: string): Promise<{ success: boolean }> {
    const existing = await this.watchRepo.findOne({ where: { userId, symbol } });
    if (!existing) {
      throw new NotFoundException('该股票不在自选中');
    }
    await this.watchRepo.delete({ id: existing.id });
    return { success: true };
  }
}
