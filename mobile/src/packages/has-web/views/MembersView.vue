<template>
  <div class="members-screen">
    <van-nav-bar title="成员管理" left-arrow @click-left="$router.back()" :border="false" />

    <!-- 邀请码模块（房主可见） -->
    <div v-if="familyStore.isOwner" class="invite-section">
      <div class="invite-card">
        <div class="invite-card-top">
          <div>
            <p class="invite-card-label">家庭邀请码</p>
            <p class="invite-card-code">{{ familyStore.inviteCode || '点击生成' }}</p>
            <p class="invite-card-expire" v-if="familyStore.inviteCodeExpiresAt">
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
    <div class="member-section">
      <div class="member-section-header">
        <h3 class="member-section-title">家庭成员</h3>
        <span class="member-section-count">{{ members.length }}/20 人</span>
      </div>

      <van-skeleton v-if="loading && !members.length" :row="3" title avatar />
      <div v-else class="member-list">
        <div v-for="m in members" :key="m.id" class="member-item">
          <van-image v-if="m.avatarUrl" round width="40" height="40" :src="m.avatarUrl" />
          <div v-else class="member-avatar-fallback">{{ (m.nickname || '?')[0] }}</div>

          <div class="member-info">
            <div class="member-name-row">
              <span class="member-name">{{ m.nickname }}</span>
              <span v-if="m.role === 'owner'" class="member-tag member-tag-owner">房主</span>
              <span v-else class="member-tag member-tag-normal">成员</span>
            </div>
            <span class="member-joined">加入于 {{ formatDate(m.joinedAt) }}</span>
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
    <div v-if="familyStore.isOwner && joinRequests.length" class="member-section">
      <div class="member-section-header">
        <h3 class="member-section-title">加入申请</h3>
        <span class="member-section-count">{{ joinRequests.length }} 条待处理</span>
      </div>
      <div class="member-list">
        <div v-for="r in joinRequests" :key="r.id" class="member-item">
          <van-image v-if="r.avatarUrl" round width="40" height="40" :src="r.avatarUrl" />
          <div v-else class="member-avatar-fallback">{{ (r.nickname || '?')[0] }}</div>
          <div class="member-info">
            <span class="member-name">{{ r.nickname }}</span>
            <span class="member-joined">{{ formatDate(r.createdAt) }} 申请</span>
          </div>
          <div class="request-actions">
            <van-button size="mini" round type="primary" @click="handleApprove(r)">同意</van-button>
            <van-button size="mini" plain round @click="handleReject(r)">拒绝</van-button>
          </div>
        </div>
      </div>
    </div>

    <!-- 退出家庭（非房主） -->
    <div v-if="!familyStore.isOwner" class="leave-section">
      <van-button block plain round type="danger" @click="handleLeave">
        退出家庭
      </van-button>
    </div>

    <div style="height: 24px"></div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { showConfirmDialog, showToast, showSuccessToast } from 'vant'
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

<style scoped>
.members-screen { min-height: 100vh; background: #f8fafc; }
.members-screen :deep(.van-nav-bar) { background: transparent; }

.invite-section { padding: 0 16px; }
.invite-card {
  background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
  border-radius: 16px; padding: 16px; display: flex; flex-direction: column; gap: 12px;
}
.invite-card-top { display: flex; align-items: flex-start; justify-content: space-between; }
.invite-card-label { font-size: 12px; color: #64748b; margin-bottom: 4px; }
.invite-card-code { font-size: 28px; font-weight: 700; color: #0ea5e9; letter-spacing: 4px; }
.invite-card-expire { font-size: 11px; color: #94a3b8; margin-top: 4px; }

.member-section { padding: 20px 16px 0; }
.member-section-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
.member-section-title { font-size: 15px; font-weight: 600; color: #1e293b; }
.member-section-count { font-size: 12px; color: #94a3b8; }

.member-list { background: #fff; border-radius: 16px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.03); }
.member-item { display: flex; align-items: center; gap: 12px; padding: 14px 16px; border-bottom: 1px solid #f1f5f9; }
.member-item:last-child { border-bottom: none; }
.member-avatar-fallback {
  width: 40px; height: 40px; border-radius: 50%; background: #e0f2fe;
  display: flex; align-items: center; justify-content: center;
  font-size: 16px; font-weight: 600; color: #0ea5e9;
}
.member-info { flex: 1; min-width: 0; }
.member-name-row { display: flex; align-items: center; gap: 6px; margin-bottom: 2px; }
.member-name { font-size: 14px; font-weight: 500; color: #1e293b; }
.member-tag { font-size: 10px; padding: 1px 6px; border-radius: 4px; }
.member-tag-owner { background: #fef3c7; color: #f59e0b; }
.member-tag-normal { background: #f1f5f9; color: #64748b; }
.member-joined { font-size: 11px; color: #94a3b8; }
.request-actions { display: flex; gap: 6px; }

.leave-section { padding: 24px 16px 0; }
</style>
