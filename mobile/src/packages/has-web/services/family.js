import request from './request'

/* ========== 家庭 ========== */

export function createFamily(payload) {
  // payload: { name, avatar }
  return request.post('/family/create', payload)
}

export function joinFamily(payload) {
  // payload: { code }
  return request.post('/family/join', payload)
}

export function getFamilyList() {
  return request.get('/family/list')
}

export function getFamilyDetail(familyId) {
  return request.get(`/family/${familyId}/detail`)
}

export function updateFamily(familyId, payload) {
  // payload: { name?, avatar? }
  return request.put(`/family/${familyId}/update`, payload)
}

export function deleteFamily(familyId) {
  return request.delete(`/family/${familyId}`)
}

export function switchFamily(familyId) {
  return request.post(`/family/${familyId}/switch`)
}

/* ========== 邀请码 ========== */

export function generateInviteCode(familyId, payload) {
  // payload: { expireDays? } 默认 7
  return request.post(`/family/${familyId}/invite-code`, payload || {})
}

export function getInviteCode(familyId) {
  return request.get(`/family/${familyId}/invite-code`)
}

/* ========== 成员 ========== */

export function getMemberList(familyId) {
  return request.get(`/family/${familyId}/members`)
}

export function updateMember(familyId, memberId, payload) {
  // payload: { nickname }
  return request.put(`/family/${familyId}/members/${memberId}`, payload)
}

export function removeMember(familyId, memberId) {
  return request.delete(`/family/${familyId}/members/${memberId}`)
}

export function leaveFamily(familyId) {
  return request.post(`/family/${familyId}/leave`)
}

/* ========== 加入申请 ========== */

export function getJoinRequests(familyId) {
  return request.get(`/family/${familyId}/join-requests`)
}

export function approveJoinRequest(familyId, requestId) {
  return request.post(`/family/${familyId}/join-requests/${requestId}/approve`)
}

export function rejectJoinRequest(familyId, requestId) {
  return request.post(`/family/${familyId}/join-requests/${requestId}/reject`)
}

/* ========== 首页概览 ========== */

export function getDashboard(familyId) {
  return request.get(`/family/${familyId}/dashboard`)
}
