// 创建待办 DTO 校验标题、执行人和截止日期。
import { IsInt, IsString, Length, Matches } from 'class-validator';

export class CreateTodoDto {
  @IsString()
  @Length(1, 50)
  title!: string;

  @IsInt()
  assigneeId!: number;

  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueDate!: string;
}
