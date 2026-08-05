<template>
  <div class="auth-screen">
    <!-- 导航栏 -->
    <van-nav-bar left-arrow fixed placeholder @click-left="$router.back()" />

    <!-- 品牌区域 -->
    <div class="auth-brand !pt-32 !pb-24">
      <div class="auth-brand-icon">
        <van-icon name="friends-o" size="32" color="#fff" />
      </div>
      <div class="auth-brand-title">创建账号</div>
      <div class="auth-brand-subtitle">注册后即可使用 HAS Web 全部功能</div>
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
          手机号注册
        </div>
        <div
          class="auth-channel-tab"
          :class="{ 'is-active': channel === 'email' }"
          @click="channel = 'email'"
        >
          邮箱注册
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
            class="auth-input pr-[120px]"
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

        <!-- 密码 -->
        <div class="auth-field">
          <div class="auth-input-icon">
            <van-icon name="lock" size="18" />
          </div>
          <input
            v-model.trim="form.password"
            class="auth-input"
            :type="showPassword ? 'text' : 'password'"
            maxlength="32"
            placeholder="设置密码（8-32位，含字母和数字）"
          />
          <div class="auth-input-action" @click="showPassword = !showPassword">
            <van-icon :name="showPassword ? 'eye-o' : 'closed-eye'" size="18" color="#86909c" />
          </div>
        </div>

        <!-- 确认密码 -->
        <div class="auth-field">
          <div class="auth-input-icon">
            <van-icon name="lock" size="18" />
          </div>
          <input
            v-model.trim="form.confirmPassword"
            class="auth-input"
            :type="showConfirm ? 'text' : 'password'"
            maxlength="32"
            placeholder="请再次输入密码"
            @keyup.enter="onRegister"
          />
          <div class="auth-input-action" @click="showConfirm = !showConfirm">
            <van-icon :name="showConfirm ? 'eye-o' : 'closed-eye'" size="18" color="#86909c" />
          </div>
        </div>
      </div>

      <!-- 提交按钮 -->
      <button
        class="auth-submit mt-28"
        :class="{ 'opacity-60': authStore.loading }"
        :disabled="authStore.loading"
        @click="onRegister"
      >
        <van-loading v-if="authStore.loading" size="20" color="#fff" />
        <span v-else>注 册</span>
      </button>

      <!-- 底部链接 -->
      <div class="auth-footer">
        <span class="text-gray-400">已有账号？</span>
        <span class="auth-footer-link" @click="$router.replace('/login')">返回登录</span>
      </div>

      <!-- 协议 -->
      <div class="auth-agreement">
        <input
          v-model="agreed"
          type="checkbox"
          class="auth-agreement-checkbox"
        />
        <span>
          注册即表示同意
          <span class="text-primary-500">《用户协议》</span>
          和
          <span class="text-primary-500">《隐私政策》</span>
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { useAuthStore } from '../stores/auth'
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
const authStore = useAuthStore()
const { countdown, start } = useCountdown(60)

const channel = ref('sms')
const showPassword = ref(false)
const showConfirm = ref(false)
const agreed = ref(false)

const form = reactive({
  target: '',
  code: '',
  password: '',
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
  await authStore.requestCode(channel.value, 'register', form.target)
  start()
}

async function onRegister() {
  if (!validateTargetField()) return

  if (!form.code) {
    showToast('请输入验证码')
    return
  }
  if (!isCode(form.code)) {
    showToast('验证码为 6 位数字')
    return
  }
  if (!form.password) {
    showToast('请设置密码')
    return
  }
  if (!isPassword(form.password)) {
    showToast('密码需 8-32 位，至少包含字母和数字')
    return
  }
  if (form.password !== form.confirmPassword) {
    showToast('两次输入的密码不一致')
    return
  }
  if (!agreed.value) {
    showToast('请先同意用户协议和隐私政策')
    return
  }

  await authStore.register({
    channel: channel.value,
    target: form.target,
    code: form.code,
    password: form.password
  })

  showToast('注册成功')
  // 如果注册后已自动登录则直接进入首页，否则跳转登录页
  if (authStore.isLoggedIn) {
    router.replace('/home')
  } else {
    router.replace('/login')
  }
}
</script>
