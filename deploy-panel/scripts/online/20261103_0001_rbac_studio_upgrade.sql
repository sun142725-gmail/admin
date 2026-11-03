-- =============================================================================
-- 2026-11-01 ~ 2026-11-03 RBAC / AI 制片厂 增量升级 SQL（幂等，可重复执行）
-- =============================================================================
-- 覆盖提交：
--   91bab0e  AI画布快照持久化        → 新表 ai_canvases
--   4f79760  任务流更名AI制片厂      → 权限名/菜单名 UPDATE
--   4399062  AI生图画布页            → 权限 ai:canvas:view + 页面 /ai/canvas
--   73d39f1  模型单价配置表          → 新表 ai_model_prices
--   c86ab60  用量项目关联与聚合报表  → ai_usage_logs 加列 project_id/unit_count + 页面 /ai/usage
--   b8a7045  发布矩阵后端            → 新表 publisher_accounts / video_publish_records + 权限双码
--   31892c7  发布矩阵数据回流        → 新表 video_platform_metrics
--   9e92233  角色一致性角色库        → 新表 character_cards + novel_projects.cover_url
--   e4e58c4  音画合成（每镜mux）     → novel_shots.muxed_file
-- 执行方式：发布面板「线上脚本」分区选择本文件 → 输入脚本名全文二次确认 → 执行。
-- 幂等规则（参照 20261030_0001_example_probe.sql 模板）：
--   建表 CREATE TABLE IF NOT EXISTS；加列/加索引先查 information_schema 再执行；
--   INSERT 走 ON DUPLICATE KEY / NOT EXISTS；UPDATE 必须带条件 WHERE。
-- 注意：生产环境种子若以 SEED=true 启动，权限/菜单部分会自动初始化（幂等），
--       本文件的权限/菜单段落与其结果一致，手工执行亦可提前生效，二者不冲突。
-- =============================================================================

-- =============================================================================
-- 一、新增表（6 张，随首启自动建，此处供手工对齐已有库）
-- =============================================================================

-- 1.1 AI 画布快照（每用户一行，91bab0e）
CREATE TABLE IF NOT EXISTS `ai_canvases` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL COMMENT '用户 id，一人一行',
  `snapshot` json NOT NULL COMMENT '画布快照(version/nodes/viewport)',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_ai_canvases_user_id` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 1.2 AI 模型单价表（73d39f1，成本核算计价依据）
CREATE TABLE IF NOT EXISTS `ai_model_prices` (
  `id` int NOT NULL AUTO_INCREMENT,
  `model_id` int NULL COMMENT '关联 ai_models.id；NULL=该 kind 全局兜底价',
  `kind` varchar(16) NOT NULL COMMENT 'chat/image/video/tts',
  `input_price` decimal(12,6) NOT NULL DEFAULT 0 COMMENT 'chat: 每1K输入token单价',
  `output_price` decimal(12,6) NOT NULL DEFAULT 0 COMMENT 'chat: 每1K输出token; 非chat: 每单位数量价',
  `unit` varchar(16) NOT NULL DEFAULT 'tokens_1k' COMMENT 'tokens_1k/image/second/char',
  `currency` varchar(8) NOT NULL DEFAULT 'CNY',
  `effective_from` datetime NOT NULL COMMENT '生效时间: 取「用量时间<=生效时间的最新一行」',
  `remark` varchar(255) NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_ai_model_prices_model_id` (`model_id`),
  KEY `idx_ai_model_prices_kind` (`kind`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 1.3 角色一致性角色卡（9e92233）
CREATE TABLE IF NOT EXISTS `character_cards` (
  `id` int NOT NULL AUTO_INCREMENT,
  `project_id` int NOT NULL COMMENT 'novel_projects.id，无外键约束',
  `name` varchar(64) NOT NULL,
  `appearance` text NULL COMMENT '外观描述，并入分镜首帧提示词',
  `reference_images` json NULL COMMENT '参考图路径数组(/uploads/...)，无默认值',
  `is_primary` tinyint NOT NULL DEFAULT 0 COMMENT '主角色排最前注入',
  `sort_order` int NOT NULL DEFAULT 0,
  `created_by` int NOT NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_character_cards_project_id` (`project_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 1.4 发布矩阵平台账号（b8a7045，凭据仅 AES-256-GCM 密文落库）
CREATE TABLE IF NOT EXISTS `publisher_accounts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `platform` varchar(32) NOT NULL COMMENT 'douyin/kuaishou/bilibili/channels/xhs/other',
  `account_name` varchar(128) NOT NULL,
  `credentials_encrypted` text NULL COMMENT '密文(iv:tag:cipher 三段十六进制)，永不回传',
  `status` int NOT NULL DEFAULT 1 COMMENT '1 启用 / 0 停用',
  `remark` varchar(255) NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_publisher_accounts_platform_name` (`platform`, `account_name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 1.5 发布记录（b8a7045，manual 通道登记）
CREATE TABLE IF NOT EXISTS `video_publish_records` (
  `id` int NOT NULL AUTO_INCREMENT,
  `novel_project_id` int NOT NULL COMMENT 'novel_projects.id，无外键约束，查询层 join',
  `platform` varchar(32) NOT NULL,
  `account_id` int NULL COMMENT 'publisher_accounts.id，other 平台可空',
  `title` varchar(255) NULL,
  `status` varchar(16) NOT NULL DEFAULT 'published' COMMENT 'manual 登记即 published，未来通道可扩展',
  `published_at` datetime(6) NOT NULL,
  `receipt_url` varchar(500) NULL COMMENT '平台作品页回执链接',
  `note` text NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_video_publish_records_project` (`novel_project_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 1.6 平台数据回流指标（31892c7，CSV 导入幂等键四元组）
CREATE TABLE IF NOT EXISTS `video_platform_metrics` (
  `id` int NOT NULL AUTO_INCREMENT,
  `novel_project_id` int NOT NULL COMMENT 'novel_projects.id，无外键约束',
  `platform` varchar(32) NOT NULL,
  `metric_date` datetime(6) NOT NULL COMMENT '指标归属日，统一存 UTC 零点',
  `video_id` varchar(128) NOT NULL COMMENT '平台视频 id，无单视频维度时空串占位',
  `views` int NOT NULL DEFAULT 0,
  `likes` int NOT NULL DEFAULT 0,
  `comments` int NOT NULL DEFAULT 0,
  `follows` int NOT NULL DEFAULT 0 COMMENT '涨粉',
  `remark` varchar(255) NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_video_platform_metrics_project` (`novel_project_id`),
  UNIQUE KEY `uk_video_platform_metrics_idem` (`novel_project_id`, `platform`, `metric_date`, `video_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- 二、存量表加列 / 加索引（information_schema 守卫，重复执行跳过）
-- =============================================================================

-- 2.1 ai_usage_logs.project_id（c86ab60，制片厂项目关联，成本核算聚合维度）
SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_usage_logs' AND COLUMN_NAME = 'project_id');
SET @ddl := IF(@has_col = 0,
  'ALTER TABLE ai_usage_logs ADD COLUMN project_id int NULL COMMENT ''制片厂项目关联(novel_projects.id)，仅制片厂管线调用传入''',
  'SELECT ''ai_usage_logs.project_id already exists'' AS skipped');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2.2 ai_usage_logs.project_id 索引
SET @has_idx := (SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_usage_logs' AND INDEX_NAME = 'idx_ai_usage_logs_project_id');
SET @ddl := IF(@has_idx = 0,
  'ALTER TABLE ai_usage_logs ADD INDEX idx_ai_usage_logs_project_id (project_id)',
  'SELECT ''idx_ai_usage_logs_project_id already exists'' AS skipped');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2.3 ai_usage_logs.unit_count（c86ab60，非 chat 类计费数量基准：image=张/video=秒/tts=字符）
SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_usage_logs' AND COLUMN_NAME = 'unit_count');
SET @ddl := IF(@has_col = 0,
  'ALTER TABLE ai_usage_logs ADD COLUMN unit_count int NOT NULL DEFAULT 0 COMMENT ''数量基准: image=张/video=秒/tts=字符/chat恒0''',
  'SELECT ''ai_usage_logs.unit_count already exists'' AS skipped');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2.4 novel_projects.cover_url（9e92233，封面生成落库）
SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'novel_projects' AND COLUMN_NAME = 'cover_url');
SET @ddl := IF(@has_col = 0,
  'ALTER TABLE novel_projects ADD COLUMN cover_url varchar(500) NULL COMMENT ''作品封面静态路径(/uploads/...)''',
  'SELECT ''novel_projects.cover_url already exists'' AS skipped');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 2.5 novel_shots.muxed_file（e4e58c4，每镜混流产物，仅作 SRT 回落探针与调试）
SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'novel_shots' AND COLUMN_NAME = 'muxed_file');
SET @ddl := IF(@has_col = 0,
  'ALTER TABLE novel_shots ADD COLUMN muxed_file varchar(255) NULL COMMENT ''每镜混流产物 mux-{id}.mp4，不作为合成输入''',
  'SELECT ''novel_shots.muxed_file already exists'' AS skipped');
PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- =============================================================================
-- 三、权限（permissions / role_permissions）
-- =============================================================================

-- 3.1 权限码 upsert（新增 ai:canvas:view/publisher 双码；顺带同步 4f79760 的两条更名，全部幂等）
INSERT INTO permissions (`name`, `code`)
VALUES
  ('AI 画布', 'ai:canvas:view'),
  ('发布矩阵管理', 'publisher:manage'),
  ('发布矩阵查看', 'publisher:view'),
  ('制片计划管理', 'flow:define:manage'),
  ('制片执行', 'flow:run:execute')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- 3.2 admin 角色授权（幂等：role_id+permission_id 已存在则跳过；与 seed ensureAdminRolePermission 一致）
INSERT INTO role_permissions (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('ai:canvas:view', 'publisher:manage', 'publisher:view', 'flow:define:manage', 'flow:run:execute')
WHERE r.code = 'admin'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- =============================================================================
-- 四、菜单与页面（resources，父级 id 动态取菜单行）
-- =============================================================================

-- 4.1 一级菜单更名：任务流 → AI 制片厂（4f79760，幂等：已改名则 0 行）
UPDATE resources SET `name` = 'AI 制片厂'
WHERE type = 'menu' AND `name` = '任务流';

-- 4.2 「AI 制片厂」菜单存在性兜底（同 seed：sortOrder 7）
INSERT INTO resources (`name`, `type`, `sort_order`)
SELECT 'AI 制片厂', 'menu', 7 FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM resources WHERE type = 'menu' AND `name` = 'AI 制片厂');

-- 4.3 AI 中心新页面：/ai/canvas AI 画布、/ai/usage 用量报表（缺失则插入）
INSERT INTO resources (`name`, `type`, `path`, `parent_id`, `permission_code`)
SELECT 'AI 画布', 'page', '/ai/canvas', m.id, 'ai:canvas:view'
FROM resources m
WHERE m.type = 'menu' AND m.`name` = 'AI 中心'
  AND NOT EXISTS (SELECT 1 FROM resources e WHERE e.path = '/ai/canvas');

INSERT INTO resources (`name`, `type`, `path`, `parent_id`, `permission_code`)
SELECT '用量报表', 'page', '/ai/usage', m.id, 'ai:usage:view'
FROM resources m
WHERE m.type = 'menu' AND m.`name` = 'AI 中心'
  AND NOT EXISTS (SELECT 1 FROM resources e WHERE e.path = '/ai/usage');

-- 4.4 AI 制片厂新页面：/publisher 发布矩阵（缺失则插入）
INSERT INTO resources (`name`, `type`, `path`, `parent_id`, `permission_code`)
SELECT '发布矩阵', 'page', '/publisher', m.id, 'publisher:view'
FROM resources m
WHERE m.type = 'menu' AND m.`name` = 'AI 制片厂'
  AND NOT EXISTS (SELECT 1 FROM resources e WHERE e.path = '/publisher');

-- 4.5 存量页面漂移校正（同 seed：parent/permissionCode 不一致时归位，幂等）
UPDATE resources e
JOIN resources m ON m.type = 'menu' AND m.`name` = 'AI 中心'
SET e.parent_id = m.id, e.permission_code = 'ai:canvas:view'
WHERE e.path = '/ai/canvas' AND (e.parent_id <> m.id OR e.permission_code <> 'ai:canvas:view');

UPDATE resources e
JOIN resources m ON m.type = 'menu' AND m.`name` = 'AI 中心'
SET e.parent_id = m.id, e.permission_code = 'ai:usage:view'
WHERE e.path = '/ai/usage' AND (e.parent_id <> m.id OR e.permission_code <> 'ai:usage:view');

UPDATE resources e
JOIN resources m ON m.type = 'menu' AND m.`name` = 'AI 制片厂'
SET e.parent_id = m.id, e.permission_code = 'publisher:view'
WHERE e.path = '/publisher' AND (e.parent_id <> m.id OR e.permission_code <> 'publisher:view');

-- =============================================================================
-- 五、执行后自检（SELECT 只读探针）
-- =============================================================================
-- 预期：new_tables=6, usage_cols=2, project_cover=1, shot_muxed=1, perms=5, pages=3, admin_grants>=5
SELECT
  (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN
      ('ai_canvases','ai_model_prices','character_cards','publisher_accounts','video_publish_records','video_platform_metrics')
  ) AS new_tables,
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'ai_usage_logs' AND COLUMN_NAME IN ('project_id','unit_count')
  ) AS usage_cols,
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'novel_projects' AND COLUMN_NAME = 'cover_url'
  ) AS project_cover,
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'novel_shots' AND COLUMN_NAME = 'muxed_file'
  ) AS shot_muxed,
  (SELECT COUNT(*) FROM permissions
    WHERE code IN ('ai:canvas:view','publisher:manage','publisher:view','flow:define:manage','flow:run:execute')
  ) AS perms,
  (SELECT COUNT(*) FROM resources
    WHERE path IN ('/ai/canvas','/ai/usage','/publisher')
  ) AS pages,
  (SELECT COUNT(*) FROM role_permissions rp
    JOIN roles r ON r.id = rp.role_id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE r.code = 'admin' AND p.code IN
      ('ai:canvas:view','publisher:manage','publisher:view','flow:define:manage','flow:run:execute')
  ) AS admin_grants;
