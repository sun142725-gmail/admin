<template>
  <div class="settings-screen">
    <van-nav-bar title="设置" left-arrow @click-left="$router.back()" :border="false" />

    <div class="settings-content">
      <!-- 通知设置 -->
      <div class="settings-card">
        <div class="settings-row">
          <div class="settings-row-left">
            <van-icon name="bell" size="18" color="#0ea5e9" />
            <span class="settings-row-label">消息通知</span>
          </div>
          <van-switch v-model="settings.notificationEnabled" size="20px" @change="handleNotificationChange" />
        </div>
      </div>

      <!-- 关于 -->
      <div class="settings-card">
        <div class="settings-row" @click="showAbout = true">
          <div class="settings-row-left">
            <van-icon name="info-o" size="18" color="#64748b" />
            <span class="settings-row-label">关于我们</span>
          </div>
          <van-icon name="arrow" color="#cbd5e1" size="14" />
        </div>
        <div class="settings-row" @click="openLink('用户协议')">
          <div class="settings-row-left">
            <van-icon name="description" size="18" color="#64748b" />
            <span class="settings-row-label">用户协议</span>
          </div>
          <van-icon name="arrow" color="#cbd5e1" size="14" />
        </div>
        <div class="settings-row" @click="openLink('隐私政策')">
          <div class="settings-row-left">
            <van-icon name="shield-o" size="18" color="#64748b" />
            <span class="settings-row-label">隐私政策</span>
          </div>
          <van-icon name="arrow" color="#cbd5e1" size="14" />
        </div>
      </div>

      <!-- 版本信息 -->
      <div class="settings-version">
        <p>版本 v1.0.0</p>
      </div>

      <!-- 退出账号 -->
      <div class="settings-card">
        <div class="settings-row settings-row-danger" @click="handleLogout">
          <span class="settings-row-label">退出账号</span>
        </div>
      </div>
    </div>

    <!-- 关于弹窗 -->
    <van-dialog v-model:show="showAbout" title="关于我们" confirm-button-text="知道了" teleport="body">
      <div class="about-content">
        <p>家庭管理 v1.0.0</p>
        <p>一款面向家庭场景的轻量协作工具，核心解决家庭成员间的家务分工与信息同步问题。</p>
      </div>
    </van-dialog>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showConfirmDialog, showToast } from 'vant'
import { useAuthStore } from '@/stores/auth'
import { useFamilyStore } from '@/stores/family'
import { getSettings, updateSettings } from '@/services/user'

const router = useRouter()
const authStore = useAuthStore()
const familyStore = useFamilyStore()

const showAbout = ref(false)
const settings = reactive({
  notificationEnabled: true
})

async function handleNotificationChange(val) {
  try {
    await updateSettings({ notificationEnabled: val })
    showToast(val ? '已开启通知' : '已关闭通知')
  } catch {
    settings.notificationEnabled = !val
  }
}

function openLink(title) {
  showToast(`${title}页面待完善`)
}

function handleLogout() {
  showConfirmDialog({
    title: '退出账号',
    message: '确定要退出当前账号吗？'
  }).then(async () => {
    await authStore.logout()
    familyStore.reset()
    router.replace('/login')
  }).catch(() => {})
}

onMounted(async () => {
  try {
    const res = await getSettings()
    const data = res.data ?? res
    if (data) {
      settings.notificationEnabled = data.notificationEnabled
    }
  } catch {
    // ignore
  }
})
</script>

<style scoped>
.settings-screen { min-height: 100vh; background: #f8fafc; }
.settings-screen :deep(.van-nav-bar) { background: #fff; }
.settings-content { padding: 12px 16px; }
.settings-card {
  background: #fff; border-radius: 16px; margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.03); overflow: hidden;
}
.settings-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px; border-bottom: 1px solid #f1f5f9; cursor: pointer;
}
.settings-row:last-child { border-bottom: none; }
.settings-row:active { background: #f8fafc; }
.settings-row-left { display: flex; align-items: center; gap: 10px; }
.settings-row-label { font-size: 14px; color: #1e293b; font-weight: 500; }
.settings-row-danger { justify-content: center; }
.settings-row-danger .settings-row-label { color: #ef4444; }
.settings-version { text-align: center; padding: 16px 0; }
.settings-version p { font-size: 12px; color: #94a3b8; }
.about-content { padding: 16px 20px; }
.about-content p { font-size: 13px; color: #64748b; line-height: 1.6; margin-bottom: 8px; }
</style>
