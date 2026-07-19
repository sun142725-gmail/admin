import { ref } from 'vue'
import { defineStore } from 'pinia'
import { getProfile, updateProfile } from '@/services/profile'
import { uploadFile } from '@/services/files'

export const useProfileStore = defineStore('has-web-profile', () => {
  const profile = ref(null)
  const loading = ref(false)

  async function loadProfile() {
    loading.value = true
    try {
      const response = await getProfile()
      profile.value = response.data ?? response
      return profile.value
    } finally {
      loading.value = false
    }
  }

  async function saveProfile(payload) {
    const response = await updateProfile(payload)
    profile.value = response.data ?? response
    return profile.value
  }

  async function uploadAvatar(file) {
    const response = await uploadFile(file, 'avatar')
    const data = response.data ?? response
    await saveProfile({ avatarUrl: data.url })
    return data.url
  }

  return {
    profile,
    loading,
    loadProfile,
    saveProfile,
    uploadAvatar
  }
})
