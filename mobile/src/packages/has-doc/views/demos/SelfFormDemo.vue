<template>
  <div class="demo-page flex flex-col h-screen bg-gray-50 overflow-hidden">
    <van-nav-bar title="SelfForm 表单" left-arrow fixed placeholder @click-left="$router.back()" />

    <div class="flex-1 overflow-hidden min-h-0">
      <!-- 外层弹性滚动，作为 scroller 传入 SelfForm 用于错误项定位 -->
      <base-scroll ref="pageScroll">
        <self-form
          ref="formRef"
          :model="form"
          :rules="rules"
          :disabled="disabled"
          label-position="left"
          :label-width="80"
          :scroller="pageScroll"
          @submit="onSubmit"
        >
          <div class="p-16">
            <!-- 分组 1：基本信息 -->
            <h3 class="text-sm font-bold text-gray-700 mb-12">基本信息</h3>
            <div class="bg-white rounded-lg shadow-card p-16 mb-20">
              <self-form-item prop="name" label="姓名">
                <input v-model="form.name" placeholder="请输入姓名" class="self-input" />
              </self-form-item>
              <self-form-item prop="phone" label="手机号">
                <input v-model="form.phone" type="tel" maxlength="11" placeholder="请输入手机号" class="self-input" />
              </self-form-item>
              <self-form-item prop="email" label="邮箱">
                <input v-model="form.email" placeholder="请输入邮箱（选填）" class="self-input" />
              </self-form-item>
            </div>

            <!-- 分组 2：资质上传 -->
            <h3 class="text-sm font-bold text-gray-700 mb-12">资质上传</h3>
            <div class="bg-white rounded-lg shadow-card p-16 mb-20">
              <self-form-item prop="avatar" label="头像">
                <self-upload
                  v-model="form.avatar"
                  :upload-fn="mockUpload"
                  @change="formRef?.validateField('avatar', 'change')"
                />
              </self-form-item>
              <self-form-item prop="idCards" label="证件照">
                <self-upload
                  v-model="form.idCards"
                  multiple
                  :max="3"
                  :upload-fn="mockUpload"
                />
              </self-form-item>
            </div>

            <!-- 分组 3：其他 -->
            <h3 class="text-sm font-bold text-gray-700 mb-12">其他信息</h3>
            <div class="bg-white rounded-lg shadow-card p-16 mb-20">
              <self-form-item prop="remark" label="备注">
                <textarea
                  v-model="form.remark"
                  rows="3"
                  placeholder="请输入备注（选填）"
                  class="self-input"
                />
              </self-form-item>
            </div>
          </div>
        </self-form>
      </base-scroll>
    </div>

    <!-- 底部操作栏：移出 self-form，固定底部，不受表单 disabled 的 pointer-events 影响 -->
    <div class="flex gap-12 p-16 pb-[calc(16px + env(safe-area-inset-bottom))] bg-white border-t border-gray-100 flex-shrink-0">
      <base-button type="button" class="btn-default flex-1" @click="disabled = !disabled">
        {{ disabled ? '启用编辑' : '禁用表单' }}
      </base-button>
      <base-button type="button" class="btn-default flex-1" @click="onReset">重置</base-button>
      <base-button type="button" class="btn-primary flex-1" @click="onSubmitClick">提交</base-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { showToast } from 'vant'
import { formRules } from '../../../../components/SelfForm.vue'

const formRef = ref()
const pageScroll = ref()
const disabled = ref(false)

const form = ref({
  name: '',
  phone: '',
  email: '',
  avatar: '',
  idCards: [] as string[],
  remark: ''
})

const rules = {
  name: [formRules.required('请输入姓名'), formRules.length(2, 10, '姓名 2-10 个字符')],
  phone: [formRules.required('请输入手机号'), formRules.mobile()],
  email: [formRules.email()],
  avatar: [{ required: true, message: '请上传头像', trigger: 'change' }],
  idCards: [],
  remark: []
}

/** 模拟上传：返回本地预览地址，80ms 延迟，10% 概率失败用于演示重试 */
function mockUpload(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      if (Math.random() < 0.1) return reject(new Error('upload fail'))
      resolve(URL.createObjectURL(file))
    }, 800)
  })
}

function onSubmit() {
  showToast('校验通过，提交成功')
  // eslint-disable-next-line no-console
  console.log('表单数据：', form.value)
}

/** 提交按钮在 self-form 外部，手动触发校验后再提交 */
function onSubmitClick() {
  formRef.value?.validate().then((res: { valid: boolean }) => {
    if (res.valid) onSubmit()
  })
}

function onReset() {
  formRef.value?.resetFields()
  showToast('已重置')
}
</script>

<style scoped>
.self-input {
  width: 100%;
  min-height: theme('minHeight.touch');
  padding: 0 theme('spacing.12');
  font-size: theme('fontSize.base');
  color: theme('colors.gray.800');
  background: transparent;
  border-bottom: 1px solid theme('colors.gray.100');
  outline: none;
  transition: border-color 0.2s ease;
}
.self-input:focus {
  border-color: theme('colors.primary.500');
}
textarea.self-input {
  padding: theme('spacing.12');
  resize: none;
}
</style>
