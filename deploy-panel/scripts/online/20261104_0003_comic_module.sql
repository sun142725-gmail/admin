-- =============================================================================
-- 2026-11-04 AI 生成漫画模块：菜单更名（幂等，可重复执行）
-- =============================================================================
-- 背景：/graphic 原菜单名「小说生图」，只产出 3-8 张互不相干的插画，没有成品形态。
-- 本次补齐分格排版 / 对话气泡 / PNG 长图导出 / 单幕重生成 / 删除，菜单更名为「AI 生成漫画」。
-- 不涉及建表、加列、权限码变更：漫画版式由前端纯函数计算、长图在浏览器导出，
-- 单幕重生成与删除复用 Go 服务已有的 graphic_stories / graphic_scenes 两张表。
-- 幂等规则（参照 20261030_0001_example_probe.sql）：UPDATE 必须带条件 WHERE。
-- 执行方式：刷新发布面板「线上脚本」列表后选择本文件 → 输入“确认执行”二次确认 → 执行。
-- =============================================================================

-- 一、菜单更名：仅在仍是旧名时更新，重复执行 0 行；
--    已经是新名（或管理员改过自定义名称）时不动，避免覆盖用户配置。
UPDATE `resources`
SET `name` = 'AI 生成漫画'
WHERE `path` = '/graphic' AND `type` = 'page' AND `name` = '小说生图';

-- 二、执行后自检（只读探针）
-- 预期：comic_menu=1（新名已生效）；legacy_menu=0（旧名已消失）；
--       graphic_pages=1（没有重复插入页面资源）；permission_unchanged=1（权限码仍为 flow:run:view）。
SELECT
  (SELECT COUNT(*) FROM `resources`
    WHERE `path` = '/graphic' AND `type` = 'page' AND `name` = 'AI 生成漫画') AS comic_menu,
  (SELECT COUNT(*) FROM `resources`
    WHERE `path` = '/graphic' AND `name` = '小说生图') AS legacy_menu,
  (SELECT COUNT(*) FROM `resources`
    WHERE `path` = '/graphic' AND `type` = 'page') AS graphic_pages,
  (SELECT COUNT(*) FROM `resources`
    WHERE `path` = '/graphic' AND `permission_code` = 'flow:run:view') AS permission_unchanged;
