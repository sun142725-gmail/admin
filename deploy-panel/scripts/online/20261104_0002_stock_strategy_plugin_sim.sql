-- =============================================================================
-- 20261104_0002 策略插件化+模拟盘上线升级 SQL（幂等，可重复执行）
-- =============================================================================
-- 依据：策略插件化+模拟盘 MVP（四模板信号纯函数/组合撮合重放器/状态机投影/盘后调度重放
--       /圆桌 strategy 点评分支/自选股策略信号标签；不做实盘下单、分钟级策略、止损止盈、
--       多策略组合账户、信号推送、run 流水表——最小可观测由 stock_strategy_accounts.last_run_* 承担）。
-- 内容：新表 4 张（stock_strategy_configs / stock_strategy_signals / stock_strategy_positions /
--       stock_strategy_accounts）+ 权限菜单段（新权限码「策略管理」+ /stock/strategy 页面资源）。
-- 口径声明（与实体/服务层一致）：
--   - 四表均不建外键约束（照 stock_daily_bars 先例，避免 sqlite/mysql 迁移差异）；
--   - 日期列统一存 UTC 零点（信号日 T，成交固定 T+1 开盘）；
--   - json 列无默认值（字面量 default 在 MySQL 8.0.13 前受限），读取侧与模板 defaultParams 合并；
--   - boolean 落 tinyint；signals.skip_reason 同内核 SkipReason 码集 + 组合层扩展码 no_bar
--     （信号日该标的整行缺 bar——真实停牌整行缺失形态，volume=0 占位行形态仍走 suspended）；
--   - 模拟盘=重放式投影：每轮「删该策略全部投影 → 唯一键幂等 upsert」，改配置后全量重建无残留。
-- 无 ALTER 段（全新表，无存量表加列/加索引需求）。
-- 执行方式：刷新发布面板「线上脚本」列表后选择本文件 → 输入“确认执行”二次确认 → 执行。
-- 幂等规则（参照 20261103_0001_rbac_studio_upgrade.sql 模板）：
--   建表 CREATE TABLE IF NOT EXISTS；INSERT 走 ON DUPLICATE KEY / NOT EXISTS；UPDATE 带条件 WHERE。
-- 注意：生产环境种子若以 SEED=true 启动，权限/菜单部分会自动初始化（幂等），
--       本文件的权限/菜单段落与其结果一致，手工执行亦可提前生效，二者不冲突。
-- =============================================================================

-- =============================================================================
-- 一、新增表（4 张）
-- =============================================================================

-- 1.1 策略配置（管理端全局对象，无 userId 维度；模拟盘=其影子账户）
CREATE TABLE IF NOT EXISTS `stock_strategy_configs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(64) NOT NULL COMMENT '策略名，唯一（uk_stock_strategy_configs_name）',
  `template` varchar(32) NOT NULL COMMENT '模板标识：ma-cross/macd/donchian/etf-momentum',
  `params` json NULL COMMENT '模板参数（键集=模板参数白名单），无默认值；读取侧与模板 defaultParams 合并',
  `symbols` json NULL COMMENT '标的池 ≤8 个 ^(sh|sz)\d{6}$（单标的模板恰 1/轮动 ≥2），无默认值',
  `initial_cash` decimal(14,2) NOT NULL DEFAULT 100000 COMMENT '初始资金（元）',
  `position_model` json NULL COMMENT '仓位模型参数（镜像 BacktestPositionModelDto），无默认值；NULL=模板默认',
  `enabled` tinyint NOT NULL DEFAULT 1 COMMENT '启用开关（停用不参与调度重放）',
  `sim_start_date` varchar(10) NOT NULL COMMENT '重放正式段起点 YYYY-MM-DD；允许修改（投影每轮全量重建无残留）',
  `remark` varchar(255) NULL,
  `created_by` int NULL COMMENT '创建者用户 id',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_stock_strategy_configs_name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='策略配置：四模板插件；模拟盘=重放式投影（影子账户语义）';

-- 1.2 策略信号投影（幂等键四元组；信号行落库按 trade_date>=sim_start_date 过滤——预热段信号不落库）
CREATE TABLE IF NOT EXISTS `stock_strategy_signals` (
  `id` int NOT NULL AUTO_INCREMENT,
  `strategy_id` int NOT NULL COMMENT 'stock_strategy_configs.id，无外键约束',
  `trade_date` datetime(6) NOT NULL COMMENT '信号产生日 T，统一存 UTC 零点（成交固定 T+1 开盘）',
  `symbol` varchar(16) NOT NULL COMMENT '归一化代码 sh600519/sz300750',
  `action` varchar(8) NOT NULL COMMENT 'buy/sell',
  `status` varchar(16) NOT NULL DEFAULT 'emitted' COMMENT 'emitted/filled/skipped（状态机终态）',
  `skip_reason` varchar(32) NULL COMMENT '内核 SkipReason 同码集+组合层扩展码 no_bar（信号日该标的整行缺 bar）',
  `filled_price` decimal(12,3) NULL COMMENT '滑点后成交价（filled 才有值）',
  `shares` int NOT NULL DEFAULT 0 COMMENT '成交股数（filled ≥100 整手；skipped 恒 0）',
  `fee` decimal(12,3) NULL COMMENT '全部费用（filled 才有值）',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_stock_strategy_signals_strategy_date` (`strategy_id`, `trade_date`),
  UNIQUE KEY `uk_stock_strategy_signals_idem` (`strategy_id`, `trade_date`, `symbol`, `action`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='策略信号投影：唯一键(strategy_id,trade_date,symbol,action)幂等 upsert；同日重跑恒等';

-- 1.3 策略持仓投影（状态机折叠产出；last_buy_date 可早于 sim_start_date——预热段建仓影子账户口径）
CREATE TABLE IF NOT EXISTS `stock_strategy_positions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `strategy_id` int NOT NULL COMMENT 'stock_strategy_configs.id，无外键约束',
  `symbol` varchar(16) NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'flat' COMMENT 'flat/pending_open/holding/pending_close',
  `shares` int NOT NULL DEFAULT 0 COMMENT '持股数（flat 恒 0）',
  `avg_cost` decimal(12,3) NULL COMMENT '含费含滑点买入成本均价（flat 为 null）',
  `last_buy_date` datetime(6) NULL COMMENT '最近买入成交日，UTC 零点；历史事实清仓不清除（影子账户口径）',
  `last_mark_date` datetime(6) NULL COMMENT '最近盯市日，UTC 零点',
  `last_price` decimal(12,3) NULL COMMENT '盯市价（该 symbol 最近一根 bar 收盘，含 volume=0 停牌占位行）',
  `market_value` decimal(14,2) NULL COMMENT '持仓市值（flat 恒 0）',
  `unrealized_pnl` decimal(14,2) NULL COMMENT '浮动盈亏（flat 恒 null）',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_stock_strategy_positions_idem` (`strategy_id`, `symbol`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='策略持仓投影：唯一键(strategy_id,symbol)；日线收盘盯市';

-- 1.4 策略模拟盘账户（1:1 策略；last_run_* 三列承担最小可观测——不做 run 流水表）
CREATE TABLE IF NOT EXISTS `stock_strategy_accounts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `strategy_id` int NOT NULL COMMENT 'stock_strategy_configs.id，无外键约束',
  `cash` decimal(14,2) NOT NULL DEFAULT 0 COMMENT '现金',
  `equity` decimal(14,2) NOT NULL DEFAULT 0 COMMENT '净值=现金+Σ持仓市值（日线收盘盯市口径）',
  `market_value` decimal(14,2) NOT NULL DEFAULT 0 COMMENT '持仓市值合计',
  `replayed_through` varchar(10) NULL COMMENT '重放截至日（库内最新 bar 日 YYYY-MM-DD）',
  `last_run_date` datetime(6) NULL COMMENT '最近一次运行时间',
  `last_run_status` varchar(16) NULL COMMENT '最近一次运行状态：ok/failed',
  `last_run_error` varchar(255) NULL COMMENT '最近一次运行错误摘要（窗口超 MAX_BARS 等失败由本列承载）',
  `created_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_stock_strategy_accounts_strategy` (`strategy_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='策略模拟盘账户：1:1 策略，投影重建时整行重写';

-- =============================================================================
-- 二、权限（permissions / role_permissions，照 20261103_0001 §三范式）
-- =============================================================================

-- 2.1 权限码 upsert（新权限码「策略管理」；watchlist-tags 走登录组不加码）
INSERT INTO permissions (`name`, `code`)
VALUES ('策略管理', 'stock:strategy:manage')
ON DUPLICATE KEY UPDATE `name` = VALUES(`name`);

-- 2.2 admin 角色授权（幂等：role_id+permission_id 已存在则跳过；与 seed ensureAdminRolePermission 一致）
INSERT INTO role_permissions (`role_id`, `permission_id`)
SELECT r.id, p.id
FROM roles r
JOIN permissions p ON p.code = 'stock:strategy:manage'
WHERE r.code = 'admin'
  AND NOT EXISTS (
    SELECT 1 FROM role_permissions rp
    WHERE rp.role_id = r.id AND rp.permission_id = p.id
  );

-- =============================================================================
-- 三、菜单与页面（resources，照 20261103_0001 §四范式；父级 id 动态取「股市」菜单行）
-- =============================================================================

-- 3.1 「股市」一级菜单存在性兜底（同 seed：先于页面挂载）
INSERT INTO resources (`name`, `type`)
SELECT '股市', 'menu' FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM resources WHERE type = 'menu' AND `name` = '股市');

-- 3.2 新页面 /stock/strategy 策略管理（挂「股市」菜单，缺失则插入）
INSERT INTO resources (`name`, `type`, `path`, `parent_id`, `permission_code`)
SELECT '策略管理', 'page', '/stock/strategy', m.id, 'stock:strategy:manage'
FROM resources m
WHERE m.type = 'menu' AND m.`name` = '股市'
  AND NOT EXISTS (SELECT 1 FROM resources e WHERE e.path = '/stock/strategy');

-- 3.3 存量页面漂移校正（同 seed：parent/permissionCode 不一致时归位，幂等）
UPDATE resources e
JOIN resources m ON m.type = 'menu' AND m.`name` = '股市'
SET e.parent_id = m.id, e.permission_code = 'stock:strategy:manage'
WHERE e.path = '/stock/strategy' AND (e.parent_id <> m.id OR e.permission_code <> 'stock:strategy:manage');

-- =============================================================================
-- 四、执行后自检（SELECT 只读探针）
-- =============================================================================
-- 预期：new_tables=4；signal_cols=9 / position_cols=10 / account_cols=8（业务列计数，WHERE 过滤业务列名）；
--       uk_indexes=8（STATISTICS 按「索引×列」出行：configs 1 + signals 4 + positions 2 + accounts 1）；
--       perms=1（stock:strategy:manage）；pages=1（/stock/strategy）；admin_grants>=1。
SELECT
  (SELECT COUNT(*) FROM information_schema.TABLES
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN
      ('stock_strategy_configs','stock_strategy_signals','stock_strategy_positions','stock_strategy_accounts')
  ) AS new_tables,
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stock_strategy_signals'
      AND COLUMN_NAME IN ('strategy_id','trade_date','symbol','action','status','skip_reason','filled_price','shares','fee')
  ) AS signal_cols,
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stock_strategy_positions'
      AND COLUMN_NAME IN ('strategy_id','symbol','status','shares','avg_cost','last_buy_date','last_mark_date','last_price','market_value','unrealized_pnl')
  ) AS position_cols,
  (SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'stock_strategy_accounts'
      AND COLUMN_NAME IN ('strategy_id','cash','equity','market_value','replayed_through','last_run_date','last_run_status','last_run_error')
  ) AS account_cols,
  (SELECT COUNT(*) FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME LIKE 'stock_strategy_%' AND INDEX_NAME <> 'PRIMARY'
      AND INDEX_NAME LIKE 'uk_%'
  ) AS uk_indexes,
  (SELECT COUNT(*) FROM permissions WHERE code = 'stock:strategy:manage') AS perms,
  (SELECT COUNT(*) FROM resources WHERE path = '/stock/strategy' AND type = 'page') AS pages,
  (SELECT COUNT(*) FROM role_permissions rp
    JOIN roles r ON r.id = rp.role_id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE r.code = 'admin' AND p.code = 'stock:strategy:manage'
  ) AS admin_grants,
  (SELECT COUNT(*) FROM stock_strategy_configs) AS config_rows;
