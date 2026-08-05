import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import { showToast, showSuccessToast } from 'vant'
import {
  createFamily,
  joinFamily,
  getFamilyList,
  getFamilyDetail,
  updateFamily,
  deleteFamily,
  switchFamily,
  generateInviteCode,
  getInviteCode,
  getMemberList,
  updateMember,
  removeMember,
  leaveFamily,
  getJoinRequests,
  approveJoinRequest,
  rejectJoinRequest,
  getDashboard
} from '@/services/family'

export const useFamilyStore = defineStore('has-web-family', () => {
  const families = ref([])
  const currentFamily = ref(null)
  const members = ref([])
  const inviteCode = ref('')
  const inviteCodeExpiresAt = ref('')
  const joinRequests = ref([])
  const dashboard = ref(null)
  const loading = ref(false)

  const currentFamilyId = computed(() => currentFamily.value?.id || '')
  const isOwner = computed(() => {
    if (!currentFamily.value || !members.value.length) return false
    const me = members.value.find((m) => m.userId === currentFamily.value?.ownerId)
    return me?.role === 'owner'
  })
  const hasFamily = computed(() => families.value.length > 0)

  /* ========== 家庭列表 ========== */

  async function loadFamilies() {
    loading.value = true
    try {
      const response = await getFamilyList()
      const data = response.data ?? response
      families.value = data.families || []
      const currentId = data.currentFamilyId
      if (currentId) {
        currentFamily.value = families.value.find((f) => f.id === currentId) || families.value[0] || null
      } else {
        currentFamily.value = families.value[0] || null
      }
      return data
    } finally {
      loading.value = false
    }
  }

  async function createFamilyAction(payload) {
    loading.value = true
    try {
      const response = await createFamily(payload)
      const data = response.data ?? response
      await loadFamilies()
      showSuccessToast('家庭创建成功')
      return data
    } finally {
      loading.value = false
    }
  }

  async function joinFamilyAction(code) {
    loading.value = true
    try {
      const response = await joinFamily({ code })
      const data = response.data ?? response
      await loadFamilies()
      showSuccessToast('加入成功')
      return data
    } finally {
      loading.value = false
    }
  }

  async function switchFamilyAction(familyId) {
    const response = await switchFamily(familyId)
    const data = response.data ?? response
    currentFamily.value = families.value.find((f) => f.id === familyId) || null
    members.value = []
    dashboard.value = null
    inviteCode.value = ''
    return data
  }

  async function updateFamilyAction(familyId, payload) {
    const response = await updateFamily(familyId, payload)
    const data = response.data ?? response
    if (currentFamily.value?.id === familyId) {
      currentFamily.value = { ...currentFamily.value, ...payload }
    }
    showSuccessToast('更新成功')
    return data
  }

  async function deleteFamilyAction(familyId) {
    await deleteFamily(familyId)
    await loadFamilies()
    showSuccessToast('家庭已解散')
  }

  /* ========== 成员 ========== */

  async function loadMembers(familyId) {
    const fid = familyId || currentFamilyId.value
    if (!fid) return
    const response = await getMemberList(fid)
    const data = response.data ?? response
    members.value = data.list || []
    return data
  }

  async function updateMemberAction(memberId, payload) {
    const response = await updateMember(currentFamilyId.value, memberId, payload)
    const data = response.data ?? response
    const idx = members.value.findIndex((m) => m.id === memberId)
    if (idx >= 0) {
      members.value[idx] = { ...members.value[idx], ...payload }
    }
    showSuccessToast('修改成功')
    return data
  }

  async function removeMemberAction(memberId) {
    await removeMember(currentFamilyId.value, memberId)
    members.value = members.value.filter((m) => m.id !== memberId)
    showSuccessToast('已移除成员')
  }

  async function leaveFamilyAction(familyId) {
    await leaveFamily(familyId)
    await loadFamilies()
    showSuccessToast('已退出家庭')
  }

  /* ========== 邀请码 ========== */

  async function loadInviteCode(familyId) {
    const fid = familyId || currentFamilyId.value
    if (!fid) return
    const response = await getInviteCode(fid)
    const data = response.data ?? response
    inviteCode.value = data.code || ''
    inviteCodeExpiresAt.value = data.expiresAt || ''
    return data
  }

  async function regenerateInviteCode(familyId) {
    const fid = familyId || currentFamilyId.value
    if (!fid) return
    const response = await generateInviteCode(fid, { expireDays: 7 })
    const data = response.data ?? response
    inviteCode.value = data.code || ''
    inviteCodeExpiresAt.value = data.expiresAt || ''
    showSuccessToast('邀请码已刷新')
    return data
  }

  /* ========== 加入申请 ========== */

  async function loadJoinRequests(familyId) {
    const fid = familyId || currentFamilyId.value
    if (!fid) return
    const response = await getJoinRequests(fid)
    const data = response.data ?? response
    joinRequests.value = data.list || []
    return data
  }

  async function approveRequestAction(requestId) {
    await approveJoinRequest(currentFamilyId.value, requestId)
    joinRequests.value = joinRequests.value.filter((r) => r.id !== requestId)
    showSuccessToast('已同意')
    await loadMembers()
  }

  async function rejectRequestAction(requestId) {
    await rejectJoinRequest(currentFamilyId.value, requestId)
    joinRequests.value = joinRequests.value.filter((r) => r.id !== requestId)
    showSuccessToast('已拒绝')
  }

  /* ========== 首页概览 ========== */

  async function loadDashboard(familyId) {
    const fid = familyId || currentFamilyId.value
    if (!fid) return
    const response = await getDashboard(fid)
    const data = response.data ?? response
    dashboard.value = data
    return data
  }

  /* ========== 重置 ========== */

  function reset() {
    families.value = []
    currentFamily.value = null
    members.value = []
    inviteCode.value = ''
    inviteCodeExpiresAt.value = ''
    joinRequests.value = []
    dashboard.value = null
  }

  return {
    families,
    currentFamily,
    members,
    inviteCode,
    inviteCodeExpiresAt,
    joinRequests,
    dashboard,
    loading,
    currentFamilyId,
    isOwner,
    hasFamily,
    loadFamilies,
    createFamilyAction,
    joinFamilyAction,
    switchFamilyAction,
    updateFamilyAction,
    deleteFamilyAction,
    loadMembers,
    updateMemberAction,
    removeMemberAction,
    leaveFamilyAction,
    loadInviteCode,
    regenerateInviteCode,
    loadJoinRequests,
    approveRequestAction,
    rejectRequestAction,
    loadDashboard,
    reset
  }
})
