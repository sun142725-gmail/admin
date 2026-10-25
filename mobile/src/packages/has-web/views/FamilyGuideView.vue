<template>
  <div class="page-screen">
    <!-- Hero -->
    <div class="guide-hero hero-safe-top">
      <div class="relative z-[1] w-72 h-72 rounded-2xl bg-white/15 flex-center mx-auto mb-16">
        <van-icon name="home-o" size="36" color="#fff" />
      </div>
      <h1 class="relative z-[1] text-2xl font-bold text-white mb-8">欢迎使用</h1>
      <p class="relative z-[1] text-base text-white/80">创建或加入家庭，开启协作之旅</p>
    </div>

    <!-- 入口卡片 -->
    <div class="p-24 px-16 flex flex-col gap-12">
      <div
        class="press bg-white rounded-xl px-16 py-20 flex items-center gap-12 shadow-popover active:scale-[0.98] transition-transform"
        @click="showCreate = true"
      >
        <div class="w-56 h-56 rounded-lg flex-center flex-shrink-0 bg-chip-blue-bg text-chip-blue-fg">
          <van-icon name="add-o" size="28" />
        </div>
        <div class="flex-1 min-w-0">
          <h3 class="text-base font-semibold text-gray-800 mb-4">创建家庭</h3>
          <p class="text-sm text-gray-400 text-ellipsis-1">创建一个新家庭，成为房主</p>
        </div>
        <van-icon name="arrow" color="#a9b1bf" size="16" />
      </div>

      <div
        class="press bg-white rounded-xl px-16 py-20 flex items-center gap-12 shadow-popover active:scale-[0.98] transition-transform"
        @click="showJoin = true"
      >
        <div class="w-56 h-56 rounded-lg flex-center flex-shrink-0 bg-chip-green-bg text-chip-green-fg">
          <van-icon name="share-o" size="28" />
        </div>
        <div class="flex-1 min-w-0">
          <h3 class="text-base font-semibold text-gray-800 mb-4">加入家庭</h3>
          <p class="text-sm text-gray-400 text-ellipsis-1">输入邀请码加入已有家庭</p>
        </div>
        <van-icon name="arrow" color="#a9b1bf" size="16" />
      </div>
    </div>

    <!-- 创建家庭弹窗 -->
    <van-popup v-model:show="showCreate" round position="bottom" :style="{ maxHeight: '85%' }" teleport="body">
      <div class="sheet">
        <div class="sheet-header">
          <h3 class="sheet-title">创建家庭</h3>
          <van-icon name="cross" size="20" color="#86909c" class="press" @click="showCreate = false" />
        </div>
        <div class="sheet-body">
          <!-- 家庭名称 -->
          <div class="sheet-field">
            <label class="sheet-label">家庭名称</label>
            <van-field
              v-model="createForm.name"
              placeholder="如：张三的小家"
              maxlength="20"
              show-word-limit
              :border="false"
              class="sheet-input"
            />
          </div>

          <!-- 家庭头像 -->
          <div class="sheet-field">
            <label class="sheet-label">选择头像</label>
            <div class="grid grid-cols-4 gap-12">
              <div
                v-for="avatar in FAMILY_AVATARS"
                :key="avatar.id"
                class="press flex flex-col items-center gap-4"
                @click="createForm.avatar = avatar.id"
              >
                <div
                  class="w-56 h-56 rounded-lg flex-center border-2 transition-colors"
                  :class="createForm.avatar === avatar.id ? 'border-primary-500' : 'border-transparent'"
                  :style="{ background: avatar.bg, color: avatar.color }"
                >
                  <van-icon :name="avatar.icon" size="24" />
                </div>
                <span class="text-xs text-gray-500">{{ avatar.label }}</span>
              </div>
            </div>
          </div>
        </div>
        <div class="sheet-footer">
          <van-button
            block
            round
            type="primary"
            :loading="familyStore.loading"
            :disabled="!createForm.name.trim()"
            @click="handleCreate"
          >
            创建家庭
          </van-button>
        </div>
      </div>
    </van-popup>

    <!-- 加入家庭弹窗 -->
    <van-popup v-model:show="showJoin" round position="bottom" teleport="body">
      <div class="sheet">
        <div class="sheet-header">
          <h3 class="sheet-title">加入家庭</h3>
          <van-icon name="cross" size="20" color="#86909c" class="press" @click="showJoin = false" />
        </div>
        <div class="sheet-body">
          <div class="sheet-field">
            <label class="sheet-label">邀请码</label>
            <van-field
              v-model="joinForm.code"
              placeholder="请输入 6 位邀请码"
              maxlength="6"
              :border="false"
              class="sheet-input join-code-input"
            />
            <p class="sheet-hint">向房主获取邀请码，有效期 7 天</p>
          </div>
        </div>
        <div class="sheet-footer">
          <van-button
            block
            round
            type="primary"
            :loading="familyStore.loading"
            :disabled="joinForm.code.length !== 6"
            @click="handleJoin"
          >
            加入家庭
          </van-button>
        </div>
      </div>
    </van-popup>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { useFamilyStore } from '@/stores/family'
import { FAMILY_AVATARS } from '@/constants/avatars'

const router = useRouter()
const familyStore = useFamilyStore()

const showCreate = ref(false)
const showJoin = ref(false)

const createForm = reactive({
  name: '',
  avatar: 'avatar_01'
})

const joinForm = reactive({
  code: ''
})

async function handleCreate() {
  if (!createForm.name.trim()) {
    showToast('请输入家庭名称')
    return
  }
  try {
    await familyStore.createFamilyAction({
      name: createForm.name.trim(),
      avatar: createForm.avatar
    })
    showCreate.value = false
    router.replace('/home')
  } catch {
    // toast 已由拦截器处理
  }
}

async function handleJoin() {
  if (joinForm.code.length !== 6) {
    showToast('请输入 6 位邀请码')
    return
  }
  try {
    await familyStore.joinFamilyAction(joinForm.code.toUpperCase())
    showJoin.value = false
    router.replace('/home')
  } catch {
    // toast 已由拦截器处理
  }
}
</script>

<style scoped>
.guide-hero {
  position: relative;
  overflow: hidden;
  text-align: center;
  background: linear-gradient(135deg, theme('colors.primary.500') 0%, theme('colors.primary.600') 100%);
  padding: 64px 24px 48px;
}
.guide-hero::before {
  content: '';
  position: absolute;
  top: -40px;
  right: -40px;
  width: 160px;
  height: 160px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  pointer-events: none;
}
.guide-hero::after {
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
.join-code-input :deep(.van-field__control) {
  font-size: theme('fontSize.xl');
  font-weight: 600;
  letter-spacing: 4px;
  text-align: center;
  text-transform: uppercase;
}
</style>
