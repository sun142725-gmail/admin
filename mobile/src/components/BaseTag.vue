<template>
  <span
    class="base-tag inline-flex items-center justify-center px-8 py-2 text-xs"
    :class="[typeClass, round ? 'rounded-full' : 'rounded-md']"
    :style="customStyle"
  >
    <slot />
  </span>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  type: { type: String, default: 'primary' },
  plain: { type: Boolean, default: false },
  round: { type: Boolean, default: true },
  color: { type: String, default: '' },
  textColor: { type: String, default: '' }
})

const typeMap = {
  primary: props.plain ? 'text-primary-500 bg-primary-50' : 'text-white bg-primary-500',
  success: props.plain ? 'text-success bg-success/10' : 'text-white bg-success',
  danger: props.plain ? 'text-danger bg-danger/10' : 'text-white bg-danger',
  warning: props.plain ? 'text-warning bg-warning/10' : 'text-white bg-warning',
  default: props.plain ? 'text-gray-500 bg-gray-100' : 'text-white bg-gray-500'
}

const typeClass = computed(() => typeMap[props.type] || typeMap.primary)

const customStyle = computed(() => {
  if (!props.color) return {}
  return {
    backgroundColor: props.plain ? 'transparent' : props.color,
    color: props.textColor || props.color,
    border: props.plain ? `1px solid ${props.color}` : 'none'
  }
})
</script>

<style scoped>
.base-tag {
  line-height: 1.4;
}
</style>
