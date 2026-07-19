<template>
  <div class="has-page pb-[calc(24px+env(safe-area-inset-bottom))]">
    <div class="px-16 pt-20 pb-26 bg-primary-500 text-white">
      <div class="flex-between">
        <div>
          <div class="text-sm opacity-90">欢迎回来</div>
          <div class="text-xl font-bold mt-4">{{ displayName }}</div>
        </div>
        <van-image
          round
          width="44"
          height="44"
          :src="profileStore.profile?.avatarUrl"
          @click="$router.push('/profile')"
        >
          <template #error>
            <div class="w-[44px] h-[44px] rounded-full bg-white/20 flex-center">
              <van-icon name="user-o" size="22" color="#fff" />
            </div>
          </template>
        </van-image>
      </div>
    </div>

    <div class="px-16 -mt-14">
      <div class="has-section">
        <div class="grid grid-cols-4 gap-12 text-center">
          <button v-for="item in quickActions" :key="item.name" class="py-8" @click="item.action">
            <div class="mx-auto w-[42px] h-[42px] rounded-lg flex-center" :style="{ background: `${item.color}18` }">
              <van-icon :name="item.icon" size="22" :color="item.color" />
            </div>
            <div class="text-xs text-gray-700 mt-8">{{ item.name }}</div>
          </button>
        </div>
      </div>

      <div class="mt-14 has-section">
        <div class="flex-between mb-12">
          <div class="text-base font-bold text-gray-800">账号状态</div>
          <base-tag type="success">已登录</base-tag>
        </div>
        <div class="text-sm text-gray-500 leading-relaxed">
          当前账号通过统一用户体系登录，C 端只展示业务入口和个人资料，不暴露管理端菜单权限。
        </div>
      </div>

      <div class="mt-14 has-section">
        <div class="text-base font-bold text-gray-800 mb-12">后续业务区</div>
        <div class="text-sm text-gray-500 leading-relaxed">
          这里可以继续承载业务卡片、消息提醒、订单/工具入口或活动内容。
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useProfileStore } from '../stores/profile'

const router = useRouter()
const authStore = useAuthStore()
const profileStore = useProfileStore()

const displayName = computed(() => {
  return profileStore.profile?.nickname || authStore.profile?.nickname || authStore.profile?.username || 'HAS 用户'
})

const quickActions = [
  { name: '资料', icon: 'user-o', color: '#0ea5e9', action: () => router.push('/profile') },
  { name: '头像', icon: 'photo-o', color: '#00b42a', action: () => router.push('/profile') },
  { name: '安全', icon: 'shield-o', color: '#ff7d00', action: () => router.push('/reset-password') },
  { name: '退出', icon: 'revoke', color: '#f53f3f', action: onLogout }
]

async function onLogout() {
  await authStore.logout()
  router.replace('/login')
}

onMounted(() => {
  authStore.loadAuthProfile().catch(() => {})
  profileStore.loadProfile().catch(() => {})
})
</script>
