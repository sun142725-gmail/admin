// 发布公告 DTO 校验标题与正文长度。
import { IsString, Length } from 'class-validator';

export class CreateAnnouncementDto {
  @IsString()
  @Length(1, 30)
  title!: string;

  @IsString()
  @Length(1, 500)
  content!: string;
}
