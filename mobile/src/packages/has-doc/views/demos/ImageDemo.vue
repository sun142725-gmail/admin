<template>
  <div class="demo-page flex flex-col h-screen bg-gray-50 overflow-hidden">
    <van-nav-bar title="BaseImage 图片" left-arrow fixed placeholder @click-left="$router.back()" />

    <div class="demo-content flex-1 overflow-hidden min-h-0 p-16 pb-safe_bottom">
      <base-scroll>
        <div>
          <section class="mb-24">
            <h3 class="text-sm font-bold text-gray-700 mb-12">等比图片</h3>
            <base-image
              src="https://img.yzcdn.cn/vant/cat.jpeg"
              width="100%"
              ratio="16/9"
              :radius="12"
            />
          </section>

          <section class="mb-24">
            <h3 class="text-sm font-bold text-gray-700 mb-12">错误图片</h3>
            <base-image src="https://error-image.jpg" width="120" height="120" :radius="12" />
          </section>

          <section>
            <h3 class="text-sm font-bold text-gray-700 mb-12">代码示例</h3>
            <pre class="code-block text-xs bg-gray-800 text-primary-300 p-16 rounded-lg whitespace-pre-wrap break-words">&lt;base-image
  src=&quot;https://xxx.jpg&quot;
  width=&quot;100%&quot;
  ratio=&quot;16/9&quot;
  :radius=&quot;12&quot;
/&gt;

&lt;base-image src=&quot;error.jpg&quot; width=&quot;120&quot; height=&quot;120&quot; /&gt;</pre>
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
