<template>
  <div class="flex flex-col items-center py-48 px-24">
    <div class="w-80 h-80 rounded-full bg-gray-50 flex-center mb-12">
      <van-icon :name="icon" size="48" :color="color" />
    </div>
    <p class="text-sm text-gray-400 text-center mb-16">{{ text }}</p>
    <slot />
  </div>
</template>

<script setup>
defineProps({
  icon: { type: String, default: 'info-o' },
  text: { type: String, default: '暂无数据' },
  color: { type: String, default: '#a9b1bf' } // gray-300
})
</script>
