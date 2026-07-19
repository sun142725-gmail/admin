<template>
  <div class="demo-page flex flex-col h-screen bg-gray-50 overflow-hidden">
    <van-nav-bar title="BaseScroll 滚动" left-arrow fixed placeholder @click-left="$router.back()" />

    <div class="demo-content flex-1 overflow-hidden min-h-0 p-16 pb-safe_bottom">
      <base-scroll :nested-scroll="true">
        <div>
          <!-- 示例 1：下拉刷新 + 上拉加载 -->
          <section class="mb-24">
            <h3 class="text-sm font-bold text-gray-700 mb-12">1. 下拉刷新 / 上拉加载</h3>
            <div class="bg-white rounded-lg shadow-card overflow-hidden" style="height: 300px">
              <base-scroll
                ref="scrollRef"
                :nested-scroll="true"
                :pull-down-refresh="true"
                :pull-up-load="true"
                :scrollbar="true"
                @pulling-down="onPullDown"
                @pulling-up="onPullUp"
              >
                <van-cell v-for="item in list" :key="item.id" :title="item.title" :label="item.desc" />
              </base-scroll>
            </div>
          </section>

          <!-- 示例 2：横向滚动 -->
          <section class="mb-24">
            <h3 class="text-sm font-bold text-gray-700 mb-12">2. 横向滚动</h3>
            <div class="bg-white rounded-lg shadow-card overflow-hidden" style="height: 112px">
              <base-scroll direction="horizontal" :scrollbar="true">
                <div class="inline-flex gap-12 p-16 items-center">
                  <div
                    v-for="i in hList"
                    :key="i"
                    class="h-[80px] w-[80px] rounded-lg bg-primary-100 flex-center flex-col"
                  >
                    <span class="text-md text-primary-500 font-bold">{{ i }}</span>
                    <span class="text-xs text-gray-500 mt-4">项</span>
                  </div>
                </div>
              </base-scroll>
            </div>
          </section>

          <!-- 示例 3：纵向 + 多个横向滚动（嵌套滚动） -->
          <section class="mb-24">
            <h3 class="text-sm font-bold text-gray-700 mb-12">3. 纵向 + 多个横向滚动</h3>
            <div class="bg-white rounded-lg shadow-card overflow-hidden" style="height: 320px">
              <base-scroll :nested-scroll="true" :scrollbar="true">
                <div class="p-16">
                  <div
                    v-for="group in groups"
                    :key="group.id"
                    class="mb-20 last:mb-0"
                  >
                    <div class="flex-between mb-8">
                      <h4 class="text-sm font-bold text-gray-700">{{ group.title }}</h4>
                      <span class="text-xs text-gray-400">共 {{ group.items.length }} 个</span>
                    </div>
                    <div class="rounded-lg bg-gray-50 overflow-hidden" style="height: 100px">
                      <base-scroll direction="horizontal" :nested-scroll="true">
                        <div class="inline-flex gap-12 px-16 items-center h-full">
                          <div
                            v-for="(item, idx) in group.items"
                            :key="idx"
                            class="h-[80px] w-[100px] rounded-lg flex-center flex-col"
                            :style="{ background: group.color }"
                          >
                            <span class="text-md text-white font-bold">{{ item }}</span>
                            <span class="text-xs text-white opacity-80 mt-4">{{ group.title }}</span>
                          </div>
                        </div>
                      </base-scroll>
                    </div>
                  </div>
                </div>
              </base-scroll>
            </div>
          </section>

          <section>
            <h3 class="text-sm font-bold text-gray-700 mb-12">代码示例</h3>
            <pre class="code-block text-xs bg-gray-800 text-primary-300 p-16 rounded-lg whitespace-pre-wrap break-words">&lt;!-- 1. 下拉刷新 / 上拉加载 --&gt;
&lt;base-scroll
  :pull-down-refresh=&quot;true&quot;
  :pull-up-load=&quot;true&quot;
  @pulling-down=&quot;onRefresh&quot;
  @pulling-up=&quot;onLoadMore&quot;
&gt;
  &lt;van-cell v-for=&quot;item in list&quot; :key=&quot;item.id&quot; :title=&quot;item.title&quot; /&gt;
&lt;/base-scroll&gt;

&lt;!-- 2. 横向滚动 --&gt;
&lt;base-scroll direction=&quot;horizontal&quot;&gt;
  &lt;div class=&quot;inline-flex gap-12 p-16&quot;&gt;...&lt;/div&gt;
&lt;/base-scroll&gt;

&lt;!-- 3. 纵向 + 多个横向滚动（嵌套） --&gt;
&lt;base-scroll :nested-scroll=&quot;true&quot;&gt;
  &lt;div v-for=&quot;group in groups&quot;&gt;
    &lt;base-scroll direction=&quot;horizontal&quot; :nested-scroll=&quot;true&quot;&gt;
      &lt;div class=&quot;inline-flex&quot;&gt;...&lt;/div&gt;
    &lt;/base-scroll&gt;
  &lt;/div&gt;
&lt;/base-scroll&gt;</pre>
          </section>
        </div>
      </base-scroll>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { showToast } from 'vant'

const scrollRef = ref(null)
const list = ref(generateData(1))

function generateData(page, size = 8) {
  return Array.from({ length: size }, (_, i) => ({
    id: `${page}-${i}`,
    title: `列表项 ${(page - 1) * size + i + 1}`,
    desc: 'BetterScroll 滚动示例'
  }))
}

function onPullDown() {
  setTimeout(() => {
    list.value = generateData(1)
    scrollRef.value?.finishPullDown()
    scrollRef.value?.enablePullUp()
    showToast('刷新成功')
  }, 1000)
}

let page = 1
function onPullUp() {
  setTimeout(() => {
    if (page >= 3) {
      scrollRef.value?.finishPullUp(false)
    } else {
      page++
      list.value.push(...generateData(page))
      scrollRef.value?.finishPullUp(true)
    }
  }, 1000)
}

// 示例 2：横向滚动数据
const hList = ref(Array.from({ length: 15 }, (_, i) => i + 1))

// 示例 3：纵向 + 多个横向滚动数据
const groups = ref([
  { id: 1, title: '热门推荐', color: '#0ea5e9', items: Array.from({ length: 8 }, (_, i) => i + 1) },
  { id: 2, title: '限时秒杀', color: '#ff7d00', items: Array.from({ length: 10 }, (_, i) => i + 1) },
  { id: 3, title: '为你精选', color: '#00b42a', items: Array.from({ length: 12 }, (_, i) => i + 1) },
  { id: 4, title: '猜你喜欢', color: '#7dd3fc', items: Array.from({ length: 9 }, (_, i) => i + 1) }
])
</script>

<style scoped>
.code-block {
  line-height: 1.6;
}
</style>
