<template>
  <div class="has-screen">
    <div class="has-content pt-32 has-bottom-safe">
      <div class="has-card-stack">
        <div class="has-section">
          <div class="has-page-title">HAS Web</div>
          <div class="has-page-subtitle">验证码登录，首次使用自动注册</div>
        </div>

        <div class="has-section">
        <van-tabs v-model:active="activeTab" shrink>
          <van-tab title="手机号" name="sms" />
          <van-tab title="邮箱" name="email" />
        </van-tabs>

        <div class="mt-20 has-field-stack">
          <input
            v-model.trim="form.target"
            class="has-input"
            :type="activeTab === 'sms' ? 'tel' : 'email'"
            :maxlength="activeTab === 'sms' ? 11 : 64"
            :placeholder="activeTab === 'sms' ? '请输入手机号' : '请输入邮箱'"
          />

          <div class="flex gap-10">
            <input v-model.trim="form.code" class="has-input flex-1" maxlength="6" placeholder="请输入验证码" />
            <van-button class="w-[112px] !h-[44px]" round plain type="primary" :disabled="countdown > 0" @click="onSendCode">
              {{ countdown > 0 ? `${countdown}s` : '发送验证码' }}
            </van-button>
          </div>

          <base-button class="w-full !min-h-[44px]" type="primary" block :loading="authStore.loading" @click="onLogin">
            登录 / 注册
          </base-button>

          <button class="w-full text-sm text-primary-500 active:text-primary-700 transition-colors" @click="$router.push('/reset-password')">
            忘记密码？
          </button>
        </div>
      </div>

        <div class="has-section">
          <div class="text-sm font-semibold text-gray-700">账号说明</div>
          <div class="text-xs text-gray-400 leading-relaxed mt-8">
            登录即表示你同意使用统一账号体系。C 端账号与管理端共用用户主表，但权限和入口相互隔离。
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showToast } from 'vant'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const activeTab = ref('sms')
const countdown = ref(0)
const form = reactive({
  target: '',
  code: ''
})

function validateTarget() {
  if (!form.target) {
    showToast(activeTab.value === 'sms' ? '请输入手机号' : '请输入邮箱')
    return false
  }
  if (activeTab.value === 'sms' && !/^1\d{10}$/.test(form.target)) {
    showToast('请输入正确的手机号')
    return false
  }
  if (activeTab.value === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.target)) {
    showToast('请输入正确的邮箱')
    return false
  }
  return true
}

function startCountdown() {
  countdown.value = 60
  const timer = setInterval(() => {
    countdown.value -= 1
    if (countdown.value <= 0) clearInterval(timer)
  }, 1000)
}

async function onSendCode() {
  if (!validateTarget()) return
  await authStore.requestCode(activeTab.value, 'login', form.target)
  startCountdown()
}

async function onLogin() {
  if (!validateTarget()) return
  if (!form.code) {
    showToast('请输入验证码')
    return
  }
  await authStore.loginByCode({
    channel: activeTab.value,
    target: form.target,
    code: form.code
  })
  const redirect = route.query.redirect || '/home'
  router.replace(String(redirect))
}
</script>
