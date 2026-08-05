<template>
  <div class="guide-screen">
    <!-- Hero -->
    <div class="guide-hero">
      <div class="guide-hero-icon">
        <van-icon name="home-o" size="36" color="#fff" />
      </div>
      <h1 class="guide-hero-title">欢迎使用</h1>
      <p class="guide-hero-desc">创建或加入家庭，开启协作之旅</p>
    </div>

    <!-- 入口卡片 -->
    <div class="guide-cards">
      <div class="guide-card guide-card-create" @click="showCreate = true">
        <div class="guide-card-icon" style="background: #e0f2fe; color: #0ea5e9">
          <van-icon name="add-o" size="28" />
        </div>
        <div class="guide-card-body">
          <h3 class="guide-card-title">创建家庭</h3>
          <p class="guide-card-desc">创建一个新家庭，成为房主</p>
        </div>
        <van-icon name="arrow" color="#cbd5e1" size="16" />
      </div>

      <div class="guide-card guide-card-join" @click="showJoin = true">
        <div class="guide-card-icon" style="background: #d1fae5; color: #10b981">
          <van-icon name="share-o" size="28" />
        </div>
        <div class="guide-card-body">
          <h3 class="guide-card-title">加入家庭</h3>
          <p class="guide-card-desc">输入邀请码加入已有家庭</p>
        </div>
        <van-icon name="arrow" color="#cbd5e1" size="16" />
      </div>
    </div>

    <!-- 创建家庭弹窗 -->
    <van-popup v-model:show="showCreate" round position="bottom" :style="{ maxHeight: '85%' }" teleport="body">
      <div class="sheet">
        <div class="sheet-header">
          <h3 class="sheet-title">创建家庭</h3>
          <van-icon name="cross" size="20" color="#94a3b8" @click="showCreate = false" />
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
            <div class="avatar-grid">
              <div
                v-for="avatar in FAMILY_AVATARS"
                :key="avatar.id"
                class="avatar-grid-item"
                :class="{ 'is-selected': createForm.avatar === avatar.id }"
                @click="createForm.avatar = avatar.id"
              >
                <div class="avatar-grid-icon" :style="{ background: avatar.bg, color: avatar.color }">
                  <van-icon :name="avatar.icon" size="24" />
                </div>
                <span class="avatar-grid-label">{{ avatar.label }}</span>
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
          <van-icon name="cross" size="20" color="#94a3b8" @click="showJoin = false" />
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
.guide-screen {
  min-height: 100vh;
  background: #f8fafc;
}

.guide-hero {
  background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
  padding: 64px 24px 48px;
  text-align: center;
  position: relative;
  overflow: hidden;
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
}

.guide-hero-icon {
  width: 72px;
  height: 72px;
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.15);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;
  position: relative;
  z-index: 1;
}

.guide-hero-title {
  font-size: 24px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 8px;
  position: relative;
  z-index: 1;
}

.guide-hero-desc {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);
  position: relative;
  z-index: 1;
}

.guide-cards {
  padding: 24px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.guide-card {
  background: #fff;
  border-radius: 16px;
  padding: 20px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
  cursor: pointer;
  transition: transform 0.15s;
}

.guide-card:active {
  transform: scale(0.98);
}

.guide-card-icon {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.guide-card-body {
  flex: 1;
  min-width: 0;
}

.guide-card-title {
  font-size: 16px;
  font-weight: 600;
  color: #1e293b;
  margin-bottom: 4px;
}

.guide-card-desc {
  font-size: 13px;
  color: #94a3b8;
}

/* Sheet */
.sheet {
  padding: 20px 16px;
}

.sheet-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 20px;
}

.sheet-title {
  font-size: 18px;
  font-weight: 700;
  color: #1e293b;
}

.sheet-body {
  margin-bottom: 20px;
}

.sheet-field {
  margin-bottom: 20px;
}

.sheet-label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: #475569;
  margin-bottom: 8px;
}

.sheet-input {
  background: #f8fafc;
  border-radius: 10px;
  overflow: hidden;
}

.join-code-input :deep(.van-field__control) {
  font-size: 20px;
  font-weight: 600;
  letter-spacing: 4px;
  text-align: center;
  text-transform: uppercase;
}

.sheet-hint {
  font-size: 12px;
  color: #94a3b8;
  margin-top: 8px;
}

.avatar-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.avatar-grid-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  cursor: pointer;
}

.avatar-grid-icon {
  width: 56px;
  height: 56px;
  border-radius: 14px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid transparent;
  transition: border-color 0.2s;
}

.avatar-grid-item.is-selected .avatar-grid-icon {
  border-color: #0ea5e9;
}

.avatar-grid-label {
  font-size: 11px;
  color: #64748b;
}

.sheet-footer {
  padding-bottom: 8px;
}

.sheet-footer :deep(.van-button--primary) {
  background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%);
  border: none;
  height: 48px;
  font-size: 16px;
  font-weight: 600;
}
</style>
