import { ref } from 'vue'
import { defineStore } from 'pinia'
import { getAuthProfile } from '@/services/auth'

export const useProfileStore = defineStore('has-web-profile', () => {
  const profile = ref(null)
  const loading = ref(false)

  async function loadProfile() {
    loading.value = true
    try {
      const response = await getAuthProfile()
      profile.value = response.data ?? response
      return profile.value
    } finally {
      loading.value = false
    }
  }

  async function saveProfile(payload) {
    profile.value = {
      ...(profile.value || {}),
      ...payload
    }
    return profile.value
  }

  async function uploadAvatar(file) {
    return profile.value?.avatarUrl || ''
  }

  return {
    profile,
    loading,
    loadProfile,
    saveProfile,
    uploadAvatar
  }
})
