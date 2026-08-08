import request from './request'

/* ========== 大事纪事件 ========== */

/**
 * 获取大事纪列表
 * @param {string} familyId - 家庭 ID
 * @param {object} params - { type: 'personal'|'family', isCore?: boolean, page?, pageSize? }
 */
export function getMilestoneList(familyId, params) {
  return request.get(`/family/${familyId}/milestones`, { params })
}

/**
 * 获取大事纪详情
 */
export function getMilestoneDetail(familyId, milestoneId) {
  return request.get(`/family/${familyId}/milestones/${milestoneId}`)
}

/**
 * 创建大事纪
 * @param {object} payload - { type, title, happenDate, desc?, isCore, relatedMemberIds?, imageList? }
 */
export function createMilestone(familyId, payload) {
  return request.post(`/family/${familyId}/milestones`, payload)
}

/**
 * 更新大事纪
 */
export function updateMilestone(familyId, milestoneId, payload) {
  return request.put(`/family/${familyId}/milestones/${milestoneId}`, payload)
}

/**
 * 删除大事纪
 */
export function deleteMilestone(familyId, milestoneId) {
  return request.delete(`/family/${familyId}/milestones/${milestoneId}`)
}

/**
 * 切换核心高光标记
 * @param {boolean} isCore - 目标状态
 */
export function toggleMilestoneCore(familyId, milestoneId, isCore) {
  return request.patch(`/family/${familyId}/milestones/${milestoneId}/core`, { isCore })
}

/**
 * 获取碑文汇总（仅核心事件，按时间正序）
 * @param {string} type - 'personal' | 'family'
 */
export function getMilestoneSummary(familyId, type) {
  return request.get(`/family/${familyId}/milestones/summary`, { params: { type } })
}
