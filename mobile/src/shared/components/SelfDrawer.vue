<!--
 * SelfDrawer 抽屉组件
 * 用途：四向弹出抽屉，内部 BaseScroll 滚动 + nestedScroll 联动 + 下拉关闭手势 + 遮罩点击关闭 + 滚动位置记忆。
 * API：modelValue / direction / title / maskClosable / maxHeight / maxWidth，插槽 default / header / footer
 * 依赖：BaseScroll（滚动底座）、@better-scroll/nested-scroll（已在 BaseScroll 注册）
 -->
<template>
  <teleport to="body">
    <div v-if="render" class="self-drawer-root">
      <transition name="self-drawer-fade">
        <div v-if="visible" class="self-drawer-mask" @click="onMaskClick" />
      </transition>
      <transition :name="transitionName" @after-leave="onAfterLeave">
        <div
          v-if="visible"
          class="self-drawer-panel"
          :class="[`is-${direction}`]"
          :style="panelStyle"
          @click.stop
        >
          <!-- 顶部下拉手势条（仅底部抽屉） -->
          <div v-if="direction === 'bottom'" class="self-drawer__handle" />
          <!-- 头部 -->
          <div v-if="title || $slots.header" class="self-drawer__header flex-between">
            <span>{{ title }}</span>
            <span v-if="closeable" class="self-drawer__close" @click="close">
              <van-icon name="cross" size="16" color="#86909c" />
            </span>
          </div>
          <!-- 滚动内容 -->
          <div class="self-drawer__body">
            <base-scroll
              ref="scrollerRef"
              :listen-scroll="direction === 'bottom'"
              :probe-type="3"
              :nested-scroll="true"
              :scrollbar="false"
              @scroll="onScroll"
              @scroll-start="onScrollStart"
              @scroll-end="onScrollEnd"
            >
              <div class="p-16 pb-safe-bottom">
                <slot />
              </div>
            </base-scroll>
          </div>
          <!-- 底部 footer -->
          <div v-if="$slots.footer" class="self-drawer__footer">
            <slot name="footer" />
          </div>
        </div>
      </transition>
    </div>
  </teleport>
</template>

<script lang="ts">
export type DrawerDirection = 'bottom' | 'top' | 'left' | 'right'

export interface DrawerProps {
  modelValue?: boolean
  /** 弹出方向 */
  direction?: DrawerDirection
  title?: string
  /** 是否显示右上角关闭按钮 */
  closeable?: boolean
  /** 点击遮罩是否关闭 */
  maskClosable?: boolean
  /** 最大高度（bottom/top） */
  maxHeight?: string
  /** 最大宽度（left/right） */
  maxWidth?: string
  /** 底部下拉关闭触发距离 */
  pullDistance?: number
}
</script>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import type { ComponentPublicInstance } from 'vue'

const props = withDefaults(defineProps<DrawerProps>(), {
  modelValue: false,
  direction: 'bottom',
  title: '',
  closeable: true,
  maskClosable: true,
  maxHeight: '85vh',
  maxWidth: '80%',
  pullDistance: 80
})

const emit = defineEmits<{
  (e: 'update:modelValue', val: boolean): void
  (e: 'open'): void
  (e: 'close'): void
}>()

type ScrollerInstance = ComponentPublicInstance & {
  refresh: () => void
  scrollTo: (x: number, y: number, time?: number) => void
}

const scrollerRef = ref<ScrollerInstance | null>(null)
const render = ref(false)
const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const transitionName = computed(() => {
  const map: Record<DrawerDirection, string> = {
    bottom: 'self-drawer-up',
    top: 'self-drawer-down',
    left: 'self-drawer-right',
    right: 'self-drawer-left'
  }
  return map[props.direction]
})

const panelStyle = computed(() => {
  const s: Record<string, string> = {}
  if (props.direction === 'bottom' || props.direction === 'top') {
    // 用固定 height 而非 max-height，确保 body/base-scroll 能获得确定高度以支持滚动
    s['height'] = props.maxHeight
  }
  if (props.direction === 'left' || props.direction === 'right') {
    s['max-width'] = props.maxWidth
  }
  return s
})

// 下拉关闭手势
let peakY = 0
let currentY = 0
let savedY = 0

function onScrollStart() {
  peakY = 0
}
function onScroll(pos: { x: number; y: number }) {
  currentY = pos.y
  if (pos.y > peakY) peakY = pos.y
}
function onScrollEnd() {
  if (props.direction === 'bottom' && peakY > props.pullDistance) {
    close()
  }
}

function onMaskClick() {
  if (props.maskClosable) close()
}

function open() {
  visible.value = true
}
function close() {
  if (!props.closeable) return
  savedY = currentY
  visible.value = false
}
function getScroller() {
  return scrollerRef.value
}

function onAfterLeave() {
  render.value = false
}

watch(visible, (v) => {
  if (v) {
    render.value = true
    document.body.style.overflow = 'hidden'
    emit('open')
    nextTick(() => {
      setTimeout(() => {
        scrollerRef.value?.refresh()
        if (savedY) scrollerRef.value?.scrollTo(0, savedY, 0)
      }, 50)
    })
  } else {
    document.body.style.overflow = ''
    emit('close')
  }
})

onBeforeUnmount(() => {
  document.body.style.overflow = ''
})

defineExpose({ open, close, getScroller })
</script>

<style scoped>
.self-drawer-root {
  position: fixed;
  inset: 0;
  z-index: theme('zIndex.dialog');
  pointer-events: none;
}
.self-drawer-mask {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  pointer-events: auto;
}
.self-drawer-panel {
  position: fixed;
  background: theme('colors.white');
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.self-drawer-panel.is-bottom {
  left: 0;
  right: 0;
  bottom: 0;
  border-top-left-radius: theme('borderRadius.lg');
  border-top-right-radius: theme('borderRadius.lg');
}
.self-drawer-panel.is-top {
  left: 0;
  right: 0;
  top: 0;
  border-bottom-left-radius: theme('borderRadius.lg');
  border-bottom-right-radius: theme('borderRadius.lg');
}
.self-drawer-panel.is-left {
  top: 0;
  bottom: 0;
  left: 0;
  width: 80%;
}
.self-drawer-panel.is-right {
  top: 0;
  bottom: 0;
  right: 0;
  width: 80%;
}
.self-drawer__handle {
  width: 40px;
  height: 4px;
  margin: 8px auto 0;
  background: theme('colors.gray.200');
  border-radius: theme('borderRadius.full');
  flex-shrink: 0;
}
.self-drawer__header {
  padding: 16px;
  font-size: theme('fontSize.base');
  font-weight: bold;
  color: theme('colors.gray.800');
  border-bottom: 1px solid theme('colors.gray.100');
  flex-shrink: 0;
}
.self-drawer__close {
  display: flex;
  align-items: center;
  padding: 4px;
  cursor: pointer;
}
.self-drawer__body {
  flex: 1 1 0;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
/* 仅作用于 body 直接子的滚动容器，避免影响抽屉内嵌套的 base-scroll */
.self-drawer__body > :deep(.base-scroll) {
  height: auto;
  flex: 1 1 0;
  min-height: 0;
}
.self-drawer__footer {
  flex-shrink: 0;
  border-top: 1px solid theme('colors.gray.100');
}
/* 遮罩淡入淡出 */
.self-drawer-fade-enter-active,
.self-drawer-fade-leave-active {
  transition: opacity 0.3s ease;
}
.self-drawer-fade-enter-from,
.self-drawer-fade-leave-to {
  opacity: 0;
}
.self-drawer-up-enter-active,
.self-drawer-up-leave-active {
  transition: transform 0.3s ease;
}
.self-drawer-up-enter-from,
.self-drawer-up-leave-to {
  transform: translateY(100%);
}
.self-drawer-down-enter-active,
.self-drawer-down-leave-active {
  transition: transform 0.3s ease;
}
.self-drawer-down-enter-from,
.self-drawer-down-leave-to {
  transform: translateY(-100%);
}
.self-drawer-right-enter-active,
.self-drawer-right-leave-active {
  transition: transform 0.3s ease;
}
.self-drawer-right-enter-from,
.self-drawer-right-leave-to {
  transform: translateX(-100%);
}
.self-drawer-left-enter-active,
.self-drawer-left-leave-active {
  transition: transform 0.3s ease;
}
.self-drawer-left-enter-from,
.self-drawer-left-leave-to {
  transform: translateX(100%);
}
</style>
