import request from './request'

export function updateProfile(payload) {
  // payload: { nickname?, avatarUrl? }
  return request.put('/user/profile', payload)
}

export function getSettings() {
  return request.get('/user/settings')
}

export function updateSettings(payload) {
  // payload: { notificationEnabled }
  return request.put('/user/settings', payload)
}
