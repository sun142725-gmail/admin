<template>
  <div class="has-screen">
    <div class="px-16 pt-14 pb-12 bg-white border-b border-gray-100 flex-between flex-shrink-0">
      <div>
        <div class="text-lg font-bold text-gray-800">首页</div>
        <div class="text-xs text-gray-400 mt-2">HAS Web</div>
      </div>
      <van-image
        round
        width="40"
        height="40"
        :src="profileStore.profile?.avatarUrl"
        @click="$router.push('/profile')"
      >
        <template #error>
          <div class="w-[40px] h-[40px] rounded-full bg-primary-50 flex-center">
            <van-icon name="user-o" size="20" color="#0ea5e9" />
          </div>
        </template>
      </van-image>
    </div>

    <div class="flex-1 overflow-y-auto px-16 pt-16 has-tab-safe">
      <div class="has-card-stack">
        <div class="has-section bg-primary-500 text-white">
          <div class="text-sm opacity-90">欢迎回来</div>
          <div class="text-2xl font-bold mt-6">{{ displayName }}</div>
          <div class="text-xs opacity-80 mt-10 leading-relaxed">
            当前账号通过统一用户体系登录，C 端只展示业务入口和个人资料。
          </div>
        </div>

        <div class="has-section">
          <div class="flex-between mb-14">
            <div class="text-base font-bold text-gray-800">快捷入口</div>
            <div class="text-xs text-gray-400">常用功能</div>
          </div>
          <div class="grid grid-cols-4 gap-12 text-center">
            <button
              v-for="item in quickActions"
              :key="item.name"
              class="py-8 rounded-lg active:bg-gray-50 transition-colors"
              @click="item.action"
            >
              <div class="mx-auto w-[44px] h-[44px] rounded-lg flex-center" :style="{ background: `${item.color}18` }">
                <van-icon :name="item.icon" size="22" :color="item.color" />
              </div>
              <div class="text-xs text-gray-700 mt-8">{{ item.name }}</div>
            </button>
          </div>
        </div>

        <div class="has-section">
          <div class="flex-between mb-12">
            <div class="text-base font-bold text-gray-800">账号状态</div>
            <base-tag type="success">已登录</base-tag>
          </div>
          <div class="text-sm text-gray-500 leading-relaxed">
            后续这里可以扩展登录安全、绑定状态、消息提醒等信息。
          </div>
        </div>

        <div class="has-section">
          <div class="text-base font-bold text-gray-800 mb-12">业务预留区</div>
          <div class="text-sm text-gray-500 leading-relaxed">
            这里可以继续承载业务卡片、消息提醒、订单/工具入口或活动内容。
          </div>
        </div>
      </div>
    </div>

    <div class="has-bottom-tab">
      <div class="flex gap-8">
        <button class="has-tab-item is-active" @click="$router.push('/home')">
          <van-icon name="wap-home-o" size="20" />
          <span>首页</span>
        </button>
        <button class="has-tab-item" @click="$router.push('/profile')">
          <van-icon name="user-o" size="20" />
          <span>个人中心</span>
        </button>
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
