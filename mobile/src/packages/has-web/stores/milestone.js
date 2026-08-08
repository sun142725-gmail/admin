import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { showSuccessToast, showConfirmDialog } from 'vant'
import {
  getMilestoneList,
  getMilestoneDetail,
  createMilestone,
  updateMilestone,
  deleteMilestone,
  toggleMilestoneCore,
  getMilestoneSummary
} from '@/services/milestone'
import { useFamilyStore } from './family'
import { useAuthStore } from './auth'

export const useMilestoneStore = defineStore('has-web-milestone', () => {
  const personalMilestones = ref([])
  const familyMilestones = ref([])
  const summaryList = ref([])
  const activeTab = ref('personal')
  const loading = ref(false)
  const summaryLoading = ref(false)

  const currentUserId = computed(() => {
    const authStore = useAuthStore()
    return authStore.profile?.id || ''
  })

  const isOwner = computed(() => {
    const familyStore = useFamilyStore()
    return familyStore.isOwner
  })

  const currentList = computed(() => {
    return activeTab.value === 'personal' ? personalMilestones.value : familyMilestones.value
  })

  function getFamilyId() {
    const familyStore = useFamilyStore()
    return familyStore.currentFamilyId
  }

  /* ========== 列表加载 ========== */

  async function loadMilestones(type) {
    const fid = getFamilyId()
    if (!fid) return
    loading.value = true
    try {
      const t = type || activeTab.value
      const response = await getMilestoneList(fid, { type: t, page: 1, pageSize: 100 })
      const data = response.data ?? response
      const list = data.list || []
      if (t === 'personal') {
        personalMilestones.value = list
      } else {
        familyMilestones.value = list
      }
      return data
    } finally {
      loading.value = false
    }
  }

  async function switchTab(type) {
    activeTab.value = type
    const target = type === 'personal' ? personalMilestones.value : familyMilestones.value
    if (target.length === 0) {
      await loadMilestones(type)
    }
  }

  /* ========== 详情 ========== */

  async function loadMilestoneDetail(milestoneId) {
    const fid = getFamilyId()
    if (!fid) return
    const response = await getMilestoneDetail(fid, milestoneId)
    return response.data ?? response
  }

  /* ========== 新增 ========== */

  async function createMilestoneAction(payload) {
    const fid = getFamilyId()
    if (!fid) return
    const response = await createMilestone(fid, payload)
    const data = response.data ?? response
    showSuccessToast('保存成功')
    await loadMilestones(payload.type)
    return data
  }

  /* ========== 编辑 ========== */

  async function updateMilestoneAction(milestoneId, payload) {
    const fid = getFamilyId()
    if (!fid) return
    const response = await updateMilestone(fid, milestoneId, payload)
    const data = response.data ?? response
    showSuccessToast('保存成功')
    await loadMilestones(payload.type || activeTab.value)
    return data
  }

  /* ========== 删除 ========== */

  async function deleteMilestoneAction(milestoneId, type) {
    const fid = getFamilyId()
    if (!fid) return
    await showConfirmDialog({
      title: '确认删除',
      message: '删除后不可恢复，确定要删除这条大事纪吗？'
    })
    await deleteMilestone(fid, milestoneId)
    const list = type === 'personal' ? personalMilestones : familyMilestones
    list.value = list.value.filter((m) => m.id !== milestoneId)
    showSuccessToast('已删除')
  }

  /* ========== 核心标记 ========== */

  async function toggleCoreAction(milestoneId, currentCore, type) {
    const fid = getFamilyId()
    if (!fid) return
    await toggleMilestoneCore(fid, milestoneId, !currentCore)
    const list = type === 'personal' ? personalMilestones : familyMilestones
    const idx = list.value.findIndex((m) => m.id === milestoneId)
    if (idx >= 0) {
      list.value[idx].isCore = !currentCore
    }
    showSuccessToast(currentCore ? '已取消碑文收录' : '已加入碑文汇总')
  }

  /* ========== 碑文汇总 ========== */

  async function loadSummary(type) {
    const fid = getFamilyId()
    if (!fid) return
    summaryLoading.value = true
    try {
      const response = await getMilestoneSummary(fid, type)
      const data = response.data ?? response
      summaryList.value = data.list || []
      return data
    } finally {
      summaryLoading.value = false
    }
  }

  /* ========== 权限判断 ========== */

  function canEdit(milestone) {
    if (!milestone) return false
    if (milestone.type === 'personal') {
      return milestone.creatorId === currentUserId.value
    }
    return milestone.creatorId === currentUserId.value || isOwner.value
  }

  function canDelete(milestone) {
    return canEdit(milestone)
  }

  function canToggleCore(milestone) {
    if (!milestone) return false
    if (milestone.type === 'personal') {
      return milestone.creatorId === currentUserId.value
    }
    return isOwner.value
  }

  /* ========== 重置 ========== */

  function reset() {
    personalMilestones.value = []
    familyMilestones.value = []
    summaryList.value = []
    activeTab.value = 'personal'
  }

  return {
    personalMilestones,
    familyMilestones,
    summaryList,
    activeTab,
    loading,
    summaryLoading,
    currentList,
    currentUserId,
    isOwner,
    loadMilestones,
    switchTab,
    loadMilestoneDetail,
    createMilestoneAction,
    updateMilestoneAction,
    deleteMilestoneAction,
    toggleCoreAction,
    loadSummary,
    canEdit,
    canDelete,
    canToggleCore,
    reset
  }
})
