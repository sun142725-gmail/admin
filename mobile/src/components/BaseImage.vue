<template>
  <div class="base-image relative overflow-hidden bg-gray-100" :style="wrapperStyle">
    <img
      v-if="src"
      :src="src"
      :alt="alt"
      class="w-full h-full object-cover"
      :style="imageStyle"
      @load="onLoad"
      @error="onError"
    />
    <div v-if="!loaded || error" class="absolute inset-0 flex-center">
      <van-icon v-if="error" name="warning-o" size="24" color="#c9cdd4" />
      <van-loading v-else size="20" color="#c9cdd4" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  src: { type: String, default: '' },
  alt: { type: String, default: '' },
  width: { type: [String, Number], default: '' },
  height: { type: [String, Number], default: '' },
  radius: { type: [String, Number], default: 8 },
  ratio: { type: [String, Number], default: '' }
})

const loaded = ref(false)
const error = ref(false)

const wrapperStyle = computed(() => {
  const style = {}
  if (props.width) style.width = typeof props.width === 'number' ? `${props.width}px` : props.width
  if (props.height) style.height = typeof props.height === 'number' ? `${props.height}px` : props.height
  if (props.ratio) style.aspectRatio = props.ratio
  if (props.radius) style.borderRadius = typeof props.radius === 'number' ? `${props.radius}px` : props.radius
  return style
})

const imageStyle = computed(() => ({
  borderRadius: typeof props.radius === 'number' ? `${props.radius}px` : props.radius
}))

function onLoad() {
  loaded.value = true
  error.value = false
}

function onError() {
  loaded.value = true
  error.value = true
}
</script>
