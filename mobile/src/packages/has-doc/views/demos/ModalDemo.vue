<template>
  <div class="demo-page flex flex-col h-screen bg-gray-50 overflow-hidden">
    <van-nav-bar title="BaseModal 弹窗" left-arrow fixed placeholder @click-left="$router.back()" />

    <div class="demo-content flex-1 overflow-hidden min-h-0 p-16 pb-safe_bottom">
      <base-scroll>
        <div>
          <section class="mb-24">
            <h3 class="text-sm font-bold text-gray-700 mb-12">基础弹窗</h3>
            <base-button type="primary" block @click="visible1 = true">打开弹窗</base-button>
            <base-modal v-model="visible1" title="提示" @confirm="showToast('点击确认')">
              <p class="text-sm text-gray-600 py-8">这是一个基础弹窗示例。</p>
            </base-modal>
          </section>

          <section class="mb-24">
            <h3 class="text-sm font-bold text-gray-700 mb-12">确认 loading</h3>
            <base-button type="success" block @click="visible2 = true">打开 loading 弹窗</base-button>
            <base-modal
              v-model="visible2"
              title="提交确认"
              :confirm-loading="confirmLoading"
              @confirm="onConfirm"
            >
              <p class="text-sm text-gray-600 py-8">点击确认后模拟异步提交。</p>
            </base-modal>
          </section>

          <section class="mb-24">
            <h3 class="text-sm font-bold text-gray-700 mb-12">无取消按钮</h3>
            <base-button type="warning" block @click="visible3 = true">打开单按钮弹窗</base-button>
            <base-modal v-model="visible3" title="提示" :show-cancel="false" @confirm="visible3 = false">
              <p class="text-sm text-gray-600 py-8">只有一个确认按钮。</p>
            </base-modal>
          </section>

          <section>
            <h3 class="text-sm font-bold text-gray-700 mb-12">代码示例</h3>
            <pre class="code-block text-xs bg-gray-800 text-primary-300 p-16 rounded-lg whitespace-pre-wrap break-words">&lt;base-modal v-model=&quot;visible&quot; title=&quot;提示&quot; @confirm=&quot;onConfirm&quot;&gt;
  &lt;p&gt;弹窗内容&lt;/p&gt;
&lt;/base-modal&gt;

&lt;base-modal
  v-model=&quot;visible&quot;
  title=&quot;提交确认&quot;
  :confirm-loading=&quot;loading&quot;
  @confirm=&quot;onSubmit&quot;
&gt;
  &lt;p&gt;确认提交吗？&lt;/p&gt;
&lt;/base-modal&gt;</pre>
          </section>
        </div>
      </base-scroll>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { showToast } from 'vant'

const visible1 = ref(false)
const visible2 = ref(false)
const visible3 = ref(false)
const confirmLoading = ref(false)

function onConfirm() {
  confirmLoading.value = true
  setTimeout(() => {
    confirmLoading.value = false
    visible2.value = false
    showToast('提交成功')
  }, 1500)
}
</script>

<style scoped>
.code-block {
  line-height: 1.6;
}
</style>
