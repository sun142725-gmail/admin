<template>
  <div class="demo-page flex flex-col h-screen bg-gray-50 overflow-hidden">
    <van-nav-bar title="BaseSwiper 轮播" left-arrow fixed placeholder @click-left="$router.back()" />

    <div class="demo-content flex-1 overflow-hidden min-h-0 p-16 pb-safe_bottom">
      <base-scroll>
        <div>
          <!-- 基础轮播 -->
          <section class="mb-24">
            <h3 class="text-sm font-bold text-gray-700 mb-12">基础轮播</h3>
            <div class="bg-white rounded-lg shadow-card overflow-hidden" style="height: 160px">
              <base-swiper :list="bannerList" @change="onChange" @click="onClick" />
            </div>
          </section>

          <!-- 自定义内容 -->
          <section class="mb-24">
            <h3 class="text-sm font-bold text-gray-700 mb-12">自定义内容</h3>
            <div class="bg-white rounded-lg shadow-card overflow-hidden" style="height: 160px">
              <base-swiper :list="colorList" :autoplay="false" :loop="false">
                <template #default="{ item, index }">
                  <div
                    class="w-full h-full flex-center"
                    :style="{ background: item }"
                  >
                    <span class="text-xl text-white font-bold">Slide {{ index + 1 }}</span>
                  </div>
                </template>
              </base-swiper>
            </div>
          </section>

          <section>
            <h3 class="text-sm font-bold text-gray-700 mb-12">代码示例</h3>
            <pre class="code-block text-xs bg-gray-800 text-primary-300 p-16 rounded-lg whitespace-pre-wrap break-words">&lt;base-swiper
  :list=&quot;bannerList&quot;
  :loop=&quot;true&quot;
  :autoplay=&quot;true&quot;
  :interval=&quot;3000&quot;
  @change=&quot;onChange&quot;
  @click=&quot;onClick&quot;
&gt;
  &lt;template #default=&quot;{ item, index }&quot;&gt;
    &lt;img :src=&quot;item.image&quot; class=&quot;w-full h-full&quot; /&gt;
  &lt;/template&gt;
&lt;/base-swiper&gt;</pre>
          </section>
        </div>
      </base-scroll>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { showToast } from 'vant'

const bannerList = ref([
  { id: 1, color: '#0ea5e9' },
  { id: 2, color: '#00b42a' },
  { id: 3, color: '#ff7d00' }
])

const colorList = ref(['#f53f3f', '#0ea5e9', '#00b42a', '#ff7d00'])

function onChange(index) {
  console.log('当前索引：', index)
}

function onClick(index, item) {
  showToast(`点击了第 ${index + 1} 张`)
}
</script>

<style scoped>
.code-block {
  line-height: 1.6;
}
</style>
