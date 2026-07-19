<template>
  <div class="demo-page flex flex-col h-screen bg-gray-50 overflow-hidden">
    <van-nav-bar title="BaseCard 卡片" left-arrow fixed placeholder @click-left="$router.back()" />

    <div class="demo-content flex-1 overflow-hidden min-h-0 p-16 pb-safe_bottom">
      <base-scroll>
        <div>
          <section class="mb-24">
            <h3 class="text-sm font-bold text-gray-700 mb-12">基础卡片</h3>
            <base-card title="今日推荐">
              <p class="text-sm text-gray-600">这是一个基础卡片容器，带标题和阴影。</p>
            </base-card>
          </section>

          <section class="mb-24">
            <h3 class="text-sm font-bold text-gray-700 mb-12">带右侧操作</h3>
            <base-card title="我的订单">
              <template #header>
                <span class="text-xs text-gray-400">查看全部 &gt;</span>
              </template>
              <div class="flex justify-around text-center">
                <div>
                  <p class="text-lg font-bold text-gray-800">12</p>
                  <p class="text-xs text-gray-500">待付款</p>
                </div>
                <div>
                  <p class="text-lg font-bold text-gray-800">3</p>
                  <p class="text-xs text-gray-500">待发货</p>
                </div>
                <div>
                  <p class="text-lg font-bold text-gray-800">8</p>
                  <p class="text-xs text-gray-500">待收货</p>
                </div>
              </div>
            </base-card>
          </section>

          <section>
            <h3 class="text-sm font-bold text-gray-700 mb-12">代码示例</h3>
            <pre class="code-block text-xs bg-gray-800 text-primary-300 p-16 rounded-lg whitespace-pre-wrap break-words">&lt;base-card title=&quot;今日推荐&quot;&gt;
  &lt;p&gt;卡片内容&lt;/p&gt;
&lt;/base-card&gt;

&lt;base-card title=&quot;我的订单&quot;&gt;
  &lt;template #header&gt;
    &lt;span&gt;查看全部&lt;/span&gt;
  &lt;/template&gt;
  &lt;!-- 内容 --&gt;
&lt;/base-card&gt;</pre>
          </section>
        </div>
      </base-scroll>
    </div>
  </div>
</template>

<style scoped>
.code-block {
  line-height: 1.6;
}
</style>
