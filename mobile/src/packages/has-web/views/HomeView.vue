<template>
  <div class="page-screen tabbar-pad">
    <!-- Hero -->
    <div class="fam-hero hero-safe-top">
      <div class="relative z-[1] flex items-center justify-between">
        <div class="flex items-center gap-12">
          <div class="w-48 h-48 rounded-xl flex-center flex-shrink-0" :style="avatarStyle">
            <van-icon :name="familyAvatar.icon" size="24" :color="familyAvatar.color" />
          </div>
          <div class="min-w-0">
            <h1 class="text-xl font-bold text-white text-ellipsis-1">{{ family?.name || '我的家庭' }}</h1>
            <p class="text-sm text-white/80 mt-2">{{ memberCount }} 位成员</p>
          </div>
        </div>
        <div
          class="w-44 h-44 rounded-full bg-white/15 flex-center press flex-shrink-0"
          role="button"
          aria-label="成员管理"
          @click="$router.push('/members')"
        >
          <van-icon name="setting-o" size="20" color="#fff" />
        </div>
      </div>

      <!-- 成员头像列表 -->
      <div v-if="dashboard?.members?.length" class="relative z-[1] flex items-center mt-20">
        <div
          v-for="(m, i) in dashboard.members.slice(0, 5)"
          :key="m.id"
          class="w-28 h-28 rounded-full border-2 border-primary-600 overflow-hidden flex-center flex-shrink-0"
          :style="{ marginLeft: i > 0 ? '-8px' : '0' }"
        >
          <van-image v-if="m.avatarUrl" round width="28" height="28" :src="m.avatarUrl" />
          <span v-else class="text-sm font-semibold text-white">{{ (m.nickname || '?')[0] }}</span>
        </div>
        <span v-if="dashboard.members.length > 5" class="text-sm text-white/80 ml-8">
          +{{ dashboard.members.length - 5 }}
        </span>
      </div>
    </div>

    <!-- 概览卡片 -->
    <div class="relative z-[2] bg-white rounded-xl mx-16 -mt-20 py-16 shadow-card flex items-center justify-around">
      <div class="flex flex-col items-center gap-2 flex-1">
        <span class="text-xl font-bold text-gray-800">{{ stats.memberCount }}</span>
        <span class="text-xs text-gray-400">成员</span>
      </div>
      <div class="w-px h-28 bg-gray-100"></div>
      <div class="flex flex-col items-center gap-2 flex-1">
        <span class="text-xl font-bold text-gray-800">{{ stats.pendingTodoCount }}</span>
        <span class="text-xs text-gray-400">待办</span>
      </div>
      <div class="w-px h-28 bg-gray-100"></div>
      <div class="flex flex-col items-center gap-2 flex-1">
        <span class="text-xl font-bold text-gray-800">{{ stats.noticeCount }}</span>
        <span class="text-xs text-gray-400">公告</span>
      </div>
    </div>

    <!-- 快捷入口 -->
    <div class="pt-20 px-16">
      <h3 class="text-base font-semibold text-gray-800 mb-12">快捷入口</h3>
      <div class="grid grid-cols-5 gap-8 bg-white rounded-xl py-16 px-8 shadow-card">
        <div class="press flex flex-col items-center gap-6" @click="$router.push('/members')">
          <div class="w-44 h-44 rounded-lg flex-center bg-chip-blue-bg text-chip-blue-fg">
            <van-icon name="friends-o" size="22" />
          </div>
          <span class="text-xs text-gray-500">成员管理</span>
        </div>
        <div class="press flex flex-col items-center gap-6" @click="$router.push('/todos')">
          <div class="w-44 h-44 rounded-lg flex-center bg-chip-green-bg text-chip-green-fg">
            <van-icon name="todo-list-o" size="22" />
          </div>
          <span class="text-xs text-gray-500">家务待办</span>
        </div>
        <div class="press flex flex-col items-center gap-6" @click="$router.push('/notices')">
          <div class="w-44 h-44 rounded-lg flex-center bg-chip-orange-bg text-chip-orange-fg">
            <van-icon name="bell" size="22" />
          </div>
          <span class="text-xs text-gray-500">家庭公告</span>
        </div>
        <div class="press flex flex-col items-center gap-6" @click="$router.push('/milestones')">
          <div class="w-44 h-44 rounded-lg flex-center bg-chip-rose-bg text-chip-rose-fg">
            <van-icon name="medal-o" size="22" />
          </div>
          <span class="text-xs text-gray-500">大事纪</span>
        </div>
        <div class="press flex flex-col items-center gap-6" @click="handleInvite">
          <div class="w-44 h-44 rounded-lg flex-center bg-chip-violet-bg text-chip-violet-fg">
            <van-icon name="share-o" size="22" />
          </div>
          <span class="text-xs text-gray-500">邀请码</span>
        </div>
      </div>
    </div>

    <!-- 最近动态 -->
    <div class="pt-20 px-16">
      <h3 class="text-base font-semibold text-gray-800 mb-12">最近动态</h3>

      <!-- 最新公告 -->
      <div
        v-if="dashboard?.latestAnnouncement"
        class="press bg-white rounded-lg px-14 py-12 mb-8 shadow-card flex items-center justify-between"
        @click="$router.push('/notices')"
      >
        <div class="flex items-center gap-10 flex-1 min-w-0">
          <div class="w-32 h-32 rounded-md flex-center flex-shrink-0 bg-chip-orange-bg text-chip-orange-fg">
            <van-icon name="volume-o" size="18" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-base font-medium text-gray-800 text-ellipsis-1">{{ dashboard.latestAnnouncement.title }}</p>
            <p class="text-xs text-gray-400 mt-2">{{ formatTime(dashboard.latestAnnouncement.publishedAt) }}</p>
          </div>
        </div>
        <van-icon name="arrow" color="#a9b1bf" size="14" />
      </div>

      <!-- 最新待办 -->
      <div
        v-for="todo in dashboard?.latestTodos || []"
        :key="todo.id"
        class="press bg-white rounded-lg px-14 py-12 mb-8 shadow-card flex items-center justify-between"
        @click="$router.push(`/todos/${todo.id}`)"
      >
        <div class="flex items-center gap-10 flex-1 min-w-0">
          <div class="w-32 h-32 rounded-md flex-center flex-shrink-0 bg-chip-green-bg text-chip-green-fg">
            <van-icon name="checked" size="18" />
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-base font-medium text-gray-800 text-ellipsis-1">{{ todo.title }}</p>
            <p class="text-xs text-gray-400 mt-2 text-ellipsis-1">
              执行人：{{ todo.assigneeName }} · {{ todo.dueDate }}
            </p>
          </div>
        </div>
        <van-icon name="arrow" color="#a9b1bf" size="14" />
      </div>

      <!-- 空状态 -->
      <div
        v-if="!dashboard?.latestAnnouncement && !(dashboard?.latestTodos?.length)"
        class="text-center py-32"
      >
        <van-icon name="info-o" size="32" color="#a9b1bf" />
        <p class="text-sm text-gray-400 mt-8">还没有动态，开始添加待办或发布公告吧</p>
      </div>
    </div>

    <!-- 邀请码弹窗 -->
    <van-popup v-model:show="showInvite" round teleport="body" :style="{ width: '320px', padding: '24px' }">
      <div class="text-center">
        <h3 class="text-lg font-bold text-gray-800 mb-20">家庭邀请码</h3>
        <div class="bg-primary-50 rounded-lg py-20 mb-8">
          <span class="text-3xl font-bold text-primary-500 tracking-6">{{ inviteCode || '加载中...' }}</span>
        </div>
        <p class="text-sm text-gray-400 mb-20">有效期至 {{ formatTime(inviteExpiresAt) }}</p>
        <div class="flex gap-8">
          <van-button block round plain @click="handleCopyCode">复制邀请码</van-button>
          <van-button block round type="primary" @click="handleRegenerate">重新生成</van-button>
        </div>
      </div>
    </van-popup>

    <TabBar />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { showToast } from 'vant'
import { useFamilyStore } from '@/stores/family'
import { getAvatarById } from '@/constants/avatars'
import TabBar from '@/components/TabBar.vue'

const familyStore = useFamilyStore()

const showInvite = ref(false)
const inviteCode = ref('')
const inviteExpiresAt = ref('')

const family = computed(() => familyStore.currentFamily)
const dashboard = computed(() => familyStore.dashboard)
const memberCount = computed(() => dashboard.value?.members?.length || family.value?.memberCount || 0)

const familyAvatar = computed(() => {
  return getAvatarById(family.value?.avatar)
})

const avatarStyle = computed(() => ({
  background: familyAvatar.value.bg
}))

const stats = computed(() => {
  return dashboard.value?.stats || { memberCount: 0, pendingTodoCount: 0, noticeCount: 0 }
})

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  const month = d.getMonth() + 1
  const day = d.getDate()
  return `${month}月${day}日`
}

async function handleInvite() {
  showInvite.value = true
  if (!familyStore.inviteCode) {
    try {
      await familyStore.loadInviteCode()
    } catch {
      // 可能不是房主
    }
  }
  inviteCode.value = familyStore.inviteCode
  inviteExpiresAt.value = familyStore.inviteCodeExpiresAt
}

async function handleRegenerate() {
  try {
    await familyStore.regenerateInviteCode()
    inviteCode.value = familyStore.inviteCode
    inviteExpiresAt.value = familyStore.inviteCodeExpiresAt
  } catch {
    // toast 已由拦截器处理
  }
}

function handleCopyCode() {
  if (!inviteCode.value) return
  navigator.clipboard?.writeText(inviteCode.value)
  showToast('已复制')
}

onMounted(async () => {
  if (familyStore.currentFamilyId) {
    try {
      await familyStore.loadDashboard()
    } catch {
      // 可能还没家庭
    }
  } else {
    try {
      await familyStore.loadFamilies()
      if (familyStore.currentFamilyId) {
        await familyStore.loadDashboard()
      }
    } catch {
      // ignore
    }
  }
})
</script>

<style scoped>
.fam-hero {
  position: relative;
  overflow: hidden;
  background: linear-gradient(135deg, theme('colors.primary.500') 0%, theme('colors.primary.600') 100%);
  padding: 48px 20px 32px;
}
.fam-hero::before {
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
.fam-hero::after {
  content: '';
  position: absolute;
  bottom: -30px;
  left: -30px;
  width: 120px;
  height: 120px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.06);
  pointer-events: none;
}
</style>
