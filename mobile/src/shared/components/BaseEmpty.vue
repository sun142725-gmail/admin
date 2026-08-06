<template>
  <div class="base-empty flex flex-col items-center justify-center p-24">
    <img
      v-if="image"
      :src="image"
      class="empty-image mb-16"
      :style="imageStyle"
      alt="empty"
    />
    <van-icon v-else :name="icon" :size="iconSize" :color="iconColor" class="mb-16" />
    <p class="empty-description text-sm text-gray-500 mb-16">{{ description }}</p>
    <base-button v-if="showButton" type="primary" size="small" @click="emit('click')">
      {{ buttonText }}
    </base-button>
  </div>
</template>

<script setup>
const props = defineProps({
  image: { type: String, default: '' },
  imageSize: { type: [String, Number], default: 120 },
  icon: { type: String, default: 'warning-o' },
  iconSize: { type: [String, Number], default: 64 },
  iconColor: { type: String, default: '#c9cdd4' },
  description: { type: String, default: '暂无数据' },
  showButton: { type: Boolean, default: false },
  buttonText: { type: String, default: '重新加载' }
})

const emit = defineEmits(['click'])

const imageStyle = {
  width: typeof props.imageSize === 'number' ? `${props.imageSize}px` : props.imageSize,
  height: typeof props.imageSize === 'number' ? `${props.imageSize}px` : props.imageSize
}
</script>

<style scoped>
.empty-image {
  object-fit: contain;
}
</style>
