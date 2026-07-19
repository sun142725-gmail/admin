<template>
  <div ref="wrapperRef" class="base-swiper relative overflow-hidden">
    <div class="swiper-content flex h-full">
      <div
        v-for="(item, index) in list"
        :key="getKey(item, index)"
        class="swiper-item flex-shrink-0 w-full h-full"
      >
        <slot :item="item" :index="index">
          <div class="w-full h-full flex-center bg-gray-100">
            <span class="text-xl text-gray-400">{{ index + 1 }}</span>
          </div>
        </slot>
      </div>
    </div>

    <!-- 分页指示器 -->
    <div v-if="showDots && list.length > 1" class="dots-wrapper absolute bottom-12 left-0 right-0 flex-center gap-8">
      <span
        v-for="(_, index) in list"
        :key="index"
        class="dot w-6 h-6 rounded-full transition-all"
        :class="{ 'w-12 bg-white': currentIndex === index, 'bg-white/50': currentIndex !== index }"
      />
    </div>
  </div>
</template>

<script setup>
import BScroll from '@better-scroll/core'
import Slide from '@better-scroll/slide'
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'

BScroll.use(Slide)

const props = defineProps({
  // 数据列表
  list: { type: Array, default: () => [] },
  // 唯一键字段名
  keyField: { type: String, default: '' },
  // 是否循环
  loop: { type: Boolean, default: true },
  // 是否自动播放
  autoplay: { type: Boolean, default: true },
  // 自动播放间隔 ms
  interval: { type: Number, default: 3000 },
  // 是否显示分页点
  showDots: { type: Boolean, default: true },
  // 初始索引
  initialIndex: { type: Number, default: 0 },
  // 切换速度 ms
  speed: { type: Number, default: 400 },
  // 是否纵向滚动
  vertical: { type: Boolean, default: false }
})

const emit = defineEmits(['change', 'click'])

const wrapperRef = ref(null)
let bs = null
const currentIndex = ref(props.initialIndex)

function getKey(item, index) {
  if (props.keyField && item && typeof item === 'object') {
    return item[props.keyField]
  }
  return index
}

function initSwiper() {
  if (!wrapperRef.value || props.list.length === 0) return

  bs = new BScroll(wrapperRef.value, {
    scrollX: !props.vertical,
    scrollY: props.vertical,
    slide: {
      loop: props.loop && props.list.length > 1,
      threshold: 0.1,
      speed: props.speed,
      autoplay: props.autoplay && props.list.length > 1,
      interval: props.interval,
      startPageXIndex: props.vertical ? 0 : props.initialIndex,
      startPageYIndex: props.vertical ? props.initialIndex : 0
    },
    momentum: false,
    bounce: false,
    probeType: 2,
    click: true
  })

  bs.on('slideWillChange', (page) => {
    const index = props.vertical ? page.pageY : page.pageX
    currentIndex.value = index
  })

  bs.on('slidePageChanged', (page) => {
    const index = props.vertical ? page.pageY : page.pageX
    currentIndex.value = index
    emit('change', index)
  })

  bs.on('scrollEnd', () => {
    const page = bs.getCurrentPage()
    const index = props.vertical ? page.pageY : page.pageX
    currentIndex.value = index
  })

  // 点击事件
  bs.on('click', () => {
    emit('click', currentIndex.value, props.list[currentIndex.value])
  })
}

function refresh() {
  if (bs) {
    nextTick(() => {
      bs.refresh()
    })
  }
}

function goToPage(index, time = 300) {
  if (bs) {
    if (props.vertical) {
      bs.goToPage(0, index, time)
    } else {
      bs.goToPage(index, 0, time)
    }
  }
}

function prev() {
  if (bs) {
    bs.prev()
  }
}

function next() {
  if (bs) {
    bs.next()
  }
}

onMounted(() => {
  initSwiper()
})

onUnmounted(() => {
  if (bs) {
    bs.destroy()
    bs = null
  }
})

watch(() => props.list, () => {
  if (bs) {
    bs.destroy()
    initSwiper()
  }
}, { deep: true })

defineExpose({
  refresh,
  goToPage,
  prev,
  next
})
</script>

<style scoped>
.base-swiper {
  height: 100%;
}

.swiper-item {
  width: 100%;
}
</style>
