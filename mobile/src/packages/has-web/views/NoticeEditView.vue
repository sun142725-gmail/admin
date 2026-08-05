<template>
  <div class="edit-screen">
    <van-nav-bar title="发布公告" left-arrow @click-left="$router.back()" :border="false">
      <template #right>
        <van-button size="small" type="primary" round :loading="submitting" @click="handlePublish">
          发布
        </van-button>
      </template>
    </van-nav-bar>

    <div class="edit-content">
      <div class="edit-card">
        <van-field
          v-model="form.title"
          placeholder="公告标题（1-30 字）"
          maxlength="30"
          show-word-limit
          :border="false"
          class="edit-title-input"
        />
      </div>

      <div class="edit-card">
        <van-field
          v-model="form.content"
          type="textarea"
          placeholder="输入公告正文内容（1-500 字）"
          maxlength="500"
          show-word-limit
          rows="8"
          autosize
          :border="false"
          class="edit-content-input"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { useNoticeStore } from '@/stores/notice'

const router = useRouter()
const noticeStore = useNoticeStore()
const submitting = ref(false)

const form = reactive({
  title: '',
  content: ''
})

async function handlePublish() {
  if (!form.title.trim()) {
    showToast('请输入公告标题')
    return
  }
  if (!form.content.trim()) {
    showToast('请输入公告正文')
    return
  }
  submitting.value = true
  try {
    await noticeStore.createNoticeAction({
      title: form.title.trim(),
      content: form.content.trim()
    })
    router.back()
  } catch {
    // toast 已处理
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.edit-screen { min-height: 100vh; background: #f8fafc; }
.edit-screen :deep(.van-nav-bar) { background: #fff; }
.edit-content { padding: 12px 16px; }
.edit-card {
  background: #fff; border-radius: 16px; margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.03); overflow: hidden;
}
.edit-title-input :deep(.van-field__control) { font-size: 18px; font-weight: 600; }
.edit-content-input :deep(.van-field__control) { font-size: 14px; line-height: 1.6; }
</style>
