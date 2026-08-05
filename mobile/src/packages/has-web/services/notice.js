import request from './request'

export function getNoticeList(familyId, params) {
  // params: { page?, pageSize? }
  return request.get(`/family/${familyId}/announcements`, { params })
}

export function getNoticeDetail(familyId, noticeId) {
  return request.get(`/family/${familyId}/announcements/${noticeId}`)
}

export function createNotice(familyId, payload) {
  // payload: { title, content }
  return request.post(`/family/${familyId}/announcements`, payload)
}

export function deleteNotice(familyId, noticeId) {
  return request.delete(`/family/${familyId}/announcements/${noticeId}`)
}
