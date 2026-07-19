<template>
  <div class="has-page">
    <van-nav-bar title="个人中心" left-arrow fixed placeholder @click-left="$router.back()" />

    <div class="p-16 pb-[calc(24px+env(safe-area-inset-bottom))]">
      <div class="has-section flex items-center">
        <self-upload
          v-model="form.avatarUrl"
          :upload-fn="profileStore.uploadAvatar"
          accept="image/*"
          :max-size="2"
          @change="onAvatarChange"
        />
        <div class="ml-14 min-w-0">
          <div class="text-lg font-bold text-gray-800 truncate">{{ form.nickname || '未设置昵称' }}</div>
          <div class="text-sm text-gray-400 mt-6 truncate">{{ form.email || '未绑定邮箱' }}</div>
        </div>
      </div>

      <div class="has-section mt-14">
        <div class="text-base font-bold text-gray-800 mb-12">基础资料</div>
        <div class="space-y-12">
          <input v-model.trim="form.nickname" class="has-input" placeholder="请输入昵称" />
          <input v-model.trim="form.email" class="has-input" type="email" placeholder="请输入邮箱" />
        </div>
        <base-button class="mt-18 w-full" type="primary" block :loading="saving" @click="onSave">
          保存资料
        </base-button>
      </div>

      <div class="has-section mt-14">
        <div class="text-base font-bold text-gray-800 mb-10">账号信息</div>
        <div class="text-sm text-gray-500 leading-7">
          <div>账号：{{ form.username || '-' }}</div>
          <div>账号类型：{{ form.userType || '-' }}</div>
          <div>注册来源：{{ form.registerChannel || '-' }}</div>
        </div>
      </div>

      <base-button class="mt-18 w-full" type="default" block @click="onLogout">退出登录</base-button>
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { useAuthStore } from '../stores/auth'
import { useProfileStore } from '../stores/profile'

const router = useRouter()
const authStore = useAuthStore()
const profileStore = useProfileStore()
const saving = ref(false)

const form = reactive({
  username: '',
  nickname: '',
  email: '',
  avatarUrl: '',
  userType: '',
  registerChannel: ''
})

function fillForm(profile = {}) {
  form.username = profile.username || ''
  form.nickname = profile.nickname || ''
  form.email = profile.email || ''
  form.avatarUrl = profile.avatarUrl || ''
  form.userType = profile.userType || ''
  form.registerChannel = profile.registerChannel || ''
}

async function onSave() {
  saving.value = true
  try {
    const profile = await profileStore.saveProfile({
      nickname: form.nickname,
      email: form.email,
      avatarUrl: form.avatarUrl
    })
    fillForm(profile)
    showToast('资料已保存')
  } finally {
    saving.value = false
  }
}

function onAvatarChange() {
  showToast('头像已更新')
}

async function onLogout() {
  await authStore.logout()
  router.replace('/login')
}

onMounted(async () => {
  const profile = await profileStore.loadProfile()
  fillForm(profile)
})
</script>
