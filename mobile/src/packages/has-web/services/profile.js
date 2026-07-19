import request from './request'

export function getProfile() {
  return request.get('/profile')
}

export function updateProfile(payload) {
  return request.patch('/profile', payload)
}

export function updatePassword(payload) {
  return request.post('/profile/password', payload)
}
