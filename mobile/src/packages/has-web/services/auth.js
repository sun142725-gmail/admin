import request from './request'

export function sendCode(payload) {
  return request.post('/auth/code/send', payload)
}

export function codeLogin(payload) {
  return request.post('/auth/code/login', payload)
}

export function resetPasswordByCode(payload) {
  return request.post('/auth/code/reset-password', payload)
}

export function refreshToken(refreshToken) {
  return request.post('/auth/refresh', { refreshToken })
}

export function logout() {
  return request.post('/auth/logout')
}

export function getAuthProfile() {
  return request.get('/auth/profile')
}
