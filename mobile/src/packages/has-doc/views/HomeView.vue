<template>
  <div class="home-page flex flex-col h-[100vh] bg-gray-50 overflow-hidden">
    <!-- 顶部标题区 -->
    <div class="header px-16 pt-20 pb-24 bg-gradient-to-br from-primary-500 to-primary-400 flex-shrink-0">
      <div class="flex-between text-white mb-20">
        <div>
          <h1 class="text-xl font-bold">组件库</h1>
          <p class="text-sm opacity-90 mt-8">移动端基础组件示例</p>
        </div>
        <div class="w-[40px] h-[40px] rounded-full bg-white/20 flex-center">
          <van-icon name="bulb-o" size="20" color="#fff" />
        </div>
      </div>

      <div class="search-bar flex items-center bg-white/95 rounded-full px-16 py-10 shadow-card">
        <van-icon name="search" size="16" color="gray-400" />
        <span class="text-sm text-gray-400 ml-8">搜索组件名称</span>
      </div>
    </div>

    <div class="flex-1 overflow-hidden min-h-0 pb-safe_bottom">
      <base-scroll>
        <div>
          <!-- 9 宫格 -->
          <div class="px-12 pt-12">
            <div class="bg-white rounded-lg shadow-card overflow-hidden">
              <div class="grid grid-cols-3">
                <div
                  v-for="(item, index) in COMPONENT_LIST"
                  :key="item.name"
                  class="grid-item flex flex-col items-center justify-center py-20 px-8 min-h-touch active:bg-gray-50 transition-colors"
                  :class="gridItemClass(index)"
                  @click="$router.push(item.route)"
                >
                  <div
                    class="icon-box w-[44px] h-[44px] rounded-lg flex-center mb-12"
                    :style="{ background: `${item.color}15` }"
                  >
                    <van-icon :name="item.icon" size="22" :color="item.color" />
                  </div>
                  <span class="text-base font-medium text-gray-800">{{ item.title }}</span>
                  <span class="text-xs text-gray-400 mt-4">{{ item.desc }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- 使用说明 -->
          <div class="px-12 mt-12 pb-24">
            <div class="app-card">
              <div class="flex items-start">
                <div class="w-[32px] h-[32px] rounded-full bg-warning/10 flex-center mr-12 flex-shrink-0">
                  <van-icon name="info-o" size="16" color="#ff7d00" />
                </div>
                <div>
                  <h3 class="text-base font-bold text-gray-800 mb-8">使用说明</h3>
                  <p class="text-sm text-gray-500 leading-relaxed">
                    组件统一存放在 <code class="text-primary-500">src/components</code>，基于
                    <code class="text-primary-500">unplugin-vue-components</code> 自动注册，页面中直接使用
                    <code class="text-primary-500">&lt;base-button /&gt;</code> 等标签即可，无需手动 import。
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </base-scroll>
    </div>
  </div>
</template>

<script setup>
import { COMPONENT_LIST } from '../constants/components'

const cols = 3
const lastFullRowIndex = Math.floor(COMPONENT_LIST.length / cols) * cols

function gridItemClass(index) {
  const classes = []
  if (index % cols !== cols - 1) {
    classes.push('border-r', 'border-gray-100')
  }
  if (index < lastFullRowIndex) {
    classes.push('border-b', 'border-gray-100')
  }
  return classes
}
</script>

<style scoped>
.grid-item:active {
  background-color: theme('colors.gray.50');
}

.icon-box {
  transition: transform 0.15s ease;
}

.grid-item:active .icon-box {
  transform: scale(0.92);
}

.search-bar {
  backdrop-filter: blur(4px);
}
</style>
