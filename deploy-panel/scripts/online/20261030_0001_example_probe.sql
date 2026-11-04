-- 示例探针脚本：验证「线上脚本」模块全链路（只读，无副作用，可重复执行）。
-- 执行方式：刷新发布面板「线上脚本」列表后选择本文件 → 输入“确认执行”二次确认 → 执行。
-- 预期输出：1 行 probe 结果（当前时间 + MySQL 版本），退出码 0，审计记录留痕。

-- 探针：数据库连接、版本与当前库
SELECT NOW() AS probe_time, VERSION() AS mysql_version, DATABASE() AS current_db;

-- ================= 幂等写法模板（真实变更脚本请遵循，参照 deploy/scripts/stock-agents.sql）=================
-- 1. 新增/更新行：INSERT ... ON DUPLICATE KEY UPDATE，按唯一键幂等，多次执行结果一致：
-- INSERT INTO dict_items (dict_code, item_key, item_value, remark)
-- VALUES ('online_script_probe', 'example', 'ok', '线上脚本示例数据')
-- ON DUPLICATE KEY UPDATE item_value = VALUES(item_value), remark = VALUES(remark);
--
-- 2. 结构变更：务必先判断再变更（information_schema 查列是否存在），保证重复执行不报错：
-- SET @has_col := (SELECT COUNT(*) FROM information_schema.COLUMNS
--   WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'dict_items' AND COLUMN_NAME = 'remark');
-- SET @ddl := IF(@has_col = 0,
--   'ALTER TABLE dict_items ADD COLUMN remark VARCHAR(255) NULL',
--   'SELECT ''column already exists'' AS skipped');
-- PREPARE stmt FROM @ddl; EXECUTE stmt; DEALLOCATE PREPARE stmt;
--
-- 禁止：非幂等的 INSERT（无唯一键）、不带 WHERE 的 UPDATE/DELETE、DROP/TRUNCATE。
