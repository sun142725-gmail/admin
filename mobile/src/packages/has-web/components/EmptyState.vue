<template>
  <div class="empty-state">
    <div class="empty-state-icon">
      <van-icon :name="icon" size="48" :color="color" />
    </div>
    <p class="empty-state-text">{{ text }}</p>
    <slot />
  </div>
</template>

<script setup>
defineProps({
  icon: { type: String, default: 'info-o' },
  text: { type: String, default: '暂无数据' },
  color: { type: String, default: '#cbd5e1' }
})
</script>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 48px 24px;
}

.empty-state-icon {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  background: #f1f5f9;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
}

.empty-state-text {
  font-size: 13px;
  color: #94a3b8;
  text-align: center;
}
</style>
