<template>
  <div class="has-screen">
    <!-- 渐变 Hero 头部 -->
    <div class="home-hero">
      <div class="flex items-start justify-between">
        <div>
          <div class="home-hero-greeting">{{ greeting }}</div>
          <div class="home-hero-name">{{ displayName }}</div>
          <div class="home-hero-desc">{{ today }} · HAS Web 统一账号体系</div>
        </div>
        <div class="home-hero-avatar" @click="$router.push('/profile')">
          <van-image
            v-if="profileStore.profile?.avatarUrl"
            round
            width="48"
            height="48"
            :src="profileStore.profile.avatarUrl"
          />
          <div v-else class="w-[48px] h-[48px] rounded-full flex-center bg-white/20">
            <van-icon name="user-o" size="24" color="#fff" />
          </div>
        </div>
      </div>
    </div>

    <!-- 概览卡片 -->
    <div class="home-overview">
      <div class="home-overview-card">
        <div class="home-overview-item">
          <div class="home-overview-value">{{ loginMethod }}</div>
          <div class="home-overview-label">登录方式</div>
        </div>
        <div class="home-overview-divider" />
        <div class="home-overview-item">
          <div class="home-overview-value flex items-center gap-6">
            <span class="home-status-dot is-success" />
            <span>正常</span>
          </div>
          <div class="home-overview-label">账号状态</div>
        </div>
        <div class="home-overview-divider" />
        <div class="home-overview-item">
          <div class="home-overview-value">{{ securityLevel }}</div>
          <div class="home-overview-label">安全等级</div>
        </div>
      </div>
    </div>

    <!-- 内容区 -->
    <div class="flex-1 overflow-y-auto px-16 pt-24 has-tab-safe">
      <div class="space-y-16 pb-20">
        <!-- 快捷入口 -->
        <div class="home-card">
          <div class="home-card-header">
            <div class="home-section-title">快捷入口</div>
            <div class="home-section-sub">常用功能</div>
          </div>
          <div class="home-action-grid">
            <button
              v-for="item in quickActions"
              :key="item.name"
              class="home-action-item active:opacity-60 transition-opacity"
              @click="item.action"
            >
              <div class="home-action-icon" :style="{ background: `${item.color}15` }">
                <van-icon :name="item.icon" size="22" :color="item.color" />
              </div>
              <div class="home-action-label">{{ item.name }}</div>
            </button>
          </div>
        </div>

        <!-- 账号安全 -->
        <div class="home-card">
          <div class="home-card-header">
            <div class="home-section-title">账号安全</div>
            <span
              class="inline-flex items-center gap-6 text-xs text-success px-10 py-2 rounded-full"
              style="background: rgba(16, 185, 129, 0.08)"
            >
              <span class="home-status-dot is-success" />
              已登录
            </span>
          </div>
          <div class="home-list">
            <div class="home-list-item">
              <div class="home-list-label">
                <van-icon name="shield-o" size="18" color="#86909c" />
                登录密码
              </div>
              <div class="home-list-value" @click="$router.push('/reset-password')">修改</div>
            </div>
            <div class="home-list-item">
              <div class="home-list-label">
                <van-icon name="phone-o" size="18" color="#86909c" />
                绑定手机
              </div>
              <div class="home-list-value">{{ maskedPhone || '未绑定' }}</div>
            </div>
            <div class="home-list-item">
              <div class="home-list-label">
                <van-icon name="envelop-o" size="18" color="#86909c" />
                绑定邮箱
              </div>
              <div class="home-list-value">{{ maskedEmail || '未绑定' }}</div>
            </div>
          </div>
        </div>

        <!-- 业务预留区 -->
        <div class="home-card">
          <div class="home-card-header">
            <div class="home-section-title">业务预留</div>
          </div>
          <div class="text-sm text-gray-400 leading-relaxed">
            这里可以继续承载业务卡片、消息提醒、订单 / 工具入口或活动内容。
          </div>
        </div>
      </div>
    </div>

    <!-- 底部 Tab -->
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
  return (
    profileStore.profile?.nickname ||
    authStore.profile?.nickname ||
    authStore.profile?.username ||
    'HAS 用户'
  )
})

const loginMethod = computed(() => {
  const p = authStore.profile || profileStore.profile || {}
  if (p.registerChannel === 'sms') return '手机号'
  if (p.registerChannel === 'email') return '邮箱'
  return '账号'
})

const securityLevel = computed(() => {
  const p = authStore.profile || profileStore.profile || {}
  let score = 1
  if (p.password) score++
  if (p.phone) score++
  if (p.email) score++
  if (score >= 3) return '高'
  if (score === 2) return '中'
  return '低'
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

const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 6) return '凌晨好'
  if (h < 12) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
})

const today = computed(() => {
  const d = new Date()
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${d.getMonth() + 1}月${d.getDate()}日 ${week[d.getDay()]}`
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
