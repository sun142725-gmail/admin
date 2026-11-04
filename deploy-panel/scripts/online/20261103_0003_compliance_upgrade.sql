-- =============================================================================
-- 20261103_0003 合规检查链（敏感词库）上线升级 SQL（幂等，可重复执行）
-- =============================================================================
-- 依据：AI 制片厂·合规检查链 MVP（roadmap:34「合规 | 敏感词检测、AIGC 内容标识……
--       发布前检查链，接入发布矩阵流程」；原创度提示不在本 MVP）。
-- 内容：新表 compliance_words（敏感词库，word 唯一）+ 权限双码
--       compliance:view（合规词库查看）/ compliance:manage（合规词库管理）+ admin 授权。
--       不加列、不动页面资源——词库是发布矩阵页（/publisher，资源已存在）内 Tab，
--       非新路由，无 resource seed 变更；检查报告不落库（每次实时计算）。
-- 序号说明：原方案编号 0002 已被 20261103_0002_ai_bazi_agent.sql 占用，顺延取 0003。
-- 执行方式：刷新发布面板「线上脚本」列表后选择本文件 → 输入“确认执行”二次确认 → 执行。
-- 幂等规则（参照 20261103_0001_rbac_studio_upgrade.sql 模板）：
--   建表 CREATE TABLE IF NOT EXISTS；加列/加索引先查 information_schema 再执行；
--   INSERT 走 ON DUPLICATE KEY / NOT EXISTS；UPDATE 必须带条件 WHERE。
-- 注意：生产环境种子若以 SEED=true 启动，权限部分会由 seed.service.ts ensureFlowSetup
--       自动初始化（幂等），本文件的权限段落与其结果一致，手工执行亦可提前生效，二者不冲突。
-- =============================================================================

-- =============================================================================
-- 一、新增表（1 张）
-- =============================================================================

-- 1.1 合规敏感词库（word 服务层 trim 后入库，唯一性以后端 trim 为准）
CREATE TABLE IF NOT EXISTS `compliance_words` (
  `id` int NOT NULL AUTO_INCREMENT,
  `word` varchar(64) NOT NULL COMMENT '敏感词原文（服务层 trim 后入库）',
  `level` varchar(16) NOT NULL COMMENT 'block 禁用 / review 待审 / replace 提示（不用 DB enum，DTO IsIn 把关）',
  `status` int NOT NULL DEFAULT 1 COMMENT '1 启用 / 0 停用，停用词不参与扫描',
  `suggestion` varchar(64) NULL COMMENT '替换建议词（replace 级提示用）',
  `remark` varchar(255) NULL,
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_compliance_words_word` (`word`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- 二、权限（permissions / role_permissions）
-- =============================================================================

-- 2.1 权限码 upsert（新增 compliance 双码，幂等）
INSERT INTO permissions (`name`, `code`)
VALUES
  ('合规词库查看', 'compliance:view'),
  ('合规词库管理', 'compliance:manage')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- 2.2 admin 角色授权（幂等：role_id+permission_id 已存在则跳过；与 seed ensureAdminRolePermission 一致）
INSERT INTO role_permissions (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code IN ('compliance:view', 'compliance:manage')
WHERE r.code = 'admin'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- =============================================================================
-- 三、执行后自检（SELECT 只读探针）
-- =============================================================================
-- 预期：new_tables=1, perms=2, admin_grants>=2, publisher_page=1（词库 Tab 宿主页存在）
SELECT
  (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'compliance_words'
  ) AS new_tables,
  (SELECT COUNT(*) FROM permissions
    WHERE code IN ('compliance:view', 'compliance:manage')
  ) AS perms,
  (SELECT COUNT(*) FROM role_permissions rp
    JOIN roles r ON r.id = rp.role_id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE r.code = 'admin' AND p.code IN ('compliance:view', 'compliance:manage')
  ) AS admin_grants,
  (SELECT COUNT(*) FROM resources
    WHERE type = 'page' AND path = '/publisher'
  ) AS publisher_page;
