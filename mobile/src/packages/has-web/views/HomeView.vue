<template>
  <div class="home-screen">
    <!-- Hero -->
    <div class="fam-hero">
      <div class="fam-hero-top">
        <div class="fam-hero-info">
          <div class="fam-hero-avatar" :style="avatarStyle">
            <van-icon :name="familyAvatar.icon" size="24" :color="familyAvatar.color" />
          </div>
          <div>
            <h1 class="fam-hero-name">{{ family?.name || '我的家庭' }}</h1>
            <p class="fam-hero-meta">{{ memberCount }} 位成员</p>
          </div>
        </div>
        <div class="fam-hero-settings" @click="$router.push('/members')">
          <van-icon name="setting-o" size="20" color="#fff" />
        </div>
      </div>

      <!-- 成员头像列表 -->
      <div class="fam-hero-members" v-if="dashboard?.members?.length">
        <div
          v-for="(m, i) in dashboard.members.slice(0, 5)"
          :key="m.id"
          class="fam-member-chip"
          :style="{ marginLeft: i > 0 ? '-8px' : '0' }"
        >
          <van-image v-if="m.avatarUrl" round width="28" height="28" :src="m.avatarUrl" />
          <span v-else class="fam-member-chip-fallback">{{ (m.nickname || '?')[0] }}</span>
        </div>
        <span v-if="dashboard.members.length > 5" class="fam-member-more">
          +{{ dashboard.members.length - 5 }}
        </span>
      </div>
    </div>

    <!-- 概览卡片 -->
    <div class="fam-overview">
      <div class="fam-overview-item">
        <span class="fam-overview-value">{{ stats.memberCount }}</span>
        <span class="fam-overview-label">成员</span>
      </div>
      <div class="fam-overview-divider"></div>
      <div class="fam-overview-item">
        <span class="fam-overview-value">{{ stats.pendingTodoCount }}</span>
        <span class="fam-overview-label">待办</span>
      </div>
      <div class="fam-overview-divider"></div>
      <div class="fam-overview-item">
        <span class="fam-overview-value">{{ stats.noticeCount }}</span>
        <span class="fam-overview-label">公告</span>
      </div>
    </div>

    <!-- 快捷入口 -->
    <div class="fam-section">
      <h3 class="fam-section-title">快捷入口</h3>
      <div class="fam-action-grid fam-action-grid--5">
        <div class="fam-action-item" @click="$router.push('/members')">
          <div class="fam-action-icon" style="background: #e0f2fe; color: #0ea5e9">
            <van-icon name="friends-o" size="22" />
          </div>
          <span class="fam-action-label">成员管理</span>
        </div>
        <div class="fam-action-item" @click="$router.push('/todos')">
          <div class="fam-action-icon" style="background: #d1fae5; color: #10b981">
            <van-icon name="todo-list-o" size="22" />
          </div>
          <span class="fam-action-label">家务待办</span>
        </div>
        <div class="fam-action-item" @click="$router.push('/notices')">
          <div class="fam-action-icon" style="background: #fef3c7; color: #f59e0b">
            <van-icon name="bell" size="22" />
          </div>
          <span class="fam-action-label">家庭公告</span>
        </div>
        <div class="fam-action-item" @click="$router.push('/milestones')">
          <div class="fam-action-icon" style="background: #fce7f3; color: #ec4899">
            <van-icon name="medal-o" size="22" />
          </div>
          <span class="fam-action-label">大事纪</span>
        </div>
        <div class="fam-action-item" @click="handleInvite">
          <div class="fam-action-icon" style="background: #ede9fe; color: #8b5cf6">
            <van-icon name="share-o" size="22" />
          </div>
          <span class="fam-action-label">邀请码</span>
        </div>
      </div>
    </div>

    <!-- 最近动态 -->
    <div class="fam-section">
      <h3 class="fam-section-title">最近动态</h3>

      <!-- 最新公告 -->
      <div class="fam-card" v-if="dashboard?.latestAnnouncement" @click="$router.push('/notices')">
        <div class="fam-card-left">
          <div class="fam-card-icon" style="background: #fef3c7; color: #f59e0b">
            <van-icon name="volume-o" size="18" />
          </div>
          <div class="fam-card-content">
            <p class="fam-card-title">{{ dashboard.latestAnnouncement.title }}</p>
            <p class="fam-card-time">{{ formatTime(dashboard.latestAnnouncement.publishedAt) }}</p>
          </div>
        </div>
        <van-icon name="arrow" color="#cbd5e1" size="14" />
      </div>

      <!-- 最新待办 -->
      <div
        v-for="todo in dashboard?.latestTodos || []"
        :key="todo.id"
        class="fam-card"
        @click="$router.push(`/todos/${todo.id}`)"
      >
        <div class="fam-card-left">
          <div class="fam-card-icon" style="background: #d1fae5; color: #10b981">
            <van-icon name="checked" size="18" />
          </div>
          <div class="fam-card-content">
            <p class="fam-card-title">{{ todo.title }}</p>
            <p class="fam-card-time">执行人：{{ todo.assigneeName }} · {{ todo.dueDate }}</p>
          </div>
        </div>
        <van-icon name="arrow" color="#cbd5e1" size="14" />
      </div>

      <!-- 空状态 -->
      <div class="fam-empty" v-if="!dashboard?.latestAnnouncement && !(dashboard?.latestTodos?.length)">
        <van-icon name="info-o" size="32" color="#cbd5e1" />
        <p class="fam-empty-text">还没有动态，开始添加待办或发布公告吧</p>
      </div>
    </div>

    <div style="height: 72px"></div>

    <!-- 邀请码弹窗 -->
    <van-popup v-model:show="showInvite" round teleport="body" :style="{ width: '320px', padding: '24px' }">
      <div class="invite-dialog">
        <h3 class="invite-title">家庭邀请码</h3>
        <div class="invite-code-box">
          <span class="invite-code-text">{{ inviteCode || '加载中...' }}</span>
        </div>
        <p class="invite-hint">有效期至 {{ formatTime(inviteExpiresAt) }}</p>
        <div class="invite-actions">
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
.home-screen { min-height: 100vh; background: #f8fafc; }

/* Hero */
.fam-hero {
  background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
  padding: 48px 20px 32px;
  position: relative;
  overflow: hidden;
}
.fam-hero::before {
  content: ''; position: absolute; top: -30px; right: -30px;
  width: 120px; height: 120px; border-radius: 50%; background: rgba(255,255,255,0.08);
}
.fam-hero-top { display: flex; align-items: center; justify-content: space-between; position: relative; z-index: 1; }
.fam-hero-info { display: flex; align-items: center; gap: 12px; }
.fam-hero-avatar { width: 48px; height: 48px; border-radius: 14px; display: flex; align-items: center; justify-content: center; }
.fam-hero-name { font-size: 20px; font-weight: 700; color: #fff; margin-bottom: 2px; }
.fam-hero-meta { font-size: 12px; color: rgba(255,255,255,0.8); }
.fam-hero-settings { width: 36px; height: 36px; border-radius: 50%; background: rgba(255,255,255,0.15); display: flex; align-items: center; justify-content: center; }
.fam-hero-members { display: flex; align-items: center; margin-top: 20px; position: relative; z-index: 1; }
.fam-member-chip { width: 28px; height: 28px; border-radius: 50%; overflow: hidden; border: 2px solid #0284c7; display: flex; align-items: center; justify-content: center; }
.fam-member-chip-fallback { font-size: 12px; font-weight: 600; color: #fff; }
.fam-member-more { font-size: 12px; color: rgba(255,255,255,0.8); margin-left: 8px; }

/* Overview */
.fam-overview {
  background: #fff; border-radius: 16px; margin: -20px 16px 0; padding: 16px 0;
  display: flex; align-items: center; justify-content: space-around;
  box-shadow: 0 4px 16px rgba(0,0,0,0.06); position: relative; z-index: 2;
}
.fam-overview-item { display: flex; flex-direction: column; align-items: center; gap: 2px; flex: 1; }
.fam-overview-value { font-size: 22px; font-weight: 700; color: #1e293b; }
.fam-overview-label { font-size: 11px; color: #94a3b8; }
.fam-overview-divider { width: 1px; height: 28px; background: #e2e8f0; }

/* Section */
.fam-section { padding: 20px 16px 0; }
.fam-section-title { font-size: 15px; font-weight: 600; color: #1e293b; margin-bottom: 12px; }

/* Action Grid */
.fam-action-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; background: #fff; border-radius: 16px; padding: 16px 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.03); }
.fam-action-grid--5 { grid-template-columns: repeat(5, 1fr); }
.fam-action-item { display: flex; flex-direction: column; align-items: center; gap: 6px; cursor: pointer; }
.fam-action-item:active { opacity: 0.7; }
.fam-action-icon { width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center; }
.fam-action-label { font-size: 11px; color: #64748b; }

/* Card */
.fam-card { background: #fff; border-radius: 12px; padding: 12px 14px; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 2px 8px rgba(0,0,0,0.03); }
.fam-card-left { display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0; }
.fam-card-icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.fam-card-content { flex: 1; min-width: 0; }
.fam-card-title { font-size: 14px; font-weight: 500; color: #1e293b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.fam-card-time { font-size: 11px; color: #94a3b8; margin-top: 2px; }

/* Empty */
.fam-empty { text-align: center; padding: 32px 0; }
.fam-empty-text { font-size: 13px; color: #94a3b8; margin-top: 8px; }

/* Invite Dialog */
.invite-dialog { text-align: center; }
.invite-title { font-size: 18px; font-weight: 700; color: #1e293b; margin-bottom: 20px; }
.invite-code-box { background: #f0f9ff; border-radius: 12px; padding: 20px; margin-bottom: 8px; }
.invite-code-text { font-size: 32px; font-weight: 700; color: #0ea5e9; letter-spacing: 6px; }
.invite-hint { font-size: 12px; color: #94a3b8; margin-bottom: 20px; }
.invite-actions { display: flex; gap: 8px; }
.invite-actions :deep(.van-button) { flex: 1; }
</style>
