<template>
  <div class="demo-page flex flex-col h-screen bg-gray-50 overflow-hidden">
    <van-nav-bar title="BaseTag 标签" left-arrow fixed placeholder @click-left="$router.back()" />

    <div class="demo-content flex-1 overflow-hidden min-h-0 p-16 pb-safe_bottom">
      <base-scroll>
        <div>
          <section class="mb-24">
            <h3 class="text-sm font-bold text-gray-700 mb-12">实心标签</h3>
            <div class="flex flex-wrap gap-8">
              <base-tag type="primary">主推</base-tag>
              <base-tag type="success">成功</base-tag>
              <base-tag type="danger">失败</base-tag>
              <base-tag type="warning">警告</base-tag>
              <base-tag type="default">默认</base-tag>
            </div>
          </section>

          <section class="mb-24">
            <h3 class="text-sm font-bold text-gray-700 mb-12">空心标签</h3>
            <div class="flex flex-wrap gap-8">
              <base-tag type="primary" plain>主推</base-tag>
              <base-tag type="success" plain>成功</base-tag>
              <base-tag type="danger" plain>失败</base-tag>
            </div>
          </section>

          <section class="mb-24">
            <h3 class="text-sm font-bold text-gray-700 mb-12">自定义颜色</h3>
            <div class="flex flex-wrap gap-8">
              <base-tag color="#7232dd" text-color="#7232dd">紫色</base-tag>
              <base-tag color="#ff6900" text-color="#ff6900" plain>橙色</base-tag>
            </div>
          </section>

          <section>
            <h3 class="text-sm font-bold text-gray-700 mb-12">代码示例</h3>
            <pre class="code-block text-xs bg-gray-800 text-primary-300 p-16 rounded-lg whitespace-pre-wrap break-words">&lt;base-tag type=&quot;primary&quot;&gt;标签&lt;/base-tag&gt;

&lt;base-tag type=&quot;success&quot; plain&gt;成功&lt;/base-tag&gt;

&lt;base-tag color=&quot;#7232dd&quot; text-color=&quot;#7232dd&quot;&gt;自定义&lt;/base-tag&gt;</pre>
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
