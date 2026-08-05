/**
 * 手机号校验：以 1 开头的 11 位数字
 */
export function isPhone(value) {
  return /^1\d{10}$/.test(value)
}

/**
 * 邮箱校验
 */
export function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

/**
 * 密码校验：8-32 位，至少包含字母和数字
 */
export function isPassword(value) {
  return /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d!@#$%^&*()_+\-=[\]{}|;:,.<>?]{8,32}$/.test(value)
}

/**
 * 验证码校验：6 位数字
 */
export function isCode(value) {
  return /^\d{6}$/.test(value)
}

/**
 * 用户名校验：3-20 位，字母/数字/下划线，以字母开头
 */
export function isUsername(value) {
  return /^[a-zA-Z][a-zA-Z0-9_]{2,19}$/.test(value)
}

/**
 * 账号校验：可为手机号、邮箱或用户名
 */
export function isAccount(value) {
  if (!value) return false
  return isPhone(value) || isEmail(value) || isUsername(value)
}

/**
 * 根据 channel 类型校验 target
 */
export function validateTarget(channel, target) {
  if (!target) return false
  return channel === 'sms' ? isPhone(target) : isEmail(target)
}

/**
 * 获取 target 类型的 placeholder
 */
export function getTargetPlaceholder(channel) {
  return channel === 'sms' ? '请输入手机号' : '请输入邮箱'
}

/**
 * 获取 target 类型的 input type
 */
export function getTargetInputType(channel) {
  return channel === 'sms' ? 'tel' : 'email'
}

/**
 * 获取 target 类型的 maxlength
 */
export function getTargetMaxlength(channel) {
  return channel === 'sms' ? 11 : 64
}

/**
 * 获取 target 类型的错误提示
 */
export function getTargetError(channel) {
  return channel === 'sms' ? '请输入正确的手机号' : '请输入正确的邮箱'
}
