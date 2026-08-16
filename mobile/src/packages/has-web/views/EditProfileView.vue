<template>
  <div class="edit-profile-screen">
    <!-- 导航栏 -->
    <van-nav-bar title="编辑资料" left-arrow @click-left="$router.back()" />

    <div class="edit-profile-content">
      <!-- 头像 -->
      <div class="edit-avatar-section" @click="triggerUpload">
        <van-image v-if="form.avatarUrl" round width="80" height="80" :src="form.avatarUrl" />
        <div v-else class="edit-avatar-fallback">
          <van-icon name="user-o" size="40" color="#fff" />
        </div>
        <div class="edit-avatar-camera">
          <van-icon name="photograph" size="14" color="#0ea5e9" />
        </div>
        <p class="edit-avatar-hint">点击更换头像</p>
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
      <div class="edit-form-card">
        <div class="edit-form-row">
          <span class="edit-form-label">昵称</span>
          <input
            v-model.trim="form.nickname"
            class="edit-form-input"
            placeholder="请输入昵称"
            maxlength="20"
          />
        </div>
        <div class="edit-form-row">
          <span class="edit-form-label">邮箱</span>
          <input
            :value="form.email"
            class="edit-form-input"
            type="email"
            readonly
          />
        </div>
        <div class="edit-form-row">
          <span class="edit-form-label">账号</span>
          <span class="edit-form-value">{{ form.username || '-' }}</span>
        </div>
      </div>

      <!-- 保存按钮 -->
      <button class="edit-save-btn" :disabled="saving" @click="onSave">
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
.edit-profile-screen { min-height: 100vh; background: #f8fafc; }

.edit-profile-content { padding: 16px; }

/* Avatar */
.edit-avatar-section {
  display: flex; flex-direction: column; align-items: center; padding: 24px 0 32px;
  position: relative;
}
.edit-avatar-fallback {
  width: 80px; height: 80px; border-radius: 50%;
  background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
  display: flex; align-items: center; justify-content: center;
}
.edit-avatar-camera {
  position: absolute; top: 38px; right: calc(50% - 52px);
  width: 28px; height: 28px; border-radius: 50%; background: #fff;
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15); z-index: 1;
}
.edit-avatar-hint {
  font-size: 12px; color: #94a3b8; margin-top: 12px;
}

/* Form */
.edit-form-card {
  background: #fff; border-radius: 16px; padding: 4px 16px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.03); margin-bottom: 24px;
}
.edit-form-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 0; border-bottom: 1px solid #f1f5f9;
}
.edit-form-row:last-child { border-bottom: none; }
.edit-form-label { font-size: 15px; color: #475569; font-weight: 500; flex-shrink: 0; }
.edit-form-input {
  flex: 1; text-align: right; font-size: 15px; color: #1e293b;
  border: none; outline: none; background: transparent; -webkit-appearance: none;
}
.edit-form-input::placeholder { color: #cbd5e1; }
.edit-form-value { font-size: 15px; color: #94a3b8; }

/* Save */
.edit-save-btn {
  width: 100%; height: 46px; border-radius: 23px; border: none;
  background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
  color: #fff; font-size: 16px; font-weight: 600; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.edit-save-btn:active { opacity: 0.9; }
.edit-save-btn:disabled { opacity: 0.5; }
</style>
