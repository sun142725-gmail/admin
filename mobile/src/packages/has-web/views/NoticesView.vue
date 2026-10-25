<template>
  <div class="page-screen tabbar-pad">
    <van-nav-bar title="家庭公告" :border="false">
      <template #right>
        <van-icon
          v-if="familyStore.isOwner"
          name="plus"
          size="20"
          color="#0ea5e9"
          class="press"
          @click="$router.push('/notices/edit')"
        />
      </template>
    </van-nav-bar>

    <div class="p-12 px-16">
      <van-skeleton v-if="noticeStore.loading && !noticeStore.notices.length" :row="3" />
      <template v-else-if="noticeStore.notices.length">
        <div
          v-for="n in noticeStore.notices"
          :key="n.id"
          class="press bg-white rounded-xl p-16 mb-10 shadow-card"
          @click="showDetail(n)"
        >
          <div class="flex items-center justify-between mb-8">
            <span class="text-base font-semibold text-gray-800 text-ellipsis-1">{{ n.title }}</span>
            <van-icon
              v-if="familyStore.isOwner"
              name="delete-o"
              size="16"
              color="#f53f3f"
              class="flex-shrink-0 ml-8"
              @click.stop="handleDelete(n)"
            />
          </div>
          <p class="text-sm text-gray-500 leading-relaxed text-ellipsis-2 mb-10">{{ n.content }}</p>
          <div class="flex items-center justify-between">
            <span class="text-sm text-primary-500">{{ n.publisherName }}</span>
            <span class="text-xs text-gray-400">{{ formatTime(n.publishedAt) }}</span>
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
      <div class="px-20 py-16 max-h-[50vh] overflow-y-auto">
        <p class="text-base text-gray-600 leading-relaxed whitespace-pre-wrap mb-12">{{ detailNotice?.content }}</p>
        <div class="flex gap-12 text-sm text-gray-400">
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
