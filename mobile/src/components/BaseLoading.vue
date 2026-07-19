<template>
  <div v-if="visible" class="base-loading" :class="{ fixed: fixed }">
    <van-loading :type="type" :size="size" :color="color" :text-size="textSize">
      {{ text }}
    </van-loading>
  </div>
</template>

<script setup>
defineProps({
  visible: { type: Boolean, default: false },
  text: { type: String, default: '加载中...' },
  type: { type: String, default: 'circular' },
  size: { type: [String, Number], default: 24 },
  textSize: { type: [String, Number], default: 14 },
  color: { type: String, default: '#0ea5e9' },
  fixed: { type: Boolean, default: false }
})
</script>

<style scoped>
.base-loading {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
}

.base-loading.fixed {
  position: fixed;
  inset: 0;
  z-index: 999;
  background: rgba(255, 255, 255, 0.8);
}
</style>
