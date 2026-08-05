import { ref } from 'vue'
import { defineStore } from 'pinia'
import { showSuccessToast } from 'vant'
import {
  getNoticeList,
  getNoticeDetail,
  createNotice,
  deleteNotice
} from '@/services/notice'
import { useFamilyStore } from './family'

export const useNoticeStore = defineStore('has-web-notice', () => {
  const notices = ref([])
  const currentNotice = ref(null)
  const loading = ref(false)
  const total = ref(0)

  function getFamilyId() {
    const familyStore = useFamilyStore()
    return familyStore.currentFamilyId
  }

  async function loadNotices() {
    const fid = getFamilyId()
    if (!fid) return
    loading.value = true
    try {
      const response = await getNoticeList(fid, { page: 1, pageSize: 50 })
      const data = response.data ?? response
      notices.value = data.list || []
      total.value = data.total || 0
      return data
    } finally {
      loading.value = false
    }
  }

  async function loadNoticeDetail(noticeId) {
    const fid = getFamilyId()
    if (!fid) return
    const response = await getNoticeDetail(fid, noticeId)
    const data = response.data ?? response
    currentNotice.value = data
    return data
  }

  async function createNoticeAction(payload) {
    const fid = getFamilyId()
    if (!fid) return
    const response = await createNotice(fid, payload)
    const data = response.data ?? response
    showSuccessToast('发布成功')
    await loadNotices()
    return data
  }

  async function deleteNoticeAction(noticeId) {
    const fid = getFamilyId()
    if (!fid) return
    await deleteNotice(fid, noticeId)
    notices.value = notices.value.filter((n) => n.id !== noticeId)
    showSuccessToast('已删除')
  }

  function reset() {
    notices.value = []
    currentNotice.value = null
    total.value = 0
  }

  return {
    notices,
    currentNotice,
    loading,
    total,
    loadNotices,
    loadNoticeDetail,
    createNoticeAction,
    deleteNoticeAction,
    reset
  }
})
