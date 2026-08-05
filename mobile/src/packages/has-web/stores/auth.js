import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { showToast } from 'vant'
import {
  codeLogin,
  passwordLogin,
  register as registerRequest,
  sendCode,
  getAuthProfile,
  logout as requestLogout
} from '@/services/auth'
import { clearTokens, setTokens } from '@/services/request'

const ACCESS_TOKEN_KEY = 'has_web_access_token'

export const useAuthStore = defineStore('has-web-auth', () => {
  const accessToken = ref(localStorage.getItem(ACCESS_TOKEN_KEY) || '')
  const profile = ref(null)
  const loading = ref(false)

  const isLoggedIn = computed(() => Boolean(accessToken.value))

  /* ========== 验证码 ========== */

  async function requestCode(channel, scene, target) {
    const response = await sendCode({ channel, scene, target })
    showToast('验证码已发送')
    return response.data ?? response
  }

  /* ========== 登录 ========== */

  async function loginByCode(payload) {
    loading.value = true
    try {
      const response = await codeLogin(payload)
      const data = response.data ?? response
      setTokens(data)
      accessToken.value = data.accessToken
      profile.value = data.profile
      return data
    } finally {
      loading.value = false
    }
  }

  async function loginByPassword(payload) {
    loading.value = true
    try {
      const response = await passwordLogin(payload)
      const data = response.data ?? response
      setTokens(data)
      accessToken.value = data.accessToken
      profile.value = data.profile
      return data
    } finally {
      loading.value = false
    }
  }

  /* ========== 注册 ========== */

  async function register(payload) {
    loading.value = true
    try {
      const response = await registerRequest(payload)
      const data = response.data ?? response
      // 注册成功后如果直接返回 token 则自动登录
      if (data?.accessToken) {
        setTokens(data)
        accessToken.value = data.accessToken
        profile.value = data.profile
      }
      return data
    } finally {
      loading.value = false
    }
  }

  /* ========== Profile ========== */

  async function loadAuthProfile() {
    const response = await getAuthProfile()
    profile.value = response.data ?? response
    return profile.value
  }

  /* ========== 退出 ========== */

  async function logout() {
    try {
      await requestLogout()
    } catch {
      // 退出失败时仍清理本地登录态。
    }
    clearTokens()
    accessToken.value = ''
    profile.value = null
  }

  return {
    accessToken,
    profile,
    loading,
    isLoggedIn,
    requestCode,
    loginByCode,
    loginByPassword,
    register,
    loadAuthProfile,
    logout
  }
})
