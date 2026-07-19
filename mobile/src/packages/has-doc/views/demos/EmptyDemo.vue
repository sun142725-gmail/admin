<template>
  <div class="demo-page flex flex-col h-screen bg-gray-50 overflow-hidden">
    <van-nav-bar title="BaseEmpty 空状态" left-arrow fixed placeholder @click-left="$router.back()" />

    <div class="demo-content flex-1 overflow-hidden min-h-0 p-16 pb-safe_bottom">
      <base-scroll>
        <div>
          <section class="mb-24">
            <h3 class="text-sm font-bold text-gray-700 mb-12">默认图标</h3>
            <div class="bg-white rounded-lg shadow-card overflow-hidden">
              <base-empty description="暂无数据" />
            </div>
          </section>

          <section class="mb-24">
            <h3 class="text-sm font-bold text-gray-700 mb-12">自定义图标</h3>
            <div class="bg-white rounded-lg shadow-card overflow-hidden">
              <base-empty icon="search" icon-color="#86909c" description="搜索无结果" />
            </div>
          </section>

          <section class="mb-24">
            <h3 class="text-sm font-bold text-gray-700 mb-12">带操作按钮</h3>
            <div class="bg-white rounded-lg shadow-card overflow-hidden">
              <base-empty
                icon="warning-o"
                description="页面出错了"
                :show-button="true"
                button-text="重新加载"
                @click="showToast('重新加载')"
              />
            </div>
          </section>

          <section>
            <h3 class="text-sm font-bold text-gray-700 mb-12">代码示例</h3>
            <pre class="code-block text-xs bg-gray-800 text-primary-300 p-16 rounded-lg whitespace-pre-wrap break-words">&lt;base-empty
  icon=&quot;warning-o&quot;
  description=&quot;暂无订单&quot;
  :show-button=&quot;true&quot;
  button-text=&quot;去逛逛&quot;
  @click=&quot;goHome&quot;
/&gt;</pre>
          </section>
        </div>
      </base-scroll>
    </div>
  </div>
</template>

<script setup>
import { showToast } from 'vant'
</script>

<style scoped>
.code-block {
  line-height: 1.6;
}
</style>
