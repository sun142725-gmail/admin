<!--
 * SelfUpload 上传组件
 * 用途：自研移动端图片上传，内置文件格式/大小校验、预览、删除、数量限制、loading、失败重试。
 *       上传逻辑通过 uploadFn 注入（解耦 MinIO），不传 uploadFn 时降级为本地 base64 预览。
 * 依赖：vant（showToast/showImagePreview 仅用于轻提示与预览，非表单控件）
 -->
<template>
  <div class="self-upload">
    <div class="self-upload__list flex flex-wrap gap-12">
      <div
        v-for="item in fileList"
        :key="item.uid"
        class="self-upload__item relative h-[80px] w-[80px] rounded-md overflow-hidden bg-gray-100"
      >
        <img v-if="item.url" :src="item.url" class="w-full h-full object-cover" @click="onPreview(item)" />
        <!-- 遮罩：上传中 / 失败 -->
        <div v-if="item.status !== 'success'" class="self-upload__mask absolute inset-0 flex-center flex-col text-white">
          <van-loading v-if="item.status === 'uploading'" size="18" color="#fff" />
          <span v-if="item.status === 'uploading'" class="text-xs mt-4">上传中</span>
          <template v-if="item.status === 'failed'">
            <van-icon name="replay" size="18" color="#fff" @click="retry(item)" />
            <span class="text-xs mt-4">点击重试</span>
          </template>
        </div>
        <!-- 删除按钮 -->
        <span
          v-if="!disabled && deletable"
          class="self-upload__del absolute top-0 right-0 w-[24px] h-[24px] flex-center bg-danger text-white rounded-full"
          @click="remove(item)"
        >
          <van-icon name="cross" size="12" color="#fff" />
        </span>
      </div>

      <!-- 选择按钮 -->
      <div
        v-if="showPicker"
        class="self-upload__picker h-[80px] w-[80px] rounded-md flex-center border border-dashed border-gray-200 text-gray-400"
        :class="{ 'is-disabled': disabled }"
        @click="trigger"
      >
        <van-icon name="photograph" size="22" />
      </div>
    </div>

    <input
      ref="inputRef"
      type="file"
      :accept="accept"
      :multiple="multiple"
      class="hidden"
      @change.stop="onChange"
    />
  </div>
</template>

<script lang="ts">
export interface UploadFile {
  uid: string
  url: string
  status: 'uploading' | 'success' | 'failed'
  file?: File
}

export interface UploadProps {
  modelValue?: string | string[]
  multiple?: boolean
  max?: number
  accept?: string
  maxSize?: number
  disabled?: boolean
  deletable?: boolean
  /** 上传函数：接收 File，返回资源 url；不传则用本地 base64 预览兜底 */
  uploadFn?: (file: File) => Promise<string>
}
</script>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { showToast, showImagePreview } from 'vant'

const props = withDefaults(defineProps<UploadProps>(), {
  modelValue: () => [],
  multiple: false,
  max: 1,
  accept: 'image/*',
  maxSize: 5,
  disabled: false,
  deletable: true,
  uploadFn: undefined
})

const emit = defineEmits<{
  (e: 'update:modelValue', val: string | string[]): void
  (e: 'change'): void
  (e: 'error', msg: string): void
}>()

const inputRef = ref<HTMLInputElement | null>(null)
const fileList = ref<UploadFile[]>([])

const showPicker = computed(() => {
  if (props.disabled) return false
  return props.multiple ? fileList.value.length < props.max : fileList.value.length === 0
})

function normalizeUrls(v: string | string[] | undefined): string[] {
  if (!v) return []
  return Array.isArray(v) ? v.filter(Boolean) : [v]
}

// 外部受控同步
watch(
  () => props.modelValue,
  (val) => {
    const urls = normalizeUrls(val)
    const cur = fileList.value.filter((f) => f.url).map((f) => f.url)
    if (urls.join(',') !== cur.join(',')) {
      fileList.value = urls.map((url) => ({ uid: genUid(), url, status: 'success' }))
    }
  },
  { immediate: true }
)

function genUid(): string {
  return `${Date.now()}_${Math.random().toString(36).slice(2)}`
}

function trigger() {
  if (props.disabled) return
  inputRef.value?.click()
}

function onChange(e: Event) {
  const target = e.target as HTMLInputElement
  const files = Array.from(target.files || [])
  target.value = '' // 重置以便重复选同一文件

  for (const file of files) {
    if (!validate(file)) continue
    // 多图数量限制
    if (props.multiple && fileList.value.length >= props.max) {
      showToast(`最多上传 ${props.max} 张`)
      break
    }
    // 单图覆盖
    if (!props.multiple) fileList.value = []

    const item: UploadFile = { uid: genUid(), url: '', status: 'uploading', file }
    fileList.value.push(item)
    uploadOne(item)
  }
}

function validate(file: File): boolean {
  // 大小校验
  if (file.size > props.maxSize * 1024 * 1024) {
    const msg = `文件不能超过 ${props.maxSize}MB`
    showToast(msg)
    emit('error', msg)
    return false
  }
  // 格式校验
  if (props.accept && !matchAccept(file, props.accept)) {
    const msg = '文件格式不支持'
    showToast(msg)
    emit('error', msg)
    return false
  }
  return true
}

function matchAccept(file: File, accept: string): boolean {
  const types = accept
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (!types.length) return true
  return types.some((t) => {
    if (t.startsWith('.')) return file.name.toLowerCase().endsWith(t.toLowerCase())
    if (t.endsWith('/*')) return file.type.startsWith(t.slice(0, -2))
    return file.type === t
  })
}

async function uploadOne(item: UploadFile) {
  if (!item.file) return
  try {
    const url = props.uploadFn ? await props.uploadFn(item.file) : await readAsBase64(item.file)
    item.url = url
    item.status = 'success'
  } catch {
    item.status = 'failed'
    showToast('上传失败，请重试')
  }
  emitChange()
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function retry(item: UploadFile) {
  item.status = 'uploading'
  uploadOne(item)
}

function remove(item: UploadFile) {
  const idx = fileList.value.findIndex((f) => f.uid === item.uid)
  if (idx > -1) fileList.value.splice(idx, 1)
  emitChange()
}

function onPreview(item: UploadFile) {
  const urls = fileList.value.filter((f) => f.url).map((f) => f.url)
  const start = urls.indexOf(item.url)
  showImagePreview({ images: urls, startPosition: start < 0 ? 0 : start })
}

function emitChange() {
  const urls = fileList.value.filter((f) => f.status === 'success' && f.url).map((f) => f.url)
  emit('update:modelValue', props.multiple ? urls : urls[0] || '')
  emit('change')
}
</script>

<style scoped>
.self-upload__picker {
  transition: border-color 0.2s ease;
}
.self-upload__picker:active {
  border-color: theme('colors.primary.400');
}
.self-upload__picker.is-disabled {
  opacity: 0.6;
  pointer-events: none;
}
.self-upload__mask {
  background: rgba(0, 0, 0, 0.4);
}
.self-upload__del {
  transform: translate(40%, -40%);
  cursor: pointer;
}
</style>
