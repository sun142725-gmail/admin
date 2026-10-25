<template>
  <div class="page-screen tabbar-pad">
    <!-- Hero -->
    <div class="profile-hero hero-safe-top">
      <div class="relative z-[1] flex flex-col items-center">
        <div class="relative inline-block press" role="button" aria-label="编辑资料" @click="$router.push('/edit-profile')">
          <van-image v-if="avatarUrl" round width="72" height="72" :src="avatarUrl" />
          <div v-else class="w-72 h-72 rounded-full bg-white/20 flex-center">
            <van-icon name="user-o" size="36" color="#fff" />
          </div>
          <div class="absolute -bottom-2 -right-2 z-[1] w-24 h-24 rounded-full bg-white flex-center shadow-popover">
            <van-icon name="photograph" size="12" color="#0ea5e9" />
          </div>
        </div>
        <h2 class="relative z-[1] text-lg font-bold text-white mt-12">{{ nickname || '未设置昵称' }}</h2>
        <p class="relative z-[1] text-sm text-white/80 mt-4">{{ maskedEmail || username || '' }}</p>
      </div>
    </div>

    <div class="p-16">
      <!-- 当前家庭 -->
      <div v-if="familyStore.currentFamily" class="screen-card p-16 mb-12">
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-12 min-w-0">
            <div class="w-40 h-40 rounded-lg flex-center flex-shrink-0" :style="avatarStyle">
              <van-icon :name="familyAvatar.icon" size="20" :color="familyAvatar.color" />
            </div>
            <div class="min-w-0">
              <p class="text-base font-semibold text-gray-800 text-ellipsis-1">{{ familyStore.currentFamily.name }}</p>
              <p class="text-sm text-gray-400 mt-2">{{ familyStore.currentFamily.memberCount }} 位成员</p>
            </div>
          </div>
          <van-button
            v-if="familyStore.families.length > 1"
            size="small"
            plain
            round
            type="primary"
            @click="showFamilyPicker = true"
          >
            切换
          </van-button>
        </div>
      </div>

      <!-- 菜单 -->
      <div class="screen-card px-16 mb-12">
        <div class="press flex items-center justify-between py-12 min-h-touch border-b border-gray-50 active:bg-gray-50 -mx-16 px-16" @click="$router.push('/edit-profile')">
          <div class="flex items-center gap-10">
            <div class="w-32 h-32 rounded-md flex-center bg-chip-blue-bg text-chip-blue-fg">
              <van-icon name="contact" size="18" />
            </div>
            <span class="text-base font-medium text-gray-800">编辑资料</span>
          </div>
          <van-icon name="arrow" color="#a9b1bf" size="14" />
        </div>
        <div class="press flex items-center justify-between py-12 min-h-touch border-b border-gray-50 active:bg-gray-50 -mx-16 px-16" @click="$router.push('/members')">
          <div class="flex items-center gap-10">
            <div class="w-32 h-32 rounded-md flex-center bg-chip-violet-bg text-chip-violet-fg">
              <van-icon name="friends-o" size="18" />
            </div>
            <span class="text-base font-medium text-gray-800">家庭管理</span>
          </div>
          <van-icon name="arrow" color="#a9b1bf" size="14" />
        </div>
        <div class="press flex items-center justify-between py-12 min-h-touch border-b border-gray-50 active:bg-gray-50 -mx-16 px-16" @click="$router.push('/reset-password')">
          <div class="flex items-center gap-10">
            <div class="w-32 h-32 rounded-md flex-center bg-chip-orange-bg text-chip-orange-fg">
              <van-icon name="lock" size="18" />
            </div>
            <span class="text-base font-medium text-gray-800">修改密码</span>
          </div>
          <van-icon name="arrow" color="#a9b1bf" size="14" />
        </div>
        <div class="press flex items-center justify-between py-12 min-h-touch active:bg-gray-50 -mx-16 px-16" @click="$router.push('/settings')">
          <div class="flex items-center gap-10">
            <div class="w-32 h-32 rounded-md flex-center bg-chip-gray-bg text-chip-gray-fg">
              <van-icon name="setting-o" size="18" />
            </div>
            <span class="text-base font-medium text-gray-800">设置</span>
          </div>
          <van-icon name="arrow" color="#a9b1bf" size="14" />
        </div>
      </div>

      <!-- 退出登录 -->
      <button
        class="w-full h-48 rounded-full border border-danger text-danger text-base font-medium press mt-8 active:bg-chip-rose-bg"
        @click="onLogout"
      >
        退出登录
      </button>
    </div>

    <!-- 家庭切换选择器 -->
    <van-popup v-model:show="showFamilyPicker" round position="bottom" teleport="body">
      <van-picker
        :columns="familyColumns"
        title="切换家庭"
        @confirm="onFamilySwitch"
        @cancel="showFamilyPicker = false"
      />
    </van-popup>

    <TabBar />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import { useAuthStore } from '@/stores/auth'
import { useProfileStore } from '@/stores/profile'
import { useFamilyStore } from '@/stores/family'
import { getAvatarById } from '@/constants/avatars'
import TabBar from '@/components/TabBar.vue'

const router = useRouter()
const authStore = useAuthStore()
const profileStore = useProfileStore()
const familyStore = useFamilyStore()

const showFamilyPicker = ref(false)

// 直接从 authStore.profile 取展示数据
const profile = computed(() => authStore.profile || {})
const nickname = computed(() => profile.value?.nickname || '')
const username = computed(() => profile.value?.username || '')
const email = computed(() => profile.value?.email || '')
const avatarUrl = computed(() => profile.value?.avatarUrl || '')

const familyAvatar = computed(() => getAvatarById(familyStore.currentFamily?.avatar))
const avatarStyle = computed(() => ({ background: familyAvatar.value.bg }))

const familyColumns = computed(() => {
  return familyStore.families.map((f) => ({
    text: f.name,
    value: f.id
  }))
})

const maskedEmail = computed(() => {
  if (!email.value) return ''
  const [name, domain] = email.value.split('@')
  if (!domain) return email.value
  return `${name.slice(0, 2)}${'*'.repeat(Math.max(name.length - 2, 0))}@${domain}`
})

async function onFamilySwitch({ selectedValues }) {
  const familyId = selectedValues[0]
  try {
    await familyStore.switchFamilyAction(familyId)
    showFamilyPicker.value = false
    showToast('已切换家庭')
  } catch {
    // toast 已处理
  }
}

async function onLogout() {
  showConfirmDialog({
    title: '退出登录',
    message: '确定要退出当前账号吗？'
  }).then(async () => {
    await authStore.logout()
    familyStore.reset()
    router.replace('/login')
  }).catch(() => {})
}

onMounted(async () => {
  // authStore.profile 已有数据则直接用，否则加载一次
  if (!authStore.profile) {
    try {
      await profileStore.loadProfile()
      authStore.profile = profileStore.profile
    } catch {
      // ignore
    }
  }

  if (!familyStore.currentFamily) {
    try {
      await familyStore.loadFamilies()
    } catch {
      // ignore
    }
  }
})
</script>

<style scoped>
.profile-hero {
  position: relative;
  overflow: hidden;
  background: linear-gradient(135deg, theme('colors.primary.500') 0%, theme('colors.primary.600') 100%);
  padding: 48px 24px 32px;
}
.profile-hero::before {
  content: '';
  position: absolute;
  top: -30px;
  right: -30px;
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  pointer-events: none;
}
</style>
