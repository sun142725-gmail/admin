<template>
  <div class="auth-screen">
    <!-- 导航栏 -->
    <van-nav-bar left-arrow fixed placeholder @click-left="$router.back()" />

    <!-- 品牌区域 -->
    <div class="auth-brand auth-brand--compact">
      <div class="auth-brand-icon">
        <van-icon name="lock" size="32" color="#fff" />
      </div>
      <div class="auth-brand-title">重置密码</div>
      <div class="auth-brand-subtitle">通过手机号或邮箱验证码重置登录密码</div>
    </div>

    <!-- 表单卡片 -->
    <div class="auth-card">
      <!-- 手机号 / 邮箱 切换 -->
      <div class="auth-channel-tabs">
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
            <van-icon :name="channel === 'sms' ? 'phone-o' : 'envelop-o'" size="18" />
          </div>
          <input
            v-model.trim="form.target"
            class="auth-input"
            :type="getTargetInputType(channel)"
            :maxlength="getTargetMaxlength(channel)"
            :placeholder="getTargetPlaceholder(channel)"
          />
        </div>

        <!-- 验证码 -->
        <div class="auth-field">
          <div class="auth-input-icon">
            <van-icon name="shield-o" size="18" />
          </div>
          <input
            v-model.trim="form.code"
            class="auth-input pr-120"
            type="text"
            inputmode="numeric"
            maxlength="6"
            placeholder="请输入验证码"
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

        <!-- 新密码 -->
        <div class="auth-field">
          <div class="auth-input-icon">
            <van-icon name="lock" size="18" />
          </div>
          <input
            v-model.trim="form.newPassword"
            class="auth-input"
            :type="showPassword ? 'text' : 'password'"
            maxlength="32"
            placeholder="设置新密码（8-32位，含字母和数字）"
          />
          <div class="auth-input-action" @click="showPassword = !showPassword">
            <van-icon :name="showPassword ? 'eye-o' : 'closed-eye'" size="18" color="#86909c" />
          </div>
        </div>

        <!-- 确认新密码 -->
        <div class="auth-field">
          <div class="auth-input-icon">
            <van-icon name="lock" size="18" />
          </div>
          <input
            v-model.trim="form.confirmPassword"
            class="auth-input"
            :type="showConfirm ? 'text' : 'password'"
            maxlength="32"
            placeholder="请再次输入新密码"
            @keyup.enter="onReset"
          />
          <div class="auth-input-action" @click="showConfirm = !showConfirm">
            <van-icon :name="showConfirm ? 'eye-o' : 'closed-eye'" size="18" color="#86909c" />
          </div>
        </div>
      </div>

      <!-- 提交按钮 -->
      <button
        class="auth-submit mt-28"
        :class="{ 'opacity-60': loading }"
        :disabled="loading"
        @click="onReset"
      >
        <van-loading v-if="loading" size="20" color="#fff" />
        <span v-else>确认重置</span>
      </button>

      <!-- 底部链接 -->
      <div class="auth-footer">
        <span class="auth-footer-link" @click="$router.replace('/login')">返回登录</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { sendCode, resetPasswordByCode } from '@/services/auth'
import { useCountdown } from '../composables/useCountdown'
import {
  validateTarget,
  isPassword,
  isCode,
  getTargetPlaceholder,
  getTargetInputType,
  getTargetMaxlength,
  getTargetError
} from '../utils/validators'

const router = useRouter()
const { countdown, start } = useCountdown(60)

const channel = ref('sms')
const showPassword = ref(false)
const showConfirm = ref(false)
const loading = ref(false)

const form = reactive({
  target: '',
  code: '',
  newPassword: '',
  confirmPassword: ''
})

function validateTargetField() {
  if (!form.target) {
    showToast(getTargetPlaceholder(channel.value))
    return false
  }
  if (!validateTarget(channel.value, form.target)) {
    showToast(getTargetError(channel.value))
    return false
  }
  return true
}

async function onSendCode() {
  if (!validateTargetField()) return
  await sendCode({ channel: channel.value, scene: 'reset_password', target: form.target })
  showToast('验证码已发送')
  start()
}

async function onReset() {
  if (!validateTargetField()) return

  if (!form.code) {
    showToast('请输入验证码')
    return
  }
  if (!isCode(form.code)) {
    showToast('验证码为 6 位数字')
    return
  }
  if (!form.newPassword) {
    showToast('请设置新密码')
    return
  }
  if (!isPassword(form.newPassword)) {
    showToast('密码需 8-32 位，至少包含字母和数字')
    return
  }
  if (form.newPassword !== form.confirmPassword) {
    showToast('两次输入的密码不一致')
    return
  }

  loading.value = true
  try {
    await resetPasswordByCode({
      channel: channel.value,
      target: form.target,
      code: form.code,
      newPassword: form.newPassword
    })
    showToast('密码已重置，请重新登录')
    router.replace('/login')
  } finally {
    loading.value = false
  }
}
</script>
