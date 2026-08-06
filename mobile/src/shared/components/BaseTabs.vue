<template>
  <div class="base-tabs flex flex-col h-full bg-white rounded-lg shadow-card overflow-hidden">
    <!-- Tab 头部 -->
    <div class="tabs-header flex relative border-b border-gray-100">
      <div
        v-for="(tab, index) in tabs"
        :key="getKey(tab, index)"
        class="tab-item flex-1 min-h-touch flex-center text-sm text-gray-600 transition-colors"
        :class="{ 'text-primary-500 font-bold': activeIndex === index }"
        @click="switchTab(index)"
      >
        {{ tab.title }}
      </div>
      <!-- 指示器 -->
      <div
        class="indicator absolute bottom-0 h-[3px] bg-primary-500 rounded-full transition-all duration-300"
        :style="indicatorStyle"
      />
    </div>

    <!-- Tab 内容区 -->
    <div ref="contentRef" class="tabs-content flex-1 overflow-hidden">
      <div class="tabs-panes flex h-full">
        <div
          v-for="(tab, index) in tabs"
          :key="getKey(tab, index)"
          class="tab-pane flex-shrink-0 w-full h-full"
        >
          <slot :name="`tab-${index}`" :tab="tab" :index="index" :active="activeIndex === index">
            <base-scroll nested-scroll>
              <div class="p-16">
                <slot :tab="tab" :index="index" :active="activeIndex === index">
                  <p class="text-sm text-gray-600">{{ tab.content }}</p>
                </slot>
              </div>
            </base-scroll>
          </slot>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import BScroll from '@better-scroll/core'
import Slide from '@better-scroll/slide'
import NestedScroll from '@better-scroll/nested-scroll'
import { ref, onMounted, onUnmounted, computed, watch } from 'vue'

BScroll.use(Slide)
BScroll.use(NestedScroll)

const props = defineProps({
  // Tab 数据：{ title, key?, content? }
  tabs: { type: Array, default: () => [] },
  // 当前激活索引
  modelValue: { type: Number, default: 0 },
  // 切换速度 ms
  speed: { type: Number, default: 300 },
  // 是否循环切换
  loop: { type: Boolean, default: false },
  // 是否允许滑动切换
  swipeable: { type: Boolean, default: true }
})

const emit = defineEmits(['update:modelValue', 'change'])

const contentRef = ref(null)
let bs = null
const activeIndex = ref(props.modelValue)

function getKey(tab, index) {
  if (tab && tab.key) return tab.key
  return index
}

const indicatorStyle = computed(() => {
  const count = props.tabs.length || 1
  const width = `${100 / count}%`
  const left = `${activeIndex.value * (100 / count)}%`
  return { width, left }
})

function initTabs() {
  if (!contentRef.value || props.tabs.length === 0) return

  bs = new BScroll(contentRef.value, {
    scrollX: props.swipeable,
    scrollY: false,
    momentum: false,
    bounce: false,
    probeType: 2,
    click: true,
    // 提高方向锁定阈值，避免上下滚动时轻微横向漂移就切换 Tab
    directionLockThreshold: 15,
    nestedScroll: true,
    slide: {
      loop: props.loop && props.tabs.length > 1,
      autoplay: false,
      threshold: 0.25,
      speed: props.speed,
      startPageXIndex: props.modelValue,
      disableSetWidth: false
    }
  })

  bs.on('slideWillChange', (page) => {
    activeIndex.value = page.pageX
  })

  bs.on('slidePageChanged', (page) => {
    activeIndex.value = page.pageX
    emit('update:modelValue', page.pageX)
    emit('change', page.pageX, props.tabs[page.pageX])
  })

  bs.on('scrollEnd', () => {
    const page = bs.getCurrentPage()
    activeIndex.value = page.pageX
  })
}

function switchTab(index) {
  if (!bs || activeIndex.value === index) return
  bs.goToPage(index, 0, props.speed)
}

function refresh() {
  if (bs) {
    bs.refresh()
  }
}

onMounted(() => {
  initTabs()
})

onUnmounted(() => {
  if (bs) {
    bs.destroy()
    bs = null
  }
})

watch(() => props.modelValue, (val) => {
  if (val !== activeIndex.value) {
    switchTab(val)
  }
})

watch(() => props.tabs.length, () => {
  if (bs) {
    bs.destroy()
    initTabs()
  }
})

defineExpose({
  refresh,
  switchTab
})
</script>

<style scoped>
.tabs-content {
  touch-action: pan-y;
}

.tab-pane {
  width: 100%;
}
</style>
