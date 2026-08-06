<template>
  <van-button
    class="base-button"
    :type="type"
    :size="size"
    :loading="loading"
    :disabled="disabled || loading"
    :block="block"
    :round="round"
    :plain="plain"
    :color="color"
    @click="handleClick"
  >
    <slot />
  </van-button>
</template>

<script setup>
const props = defineProps({
  type: { type: String, default: 'primary' },
  size: { type: String, default: 'normal' },
  loading: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
  block: { type: Boolean, default: false },
  round: { type: Boolean, default: true },
  plain: { type: Boolean, default: false },
  color: { type: String, default: '' },
  debounce: { type: Number, default: 0 }
})

const emit = defineEmits(['click'])

let timer = null

function handleClick(event) {
  if (props.loading || props.disabled) return
  if (props.debounce > 0) {
    clearTimeout(timer)
    timer = setTimeout(() => {
      emit('click', event)
    }, props.debounce)
  } else {
    emit('click', event)
  }
}
</script>

<style scoped>
.base-button {
  font-weight: 500;
  min-height: 44px;
  touch-action: manipulation;
}
</style>
