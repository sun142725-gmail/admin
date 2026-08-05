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
.family-tabbar {
  --van-tabbar-height: 56px;
  --van-tabbar-background: #ffffff;
  --van-tabbar-item-active-color: #0ea5e9;
  --van-tabbar-item-text-color: #94a3b8;
  --van-tabbar-item-icon-size: 22px;
  --van-tabbar-item-font-size: 11px;
  box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.06);
}
</style>
