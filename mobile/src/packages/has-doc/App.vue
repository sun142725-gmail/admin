<template>
  <router-view v-slot="{ Component }">
    <keep-alive :max="5">
      <component :is="Component" />
    </keep-alive>
  </router-view>
</template>

<script setup>
// 全局入口，可在此处理应用级逻辑
</script>

<style scoped></style>
