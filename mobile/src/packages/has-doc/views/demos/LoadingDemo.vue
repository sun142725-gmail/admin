<template>
  <div class="demo-page flex flex-col h-screen bg-gray-50 overflow-hidden">
    <van-nav-bar title="BaseLoading 加载" left-arrow fixed placeholder @click-left="$router.back()" />

    <div class="demo-content flex-1 overflow-hidden min-h-0 p-16 pb-safe_bottom">
      <base-scroll>
        <div>
          <section class="mb-24">
            <h3 class="text-sm font-bold text-gray-700 mb-12">局部加载</h3>
            <div class="bg-white rounded-lg shadow-card p-24">
              <base-loading :visible="true" text="正在加载..." />
            </div>
          </section>

          <section class="mb-24">
            <h3 class="text-sm font-bold text-gray-700 mb-12">全屏加载</h3>
            <base-button type="primary" block @click="showFullLoading">显示全屏加载 2 秒</base-button>
            <base-loading :visible="fullLoading" fixed text="请稍候" />
          </section>

          <section>
            <h3 class="text-sm font-bold text-gray-700 mb-12">代码示例</h3>
            <pre class="code-block text-xs bg-gray-800 text-primary-300 p-16 rounded-lg whitespace-pre-wrap break-words">&lt;!-- 局部 --&gt;
&lt;base-loading :visible=&quot;loading&quot; text=&quot;正在加载...&quot; /&gt;

&lt;!-- 全屏 --&gt;
&lt;base-loading :visible=&quot;visible&quot; fixed text=&quot;请稍候&quot; /&gt;</pre>
          </section>
        </div>
      </base-scroll>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const fullLoading = ref(false)

function showFullLoading() {
  fullLoading.value = true
  setTimeout(() => {
    fullLoading.value = false
  }, 2000)
}
</script>

<style scoped>
.code-block {
  line-height: 1.6;
}
</style>
