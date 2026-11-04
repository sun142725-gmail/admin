// 菜单资源更名的幂等判定（纯函数，便于单测）。
// 老库启动时把历史名称归位到当前名称；已是新名、或管理员自定义过的名称一律不动。
// 口径与 deploy-panel/scripts/online/20261104_0003_comic_module.sql 的带条件 UPDATE 一致。

/** path → 历史名称。只有当前名称精确等于历史名称时才允许归位。 */
export const LEGACY_PAGE_NAMES: Record<string, string> = {
  '/graphic': '小说生图'
};

export const shouldRenameResourcePage = (
  path: string,
  currentName: string,
  targetName: string,
  legacyNames: Record<string, string> = LEGACY_PAGE_NAMES
): boolean => legacyNames[path] === currentName && currentName !== targetName;
