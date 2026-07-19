<template>
  <div class="has-page">
    <van-nav-bar title="重置密码" left-arrow fixed placeholder @click-left="$router.back()" />

    <div class="p-16">
      <div class="has-section">
        <van-tabs v-model:active="activeTab" shrink>
          <van-tab title="手机号" name="sms" />
          <van-tab title="邮箱" name="email" />
        </van-tabs>

        <div class="mt-20 space-y-12">
          <input
            v-model.trim="form.target"
            class="has-input"
            :type="activeTab === 'sms' ? 'tel' : 'email'"
            :maxlength="activeTab === 'sms' ? 11 : 64"
            :placeholder="activeTab === 'sms' ? '请输入手机号' : '请输入邮箱'"
          />
          <div class="flex gap-10">
            <input v-model.trim="form.code" class="has-input flex-1" maxlength="6" placeholder="请输入验证码" />
            <van-button class="w-[112px]" round plain type="primary" :disabled="countdown > 0" @click="onSendCode">
              {{ countdown > 0 ? `${countdown}s` : '发送验证码' }}
            </van-button>
          </div>
          <input v-model.trim="form.newPassword" class="has-input" type="password" placeholder="请输入新密码" />
        </div>

        <base-button class="mt-20 w-full" type="primary" block :loading="loading" @click="onReset">
          确认重置
        </base-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { sendCode, resetPasswordByCode } from '@/services/auth'

const router = useRouter()
const activeTab = ref('sms')
const countdown = ref(0)
const loading = ref(false)
const form = reactive({
  target: '',
  code: '',
  newPassword: ''
})

function startCountdown() {
  countdown.value = 60
  const timer = setInterval(() => {
    countdown.value -= 1
    if (countdown.value <= 0) clearInterval(timer)
  }, 1000)
}

async function onSendCode() {
  if (!form.target) {
    showToast(activeTab.value === 'sms' ? '请输入手机号' : '请输入邮箱')
    return
  }
  await sendCode({ channel: activeTab.value, scene: 'reset_password', target: form.target })
  showToast('验证码已发送')
  startCountdown()
}

async function onReset() {
  if (!form.target || !form.code || !form.newPassword) {
    showToast('请完整填写信息')
    return
  }
  loading.value = true
  try {
    await resetPasswordByCode({
      channel: activeTab.value,
      target: form.target,
      code: form.code,
      newPassword: form.newPassword
    })
    showToast('密码已重置')
    router.replace('/login')
  } finally {
    loading.value = false
  }
}
</script>
