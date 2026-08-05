<template>
  <div class="notices-screen">
    <van-nav-bar title="家庭公告" :border="false">
      <template #right>
        <van-icon
          v-if="familyStore.isOwner"
          name="plus"
          size="20"
          color="#0ea5e9"
          @click="$router.push('/notices/edit')"
        />
      </template>
    </van-nav-bar>

    <div class="notice-list">
      <van-skeleton v-if="noticeStore.loading && !noticeStore.notices.length" :row="3" />
      <template v-else-if="noticeStore.notices.length">
        <div
          v-for="n in noticeStore.notices"
          :key="n.id"
          class="notice-item"
          @click="showDetail(n)"
        >
          <div class="notice-item-header">
            <span class="notice-item-title">{{ n.title }}</span>
            <van-icon
              v-if="familyStore.isOwner"
              name="delete-o"
              size="16"
              color="#ef4444"
              @click.stop="handleDelete(n)"
            />
          </div>
          <p class="notice-item-content">{{ n.content }}</p>
          <div class="notice-item-footer">
            <span class="notice-item-publisher">{{ n.publisherName }}</span>
            <span class="notice-item-time">{{ formatTime(n.publishedAt) }}</span>
          </div>
        </div>
      </template>
      <EmptyState
        v-else
        icon="bell"
        :text="familyStore.isOwner ? '暂无公告，点击右上角发布' : '暂无公告'"
      />
    </div>

    <!-- 公告详情弹窗 -->
    <van-dialog
      v-model:show="showDetailDialog"
      :title="detailNotice?.title"
      confirm-button-text="关闭"
      teleport="body"
    >
      <div class="notice-detail-body">
        <p class="notice-detail-content">{{ detailNotice?.content }}</p>
        <div class="notice-detail-meta">
          <span>{{ detailNotice?.publisherName }}</span>
          <span>{{ formatTime(detailNotice?.publishedAt) }}</span>
        </div>
      </div>
    </van-dialog>

    <TabBar />
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { showConfirmDialog } from 'vant'
import { useNoticeStore } from '@/stores/notice'
import { useFamilyStore } from '@/stores/family'
import EmptyState from '@/components/EmptyState.vue'
import TabBar from '@/components/TabBar.vue'

const noticeStore = useNoticeStore()
const familyStore = useFamilyStore()

const showDetailDialog = ref(false)
const detailNotice = ref(null)

function formatTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function showDetail(n) {
  detailNotice.value = n
  showDetailDialog.value = true
}

function handleDelete(n) {
  showConfirmDialog({
    title: '删除公告',
    message: `确定要删除「${n.title}」吗？`
  }).then(() => {
    noticeStore.deleteNoticeAction(n.id)
  }).catch(() => {})
}

onMounted(async () => {
  if (!familyStore.currentFamilyId) {
    await familyStore.loadFamilies()
  }
  await noticeStore.loadNotices()
})
</script>

<style scoped>
.notices-screen { min-height: 100vh; background: #f8fafc; }
.notices-screen :deep(.van-nav-bar) { background: #fff; }
.notice-list { padding: 12px 16px; }
.notice-item {
  background: #fff; border-radius: 16px; padding: 16px; margin-bottom: 10px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.03);
}
.notice-item:active { opacity: 0.8; }
.notice-item-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.notice-item-title { font-size: 15px; font-weight: 600; color: #1e293b; }
.notice-item-content {
  font-size: 13px; color: #64748b; line-height: 1.5;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden; margin-bottom: 10px;
}
.notice-item-footer { display: flex; align-items: center; justify-content: space-between; }
.notice-item-publisher { font-size: 12px; color: #0ea5e9; }
.notice-item-time { font-size: 11px; color: #94a3b8; }

.notice-detail-body { padding: 16px 20px; max-height: 50vh; overflow-y: auto; }
.notice-detail-content { font-size: 14px; color: #475569; line-height: 1.6; margin-bottom: 12px; white-space: pre-wrap; }
.notice-detail-meta { display: flex; gap: 12px; font-size: 12px; color: #94a3b8; }
</style>
