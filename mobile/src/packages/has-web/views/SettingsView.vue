<template>
  <div class="page-screen">
    <van-nav-bar title="设置" left-arrow @click-left="$router.back()" :border="false" />

    <div class="p-12 px-16">
      <!-- 通知设置 -->
      <div class="screen-card mb-12">
        <div class="flex items-center justify-between px-16 py-14 min-h-touch">
          <div class="flex items-center gap-10">
            <van-icon name="bell" size="18" color="#0ea5e9" />
            <span class="text-base font-medium text-gray-800">消息通知</span>
          </div>
          <van-switch v-model="settings.notificationEnabled" size="20px" @change="handleNotificationChange" />
        </div>
      </div>

      <!-- 关于 -->
      <div class="screen-card mb-12">
        <div class="press flex items-center justify-between px-16 py-14 min-h-touch border-b border-gray-50 active:bg-gray-50" @click="showAbout = true">
          <div class="flex items-center gap-10">
            <van-icon name="info-o" size="18" color="#4e5969" />
            <span class="text-base font-medium text-gray-800">关于我们</span>
          </div>
          <van-icon name="arrow" color="#a9b1bf" size="14" />
        </div>
        <div class="press flex items-center justify-between px-16 py-14 min-h-touch border-b border-gray-50 active:bg-gray-50" @click="openLink('用户协议')">
          <div class="flex items-center gap-10">
            <van-icon name="description" size="18" color="#4e5969" />
            <span class="text-base font-medium text-gray-800">用户协议</span>
          </div>
          <van-icon name="arrow" color="#a9b1bf" size="14" />
        </div>
        <div class="press flex items-center justify-between px-16 py-14 min-h-touch active:bg-gray-50" @click="openLink('隐私政策')">
          <div class="flex items-center gap-10">
            <van-icon name="shield-o" size="18" color="#4e5969" />
            <span class="text-base font-medium text-gray-800">隐私政策</span>
          </div>
          <van-icon name="arrow" color="#a9b1bf" size="14" />
        </div>
      </div>

      <!-- 版本信息 -->
      <div class="text-center py-16">
        <p class="text-sm text-gray-400">版本 v1.0.0</p>
      </div>

      <!-- 退出账号 -->
      <div class="screen-card">
        <div class="press flex items-center justify-center px-16 py-14 min-h-touch active:bg-chip-rose-bg" @click="handleLogout">
          <span class="text-base font-medium text-danger">退出账号</span>
        </div>
      </div>
    </div>

    <!-- 关于弹窗 -->
    <van-dialog v-model:show="showAbout" title="关于我们" confirm-button-text="知道了" teleport="body">
      <div class="px-20 py-16">
        <p class="text-sm text-gray-500 leading-relaxed mb-8">家庭管理 v1.0.0</p>
        <p class="text-sm text-gray-500 leading-relaxed mb-8">
          一款面向家庭场景的轻量协作工具，核心解决家庭成员间的家务分工与信息同步问题。
        </p>
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
