// AI 生图 DTO。
import { ArrayMaxSize, IsArray, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

/** 图生图参考图 data URL 形态：仅放行 png/jpeg/jpg/webp 四种位图 MIME（gif/动图/任意类型不收）。
 *  与适配器 imageEdits 的宽松解析（openai-compatible.adapter.ts imageEdits 的 ^data:([^;]+);base64,(.*)$）
 *  是两层校验：DTO 层白名单拦截在入口，适配器只兜最终格式解析；slice(0,4) 截断语义与 DTO
 *  ArrayMaxSize(4) 对齐（正常流 DTO 已拦，适配器截断为纵深兜底）。 */
export const REFERENCE_DATA_URL_PATTERN = /^data:image\/(png|jpe?g|webp);base64,/;

/** 参考图 data URL 合法性纯函数（与 REFERENCE_DATA_URL_PATTERN 同口径，供单测与服务层复用）。 */
export const isValidReferenceDataUrl = (value: unknown): boolean =>
  typeof value === 'string' && REFERENCE_DATA_URL_PATTERN.test(value);

export class GenerateImageDto {
  @IsOptional()
  @IsInt()
  modelId?: number;

  @IsString()
  @MinLength(1)
  @MaxLength(2000)
  prompt!: string;

  @IsOptional()
  @IsIn(['1024x1024', '512x512', '1792x1024', '1024x1792'])
  size?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  count?: number;

  // 图生图参考图（data URL 数组，最多 4 张）：有值时适配器自动切 images/edits 通道。
  // 单张长度不设上限：大参考图（多 MB base64）是合法输入，由 main.ts 的 10MB JSON body 上限兜底。
  // DTO 层「报错 422」而非截断：前端 Upload 已 maxCount=4 + 类型校验，正常流不会触发；
  // 超限/非法格式在此明确失败比静默截断更可预期（与适配器 slice(0,4) 截断为纵深兜底，两层不冲突）。
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @IsString({ each: true })
  @Matches(REFERENCE_DATA_URL_PATTERN, {
    each: true,
    message: '参考图必须是 data:image/png|jpeg|jpg|webp;base64, 格式'
  })
  referenceImages?: string[];
}
