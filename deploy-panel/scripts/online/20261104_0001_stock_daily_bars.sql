-- =============================================================================
-- 20261104_0001 股票日线行情库上线升级 SQL（幂等，可重复执行）
-- =============================================================================
-- 依据：股票日线行情库 MVP（新表 stock_daily_bars / 增量断点续抓（多源容灾+限流）/
--       盘后定时抓自选+候选池+自动补缺 / 质量探针纯函数+前端报表；不做分钟线、实盘、A股以外）。
-- 内容：仅新表 stock_daily_bars（1 张）。
-- 复权口径声明（必须与实体 stock-daily-bar.entity.ts / 服务层源门禁一致）：
--   OHLC 四列存前复权价（qfq，与行情软件同口径）；volume（手）/amount（元）为原始口径不复权。
--   上游仅东财主源满足完整口径（东财 fqt=1 前复权且成交额真实）；腾讯 qfqday 前复权但 amount 恒 0；
--   新浪公开接口不复权且 amount 恒 0——后端写库门禁在 kline 降级命中腾讯/新浪时整标的跳过不写库
--   （新浪不复权会以错误价覆盖前复权序列，双源 amount=0 会把真实成交额清零；
--   降级是暂态而错误口径写入是持久伤害，宁缺毋滥，下轮自动重试）。
--   trade_date 统一存 UTC 零点（交易日）。
-- 无权限/资源段理由：报表 Tab 挂既有选股器页（/stock/screener，ScreenerPage 内 Tab，非新路由），
--   复用宿主页权限码 stock:screener:use（seed.service.ts 已 seed，不新增权限码、不新增 resource），
--   照 20261103_0003 头注范式——词库是发布矩阵页内 Tab 无 resource seed 变更，同理由本文件
--   无 permissions / resources 段。
-- 执行方式：发布面板「线上脚本」分区选择本文件 → 输入脚本名全文二次确认 → 执行。
-- 幂等规则（参照 20261103_0001_rbac_studio_upgrade.sql 模板）：
--   建表 CREATE TABLE IF NOT EXISTS；本文件无 ALTER 段（全新表，无存量表加列/加索引需求）；
--   无 INSERT 段（质量结论不落库，表由后端行情抓取服务写入）。
-- =============================================================================

-- =============================================================================
-- 一、新增表（1 张）
-- =============================================================================

CREATE TABLE IF NOT EXISTS `stock_daily_bars` (
  `id` int NOT NULL AUTO_INCREMENT,
  `symbol` varchar(16) NOT NULL COMMENT '归一化代码 sh600519/sz300750（与 stock_watchlist 同款）',
  `trade_date` datetime(6) NOT NULL COMMENT '交易日，统一存 UTC 零点',
  `open` decimal(12,3) NOT NULL COMMENT '前复权开盘价（qfq 口径，与行情软件同口径）',
  `high` decimal(12,3) NOT NULL COMMENT '前复权最高价（qfq 口径）',
  `low` decimal(12,3) NOT NULL COMMENT '前复权最低价（qfq 口径）',
  `close` decimal(12,3) NOT NULL COMMENT '前复权收盘价（qfq 口径；增量续抓据此做复权漂移校准）',
  `volume` int NOT NULL DEFAULT 0 COMMENT '成交量（手），原始口径不复权；0=停牌占位由质量探针标记',
  `amount` decimal(16,2) NOT NULL DEFAULT 0 COMMENT '成交额（元），原始口径不复权（全市场日额约 2e12，16,2 足够）',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_stock_daily_bars_symbol_date` (`symbol`, `trade_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='股票日线行情库：唯一键(symbol,trade_date)幂等 upsert；OHLC 前复权，量额原始口径；仅东财主源经源门禁写库';

-- =============================================================================
-- 二、执行后自检（SELECT 只读探针）
-- =============================================================================
-- 预期：new_tables=1；bar_cols=8（业务八列，WHERE 过滤业务列名——裸 COUNT(*) 会得 11，含 id/created_at/updated_at）；
--       uk_index=1（COUNT(DISTINCT INDEX_NAME) 且排除 PRIMARY——健康表 DISTINCT INDEX_NAME 含主键共 2）；
--       bar_rows>=0（新建表为 0，盘后定时抓取后增长）。
SELECT
  (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stock_daily_bars'
  ) AS new_tables,
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stock_daily_bars'
      AND COLUMN_NAME IN ('symbol','trade_date','open','high','low','close','volume','amount')
  ) AS bar_cols,
  (SELECT COUNT(DISTINCT INDEX_NAME) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stock_daily_bars'
      AND INDEX_NAME <> 'PRIMARY'
  ) AS uk_index,
  (SELECT COUNT(*) FROM stock_daily_bars) AS bar_rows;
