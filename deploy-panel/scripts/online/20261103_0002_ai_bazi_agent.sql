-- =============================================================================
-- 20261103_0002 八字命理师智能体上线（幂等，可重复执行）
-- =============================================================================
-- 依据：plan/prompt-fortune-teller-bazi-20261102.md（提示词存档，《穷宝通鉴》笔误
--       已在本次配置中更正为《穷通宝鉴》，又名《造化元钥》）。
-- 内容：向 ai_agents 幂等插入一条 native 智能体（code = 'bazi'），供对话页与
--       后续业务模块按 code 引用；不新增表/列/权限/菜单，无需 schema 变更。
-- 模型绑定：native 智能体必须绑模型。生产库的模型 id 属实例数据，无法硬编码，
--       故按优先级自动绑定：① 与「六爻解卦」（code='divination'）同款模型；
--       ② 兜底取最早启用的模型（status=1 按 id 升序第一条）。两者皆缺失时
--       model_id 落 NULL，执行后须到「AI 中心 → 智能体管理」手工绑定模型。
-- 幂等规则：NOT EXISTS 按 code='bazi' 判断，已存在则整体跳过——不覆盖线上
--       后续在管理端对提示词/参数的任何修改，重复执行安全。
-- 执行方式：发布面板「线上脚本」分区选择本文件 → 输入脚本名全文二次确认 → 执行。
-- =============================================================================

INSERT INTO ai_agents (
  `name`, `description`, `kind`, `code`, `model_id`, `system_prompt`,
  `temperature`, `opening_line`, `allow_image`, `sort`, `status`,
  `created_at`, `updated_at`
)
SELECT
  '八字命理',
  '子平八字体系命理师（提示词存档 20261102）：以古籍为据，不妄断，只输出应象最强、可验证性最高的结论。',
  'native',
  'bazi',
  COALESCE(
    (SELECT d.model_id FROM (
      SELECT a.model_id FROM ai_agents a
      WHERE a.code = 'divination' AND a.model_id IS NOT NULL
      ORDER BY a.id LIMIT 1
    ) d),
    (SELECT m.id FROM (
      SELECT m2.id FROM ai_models m2
      WHERE m2.status = 1
      ORDER BY m2.id LIMIT 1
    ) m)
  ),
  '你是一个经验丰富的命理师，熟读《渊海子平》《三命通会》《千里命稿》《穷通宝鉴》《滴天髓阐微》《子平真诠》《巾箱秘术》《李虚中命书》《盲派秘籍》《八字提要》《五行精纪》《命理探源》。能熟练使用五行衰旺取格用神，神煞等，详细解析人生运势，事业、财运、六亲、健康等。请严格以上书籍为主要依据，详细解析一下八字运势，不妄断，禁止套话与迎合，只输出最有命理依据，应象最强，可验证性最高的结论。',
  0.7,
  '请提供你的出生年月日时（注明公历或农历）与性别，我来为你排盘解析。',
  0,
  0,
  1,
  NOW(6),
  NOW(6)
FROM DUAL
WHERE NOT EXISTS (SELECT 1 FROM ai_agents WHERE code = 'bazi');

-- =============================================================================
-- 执行后自检（SELECT 只读探针）
-- =============================================================================
-- 预期：bazi_agent=1（存在）；bazi_bound=1（已绑模型，为 0 则需手工绑定）；
--       prompt_ok=1（提示词含更正后的《穷通宝鉴》且不含笔误《穷宝通鉴》）。
SELECT
  (SELECT COUNT(*) FROM ai_agents WHERE code = 'bazi') AS bazi_agent,
  (SELECT COUNT(*) FROM ai_agents
    WHERE code = 'bazi' AND model_id IS NOT NULL) AS bazi_bound,
  (SELECT COUNT(*) FROM ai_agents
    WHERE code = 'bazi'
      AND system_prompt LIKE '%穷通宝鉴%'
      AND system_prompt NOT LIKE '%穷宝通鉴%') AS prompt_ok;
