<template>
  <div class="page-screen pb-24">
    <van-nav-bar title="成员管理" left-arrow @click-left="$router.back()" :border="false" />

    <!-- 邀请码模块（房主可见） -->
    <div v-if="familyStore.isOwner" class="px-16">
      <div class="bg-gradient-to-br from-primary-50 to-primary-100 rounded-xl p-16 flex flex-col gap-12">
        <div class="flex items-start justify-between gap-12">
          <div class="min-w-0">
            <p class="text-sm text-gray-500 mb-4">家庭邀请码</p>
            <p class="text-3xl font-bold text-primary-500 tracking-4 text-ellipsis-1">{{ familyStore.inviteCode || '点击生成' }}</p>
            <p v-if="familyStore.inviteCodeExpiresAt" class="text-xs text-gray-400 mt-4">
              有效期至 {{ formatDate(familyStore.inviteCodeExpiresAt) }}
            </p>
          </div>
          <van-button size="small" plain round type="primary" @click="handleCopy">
            复制
          </van-button>
        </div>
        <van-button size="small" block plain round @click="handleRegenerate">
          {{ familyStore.inviteCode ? '重新生成' : '生成邀请码' }}
        </van-button>
      </div>
    </div>

    <!-- 成员列表 -->
    <div class="pt-20 px-16">
      <div class="flex items-center justify-between mb-12">
        <h3 class="text-base font-semibold text-gray-800">家庭成员</h3>
        <span class="text-sm text-gray-400">{{ members.length }}/20 人</span>
      </div>

      <van-skeleton v-if="loading && !members.length" :row="3" title avatar />
      <div v-else class="screen-card">
        <div
          v-for="m in members"
          :key="m.id"
          class="flex items-center gap-12 px-16 py-14 border-b border-gray-50 active:bg-gray-50 last:border-b-0"
        >
          <van-image v-if="m.avatarUrl" round width="40" height="40" :src="m.avatarUrl" />
          <div v-else class="w-40 h-40 rounded-full bg-primary-100 flex-center text-base font-semibold text-primary-500 flex-shrink-0">
            {{ (m.nickname || '?')[0] }}
          </div>

          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-6 mb-2">
              <span class="text-base font-medium text-gray-800 text-ellipsis-1">{{ m.nickname }}</span>
              <span v-if="m.role === 'owner'" class="text-xs px-6 py-1 rounded bg-chip-orange-bg text-chip-orange-fg flex-shrink-0">房主</span>
              <span v-else class="text-xs px-6 py-1 rounded bg-gray-50 text-gray-500 flex-shrink-0">成员</span>
            </div>
            <span class="text-xs text-gray-400">加入于 {{ formatDate(m.joinedAt) }}</span>
          </div>

          <van-button
            v-if="familyStore.isOwner && m.role !== 'owner'"
            size="mini"
            plain
            round
            type="danger"
            @click="handleRemove(m)"
          >
            移除
          </van-button>
        </div>
      </div>
    </div>

    <!-- 加入申请列表（房主可见，有数据才显示） -->
    <div v-if="familyStore.isOwner && joinRequests.length" class="pt-20 px-16">
      <div class="flex items-center justify-between mb-12">
        <h3 class="text-base font-semibold text-gray-800">加入申请</h3>
        <span class="text-sm text-gray-400">{{ joinRequests.length }} 条待处理</span>
      </div>
      <div class="screen-card">
        <div
          v-for="r in joinRequests"
          :key="r.id"
          class="flex items-center gap-12 px-16 py-14 border-b border-gray-50 last:border-b-0"
        >
          <van-image v-if="r.avatarUrl" round width="40" height="40" :src="r.avatarUrl" />
          <div v-else class="w-40 h-40 rounded-full bg-primary-100 flex-center text-base font-semibold text-primary-500 flex-shrink-0">
            {{ (r.nickname || '?')[0] }}
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-base font-medium text-gray-800 text-ellipsis-1">{{ r.nickname }}</p>
            <span class="text-xs text-gray-400">{{ formatDate(r.createdAt) }} 申请</span>
          </div>
          <div class="flex gap-6 flex-shrink-0">
            <van-button size="mini" round type="primary" @click="handleApprove(r)">同意</van-button>
            <van-button size="mini" plain round @click="handleReject(r)">拒绝</van-button>
          </div>
        </div>
      </div>
    </div>

    <!-- 退出家庭（非房主） -->
    <div v-if="!familyStore.isOwner" class="px-16 pt-24">
      <van-button block plain round type="danger" @click="handleLeave">
        退出家庭
      </van-button>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { showConfirmDialog, showToast } from 'vant'
import { useFamilyStore } from '@/stores/family'

const familyStore = useFamilyStore()
const loading = ref(false)

const members = computed(() => familyStore.members)
const joinRequests = computed(() => familyStore.joinRequests)

function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('zh-CN')
}

async function handleCopy() {
  if (!familyStore.inviteCode) {
    await handleRegenerate()
    return
  }
  navigator.clipboard?.writeText(familyStore.inviteCode)
  showToast('已复制邀请码')
}

async function handleRegenerate() {
  try {
    await familyStore.regenerateInviteCode()
  } catch {
    // toast 已处理
  }
}

function handleRemove(m) {
  showConfirmDialog({
    title: '移除成员',
    message: `确定要移除「${m.nickname}」吗？`
  }).then(async () => {
    await familyStore.removeMemberAction(m.id)
  }).catch(() => {})
}

function handleApprove(r) {
  familyStore.approveRequestAction(r.id)
}

function handleReject(r) {
  showConfirmDialog({
    title: '拒绝申请',
    message: `确定要拒绝「${r.nickname}」的申请吗？`
  }).then(() => {
    familyStore.rejectRequestAction(r.id)
  }).catch(() => {})
}

function handleLeave() {
  showConfirmDialog({
    title: '退出家庭',
    message: '确定要退出当前家庭吗？'
  }).then(async () => {
    await familyStore.leaveFamilyAction(familyStore.currentFamilyId)
    window.location.hash = '#/family-guide'
  }).catch(() => {})
}

onMounted(async () => {
  loading.value = true
  try {
    await familyStore.loadMembers()
    if (familyStore.isOwner) {
      Promise.all([
        familyStore.loadInviteCode().catch(() => {}),
        familyStore.loadJoinRequests().catch(() => {})
      ])
    }
  } finally {
    loading.value = false
  }
})
</script>
