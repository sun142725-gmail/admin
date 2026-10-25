<template>
  <div class="page-screen">
    <!-- 导航栏 -->
    <van-nav-bar title="编辑资料" left-arrow @click-left="$router.back()" />

    <div class="p-16">
      <!-- 头像 -->
      <div class="press flex flex-col items-center pt-24 pb-32 relative" @click="triggerUpload">
        <div class="relative">
          <van-image v-if="form.avatarUrl" round width="80" height="80" :src="form.avatarUrl" />
          <div v-else class="w-80 h-80 rounded-full bg-gradient-to-br from-primary-500 to-primary-600 flex-center">
            <van-icon name="user-o" size="40" color="#fff" />
          </div>
          <div class="absolute -bottom-2 -right-2 z-[1] w-28 h-28 rounded-full bg-white flex-center shadow-popover">
            <van-icon name="photograph" size="14" color="#0ea5e9" />
          </div>
        </div>
        <p class="text-sm text-gray-400 mt-12">点击更换头像</p>
      </div>

      <!-- 隐藏的上传组件 -->
      <SelfUpload
        ref="uploadRef"
        v-model="form.avatarUrl"
        accept="image/*"
        :max-size="2"
        class="hidden"
        @change="onAvatarChange"
      />

      <!-- 资料表单 -->
      <div class="screen-card px-16 py-4 mb-24">
        <div class="flex items-center justify-between py-14 min-h-touch border-b border-gray-50">
          <span class="text-base font-medium text-gray-600 flex-shrink-0">昵称</span>
          <input
            v-model.trim="form.nickname"
            class="edit-form-input"
            placeholder="请输入昵称"
            maxlength="20"
          />
        </div>
        <div class="flex items-center justify-between py-14 min-h-touch border-b border-gray-50">
          <span class="text-base font-medium text-gray-600 flex-shrink-0">邮箱</span>
          <input
            :value="form.email"
            class="edit-form-input"
            type="email"
            readonly
          />
        </div>
        <div class="flex items-center justify-between py-14 min-h-touch">
          <span class="text-base font-medium text-gray-600 flex-shrink-0">账号</span>
          <span class="text-base text-gray-400">{{ form.username || '-' }}</span>
        </div>
      </div>

      <!-- 保存按钮 -->
      <button
        class="w-full h-btn_lg rounded-full bg-gradient-to-br from-primary-500 to-primary-600 text-white text-base font-semibold press flex items-center justify-center active:opacity-90 disabled:opacity-50"
        :disabled="saving"
        @click="onSave"
      >
        <van-loading v-if="saving" size="18" color="#fff" />
        <span v-else>保存资料</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { useAuthStore } from '@/stores/auth'
import { useProfileStore } from '@/stores/profile'
import { updateProfile } from '@/services/user'

const router = useRouter()
const authStore = useAuthStore()
const profileStore = useProfileStore()

const saving = ref(false)
const uploadRef = ref(null)

const form = reactive({
  username: '',
  nickname: '',
  email: '',
  avatarUrl: ''
})

function triggerUpload() {
  uploadRef.value?.trigger?.()
}

function onAvatarChange() {
  // 头像选择后暂不自动上传，随保存一起提交
}

async function onSave() {
  if (!form.nickname) {
    showToast('请输入昵称')
    return
  }
  saving.value = true
  try {
    await updateProfile({
      nickname: form.nickname,
      avatarUrl: form.avatarUrl
    })
    // 同步更新 authStore.profile
    if (authStore.profile) {
      authStore.profile.nickname = form.nickname
      authStore.profile.avatarUrl = form.avatarUrl
    }
    showToast('资料已保存')
    router.back()
  } catch {
    // toast 已处理
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  const profile = authStore.profile || await profileStore.loadProfile()
  form.username = profile?.username || ''
  form.nickname = profile?.nickname || ''
  form.email = profile?.email || ''
  form.avatarUrl = profile?.avatarUrl || ''
})
</script>

<style scoped>
.edit-form-input {
  flex: 1;
  text-align: right;
  font-size: theme('fontSize.base');
  color: theme('colors.gray.800');
  border: none;
  outline: none;
  background: transparent;
  -webkit-appearance: none;
  min-width: 0;
}

.edit-form-input::placeholder {
  color: theme('colors.gray.300');
}
</style>
