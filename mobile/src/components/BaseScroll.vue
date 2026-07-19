<template>
  <div ref="wrapperRef" class="base-scroll relative overflow-hidden">
    <div class="base-scroll-content" :class="contentClass">
      <slot />

      <!-- 下拉刷新状态 -->
      <div v-if="pullDownRefresh" class="pulldown-wrapper absolute w-full text-center text-xs text-gray-400">
        <slot name="pullDown" :status="pullDownStatus">
          {{ pullDownText }}
        </slot>
      </div>

      <!-- 上拉加载状态 -->
      <div v-if="pullUpLoad" class="pullup-wrapper w-full text-center text-xs text-gray-400 py-12">
        <slot name="pullUp" :status="pullUpStatus">
          {{ pullUpText }}
        </slot>
      </div>
    </div>
  </div>
</template>

<script setup>
import BScroll from '@better-scroll/core'
import PullDown from '@better-scroll/pull-down'
import PullUp from '@better-scroll/pull-up'
import ScrollBar from '@better-scroll/scroll-bar'
import NestedScroll from '@better-scroll/nested-scroll'
import { ref, onMounted, onUnmounted, computed, watch, nextTick } from 'vue'

BScroll.use(PullDown)
BScroll.use(PullUp)
BScroll.use(ScrollBar)
BScroll.use(NestedScroll)

const props = defineProps({
  // 滚动方向：vertical / horizontal / free
  direction: { type: String, default: 'vertical' },
  // 是否开启点击
  click: { type: Boolean, default: true },
  // 是否开启下拉刷新
  pullDownRefresh: { type: [Boolean, Object], default: false },
  // 是否开启上拉加载
  pullUpLoad: { type: [Boolean, Object], default: false },
  // 是否显示滚动条
  scrollbar: { type: [Boolean, Object], default: false },
  // 是否监听滚动位置
  probeType: { type: Number, default: 0 },
  // 是否派发 scroll 事件
  listenScroll: { type: Boolean, default: false },
  // 是否启用 mousewheel（PC 端）
  mouseWheel: { type: [Boolean, Object], default: false },
  // 是否启用嵌套滚动（用于 Tabs 等场景）
  nestedScroll: { type: [Boolean, Object], default: false }
})

const emit = defineEmits(['scroll', 'pullingDown', 'pullingUp', 'scrollStart', 'scrollEnd'])

const wrapperRef = ref(null)
let bs = null

const pullDownStatus = ref('default')
const pullUpStatus = ref('default')

// 横向/自由滚动时内容容器需为 inline-block，宽度收缩到内容实际宽度，
// 这样 BetterScroll 才能检测到内容比容器更宽从而启用横向滚动
const contentClass = computed(() => ({
  'content-horizontal': props.direction === 'horizontal',
  'content-free': props.direction === 'free'
}))

const pullDownText = computed(() => {
  const map = {
    default: '下拉刷新',
    pulling: '下拉刷新',
    beforeUpdate: '释放立即刷新',
    updating: '加载中...'
  }
  return map[pullDownStatus.value]
})

const pullUpText = computed(() => {
  const map = {
    default: '上拉加载更多',
    pulling: '上拉加载更多',
    beforeUpdate: '释放加载更多',
    updating: '加载中...',
    noMore: '没有更多了'
  }
  return map[pullUpStatus.value]
})

function initScroll() {
  if (!wrapperRef.value) return

  const options = {
    scrollX: props.direction === 'horizontal' || props.direction === 'free',
    scrollY: props.direction === 'vertical' || props.direction === 'free',
    freeScroll: props.direction === 'free',
    click: props.click,
    probeType: props.listenScroll ? props.probeType : 0,
    scrollbar: props.scrollbar,
    mouseWheel: props.mouseWheel,
    nestedScroll: props.nestedScroll
  }

  if (props.pullDownRefresh) {
    options.pullDownRefresh = typeof props.pullDownRefresh === 'object'
      ? props.pullDownRefresh
      : { threshold: 70, stop: 56 }
  }

  if (props.pullUpLoad) {
    options.pullUpLoad = typeof props.pullUpLoad === 'object'
      ? props.pullUpLoad
      : { threshold: 0 }
  }

  bs = new BScroll(wrapperRef.value, options)

  if (props.listenScroll) {
    bs.on('scroll', (pos) => {
      emit('scroll', pos)
    })
  }

  bs.on('scrollStart', () => emit('scrollStart'))
  bs.on('scrollEnd', () => emit('scrollEnd'))

  if (props.pullDownRefresh) {
    bs.on('pullingDown', () => {
      pullDownStatus.value = 'updating'
      emit('pullingDown')
    })
    bs.on('enterThreshold', () => {
      pullDownStatus.value = 'beforeUpdate'
    })
    bs.on('leaveThreshold', () => {
      pullDownStatus.value = 'pulling'
    })
  }

  if (props.pullUpLoad) {
    bs.on('pullingUp', () => {
      pullUpStatus.value = 'updating'
      emit('pullingUp')
    })
  }
}

function refresh() {
  if (bs) {
    nextTick(() => {
      bs.refresh()
    })
  }
}

function finishPullDown() {
  if (bs) {
    pullDownStatus.value = 'default'
    bs.finishPullDown()
    refresh()
  }
}

function finishPullUp(hasMore = true) {
  if (bs) {
    if (hasMore) {
      pullUpStatus.value = 'default'
      bs.finishPullUp()
      refresh()
    } else {
      pullUpStatus.value = 'noMore'
      bs.finishPullUp()
      bs.closePullUp()
    }
  }
}

function enablePullUp() {
  if (bs) {
    pullUpStatus.value = 'default'
    bs.openPullUp()
  }
}

function scrollTo(x, y, time = 300) {
  if (bs) {
    bs.scrollTo(x, y, time)
  }
}

function scrollToElement(el, time = 300, offsetX = false, offsetY = false) {
  if (bs) {
    bs.scrollToElement(el, time, offsetX, offsetY)
  }
}

let resizeObserver = null

onMounted(() => {
  nextTick(() => {
    initScroll()
    if (wrapperRef.value && window.ResizeObserver) {
      resizeObserver = new ResizeObserver(() => {
        refresh()
      })
      resizeObserver.observe(wrapperRef.value)
    }
  })
})

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (bs) {
    bs.destroy()
    bs = null
  }
})

watch(() => props.direction, () => {
  if (bs) {
    bs.destroy()
    initScroll()
  }
})

defineExpose({
  refresh,
  finishPullDown,
  finishPullUp,
  enablePullUp,
  scrollTo,
  scrollToElement
})
</script>

<style scoped>
.base-scroll {
  height: 100%;
  touch-action: none;
}

/* 横向/自由滚动：内容容器改为 inline-block，宽度由内容撑开 */
.base-scroll-content.content-horizontal,
.base-scroll-content.content-free {
  display: inline-block;
}

.pulldown-wrapper {
  top: -40px;
  height: 40px;
  line-height: 40px;
}
</style>
