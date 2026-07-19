<template>
  <div class="demo-page flex flex-col h-screen bg-gray-50 overflow-hidden">
    <van-nav-bar title="BaseButton 按钮" left-arrow fixed placeholder @click-left="$router.back()" />

    <div class="demo-content flex-1 overflow-hidden min-h-0 p-16 pb-safe_bottom">
      <base-scroll>
        <div>
          <section class="mb-24">
            <h3 class="text-sm font-bold text-gray-700 mb-12">类型与样式</h3>
            <div class="space-y-12">
              <base-button type="primary" block>主要按钮</base-button>
              <base-button type="success" block>成功按钮</base-button>
              <base-button type="danger" block>危险按钮</base-button>
              <base-button type="warning" block>警告按钮</base-button>
              <base-button type="primary" plain block>朴素按钮</base-button>
            </div>
          </section>

          <section class="mb-24">
            <h3 class="text-sm font-bold text-gray-700 mb-12">加载状态</h3>
            <base-button type="primary" block :loading="loading" @click="toggleLoading">
              {{ loading ? '加载中' : '点击加载' }}
            </base-button>
          </section>

          <section class="mb-24">
            <h3 class="text-sm font-bold text-gray-700 mb-12">禁用状态</h3>
            <base-button type="primary" block disabled>禁用按钮</base-button>
          </section>

          <section class="mb-24">
            <h3 class="text-sm font-bold text-gray-700 mb-12">防抖（500ms）</h3>
            <base-button type="primary" block :debounce="500" @click="onDebounceClick">
              快速点击我只触发一次
            </base-button>
            <p class="text-xs text-gray-500 mt-8">点击次数：{{ clickCount }}</p>
          </section>

          <section>
            <h3 class="text-sm font-bold text-gray-700 mb-12">代码示例</h3>
            <pre class="code-block text-xs bg-gray-800 text-primary-300 p-16 rounded-lg whitespace-pre-wrap break-words">&lt;base-button type=&quot;primary&quot; block @click=&quot;submit&quot;&gt;
  提交
&lt;/base-button&gt;

&lt;base-button :loading=&quot;loading&quot; block @click=&quot;toggleLoading&quot;&gt;
  加载中
&lt;/base-button&gt;

&lt;base-button :debounce=&quot;500&quot; @click=&quot;handleClick&quot;&gt;
  防抖按钮
&lt;/base-button&gt;</pre>
          </section>
        </div>
      </base-scroll>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { showToast } from 'vant'

const loading = ref(false)
const clickCount = ref(0)

function toggleLoading() {
  loading.value = true
  setTimeout(() => {
    loading.value = false
  }, 1500)
}

function onDebounceClick() {
  clickCount.value++
  showToast(`第 ${clickCount.value} 次触发`)
}
</script>

<style scoped>
.code-block {
  line-height: 1.6;
}
</style>
