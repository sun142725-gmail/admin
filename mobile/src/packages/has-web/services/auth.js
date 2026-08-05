import request from './request'

/* ========== 验证码 ========== */

export function sendCode(payload) {
  // payload: { channel: 'sms' | 'email', scene: 'login' | 'register' | 'reset_password', target }
  return request.post('/auth/code/send', payload)
}

/* ========== 登录 ========== */

export function codeLogin(payload) {
  // payload: { channel: 'sms' | 'email', target, code }
  return request.post('/auth/code/login', payload)
}

export function passwordLogin(payload) {
  // payload: { account, password }
  // account 可为手机号、邮箱或用户名；兼容原 { username, password } 格式
  return request.post('/auth/login', payload)
}

/* ========== 注册 ========== */

export function register(payload) {
  // payload: { channel: 'sms' | 'email', target, code, password }
  return request.post('/auth/register', payload)
}

/* ========== 重置密码 ========== */

export function resetPasswordByCode(payload) {
  // payload: { channel: 'sms' | 'email', target, code, newPassword }
  return request.post('/auth/code/reset-password', payload)
}

/* ========== Token & Profile ========== */

export function refreshToken(refreshToken) {
  return request.post('/auth/refresh', { refreshToken })
}

export function logout() {
  return request.post('/auth/logout')
}

export function getAuthProfile() {
  return request.get('/auth/profile')
}
