<template>
  <div class="demo-page flex flex-col h-screen bg-gray-50 overflow-hidden">
    <van-nav-bar title="SelfDrawer 抽屉" left-arrow fixed placeholder @click-left="$router.back()" />

    <div class="flex-1 overflow-hidden min-h-0">
      <base-scroll>
        <div class="p-16">
          <!-- 标题 -->
          <h3 class="text-sm font-bold text-gray-700 mb-16">抽屉四方向演示</h3>

          <!-- 四个方向入口 -->
          <div class="flex flex-col gap-12">
            <base-button type="primary" block @click="bottomVisible = true">打开底部抽屉（完整表单 + 下拉关闭）</base-button>
            <base-button type="default" block @click="topVisible = true">打开顶部抽屉（筛选）</base-button>
            <base-button type="default" block @click="leftVisible = true">打开左侧抽屉（长列表）</base-button>
            <base-button type="default" block @click="rightVisible = true">打开右侧抽屉（详情 + footer）</base-button>
          </div>

          <!-- 使用说明 -->
          <div class="app-card mt-20">
            <h4 class="text-base font-bold text-gray-800 mb-8">交互测试要点</h4>
            <ul class="text-sm text-gray-500 leading-relaxed list-disc pl-16">
              <li>底部抽屉：顶部把手下拉超过 80px 松手自动关闭</li>
              <li>遮罩点击关闭、右上角 × 按钮、页面按钮三种关闭入口</li>
              <li>底部抽屉内嵌次级滚动列表，验证 nested-scroll 联动不卡死</li>
              <li>左侧抽屉超长列表测试 BaseScroll 高度自动刷新</li>
            </ul>
          </div>
        </div>
      </base-scroll>
    </div>

    <!-- ============ 1. 底部抽屉：完整表单 ============ -->
    <self-drawer
      v-model="bottomVisible"
      direction="bottom"
      title="底部抽屉 - 完整表单"
      max-height="85vh"
    >
      <self-form
        ref="bottomFormRef"
        :model="bottomForm"
        :rules="bottomRules"
        label-position="top"
      >
        <self-form-item prop="name" label="姓名">
          <input v-model="bottomForm.name" placeholder="请输入姓名" class="demo-input" />
        </self-form-item>
        <self-form-item prop="phone" label="手机号">
          <input v-model="bottomForm.phone" type="tel" maxlength="11" placeholder="请输入手机号" class="demo-input" />
        </self-form-item>
        <self-form-item prop="email" label="邮箱">
          <input v-model="bottomForm.email" placeholder="请输入邮箱（选填）" class="demo-input" />
        </self-form-item>
        <self-form-item prop="avatar" label="头像">
          <self-upload
            v-model="bottomForm.avatar"
            :upload-fn="mockUpload"
            @change="bottomFormRef?.validateField('avatar', 'change')"
          />
        </self-form-item>

        <!-- 嵌套次级滚动：验证 nested-scroll 联动 -->
        <self-form-item label="兴趣标签（嵌套滚动）">
          <div class="h-[120px] rounded-md border border-gray-200 overflow-hidden">
            <base-scroll :nested-scroll="true">
              <div class="p-12">
                <div
                  v-for="i in 30"
                  :key="i"
                  class="nested-item"
                >标签 {{ i }}</div>
              </div>
            </base-scroll>
          </div>
        </self-form-item>
      </self-form>

      <template #footer>
        <div class="flex gap-12 p-16 pb-safe-bottom">
          <base-button type="default" class="flex-1" @click="bottomVisible = false">取消</base-button>
          <base-button type="primary" class="flex-1" @click="onBottomSubmit">提交</base-button>
        </div>
      </template>
    </self-drawer>

    <!-- ============ 2. 顶部抽屉：简易筛选 ============ -->
    <self-drawer
      v-model="topVisible"
      direction="top"
      title="顶部抽屉 - 筛选"
      max-height="80vh"
    >
      <self-form :model="topForm" label-position="top">
        <self-form-item label="排序方式">
          <div class="flex gap-12">
            <base-button
              v-for="opt in sortOptions"
              :key="opt.value"
              :type="topForm.sort === opt.value ? 'primary' : 'default'"
              size="small"
              class="flex-1"
              @click="topForm.sort = opt.value"
            >{{ opt.label }}</base-button>
          </div>
        </self-form-item>
        <self-form-item label="关键词">
          <input v-model="topForm.keyword" placeholder="请输入关键词" class="demo-input" />
        </self-form-item>
        <self-form-item label="仅看有货">
          <div
            class="filter-row flex items-center justify-between min-h-touch"
            @click="topForm.inStock = !topForm.inStock"
          >
            <span class="text-sm text-gray-700">有货商品</span>
            <span class="filter-switch" :class="{ 'is-on': topForm.inStock }">
              <span class="filter-switch__node" />
            </span>
          </div>
        </self-form-item>
      </self-form>
    </self-drawer>

    <!-- ============ 3. 左侧抽屉：超长列表 ============ -->
    <self-drawer
      v-model="leftVisible"
      direction="left"
      title="左侧抽屉 - 分类"
      max-width="80vw"
    >
      <div
        v-for="i in 50"
        :key="i"
        class="left-item"
        @click="onLeftPick(i)"
      >分类 {{ i }}</div>
    </self-drawer>

    <!-- ============ 4. 右侧抽屉：详情只读 + footer ============ -->
    <self-drawer
      v-model="rightVisible"
      direction="right"
      title="右侧抽屉 - 详情"
      max-width="80vw"
    >
      <self-form :model="rightForm" disabled label-position="top">
        <self-form-item label="商品名称">
          <input v-model="rightForm.name" class="demo-input" disabled />
        </self-form-item>
        <self-form-item label="状态">
          <input v-model="rightForm.status" class="demo-input" disabled />
        </self-form-item>
        <self-form-item label="价格">
          <input v-model="rightForm.price" class="demo-input" disabled />
        </self-form-item>
        <self-form-item label="描述">
          <textarea v-model="rightForm.desc" rows="3" class="demo-input" disabled></textarea>
        </self-form-item>
      </self-form>

      <template #footer>
        <div class="flex gap-12 p-16 pb-safe-bottom">
          <base-button type="default" class="flex-1" @click="rightVisible = false">取消</base-button>
          <base-button type="primary" class="flex-1" @click="onRightSave">保存</base-button>
        </div>
      </template>
    </self-drawer>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { showToast } from 'vant'
import { formRules } from '../../../../components/SelfForm.vue'

interface BottomForm {
  name: string
  phone: string
  email: string
  avatar: string
}
interface TopForm {
  sort: string
  keyword: string
  inStock: boolean
}
interface RightForm {
  name: string
  status: string
  price: string
  desc: string
}

// 四个抽屉显隐
const bottomVisible = ref(false)
const topVisible = ref(false)
const leftVisible = ref(false)
const rightVisible = ref(false)

// 底部抽屉表单
const bottomFormRef = ref<{ validate: () => Promise<{ valid: boolean }> } | null>(null)
const bottomForm = ref<BottomForm>({ name: '', phone: '', email: '', avatar: '' })
const bottomRules = {
  name: [formRules.required('请输入姓名')],
  phone: [formRules.required('请输入手机号'), formRules.mobile()],
  email: [formRules.email()],
  avatar: [{ required: true, message: '请上传头像', trigger: 'change' }]
}

// 顶部抽屉筛选
const topForm = ref<TopForm>({ sort: 'asc', keyword: '', inStock: false })
const sortOptions: { label: string; value: string }[] = [
  { label: '升序', value: 'asc' },
  { label: '降序', value: 'desc' }
]

// 右侧抽屉详情（只读）
const rightForm = ref<RightForm>({
  name: '示例商品',
  status: '在售',
  price: '￥99.00',
  desc: '这是一段不可编辑的商品描述，用于演示只读表单场景。'
})

/** 模拟上传：800ms 延迟，10% 失败用于演示重试 */
function mockUpload(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (Math.random() < 0.1) return reject(new Error('upload fail'))
      resolve(URL.createObjectURL(file))
    }, 800)
  })
}

function onBottomSubmit(): void {
  bottomFormRef.value?.validate().then((res: { valid: boolean }) => {
    if (res.valid) {
      showToast('提交成功')
      bottomVisible.value = false
    }
  })
}

function onLeftPick(i: number): void {
  showToast(`选择了 分类 ${i}`)
  leftVisible.value = false
}

function onRightSave(): void {
  showToast('已保存')
  rightVisible.value = false
}
</script>

<style scoped>
.demo-input {
  width: 100%;
  min-height: theme('minHeight.touch');
  padding: 0 theme('spacing.12');
  font-size: theme('fontSize.base');
  color: theme('colors.gray.800');
  background: transparent;
  border: 1px solid theme('colors.gray.200');
  border-radius: theme('borderRadius.md');
  outline: none;
  -webkit-tap-highlight-color: transparent;
  transition: border-color 0.2s ease;
  box-sizing: border-box;
}
.demo-input:focus {
  border-color: theme('colors.primary.500');
}
.demo-input:disabled {
  background: theme('colors.gray.50');
  color: theme('colors.gray.400');
}
textarea.demo-input {
  padding: theme('spacing.12');
  resize: none;
}
.nested-item {
  height: 44px;
  line-height: 44px;
  padding: 0 theme('spacing.12');
  font-size: theme('fontSize.base');
  color: theme('colors.gray.700');
  border-bottom: 1px solid theme('colors.gray.100');
}
.left-item {
  height: 44px;
  line-height: 44px;
  padding: 0 theme('spacing.16');
  font-size: theme('fontSize.base');
  color: theme('colors.gray.700');
  border-bottom: 1px solid theme('colors.gray.100');
}
.left-item:active {
  background: theme('colors.gray.50');
}
/* 顶部抽屉筛选开关 */
.filter-row {
  padding: 0 theme('spacing.12');
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}
.filter-switch {
  position: relative;
  width: 44px;
  height: 24px;
  background: theme('colors.gray.200');
  border-radius: theme('borderRadius.full');
  transition: background-color 0.25s ease;
  flex-shrink: 0;
}
.filter-switch.is-on {
  background: theme('colors.primary.500');
}
.filter-switch__node {
  position: absolute;
  top: 2px;
  left: 2px;
  width: 20px;
  height: 20px;
  background: theme('colors.white');
  border-radius: theme('borderRadius.full');
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
  transition: transform 0.25s ease;
}
.filter-switch.is-on .filter-switch__node {
  transform: translateX(20px);
}
</style>
