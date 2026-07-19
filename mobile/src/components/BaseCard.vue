<template>
  <div class="base-card bg-white rounded-lg overflow-hidden" :class="{ 'shadow-card': shadow, 'p-16': padding }">
    <div v-if="title || $slots.header" class="card-header flex-between px-16 py-12 border-b border-gray-100">
      <div class="flex items-center">
        <div v-if="icon" class="w-[4px] h-16 bg-primary-500 rounded-full mr-8" />
        <span class="text-base font-bold text-gray-800">{{ title }}</span>
      </div>
      <slot name="header" />
    </div>
    <div class="card-body" :class="{ 'p-16': padding }">
      <slot />
    </div>
    <div v-if="$slots.footer" class="card-footer px-16 py-12 border-t border-gray-100">
      <slot name="footer" />
    </div>
  </div>
</template>

<script setup>
defineProps({
  title: { type: String, default: '' },
  icon: { type: Boolean, default: true },
  shadow: { type: Boolean, default: true },
  padding: { type: Boolean, default: true }
})
</script>
