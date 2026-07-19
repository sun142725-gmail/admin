<template>
  <div class="has-screen">
    <div class="px-16 pt-14 pb-12 bg-white border-b border-gray-100 flex-shrink-0">
      <div class="text-lg font-bold text-gray-800">个人中心</div>
      <div class="text-xs text-gray-400 mt-2">资料与账号安全</div>
    </div>

    <div class="flex-1 overflow-y-auto px-16 pt-16 has-tab-safe">
      <div class="has-card-stack">
        <div class="has-section flex items-center">
          <self-upload
            v-model="form.avatarUrl"
            accept="image/*"
            :max-size="2"
            @change="onAvatarChange"
          />
          <div class="ml-14 min-w-0">
            <div class="text-xl font-bold text-gray-800 truncate">{{ form.nickname || '未设置昵称' }}</div>
            <div class="text-sm text-gray-400 mt-6 truncate">{{ form.email || '未绑定邮箱' }}</div>
            <div class="text-xs text-primary-500 mt-8">点击头像可上传新图片</div>
          </div>
        </div>

        <div class="has-section">
          <div class="text-base font-bold text-gray-800 mb-14">个人资料</div>
          <div class="has-field-stack">
            <input v-model.trim="form.nickname" class="has-input" placeholder="请输入昵称" />
            <input v-model.trim="form.email" class="has-input" type="email" placeholder="请输入邮箱" />
          </div>
          <base-button class="mt-18 w-full !min-h-[44px]" type="primary" block :loading="saving" @click="onSave">
            保存资料
          </base-button>
        </div>

        <div class="has-section">
          <div class="text-base font-bold text-gray-800 mb-14">修改密码</div>
          <div class="text-sm text-gray-500 leading-relaxed mb-14">
            密码重置通过手机号或邮箱验证码完成，修改后旧登录态会失效。
          </div>
          <base-button class="w-full !min-h-[44px]" type="default" block @click="$router.push('/reset-password')">
            去重置密码
          </base-button>
        </div>

        <div class="has-section">
          <div class="text-base font-bold text-gray-800 mb-10">账号信息</div>
          <div class="text-sm text-gray-500 leading-7">
            <div>账号：{{ form.username || '-' }}</div>
            <div>账号类型：{{ form.userType || '-' }}</div>
            <div>注册来源：{{ form.registerChannel || '-' }}</div>
          </div>
        </div>

        <base-button class="w-full !min-h-[44px]" type="default" block @click="onLogout">退出登录</base-button>
      </div>
    </div>

    <div class="has-bottom-tab">
      <div class="flex gap-8">
        <button class="has-tab-item" @click="$router.push('/home')">
          <van-icon name="wap-home-o" size="20" />
          <span>首页</span>
        </button>
        <button class="has-tab-item is-active" @click="$router.push('/profile')">
          <van-icon name="user-o" size="20" />
          <span>个人中心</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref } from 'vue'
import { useRouter } from 'vue-router'
import { showToast } from 'vant'
import { useAuthStore } from '../stores/auth'
import { useProfileStore } from '../stores/profile'

const router = useRouter()
const authStore = useAuthStore()
const profileStore = useProfileStore()
const saving = ref(false)

const form = reactive({
  username: '',
  nickname: '',
  email: '',
  avatarUrl: '',
  userType: '',
  registerChannel: ''
})

function fillForm(profile = {}) {
  form.username = profile.username || ''
  form.nickname = profile.nickname || ''
  form.email = profile.email || ''
  form.avatarUrl = profile.avatarUrl || ''
  form.userType = profile.userType || ''
  form.registerChannel = profile.registerChannel || ''
}

async function onSave() {
  showToast('C 端资料编辑接口暂未开放')
}

function onAvatarChange() {
  showToast('C 端头像上传接口暂未开放')
  form.avatarUrl = profileStore.profile?.avatarUrl || ''
}

async function onLogout() {
  await authStore.logout()
  router.replace('/login')
}

onMounted(async () => {
  const profile = await profileStore.loadProfile()
  fillForm(profile)
})
</script>
