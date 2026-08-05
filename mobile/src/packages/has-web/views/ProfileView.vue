<template>
  <div class="has-screen">
    <!-- 渐变 Hero 头部 -->
    <div class="profile-hero">
      <div class="profile-avatar-wrap" @click="triggerUpload">
        <div class="profile-avatar">
          <van-image
            v-if="form.avatarUrl"
            width="80"
            height="80"
            :src="form.avatarUrl"
          />
          <div v-else class="w-[80px] h-[80px] rounded-full flex-center bg-white/20">
            <van-icon name="user-o" size="40" color="#fff" />
          </div>
        </div>
        <div class="absolute -bottom-2 -right-2 w-[28px] h-[28px] rounded-full bg-white flex-center shadow-card z-10">
          <van-icon name="photograph" size="14" color="#0ea5e9" />
        </div>
      </div>
      <div class="profile-name">{{ form.nickname || '未设置昵称' }}</div>
      <div class="profile-meta">{{ form.email || '未绑定邮箱' }}</div>
    </div>

    <!-- 隐藏的上传组件 -->
    <self-upload
      ref="uploadRef"
      v-model="form.avatarUrl"
      accept="image/*"
      :max-size="2"
      class="hidden"
      @change="onAvatarChange"
    />

    <!-- 内容区 -->
    <div class="flex-1 overflow-y-auto px-16 pt-24 has-tab-safe">
      <div class="space-y-16 pb-20">
        <!-- 个人资料 -->
        <div class="profile-card">
          <div class="profile-card-title">个人资料</div>
          <div class="space-y-16">
            <div class="profile-field">
              <div class="profile-field-label">昵称</div>
              <input
                v-model.trim="form.nickname"
                class="profile-input"
                placeholder="请输入昵称"
              />
            </div>
            <div class="profile-field">
              <div class="profile-field-label">邮箱</div>
              <input
                v-model.trim="form.email"
                class="profile-input"
                type="email"
                placeholder="请输入邮箱"
              />
            </div>
          </div>
          <button class="profile-save-btn" :disabled="saving" @click="onSave">
            <van-loading v-if="saving" size="18" color="#fff" />
            <span v-else>保存资料</span>
          </button>
        </div>

        <!-- 安全设置 -->
        <div class="profile-card">
          <div class="profile-card-title">安全设置</div>
          <div class="divide-y divide-gray-50">
            <div class="profile-action-row" @click="$router.push('/reset-password')">
              <div class="profile-action-label">
                <div class="profile-action-icon" style="background: rgba(255, 125, 0, 0.1)">
                  <van-icon name="lock" size="18" color="#ff7d00" />
                </div>
                修改密码
              </div>
              <van-icon name="arrow" size="16" color="#c9cdd4" />
            </div>
            <div class="profile-action-row">
              <div class="profile-action-label">
                <div class="profile-action-icon" style="background: rgba(14, 165, 233, 0.1)">
                  <van-icon name="phone-o" size="18" color="#0ea5e9" />
                </div>
                绑定手机
              </div>
              <span class="text-sm text-gray-400">{{ maskedPhone || '未绑定' }}</span>
            </div>
            <div class="profile-action-row">
              <div class="profile-action-label">
                <div class="profile-action-icon" style="background: rgba(0, 180, 42, 0.1)">
                  <van-icon name="envelop-o" size="18" color="#00b42a" />
                </div>
                绑定邮箱
              </div>
              <span class="text-sm text-gray-400">{{ maskedEmail || '未绑定' }}</span>
            </div>
          </div>
        </div>

        <!-- 账号信息 -->
        <div class="profile-card">
          <div class="profile-card-title">账号信息</div>
          <div class="divide-y divide-gray-50">
            <div class="profile-action-row">
              <div class="profile-action-label">账号</div>
              <span class="text-sm text-gray-400">{{ form.username || '-' }}</span>
            </div>
            <div class="profile-action-row">
              <div class="profile-action-label">账号类型</div>
              <span class="text-sm text-gray-400">{{ form.userType || '-' }}</span>
            </div>
            <div class="profile-action-row">
              <div class="profile-action-label">注册来源</div>
              <span class="text-sm text-gray-400">{{ registerChannelText }}</span>
            </div>
          </div>
        </div>

        <!-- 退出登录 -->
        <button class="home-logout" @click="onLogout">退出登录</button>
      </div>
    </div>

    <!-- 底部 Tab -->
    <div class="has-bottom-tab">
      <div class="flex gap-8">
        <button class="has-tab-item" @click="$router.push('/home')">
          <van-icon name="wap-home-o" size="20" />
          <span>首页</span>
        </button>
        <button class="has-tab-item is-active" @click="$router.push('/profile')">
          <van-icon name="user-o" size="20" />
          <span>个人中心</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { useAuthStore } from '../stores/auth'
import { useProfileStore } from '../stores/profile'

const router = useRouter()
const authStore = useAuthStore()
const profileStore = useProfileStore()
const saving = ref(false)
const uploadRef = ref(null)

const form = reactive({
  username: '',
  nickname: '',
  email: '',
  avatarUrl: '',
  userType: '',
  registerChannel: ''
})

const registerChannelText = computed(() => {
  const map = { sms: '手机号', email: '邮箱', username: '用户名' }
  return map[form.registerChannel] || form.registerChannel || '-'
})

const maskedPhone = computed(() => {
  const phone = authStore.profile?.phone || profileStore.profile?.phone
  if (!phone) return ''
  return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2')
})

const maskedEmail = computed(() => {
  const email = authStore.profile?.email || profileStore.profile?.email
  if (!email) return ''
  const [name, domain] = email.split('@')
  if (!domain) return email
  const visible = name.slice(0, Math.min(2, name.length))
  return `${visible}${'*'.repeat(Math.max(name.length - 2, 0))}@${domain}`
})

function fillForm(profile = {}) {
  form.username = profile.username || ''
  form.nickname = profile.nickname || ''
  form.email = profile.email || ''
  form.avatarUrl = profile.avatarUrl || ''
  form.userType = profile.userType || ''
  form.registerChannel = profile.registerChannel || ''
}

function triggerUpload() {
  uploadRef.value?.trigger?.()
}

async function onSave() {
  saving.value = true
  try {
    await profileStore.saveProfile({
      nickname: form.nickname,
      email: form.email
    })
    showToast('资料已保存')
  } finally {
    saving.value = false
  }
}

function onAvatarChange() {
  showToast('C 端头像上传接口暂未开放')
  form.avatarUrl = profileStore.profile?.avatarUrl || ''
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
