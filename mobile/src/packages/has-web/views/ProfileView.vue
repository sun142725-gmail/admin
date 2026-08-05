<template>
  <div class="profile-screen">
    <!-- Hero -->
    <div class="profile-hero">
      <div class="profile-avatar-wrap" @click="$router.push('/edit-profile')">
        <van-image v-if="avatarUrl" round width="72" height="72" :src="avatarUrl" />
        <div v-else class="profile-avatar-fallback">
          <van-icon name="user-o" size="36" color="#fff" />
        </div>
        <div class="profile-avatar-camera">
          <van-icon name="photograph" size="12" color="#0ea5e9" />
        </div>
      </div>
      <h2 class="profile-name">{{ nickname || '未设置昵称' }}</h2>
      <p class="profile-meta">{{ maskedEmail || username || '' }}</p>
    </div>

    <div class="profile-content">
      <!-- 当前家庭 -->
      <div class="profile-card" v-if="familyStore.currentFamily">
        <div class="family-card-row">
          <div class="family-card-info">
            <div class="family-card-avatar" :style="avatarStyle">
              <van-icon :name="familyAvatar.icon" size="20" :color="familyAvatar.color" />
            </div>
            <div>
              <p class="family-card-name">{{ familyStore.currentFamily.name }}</p>
              <p class="family-card-meta">{{ familyStore.currentFamily.memberCount }} 位成员</p>
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
      <div class="profile-card">
        <div class="profile-menu-row" @click="$router.push('/edit-profile')">
          <div class="profile-menu-left">
            <div class="profile-menu-icon" style="background: #e0f2fe; color: #0ea5e9">
              <van-icon name="contact" size="18" />
            </div>
            <span class="profile-menu-label">编辑资料</span>
          </div>
          <van-icon name="arrow" color="#cbd5e1" size="14" />
        </div>
        <div class="profile-menu-row" @click="$router.push('/members')">
          <div class="profile-menu-left">
            <div class="profile-menu-icon" style="background: #ede9fe; color: #8b5cf6">
              <van-icon name="friends-o" size="18" />
            </div>
            <span class="profile-menu-label">家庭管理</span>
          </div>
          <van-icon name="arrow" color="#cbd5e1" size="14" />
        </div>
        <div class="profile-menu-row" @click="$router.push('/reset-password')">
          <div class="profile-menu-left">
            <div class="profile-menu-icon" style="background: #fef3c7; color: #f59e0b">
              <van-icon name="lock" size="18" />
            </div>
            <span class="profile-menu-label">修改密码</span>
          </div>
          <van-icon name="arrow" color="#cbd5e1" size="14" />
        </div>
        <div class="profile-menu-row" @click="$router.push('/settings')">
          <div class="profile-menu-left">
            <div class="profile-menu-icon" style="background: #f1f5f9; color: #64748b">
              <van-icon name="setting-o" size="18" />
            </div>
            <span class="profile-menu-label">设置</span>
          </div>
          <van-icon name="arrow" color="#cbd5e1" size="14" />
        </div>
      </div>

      <!-- 退出登录 -->
      <button class="profile-logout-btn" @click="onLogout">退出登录</button>
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
.profile-screen { min-height: 100vh; background: #f8fafc; padding-bottom: 72px; }

/* Hero */
.profile-hero {
  background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
  padding: 48px 24px 32px; text-align: center; position: relative; overflow: hidden;
}
.profile-hero::before {
  content: ''; position: absolute; top: -30px; right: -30px;
  width: 120px; height: 120px; border-radius: 50%; background: rgba(255,255,255,0.08);
}
.profile-avatar-wrap {
  width: 72px; height: 72px; margin: 0 auto 12px; position: relative; display: inline-block;
}
.profile-avatar-fallback {
  width: 72px; height: 72px; border-radius: 50%; background: rgba(255,255,255,0.2);
  display: flex; align-items: center; justify-content: center;
}
.profile-avatar-camera {
  position: absolute; bottom: -2px; right: -2px; width: 24px; height: 24px;
  border-radius: 50%; background: #fff; display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.15); z-index: 1;
}
.profile-name { font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 4px; position: relative; z-index: 1; }
.profile-meta { font-size: 12px; color: rgba(255,255,255,0.8); position: relative; z-index: 1; }

.profile-content { padding: 16px; }

/* Cards */
.profile-card { background: #fff; border-radius: 16px; padding: 16px; margin-bottom: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.03); }
.family-card-row { display: flex; align-items: center; justify-content: space-between; }
.family-card-info { display: flex; align-items: center; gap: 12px; }
.family-card-avatar { width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center; }
.family-card-name { font-size: 15px; font-weight: 600; color: #1e293b; }
.family-card-meta { font-size: 12px; color: #94a3b8; margin-top: 2px; }

/* Menu */
.profile-menu-row { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid #f1f5f9; cursor: pointer; }
.profile-menu-row:last-child { border-bottom: none; }
.profile-menu-row:active { background: #f8fafc; }
.profile-menu-left { display: flex; align-items: center; gap: 10px; }
.profile-menu-icon { width: 32px; height: 32px; border-radius: 8px; display: flex; align-items: center; justify-content: center; }
.profile-menu-label { font-size: 14px; color: #1e293b; font-weight: 500; }

/* Logout */
.profile-logout-btn {
  width: 100%; height: 46px; border-radius: 23px; border: 1px solid #ef4444;
  background: transparent; color: #ef4444; font-size: 15px; font-weight: 500;
  cursor: pointer; margin-top: 8px;
}
.profile-logout-btn:active { background: #fef2f2; }
</style>
