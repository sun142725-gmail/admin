<template>
  <router-view v-slot="{ Component }">
    <component :is="Component" />
  </router-view>
</template>

<script setup>
// has-web 应用根入口，页面级逻辑放到各 view 与 store 中维护。
</script>
