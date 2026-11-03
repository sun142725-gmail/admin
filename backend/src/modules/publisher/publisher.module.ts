// 发布矩阵模块：平台账号 + 发布记录 + 数据回流指标 + manual 通道（未来平台 API 通道在此扩展 providers）。
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PublisherAccount } from '../../common/entities/publisher-account.entity';
import { VideoPublishRecord } from '../../common/entities/video-publish-record.entity';
import { VideoPlatformMetric } from '../../common/entities/video-platform-metric.entity';
import { NovelProject } from '../../common/entities/novel-project.entity';
import { PublisherController } from './publisher.controller';
import { PublisherService } from './publisher.service';
import { ManualPublisherChannel } from './channels/manual-publisher.channel';
import { PublisherChannelRegistry } from './publisher-channel.registry';

@Module({
  imports: [TypeOrmModule.forFeature([PublisherAccount, VideoPublishRecord, VideoPlatformMetric, NovelProject])],
  controllers: [PublisherController],
  providers: [PublisherService, ManualPublisherChannel, PublisherChannelRegistry]
})
export class PublisherModule {}
