// 手动补抓触发 DTO：symbols 可选≤50（缺省=全宇宙），full 可选默认 false。
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, Matches } from 'class-validator';

export class TriggerBarsDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @Matches(/^(sh|sz)\d{6}$/, {
    each: true,
    message: 'symbols 每项必须为半角归一化代码（如 sh600519）'
  })
  symbols?: string[];

  // full=true：单标的全量重抓（先抓成功后删+事务，根数=max(initBars, 现存 barCount) 且 ≤1000）
  @IsOptional()
  @IsBoolean()
  full?: boolean;
}
