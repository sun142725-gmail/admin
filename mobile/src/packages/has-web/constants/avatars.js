/**
 * 内置家庭头像列表
 * 一期使用 Vant 图标 + 背景色作为头像替代方案
 */
export const FAMILY_AVATARS = [
  { id: 'avatar_01', icon: 'home-o', color: '#0ea5e9', bg: '#e0f2fe', label: '温馨' },
  { id: 'avatar_02', icon: 'smile-o', color: '#10b981', bg: '#d1fae5', label: '快乐' },
  { id: 'avatar_03', icon: 'friends-o', color: '#8b5cf6', bg: '#ede9fe', label: '团结' },
  { id: 'avatar_04', icon: 'star-o', color: '#f59e0b', bg: '#fef3c7', label: '幸福' },
  { id: 'avatar_05', icon: 'heart-o', color: '#ef4444', bg: '#fee2e2', label: '和睦' },
  { id: 'avatar_06', icon: 'fire-o', color: '#f97316', bg: '#ffedd5', label: '活力' }
]

/**
 * 根据头像 ID 获取头像配置
 */
export function getAvatarById(id) {
  return FAMILY_AVATARS.find((a) => a.id === id) || FAMILY_AVATARS[0]
}
