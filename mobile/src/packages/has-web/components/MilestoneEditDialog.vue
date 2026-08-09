<template>
  <base-modal
    v-model="visible"
    :title="mode === 'create' ? '记录大事纪' : '编辑大事纪'"
    position="bottom"
    :round="true"
    :closeable="true"
    :close-on-click-overlay="true"
    :show-footer="false"
    max-height="85vh"
  >
    <div class="ms-edit-form">
      <!-- 事件归属 -->
      <div class="ms-edit-field">
        <label class="ms-edit-label">事件归属 <span class="ms-edit-required">*</span></label>
        <base-radio
          v-model="form.type"
          :options="typeOptions"
          :disabled="mode === 'edit'"
        />
      </div>

      <!-- 发生时间 -->
      <div class="ms-edit-field">
        <label class="ms-edit-label">发生时间 <span class="ms-edit-required">*</span></label>
        <div class="ms-edit-date-row">
          <base-date-picker
            v-model="form.happenDate"
            :precision="dateMode"
            placeholder="请选择时间"
            :max-date="maxDate"
          />
          <div class="ms-edit-date-mode">
            <span
              class="ms-edit-mode-btn"
              :class="{ 'ms-edit-mode-btn--active': dateMode === 'day' }"
              @click="dateMode = 'day'"
            >精确到日</span>
            <span
              class="ms-edit-mode-btn"
              :class="{ 'ms-edit-mode-btn--active': dateMode === 'month' }"
              @click="dateMode = 'month'"
            >仅年月</span>
          </div>
        </div>
      </div>

      <!-- 事件标题 -->
      <div class="ms-edit-field">
        <label class="ms-edit-label">事件标题 <span class="ms-edit-required">*</span></label>
        <van-field
          v-model="form.title"
          placeholder="简洁概括事件，如：正式入职互联网行业"
          maxlength="50"
          show-word-limit
          clearable
        />
      </div>

      <!-- 事件详情 -->
      <div class="ms-edit-field">
        <label class="ms-edit-label">事件详情</label>
        <van-field
          v-model="form.desc"
          type="textarea"
          placeholder="记录细节、成就、感悟..."
          rows="3"
          autosize
          maxlength="500"
          show-word-limit
        />
      </div>

      <!-- 上传配图 -->
      <div class="ms-edit-field">
        <label class="ms-edit-label">上传配图 <span class="ms-edit-hint">最多3张</span></label>
        <self-upload
          v-model="form.imageList"
          :multiple="true"
          :max="3"
          :max-size="5"
          :upload-fn="uploadFn"
        />
      </div>

      <!-- 核心高光开关 -->
      <div class="ms-edit-field ms-edit-core">
        <div class="ms-edit-core-info">
          <span class="ms-edit-core-label">
            <van-icon name="star" size="16" :color="form.isCore ? '#f59e0b' : '#cbd5e1'" />
            纳入碑文汇总
          </span>
          <span class="ms-edit-core-hint">{{ coreHint }}</span>
        </div>
        <van-switch
          v-model="form.isCore"
          :disabled="!canToggleCore"
          size="20px"
          active-color="#f59e0b"
        />
      </div>

      <!-- 保存按钮 -->
      <div class="ms-edit-submit">
        <base-button block round type="primary" :loading="submitting" @click="handleSubmit">
          保存
        </base-button>
      </div>
    </div>
  </base-modal>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { showToast } from 'vant'
import { uploadFile } from '@/services/files'
import { useMilestoneStore } from '@/stores/milestone'
import { useFamilyStore } from '@/stores/family'
import { useAuthStore } from '@/stores/auth'
import { validateTitle, validateHappenDate } from '@/utils/milestone'

const props = defineProps({
  show: { type: Boolean, default: false },
  mode: { type: String, default: 'create' },
  milestone: { type: Object, default: null },
  defaultType: { type: String, default: 'personal' }
})

const emit = defineEmits(['update:show', 'saved'])

const milestoneStore = useMilestoneStore()
const familyStore = useFamilyStore()
const authStore = useAuthStore()

const submitting = ref(false)
const dateMode = ref('day')

const form = ref({
  type: 'personal',
  title: '',
  happenDate: '',
  desc: '',
  isCore: false,
  relatedMemberIds: [],
  imageList: []
})

const maxDate = new Date()

const typeOptions = [
  { label: '个人大事纪', value: 'personal' },
  { label: '家庭大事纪', value: 'family' }
]

const visible = computed({
  get: () => props.show,
  set: (v) => emit('update:show', v)
})

const isOwner = computed(() => familyStore.isOwner)
const currentUserId = computed(() => authStore.profile?.id || '')

const canToggleCore = computed(() => {
  if (props.mode === 'create') {
    return form.value.type === 'personal' || isOwner.value
  }
  if (!props.milestone) return false
  if (props.milestone.type === 'personal') {
    return props.milestone.creatorId === currentUserId.value
  }
  return isOwner.value
})

const coreHint = computed(() => {
  if (props.mode === 'create') {
    if (form.value.type === 'family' && !isOwner.value) {
      return '家庭事件核心标记需房主操作'
    }
    return '开启后将展示在碑文汇总页'
  }
  if (!props.milestone) return ''
  if (props.milestone.type === 'personal' && props.milestone.creatorId !== currentUserId.value) {
    return '仅创建人可修改'
  }
  if (props.milestone.type === 'family' && !isOwner.value) {
    return '仅房主可修改'
  }
  return '开启后将展示在碑文汇总页'
})

const uploadFn = async (file) => {
  const response = await uploadFile(file, 'milestone')
  const data = response.data ?? response
  return data.url || data
}

// 初始化表单
watch(
  () => props.show,
  (show) => {
    if (!show) return
    if (props.mode === 'edit' && props.milestone) {
      form.value = {
        type: props.milestone.type,
        title: props.milestone.title || '',
        happenDate: props.milestone.happenDate || '',
        desc: props.milestone.desc || '',
        isCore: props.milestone.isCore || false,
        relatedMemberIds: props.milestone.relatedMemberIds || [],
        imageList: props.milestone.imageList || []
      }
      dateMode.value = props.milestone.happenDate?.length === 7 ? 'month' : 'day'
    } else {
      form.value = {
        type: props.defaultType,
        title: '',
        happenDate: '',
        desc: '',
        isCore: false,
        relatedMemberIds: [],
        imageList: []
      }
      dateMode.value = 'day'
    }
  },
  { immediate: true }
)

// 切换日期精度时兼容已有值
watch(dateMode, (mode) => {
  if (!form.value.happenDate) return
  if (mode === 'month' && form.value.happenDate.length === 10) {
    form.value.happenDate = form.value.happenDate.slice(0, 7)
  }
})

async function handleSubmit() {
  const titleError = validateTitle(form.value.title)
  if (titleError) {
    showToast(titleError)
    return
  }
  const dateError = validateHappenDate(form.value.happenDate)
  if (dateError) {
    showToast(dateError)
    return
  }

  if (props.mode === 'create' && form.value.isCore) {
    if (form.value.type === 'family' && !isOwner.value) {
      showToast('家庭事件核心标记需房主操作')
      return
    }
  }

  submitting.value = true
  try {
    const payload = {
      type: form.value.type,
      title: form.value.title.trim(),
      happenDate: form.value.happenDate,
      desc: form.value.desc.trim(),
      isCore: form.value.isCore,
      relatedMemberIds: form.value.type === 'personal'
        ? [currentUserId.value]
        : (form.value.relatedMemberIds.length ? form.value.relatedMemberIds : [currentUserId.value]),
      imageList: form.value.imageList || []
    }

    if (props.mode === 'edit' && props.milestone) {
      await milestoneStore.updateMilestoneAction(props.milestone.id, payload)
    } else {
      await milestoneStore.createMilestoneAction(payload)
    }
    emit('saved')
    emit('update:show', false)
  } catch {
    // 错误已由拦截器处理
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.ms-edit-form {
  padding: 4px 0 8px;
}

.ms-edit-field {
  margin-bottom: 16px;
}

.ms-edit-label {
  display: block;
  font-size: 14px;
  font-weight: 500;
  color: #334155;
  margin-bottom: 8px;
}

.ms-edit-required {
  color: #ef4444;
}

.ms-edit-hint {
  font-size: 12px;
  color: #94a3b8;
  font-weight: 400;
  margin-left: 4px;
}

.ms-edit-date-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ms-edit-date-row > :first-child {
  flex: 1;
}

.ms-edit-date-mode {
  display: flex;
  flex-direction: column;
  gap: 4px;
  flex-shrink: 0;
}

.ms-edit-mode-btn {
  font-size: 10px;
  color: #94a3b8;
  padding: 3px 8px;
  border-radius: 4px;
  background: #f1f5f9;
  cursor: pointer;
  white-space: nowrap;
}

.ms-edit-mode-btn--active {
  background: #e0f2fe;
  color: #0ea5e9;
  font-weight: 500;
}

.ms-edit :deep(.van-field) {
  background: #f7f8fa;
  border-radius: 8px;
}

.ms-edit-core {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #f7f8fa;
  border-radius: 8px;
  padding: 12px;
}

.ms-edit-core-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ms-edit-core-label {
  font-size: 14px;
  font-weight: 500;
  color: #334155;
  display: flex;
  align-items: center;
  gap: 6px;
}

.ms-edit-core-hint {
  font-size: 11px;
  color: #94a3b8;
}

.ms-edit-submit {
  padding: 8px 0;
  padding-bottom: calc(8px + env(safe-area-inset-bottom, 0px));
}
</style>
