// 发起圆桌会议入参。
import { IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateRoundtableDto {
  /** 分析对象类型：market 大盘 / index 指数 / sector 板块 / stock 个股。 */
  @IsIn(['market', 'index', 'sector', 'stock'])
  subjectType!: string;

  /** 对象代码：sh600519 / sh000001 / BK0475（东财板块）/ new_xxx（新浪板块）；大盘可空。 */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  symbol?: string;

  /** 用户附加关注的问题。 */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  question?: string;

  /** 会议模式：quick 独立+总结 / standard 独立+1轮辩论（默认）/ deep 独立+2轮辩论。 */
  @IsOptional()
  @IsIn(['quick', 'standard', 'deep'])
  mode?: string;

  /** 指定模型行 id（空 = 自动：智能体绑定模型 > 任意 chat 渠道）。 */
  @IsOptional()
  @IsInt()
  modelId?: number;
}
