<template>
  <div class="demo-page flex flex-col h-screen bg-gray-50 overflow-hidden">
    <van-nav-bar title="BaseTabs 标签页" left-arrow fixed placeholder @click-left="$router.back()" />

    <div class="demo-content flex-1 overflow-hidden min-h-0 p-16 pb-safe_bottom">
      <base-scroll>
        <div>
          <!-- 说明 -->
          <section class="mb-16">
            <p class="text-xs text-gray-500 leading-relaxed">
              本示例演示左右滑动切换 Tab，同时每个 Tab 内部可上下滚动，两者手势互不冲突。Tab 不会自动切换，只能通过点击 Tab 标题或左右滑动手势切换。
            </p>
          </section>

          <!-- 滑动 Tab 示例 -->
          <section class="mb-24">
            <h3 class="text-sm font-bold text-gray-700 mb-12">左右滑动 + 上下滚动</h3>
            <div class="bg-white rounded-lg shadow-card overflow-hidden" style="height: 420px">
              <base-tabs v-model="activeIndex" :tabs="tabs" @change="onChange">
                <template #default="{ tab }">
                  <base-scroll nested-scroll>
                    <div class="p-16">
                      <base-card :title="tab.title" :shadow="true">
                        <p class="text-sm text-gray-600">{{ tab.content }}</p>
                      </base-card>
                      <div class="mt-16 space-y-12">
                        <div
                          v-for="i in 20"
                          :key="i"
                          class="py-12 border-b border-gray-100"
                        >
                          <p class="text-sm text-gray-700">{{ tab.title }} 列表项 {{ i }}</p>
                          <p class="text-xs text-gray-400 mt-4">上下滚动查看更多，左右滑动切换 Tab</p>
                        </div>
                      </div>
                    </div>
                  </base-scroll>
                </template>
              </base-tabs>
            </div>
          </section>

          <section>
            <h3 class="text-sm font-bold text-gray-700 mb-12">代码示例</h3>
            <pre v-pre class="code-block text-xs bg-gray-800 text-primary-300 p-16 rounded-lg whitespace-pre-wrap break-words">&lt;base-tabs v-model=&quot;activeIndex&quot; :tabs=&quot;tabs&quot; @change=&quot;onChange&quot;&gt;
  &lt;template #default=&quot;{ tab }&quot;&gt;
    &lt;!-- 内部滚动需开启 nested-scroll --&gt;
    &lt;base-scroll nested-scroll&gt;
      &lt;div class=&quot;p-16&quot;&gt;
        &lt;p&gt;{{ tab.content }}&lt;/p&gt;
        &lt;div v-for=&quot;i in 20&quot; :key=&quot;i&quot;&gt;...&lt;/div&gt;
      &lt;/div&gt;
    &lt;/base-scroll&gt;
  &lt;/template&gt;
&lt;/base-tabs&gt;</pre>
          </section>
        </div>
      </base-scroll>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { showToast } from 'vant'

const activeIndex = ref(0)

const tabs = ref([
  { title: '推荐', content: '推荐 Tab：左右滑动可切换到下一个 Tab，上下滚动可浏览列表。' },
  { title: '关注', content: '关注 Tab：同样支持左右滑动切换和上下滚动浏览。' },
  { title: '热榜', content: '热榜 Tab：手势互不冲突，使用 BetterScroll nested-scroll 实现。' }
])

function onChange(index, tab) {
  showToast(`切换到 ${tab.title}`)
}
</script>

<style scoped>
.code-block {
  line-height: 1.6;
}
</style>
