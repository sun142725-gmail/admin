<template>
  <div class="auth-screen">
    <!-- 品牌区域 -->
    <div class="auth-brand">
      <div class="auth-brand-icon">
        <van-icon name="manager-o" size="32" color="#fff" />
      </div>
      <div class="auth-brand-title">HAS Web</div>
      <div class="auth-brand-subtitle">统一账号体系 · 安全登录</div>
    </div>

    <!-- 表单卡片 -->
    <div class="auth-card">
      <!-- 登录方式切换 -->
      <div class="auth-mode-tabs">
        <div
          class="auth-mode-tab"
          :class="{ 'is-active': mode === 'password' }"
          @click="mode = 'password'"
        >
          密码登录
        </div>
        <div
          class="auth-mode-tab"
          :class="{ 'is-active': mode === 'code' }"
          @click="mode = 'code'"
        >
          验证码登录
        </div>
      </div>

      <!-- 手机号 / 邮箱 切换（仅验证码模式） -->
      <div v-if="mode === 'code'" class="auth-channel-tabs">
        <div
          class="auth-channel-tab"
          :class="{ 'is-active': channel === 'sms' }"
          @click="channel = 'sms'"
        >
          手机号
        </div>
        <div
          class="auth-channel-tab"
          :class="{ 'is-active': channel === 'email' }"
          @click="channel = 'email'"
        >
          邮箱
        </div>
      </div>

      <!-- 表单字段 -->
      <div class="space-y-16">
        <!-- 账号输入 -->
        <div class="auth-field">
          <div class="auth-input-icon">
            <van-icon :name="accountIcon" size="18" />
          </div>
          <input
            v-model.trim="form.account"
            class="auth-input"
            :type="accountInputType"
            :maxlength="accountMaxlength"
            :placeholder="accountPlaceholder"
          />
        </div>

        <!-- 密码输入（密码登录模式） -->
        <div v-if="mode === 'password'" class="auth-field">
          <div class="auth-input-icon">
            <van-icon name="lock" size="18" />
          </div>
          <input
            v-model.trim="form.password"
            class="auth-input"
            :type="showPassword ? 'text' : 'password'"
            maxlength="32"
            placeholder="请输入密码"
            @keyup.enter="onLogin"
          />
          <div class="auth-input-action" @click="showPassword = !showPassword">
            <van-icon :name="showPassword ? 'eye-o' : 'closed-eye'" size="18" color="#86909c" />
          </div>
        </div>

        <!-- 验证码输入（验证码登录模式） -->
        <div v-if="mode === 'code'" class="auth-field">
          <div class="auth-input-icon">
            <van-icon name="shield-o" size="18" />
          </div>
          <input
            v-model.trim="form.code"
            class="auth-input pr-[120px]"
            type="text"
            inputmode="numeric"
            maxlength="6"
            placeholder="请输入验证码"
            @keyup.enter="onLogin"
          />
          <div class="auth-input-action">
            <button
              class="auth-code-btn"
              :disabled="countdown > 0"
              @click="onSendCode"
            >
              {{ countdown > 0 ? `${countdown}s 后重发` : '发送验证码' }}
            </button>
          </div>
        </div>
      </div>

      <!-- 提交按钮 -->
      <button
        class="auth-submit mt-28"
        :class="{ 'opacity-60': authStore.loading }"
        :disabled="authStore.loading"
        @click="onLogin"
      >
        <van-loading v-if="authStore.loading" size="20" color="#fff" />
        <span v-else>登 录</span>
      </button>

      <!-- 底部链接 -->
      <div class="auth-footer">
        <span class="text-gray-400">还没有账号？</span>
        <span class="auth-footer-link" @click="$router.push('/register')">立即注册</span>
        <span class="text-gray-200">|</span>
        <span class="auth-footer-link" @click="$router.push('/reset-password')">忘记密码</span>
      </div>

      <!-- 协议 -->
      <div class="auth-agreement">
        <input
          v-model="agreed"
          type="checkbox"
          class="auth-agreement-checkbox"
        />
        <span>
          登录即表示同意
          <span class="text-primary-500">《用户协议》</span>
          和
          <span class="text-primary-500">《隐私政策》</span>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import { useAuthStore } from '../stores/auth'
import { useCountdown } from '../composables/useCountdown'
import {
  isAccount,
  validateTarget,
  getTargetPlaceholder,
  getTargetInputType,
  getTargetMaxlength,
  getTargetError
} from '../utils/validators'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const { countdown, start } = useCountdown(60)

const mode = ref('password') // 'password' | 'code'
const channel = ref('sms') // 'sms' | 'email'（仅验证码模式使用）
const showPassword = ref(false)
const agreed = ref(false)

const form = reactive({
  account: '', // 密码模式：手机号/邮箱/用户名；验证码模式：手机号或邮箱
  password: '',
  code: ''
})

/* —— 密码模式：统一 account 输入 —— */
const accountIcon = computed(() => {
  if (mode.value === 'code') return channel.value === 'sms' ? 'phone-o' : 'envelop-o'
  return 'manager-o'
})
const accountInputType = computed(() => {
  if (mode.value === 'code') return getTargetInputType(channel.value)
  return 'text' // 密码模式允许输入手机号/邮箱/用户名，用 text
})
const accountMaxlength = computed(() => {
  if (mode.value === 'code') return getTargetMaxlength(channel.value)
  return 64 // 密码模式取邮箱最大长度
})
const accountPlaceholder = computed(() => {
  if (mode.value === 'code') return getTargetPlaceholder(channel.value)
  return '手机号 / 邮箱 / 用户名'
})

/* —— 校验 —— */
function validateAccount() {
  if (!form.account) {
    showToast(accountPlaceholder.value)
    return false
  }
  if (mode.value === 'password') {
    if (!isAccount(form.account)) {
      showToast('请输入正确的手机号、邮箱或用户名')
      return false
    }
  } else {
    if (!validateTarget(channel.value, form.account)) {
      showToast(getTargetError(channel.value))
      return false
    }
  }
  return true
}

/* —— 发送验证码 —— */
async function onSendCode() {
  if (!validateAccount()) return
  await authStore.requestCode(channel.value, 'login', form.account)
  start()
}

/* —— 登录 —— */
async function onLogin() {
  if (!validateAccount()) return

  if (mode.value === 'password') {
    if (!form.password) {
      showToast('请输入密码')
      return
    }
  } else {
    if (!form.code) {
      showToast('请输入验证码')
      return
    }
  }

  if (!agreed.value) {
    showToast('请先同意用户协议和隐私政策')
    return
  }

  if (mode.value === 'password') {
    await authStore.loginByPassword({
      account: form.account,
      password: form.password
    })
  } else {
    await authStore.loginByCode({
      channel: channel.value,
      target: form.account,
      code: form.code
    })
  }

  const redirect = route.query.redirect || '/home'
  router.replace(String(redirect))
}
</script>
