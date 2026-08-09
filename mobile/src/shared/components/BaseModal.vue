<template>
  <van-popup
    v-model:show="show"
    class="base-modal"
    :round="round"
    :position="position"
    :closeable="closeable"
    :close-on-click-overlay="closeOnClickOverlay"
    :style="popupStyle"
    @closed="emit('closed')"
  >
    <div v-if="title" class="modal-title text-base font-bold text-center py-16 text-gray-800">{{ title }}</div>
    <div class="modal-body" :style="bodyStyleObj">
      <slot />
    </div>
    <div v-if="showFooter" class="modal-footer flex p-16 gap-12">
      <base-button v-if="showCancel" plain type="default" class="flex-1" @click="onCancel">
        {{ cancelText }}
      </base-button>
      <base-button type="primary" class="flex-1" :loading="confirmLoading" @click="onConfirm">
        {{ confirmText }}
      </base-button>
    </div>
  </van-popup>
</template>

<script setup>
const props = defineProps({
  modelValue: { type: Boolean, default: false },
  title: { type: String, default: '' },
  width: { type: [String, Number], default: '80%' },
  maxWidth: { type: [String, Number], default: 320 },
  maxHeight: { type: String, default: '' },
  round: { type: Boolean, default: true },
  position: { type: String, default: 'center' },
  closeable: { type: Boolean, default: false },
  closeOnClickOverlay: { type: Boolean, default: true },
  showFooter: { type: Boolean, default: true },
  showCancel: { type: Boolean, default: true },
  cancelText: { type: String, default: '取消' },
  confirmText: { type: String, default: '确认' },
  confirmLoading: { type: Boolean, default: false },
  bodyStyle: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue', 'confirm', 'cancel', 'closed'])

const show = computed({
  get: () => props.modelValue,
  set: (val) => emit('update:modelValue', val)
})

/**
 * position=center: 居中弹窗，限宽不限高
 * position=bottom/top: 底部/顶部抽屉，限高不限宽，body 内部滚动
 */
const popupStyle = computed(() => {
  const style = {}
  if (props.position === 'center') {
    style.width = typeof props.width === 'number' ? `${props.width}px` : props.width
    style.maxWidth = typeof props.maxWidth === 'number' ? `${props.maxWidth}px` : props.maxWidth
  }
  if (props.maxHeight) {
    style.maxHeight = props.maxHeight
  }
  return style
})

const bodyStyleObj = computed(() => {
  if (!props.bodyStyle) return {}
  return props.bodyStyle.split(';').reduce((acc, item) => {
    const [key, val] = item.split(':').map(s => s.trim())
    if (key && val) acc[key] = val
    return acc
  }, {})
})

function onConfirm() {
  emit('confirm')
}

function onCancel() {
  show.value = false
  emit('cancel')
}
</script>

<style scoped>
.base-modal {
  overflow: hidden;
}

.modal-body {
  padding: 8px 16px;
  max-height: 60vh;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
</style>