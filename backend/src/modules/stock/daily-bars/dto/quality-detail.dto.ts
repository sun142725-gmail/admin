// 数据质量明细查询 DTO：逗号分隔代码清单（1~20 个，逐个半角 ^(sh|sz)\d{6}$）。
import { IsString, Matches } from 'class-validator';

export class QualityDetailDto {
  // 校验原始串（服务层再 split/trim）；正则一律半角（全角逗号/全角数字/大写均 422）
  @IsString()
  @Matches(/^((sh|sz)\d{6})(,(sh|sz)\d{6}){0,19}$/, {
    message: 'symbols 必须为 1~20 个逗号分隔的半角代码（如 sh600519,sz300750）'
  })
  symbols!: string;
}
