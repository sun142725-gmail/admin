// 任务流 DTO：流程 CRUD 与运行触发参数。
import { Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsObject, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

export class CreateFlowDto {
  @IsString()
  @MaxLength(64)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  icon?: string;
}

export class UpdateFlowDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(16)
  icon?: string;

  // 画布结构（React Flow 序列化），变更时版本 +1。
  @IsOptional()
  @IsObject()
  dag?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @IsOptional()
  @IsIn([0, 1])
  status?: number;
}

export class StartRunDto {
  // 开始节点入参 { 变量名: 值 }。
  @IsOptional()
  @IsObject()
  inputs?: Record<string, unknown>;
}

export class SingleRunDto {
  @IsInt()
  flowId!: number;

  @IsString()
  @MaxLength(64)
  nodeId!: string;

  // mock 上下文 { 节点ID: 输出对象 }，前端可用上次运行产物预填。
  @IsOptional()
  @IsObject()
  mockContext?: Record<string, unknown>;
}

export class StartVariableDto {
  @IsString()
  @MaxLength(64)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  label?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  defaultValue?: string;

  @IsOptional()
  @IsIn([0, 1])
  required?: number;
}

export class FlowVariableConfigDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => StartVariableDto)
  variables!: StartVariableDto[];
}
