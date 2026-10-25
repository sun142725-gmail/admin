<template>
  <van-tabbar v-model="active" route :border="false" class="family-tabbar">
    <van-tabbar-item v-for="tab in tabs" :key="tab.path" :to="tab.path" :icon="tab.icon">
      {{ tab.label }}
    </van-tabbar-item>
  </van-tabbar>
</template>

<script setup>
import { ref } from 'vue'

const active = ref(0)

const tabs = [
  { path: '/home', icon: 'wap-home-o', label: '首页' },
  { path: '/todos', icon: 'todo-list-o', label: '待办' },
  { path: '/notices', icon: 'bell', label: '公告' },
  { path: '/profile', icon: 'user-o', label: '我的' }
]
</script>

<style scoped>
/* 颜色/高度/字号已由 html:root 的 Vant 变量桥接统一，这里只做浮层投影 */
.family-tabbar {
  box-shadow: 0 -2px 12px rgba(10, 12, 16, 0.04);
}
</style>
