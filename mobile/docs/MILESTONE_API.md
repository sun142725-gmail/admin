# 家庭大事纪 - 后端 API 接口规范

> 版本：v1.0  
> 日期：2026-08-08  
> Base URL：`/api`  
> 认证方式：`Authorization: Bearer <accessToken>`  
> 统一响应格式：`{ code: number, message: string, data: T }`  
> HTTP 状态码：200 成功 / 400 参数错误 / 401 未认证 / 403 无权限 / 404 不存在 / 500 服务错误  
> 关联文档：[API_SPEC.md](./API_SPEC.md) | [MILESTONE_DEV.md](./MILESTONE_DEV.md)

---

## 统一说明

### 响应格式

沿用现有规范：

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

| code | 说明 |
|------|------|
| 0 | 成功 |
| 40001 | 参数校验失败 |
| 40101 | 未登录或 token 过期 |
| 40301 | 无权限 |
| 40401 | 资源不存在 |
| 40901 | 冲突 |
| 50000 | 服务器错误 |

### 新增错误码

| code | 说明 |
|------|------|
| 40302 | 无权修改核心标记（个人事件仅本人，家庭事件仅房主） |
| 40303 | 无权编辑/删除他人个人事件 |

---

## 一、数据模型

### 1.1 FamilyMilestone（大事纪事件）

```typescript
interface FamilyMilestone {
  id: string                  // 唯一事件 ID（UUID）
  familyId: string            // 所属家庭 ID
  type: 'personal' | 'family' // 事件类型：personal 个人 / family 家庭
  title: string               // 事件标题（1-50 字符）
  happenDate: string          // 发生时间 YYYY-MM-DD 或 YYYY-MM（支持模糊日期）
  desc: string                // 事件详情（选填，最多 500 字符）
  isCore: boolean             // 是否核心高光事件（纳入碑文汇总）
  creatorId: string           // 创建人用户 ID
  creatorName: string         // 创建人昵称（冗余字段，避免连表查询）
  relatedMemberIds: string[]  // 关联家庭成员 ID 数组
  imageList: string[]         // 配图 URL 数组（最多 3 张）
  createdAt: string           // 创建时间 ISO 8601
  updatedAt: string           // 更新时间 ISO 8601
}
```

### 1.2 数据库 Schema（NestJS / TypeORM）

```typescript
import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index
} from 'typeorm'

@Entity('family_milestones')
export class FamilyMilestoneEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column({ name: 'family_id', type: 'uuid' })
  @Index()
  familyId: string

  @Column({ type: 'varchar', length: 20 })
  type: 'personal' | 'family'

  @Column({ type: 'varchar', length: 50 })
  title: string

  @Column({ name: 'happen_date', type: 'varchar', length: 10 })
  @Index()
  happenDate: string                    // YYYY-MM-DD 或 YYYY-MM

  @Column({ type: 'varchar', length: 500, default: '' })
  desc: string

  @Column({ name: 'is_core', type: 'boolean', default: false })
  @Index()
  isCore: boolean

  @Column({ name: 'creator_id', type: 'uuid' })
  @Index()
  creatorId: string

  @Column({ name: 'creator_name', type: 'varchar', length: 50 })
  creatorName: string

  @Column({ name: 'related_member_ids', type: 'json', default: [] })
  relatedMemberIds: string[]

  @Column({ name: 'image_list', type: 'json', default: [] })
  imageList: string[]

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date
}
```

**索引说明：**

| 索引 | 字段 | 用途 |
|------|------|------|
| idx_family_id | family_id | 按家庭查询 |
| idx_family_type | (family_id, type) | 按家庭+类型查询列表 |
| idx_family_core | (family_id, type, is_core) | 碑文汇总查询 |
| idx_happen_date | happen_date | 时间排序 |
| idx_creator_id | creator_id | 按创建人查询 |

### 1.3 复合索引建议

```sql
-- 列表查询：按家庭 + 类型过滤，按时间倒序
CREATE INDEX idx_milestone_list ON family_milestones (family_id, type, happen_date DESC);

-- 碑文汇总：按家庭 + 类型 + 核心标记过滤，按时间正序
CREATE INDEX idx_milestone_summary ON family_milestones (family_id, type, is_core, happen_date ASC);
```

---

## 二、接口总览

| 序号 | 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|------|
| 1 | GET | `/api/family/:familyId/milestones` | 大事纪列表 | 家庭成员 |
| 2 | GET | `/api/family/:familyId/milestones/:milestoneId` | 大事纪详情 | 家庭成员 |
| 3 | POST | `/api/family/:familyId/milestones` | 创建大事纪 | 家庭成员 |
| 4 | PUT | `/api/family/:familyId/milestones/:milestoneId` | 更新大事纪 | 创建人/房主 |
| 5 | DELETE | `/api/family/:familyId/milestones/:milestoneId` | 删除大事纪 | 创建人/房主 |
| 6 | PATCH | `/api/family/:familyId/milestones/:milestoneId/core` | 切换核心标记 | 按规则 |
| 7 | GET | `/api/family/:familyId/milestones/summary` | 碑文汇总 | 家庭成员 |

---

## 三、接口详情

### 3.1 获取大事纪列表

```
GET /api/family/:familyId/milestones
```

**Query 参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | string | 是 | `personal` / `family` |
| isCore | boolean | 否 | 筛选核心事件，不传返回全部 |
| page | number | 否 | 默认 1 |
| pageSize | number | 否 | 默认 50（大事纪通常数据量不大，默认较大） |

**Response：**

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "list": [
      {
        "id": "uuid",
        "familyId": "uuid",
        "type": "personal",
        "title": "年薪突破80W",
        "happenDate": "2025-10-01",
        "desc": "达成阶段性职业目标",
        "isCore": true,
        "creatorId": "uuid",
        "creatorName": "张三",
        "relatedMemberIds": ["uuid"],
        "imageList": ["https://..."],
        "createdAt": "2025-10-01T12:00:00.000Z",
        "updatedAt": "2025-10-01T12:00:00.000Z"
      }
    ],
    "total": 10,
    "page": 1,
    "pageSize": 50
  }
}
```

**排序规则：** `happenDate DESC`（最新事件在前）

**权限：** 家庭成员可访问。

**说明：**
- `type=personal` 时返回当前家庭内所有成员的个人大事纪（同家庭成员只读可见）
- `type=family` 时返回家庭大事纪

---

### 3.2 获取大事纪详情

```
GET /api/family/:familyId/milestones/:milestoneId
```

**Response：** 同列表项结构。

**权限：** 家庭成员可访问。

---

### 3.3 创建大事纪

```
POST /api/family/:familyId/milestones
```

**Request：**

```json
{
  "type": "personal",            // 必填，personal / family
  "title": "年薪突破80W",         // 必填，1-50 字符
  "happenDate": "2025-10-01",    // 必填，YYYY-MM-DD 或 YYYY-MM
  "desc": "达成阶段性职业目标",    // 选填，最多 500 字符
  "isCore": false,               // 可选，默认 false
  "relatedMemberIds": ["uuid"],  // 可选，家庭事件可关联成员
  "imageList": ["https://..."]   // 可选，最多 3 张
}
```

**Response：**

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "uuid",
    "familyId": "uuid",
    "type": "personal",
    "title": "年薪突破80W",
    "happenDate": "2025-10-01",
    "desc": "达成阶段性职业目标",
    "isCore": false,
    "creatorId": "uuid",
    "creatorName": "张三",
    "relatedMemberIds": ["uuid"],
    "imageList": ["https://..."],
    "createdAt": "2025-10-01T12:00:00.000Z",
    "updatedAt": "2025-10-01T12:00:00.000Z"
  }
}
```

**校验规则：**

| 字段 | 校验 |
|------|------|
| type | 必填，枚举值 `personal` / `family` |
| title | 必填，1-50 字符，trim 后非空 |
| happenDate | 必填，格式 YYYY-MM-DD 或 YYYY-MM，不晚于当天 |
| desc | 选填，最多 500 字符 |
| isCore | 默认 false |
| relatedMemberIds | 选填，数组，每个元素须为当前家庭成员 ID |
| imageList | 选填，数组，最多 3 个元素 |

**权限：** 家庭成员可创建。

**业务逻辑：**
- `creatorId` 从 JWT token 中获取，不由前端传入
- `creatorName` 从用户信息中获取并冗余存储
- `type=personal` 时，`relatedMemberIds` 自动设为 `[creatorId]`（个人事件仅关联自己）
- `type=family` 时，`relatedMemberIds` 使用前端传入值，默认为 `[creatorId]`
- 若 `isCore=true`，需校验核心标记权限（见 3.6 权限规则）
- `imageList` 中的 URL 须为已上传文件返回的合法 URL

---

### 3.4 更新大事纪

```
PUT /api/family/:familyId/milestones/:milestoneId
```

**Request：**

```json
{
  "title": "年薪突破100W",          // 可选
  "happenDate": "2025-12-01",      // 可选
  "desc": "更新描述",               // 可选
  "isCore": true,                  // 可选
  "relatedMemberIds": ["uuid"],    // 可选
  "imageList": ["https://..."]     // 可选
}
```

**Response：** 更新后的完整事件对象。

**权限校验：**

| 事件类型 | 可编辑字段 | 可操作人 |
|---------|-----------|---------|
| personal | 全部字段 | 仅 `creatorId === 当前用户` |
| family | 全部字段 | `creatorId === 当前用户` 或房主 |

**校验规则：**
- `type` 不可修改（创建后事件归属不可变更）
- 各字段校验同创建接口
- 若请求中包含 `isCore` 且与当前值不同，需额外校验核心标记权限

**错误码：**

| code | 说明 |
|------|------|
| 40301 | 无权编辑该事件 |
| 40302 | 无权修改核心标记 |
| 40401 | 事件不存在 |

---

### 3.5 删除大事纪

```
DELETE /api/family/:familyId/milestones/:milestoneId
```

**Response：**

```json
{
  "code": 0,
  "message": "success",
  "data": null
}
```

**权限校验：**

| 事件类型 | 可删除人 |
|---------|---------|
| personal | 仅 `creatorId === 当前用户` |
| family | `creatorId === 当前用户` 或房主 |

**错误码：**

| code | 说明 |
|------|------|
| 40301 | 无权删除该事件 |
| 40401 | 事件不存在 |

---

### 3.6 切换核心高光标记

```
PATCH /api/family/:familyId/milestones/:milestoneId/core
```

**Request：**

```json
{
  "isCore": true       // 目标状态，true=纳入碑文 / false=移出碑文
}
```

**Response：**

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "id": "uuid",
    "isCore": true,
    "updatedAt": "2025-10-01T12:00:00.000Z"
  }
}
```

**权限校验（核心）：**

| 事件类型 | 可操作人 | 说明 |
|---------|---------|------|
| personal | 仅 `creatorId === 当前用户` | 个人事件核心标记仅本人可切换 |
| family | 仅房主（`family.ownerId === 当前用户`） | 家庭事件核心标记仅房主可切换 |

**错误码：**

| code | 说明 |
|------|------|
| 40301 | 无权限 |
| 40302 | 无权修改核心标记（个人事件仅本人，家庭事件仅房主） |
| 40401 | 事件不存在 |

---

### 3.7 获取碑文汇总

```
GET /api/family/:familyId/milestones/summary?type=personal
```

**Query 参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | string | 是 | `personal` / `family` |

**Response：**

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "type": "personal",
    "title": "个人纪事碑文",
    "list": [
      {
        "id": "uuid",
        "happenDate": "2020-07-15",
        "title": "正式入职互联网行业",
        "desc": "开启职业新征程"
      },
      {
        "id": "uuid",
        "happenDate": "2023-03-20",
        "title": "考取高级专业证书",
        "desc": "职业能力进阶"
      },
      {
        "id": "uuid",
        "happenDate": "2025-10-01",
        "title": "年薪突破80W",
        "desc": "达成阶段性职业目标"
      }
    ]
  }
}
```

**查询规则：**
- 筛选条件：`familyId` + `type` + `isCore = true`
- 排序：`happenDate ASC`（从早到晚，符合履历阅读习惯）
- 返回字段精简：仅返回 `id`、`happenDate`、`title`、`desc`（不需要 `imageList`、`creatorId` 等字段）

**权限：** 家庭成员可访问。

**说明：**
- `type=personal` 时，返回的是当前家庭内所有成员的个人核心事件汇总
- 如需仅看自己的个人碑文，前端可在后续迭代中增加 `creatorId` 筛选参数
- `title` 字段根据 type 返回「个人纪事碑文」或「家庭纪事碑文」

---

## 四、权限控制规则

### 4.1 权限矩阵

| 操作 | 个人事件 | 家庭事件 |
|------|---------|---------|
| 查看列表 | 同家庭成员只读 | 所有家庭成员 |
| 查看详情 | 同家庭成员只读 | 所有家庭成员 |
| 查看碑文 | 同家庭成员只读 | 所有家庭成员 |
| 创建 | 仅本人创建自己的 | 所有家庭成员 |
| 编辑 | 仅创建人 | 创建人 + 房主 |
| 删除 | 仅创建人 | 创建人 + 房主 |
| 切换核心标记 | 仅创建人 | 仅房主 |

### 4.2 后端权限校验中间件

```typescript
// NestJS Guard 示例

@Injectable()
export class MilestonePermissionGuard implements CanActivate {
  constructor(private readonly familyMemberService: FamilyMemberService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest()
    const user = req.user                    // JWT 解析后的用户
    const { familyId, milestoneId } = req.params
    const method = req.method

    // 1. 验证用户是否为家庭成员
    const membership = await this.familyMemberService.findByFamilyAndUser(
      familyId,
      user.id
    )
    if (!membership) {
      throw new ForbiddenException('非家庭成员，无权访问')
    }

    // 2. 获取事件（如果操作的是具体事件）
    if (milestoneId) {
      const milestone = await this.milestoneService.findById(milestoneId)
      if (!milestone) {
        throw new NotFoundException('事件不存在')
      }
      if (milestone.familyId !== familyId) {
        throw new NotFoundException('事件不存在')
      }

      const isOwner = membership.role === 'owner'
      const isCreator = milestone.creatorId === user.id

      // 编辑/删除权限
      if (method === 'PUT' || method === 'DELETE') {
        if (milestone.type === 'personal' && !isCreator) {
          throw new ForbiddenException({
            code: 40303,
            message: '无权编辑/删除他人个人事件'
          })
        }
        if (milestone.type === 'family' && !isCreator && !isOwner) {
          throw new ForbiddenException({
            code: 40301,
            message: '无权编辑/删除该家庭事件'
          })
        }
      }

      // 核心标记切换权限
      if (req.path.endsWith('/core')) {
        if (milestone.type === 'personal' && !isCreator) {
          throw new ForbiddenException({
            code: 40302,
            message: '个人事件核心标记仅本人可修改'
          })
        }
        if (milestone.type === 'family' && !isOwner) {
          throw new ForbiddenException({
            code: 40302,
            message: '家庭事件核心标记仅房主可修改'
          })
        }
      }
    }

    return true
  }
}
```

### 4.3 创建时的核心标记权限校验

创建事件时若 `isCore=true`，同样需校验：

| 事件类型 | 创建时 isCore=true 的权限 |
|---------|------------------------|
| personal | 允许（创建人就是自己，自然有权标记） |
| family | 仅房主可在创建时标记为核心 |

---

## 五、Controller 示例（NestJS）

```typescript
import {
  Controller, Get, Post, Put, Delete, Patch,
  Param, Query, Body, UseGuards, Req
} from '@nestjs/common'
import { JwtAuthGuard } from '../auth/jwt-auth.guard'
import { FamilyMemberGuard } from '../family/family-member.guard'
import { MilestoneService } from './milestone.service'
import { CreateMilestoneDto, UpdateMilestoneDto, ToggleCoreDto } from './dto'

@Controller('api/family/:familyId/milestones')
@UseGuards(JwtAuthGuard, FamilyMemberGuard)
export class MilestoneController {
  constructor(private readonly milestoneService: MilestoneService) {}

  @Get()
  async list(
    @Param('familyId') familyId: string,
    @Query('type') type: 'personal' | 'family',
    @Query('isCore') isCore?: boolean,
    @Query('page') page = 1,
    @Query('pageSize') pageSize = 50
  ) {
    return this.milestoneService.list(familyId, { type, isCore, page, pageSize })
  }

  @Get('summary')
  async summary(
    @Param('familyId') familyId: string,
    @Query('type') type: 'personal' | 'family'
  ) {
    return this.milestoneService.getSummary(familyId, type)
  }

  @Get(':milestoneId')
  async detail(
    @Param('familyId') familyId: string,
    @Param('milestoneId') milestoneId: string
  ) {
    return this.milestoneService.detail(familyId, milestoneId)
  }

  @Post()
  async create(
    @Param('familyId') familyId: string,
    @Body() dto: CreateMilestoneDto,
    @Req() req: any
  ) {
    return this.milestoneService.create(familyId, dto, req.user)
  }

  @Put(':milestoneId')
  async update(
    @Param('familyId') familyId: string,
    @Param('milestoneId') milestoneId: string,
    @Body() dto: UpdateMilestoneDto,
    @Req() req: any
  ) {
    return this.milestoneService.update(familyId, milestoneId, dto, req.user)
  }

  @Delete(':milestoneId')
  async delete(
    @Param('familyId') familyId: string,
    @Param('milestoneId') milestoneId: string,
    @Req() req: any
  ) {
    return this.milestoneService.delete(familyId, milestoneId, req.user)
  }

  @Patch(':milestoneId/core')
  async toggleCore(
    @Param('familyId') familyId: string,
    @Param('milestoneId') milestoneId: string,
    @Body() dto: ToggleCoreDto,
    @Req() req: any
  ) {
    return this.milestoneService.toggleCore(familyId, milestoneId, dto.isCore, req.user)
  }
}
```

> **注意**：`@Get('summary')` 路由需在 `@Get(':milestoneId')` 之前声明，避免 `summary` 被当作 `milestoneId` 参数匹配。

---

## 六、DTO 校验（NestJS）

```typescript
import { IsString, IsBoolean, IsOptional, IsEnum, IsArray, MaxLength, MinLength } from 'class-validator'

export class CreateMilestoneDto {
  @IsEnum(['personal', 'family'])
  type: 'personal' | 'family'

  @IsString()
  @MinLength(1)
  @MaxLength(50)
  title: string

  @IsString()
  @Matches(/^\d{4}-(\d{2})(-\d{2})?$/, {
    message: 'happenDate 格式应为 YYYY-MM 或 YYYY-MM-DD'
  })
  happenDate: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  desc?: string

  @IsOptional()
  @IsBoolean()
  isCore?: boolean

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  relatedMemberIds?: string[]

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  imageList?: string[]
}

export class UpdateMilestoneDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(50)
  title?: string

  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-(\d{2})(-\d{2})?$/)
  happenDate?: string

  @IsOptional()
  @IsString()
  @MaxLength(500)
  desc?: string

  @IsOptional()
  @IsBoolean()
  isCore?: boolean

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  relatedMemberIds?: string[]

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(3)
  imageList?: string[]
}

export class ToggleCoreDto {
  @IsBoolean()
  isCore: boolean
}
```

---

## 七、Service 层示例（NestJS）

```typescript
@Injectable()
export class MilestoneService {
  constructor(
    @InjectRepository(MilestoneEntity)
    private readonly repo: Repository<MilestoneEntity>,
    private readonly familyMemberService: FamilyMemberService
  ) {}

  async list(familyId: string, opts: { type, isCore?, page?, pageSize? }) {
    const qb = this.repo
      .createQueryBuilder('m')
      .where('m.family_id = :familyId', { familyId })
      .andWhere('m.type = :type', { type: opts.type })
      .orderBy('m.happen_date', 'DESC')
      .skip((opts.page - 1) * opts.pageSize)
      .take(opts.pageSize)

    if (opts.isCore !== undefined) {
      qb.andWhere('m.is_core = :isCore', { isCore: opts.isCore })
    }

    const [list, total] = await qb.getManyAndCount()
    return { list, total, page: opts.page, pageSize: opts.pageSize }
  }

  async getSummary(familyId: string, type: 'personal' | 'family') {
    const list = await this.repo.find({
      where: { familyId, type, isCore: true },
      order: { happenDate: 'ASC' },
      select: ['id', 'happenDate', 'title', 'desc']
    })
    const title = type === 'personal' ? '个人纪事碑文' : '家庭纪事碑文'
    return { type, title, list }
  }

  async detail(familyId: string, milestoneId: string) {
    const milestone = await this.repo.findOne({
      where: { id: milestoneId, familyId }
    })
    if (!milestone) throw new NotFoundException('事件不存在')
    return milestone
  }

  async create(familyId: string, dto: CreateMilestoneDto, user: any) {
    // 校验核心标记权限
    if (dto.isCore && dto.type === 'family') {
      const membership = await this.familyMemberService.findByFamilyAndUser(familyId, user.id)
      if (membership.role !== 'owner') {
        throw new ForbiddenException({ code: 40302, message: '家庭事件核心标记仅房主可操作' })
      }
    }

    const entity = this.repo.create({
      familyId,
      type: dto.type,
      title: dto.title.trim(),
      happenDate: dto.happenDate,
      desc: dto.desc || '',
      isCore: dto.isCore || false,
      creatorId: user.id,
      creatorName: user.nickname || user.username,
      relatedMemberIds: dto.type === 'personal' ? [user.id] : (dto.relatedMemberIds || [user.id]),
      imageList: dto.imageList || []
    })

    return this.repo.save(entity)
  }

  async update(familyId: string, milestoneId: string, dto: UpdateMilestoneDto, user: any) {
    const milestone = await this.detail(familyId, milestoneId)
    const membership = await this.familyMemberService.findByFamilyAndUser(familyId, user.id)
    const isOwner = membership.role === 'owner'
    const isCreator = milestone.creatorId === user.id

    // 权限校验
    if (milestone.type === 'personal' && !isCreator) {
      throw new ForbiddenException({ code: 40303, message: '无权编辑他人个人事件' })
    }
    if (milestone.type === 'family' && !isCreator && !isOwner) {
      throw new ForbiddenException({ code: 40301, message: '无权编辑该家庭事件' })
    }

    // 核心标记变更需额外校验
    if (dto.isCore !== undefined && dto.isCore !== milestone.isCore) {
      if (milestone.type === 'personal' && !isCreator) {
        throw new ForbiddenException({ code: 40302, message: '个人事件核心标记仅本人可修改' })
      }
      if (milestone.type === 'family' && !isOwner) {
        throw new ForbiddenException({ code: 40302, message: '家庭事件核心标记仅房主可修改' })
      }
    }

    Object.assign(milestone, {
      ...(dto.title !== undefined && { title: dto.title.trim() }),
      ...(dto.happenDate !== undefined && { happenDate: dto.happenDate }),
      ...(dto.desc !== undefined && { desc: dto.desc }),
      ...(dto.isCore !== undefined && { isCore: dto.isCore }),
      ...(dto.relatedMemberIds !== undefined && { relatedMemberIds: dto.relatedMemberIds }),
      ...(dto.imageList !== undefined && { imageList: dto.imageList })
    })

    return this.repo.save(milestone)
  }

  async delete(familyId: string, milestoneId: string, user: any) {
    const milestone = await this.detail(familyId, milestoneId)
    const membership = await this.familyMemberService.findByFamilyAndUser(familyId, user.id)
    const isOwner = membership.role === 'owner'
    const isCreator = milestone.creatorId === user.id

    if (milestone.type === 'personal' && !isCreator) {
      throw new ForbiddenException({ code: 40303, message: '无权删除他人个人事件' })
    }
    if (milestone.type === 'family' && !isCreator && !isOwner) {
      throw new ForbiddenException({ code: 40301, message: '无权删除该家庭事件' })
    }

    await this.repo.remove(milestone)
    return null
  }

  async toggleCore(familyId: string, milestoneId: string, isCore: boolean, user: any) {
    const milestone = await this.detail(familyId, milestoneId)
    const membership = await this.familyMemberService.findByFamilyAndUser(familyId, user.id)
    const isOwner = membership.role === 'owner'
    const isCreator = milestone.creatorId === user.id

    if (milestone.type === 'personal' && !isCreator) {
      throw new ForbiddenException({ code: 40302, message: '个人事件核心标记仅本人可修改' })
    }
    if (milestone.type === 'family' && !isOwner) {
      throw new ForbiddenException({ code: 40302, message: '家庭事件核心标记仅房主可修改' })
    }

    milestone.isCore = isCore
    await this.repo.save(milestone)
    return { id: milestone.id, isCore: milestone.isCore, updatedAt: milestone.updatedAt }
  }
}
```

---

## 八、文件上传接口（复用现有）

大事纪配图上传复用已有的文件上传接口：

```
POST /api/files/upload
```

**Request：** `multipart/form-data`

| 字段 | 类型 | 说明 |
|------|------|------|
| file | File | 图片文件 |
| bizType | string | 传 `milestone` |

**Response：**

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "url": "https://cdn.example.com/milestones/xxx.jpg"
  }
}
```

---

## 九、接口总览表（含已有接口）

| 序号 | 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|------|
| | | **认证（已有）** | | |
| 1-7 | | `/api/auth/*` | 略 | 略 |
| | | **家庭（已有）** | | |
| 8-16 | | `/api/family/*` | 略 | 略 |
| | | **成员（已有）** | | |
| 17-23 | | `/api/family/:familyId/members/*` | 略 | 略 |
| | | **待办（已有）** | | |
| 24-30 | | `/api/family/:familyId/todos/*` | 略 | 略 |
| | | **公告（已有）** | | |
| 31-34 | | `/api/family/:familyId/announcements/*` | 略 | 略 |
| | | **概览（已有）** | | |
| 35 | GET | `/api/family/:familyId/dashboard` | 首页概览 | 成员 |
| | | **大事纪（新增）** | | |
| 36 | GET | `/api/family/:familyId/milestones` | 大事纪列表 | 成员 |
| 37 | GET | `/api/family/:familyId/milestones/summary` | 碑文汇总 | 成员 |
| 38 | GET | `/api/family/:familyId/milestones/:milestoneId` | 大事纪详情 | 成员 |
| 39 | POST | `/api/family/:familyId/milestones` | 创建大事纪 | 成员 |
| 40 | PUT | `/api/family/:familyId/milestones/:milestoneId` | 更新大事纪 | 创建人/房主 |
| 41 | DELETE | `/api/family/:familyId/milestones/:milestoneId` | 删除大事纪 | 创建人/房主 |
| 42 | PATCH | `/api/family/:familyId/milestones/:milestoneId/core` | 切换核心标记 | 按规则 |
| | | **用户（已有）** | | |
| 43-45 | | `/api/user/*` | 略 | 略 |
| | | **文件（已有）** | | |
| 46 | POST | `/api/files/upload` | 文件上传 | 登录 |

---

## 十、补充说明

### 10.1 路由顺序注意

NestJS Controller 中，`@Get('summary')` 必须在 `@Get(':milestoneId')` 之前声明，否则 `summary` 会被当作 UUID 参数匹配导致 404。

### 10.2 happenDate 模糊日期处理

- 存储格式：统一用 `varchar(10)` 存储，兼容 `YYYY-MM`（7 字符）和 `YYYY-MM-DD`（10 字符）
- 排序规则：字符串排序天然支持时间正序/倒序（ISO 格式优势）
- 校验正则：`/^\d{4}-(\d{2})(-\d{2})?$/`

### 10.3 imageList 存储

- 使用 JSON 字段存储 URL 数组
- 最多 3 张图片
- 图片 URL 由 `/api/files/upload` 接口返回
- 不做图片压缩处理（一期简化）

### 10.4 relatedMemberIds 校验

- 创建/更新时，`relatedMemberIds` 中的每个 ID 须为当前家庭的成员
- 后端需校验：`SELECT id FROM family_members WHERE family_id = ? AND user_id IN (?)`
- 不合法的 ID 静默过滤，不报错

### 10.5 家庭切换时的数据隔离

- 所有查询都带 `familyId` 条件，天然隔离
- 个人大事纪也挂载在家庭下（`familyId` 字段），因为个人事件的「可见范围」是同家庭成员
- 不存在脱离家庭的个人大事纪

### 10.6 删除家庭的级联处理

解散家庭时，需级联删除该家庭下的所有大事纪事件：

```sql
DELETE FROM family_milestones WHERE family_id = ?;
```

或在 TypeORM 中配置 `onDelete: 'CASCADE'` 外键关系。

### 10.7 数据量预估

- 单个家庭大事纪预估：50-200 条（长期使用）
- 核心事件预估：10-30 条
- 不需要分页加载优化，一次加载全部即可
- 列表接口 `pageSize` 默认 50，前端可传 100

### 10.8 后续迭代预留

本期不实现但接口设计已预留扩展空间：

| 功能 | 预留方案 |
|------|---------|
| 按创建人筛选个人碑文 | 列表/汇总接口增加 `creatorId` query 参数 |
| 事件分类标签 | 新增 `category` 和 `tags` 字段 |
| 搜索 | 新增 `GET /milestones/search?q=keyword` 接口 |
| PDF 导出 | 后端生成 PDF，新增 `GET /milestones/summary/pdf` 接口 |
| 时间范围筛选 | 列表接口增加 `startDate` / `endDate` 参数 |
