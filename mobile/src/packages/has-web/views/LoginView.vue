<template>
  <div class="has-page flex flex-col">
    <div class="px-20 pt-44 pb-24 bg-primary-500 text-white">
      <div class="text-2xl font-bold">HAS Web</div>
      <div class="text-sm opacity-90 mt-8">验证码登录，首次使用自动注册</div>
    </div>

    <div class="flex-1 px-16 pt-20">
      <div class="has-section">
        <van-tabs v-model:active="activeTab" shrink>
          <van-tab title="手机号" name="sms" />
          <van-tab title="邮箱" name="email" />
        </van-tabs>

        <div class="mt-20">
          <input
            v-model.trim="form.target"
            class="has-input"
            :type="activeTab === 'sms' ? 'tel' : 'email'"
            :maxlength="activeTab === 'sms' ? 11 : 64"
            :placeholder="activeTab === 'sms' ? '请输入手机号' : '请输入邮箱'"
          />

          <div class="flex gap-10 mt-12">
            <input v-model.trim="form.code" class="has-input flex-1" maxlength="6" placeholder="请输入验证码" />
            <van-button class="w-[112px]" round plain type="primary" :disabled="countdown > 0" @click="onSendCode">
              {{ countdown > 0 ? `${countdown}s` : '发送验证码' }}
            </van-button>
          </div>

          <base-button class="mt-20 w-full" type="primary" block :loading="authStore.loading" @click="onLogin">
            登录 / 注册
          </base-button>

          <button class="w-full mt-16 text-sm text-primary-500" @click="$router.push('/reset-password')">
            忘记密码？
          </button>
        </div>
      </div>

      <div class="px-8 mt-18 text-xs text-gray-400 leading-relaxed">
        登录即表示你同意使用统一账号体系。C 端账号与管理端共用用户主表，但权限和入口相互隔离。
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
