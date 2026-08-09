<!--
 * BaseDatePicker 日期选择器
 * 用途：封装 Vant DatePicker + Popup，支持年月日 / 仅年月两种精度。
 *       使用 Vant 4 内置工具栏（showToolbar），不重复渲染 toolbar。
 *       放入 shared/components/ 即自动全局注册为 <base-date-picker />。
 * 依赖：vant（van-popup / van-date-picker / van-icon）
 -->
<template>
  <div class="base-date-picker">
    <!-- 触发器 -->
    <div
      class="base-date-picker__trigger"
      :class="{ 'is-placeholder': !displayValue }"
      @click="openPicker"
    >
      <span class="base-date-picker__value">{{ displayValue || placeholder }}</span>
      <van-icon name="arrow-down" size="14" color="#c0c4cc" />
    </div>

    <!-- 日期选择弹窗 -->
    <van-popup
      v-model:show="popupVisible"
      round
      position="bottom"
      teleport="body"
    >
      <van-date-picker
        v-model="pickerValue"
        :columns-type="columnsType"
        :min-date="minDate"
        :max-date="maxDate"
        :title="toolbarTitle"
        @confirm="onConfirm"
        @cancel="onCancel"
      />
    </van-popup>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'

const props = defineProps({
  /** 绑定值，YYYY-MM-DD 或 YYYY-MM */
  modelValue: { type: String, default: '' },
  /** 日期精度：day=年月日 / month=仅年月 */
  precision: { type: String, default: 'day' },
  /** 占位文案 */
  placeholder: { type: String, default: '请选择日期' },
  /** 最小日期 */
  minDate: { type: Date, default: () => new Date(1970, 0, 1) },
  /** 最大日期 */
  maxDate: { type: Date, default: () => new Date() },
  /** 弹窗标题 */
  title: { type: String, default: '' }
})

const emit = defineEmits(['update:modelValue', 'change'])

const popupVisible = ref(false)
const pickerValue = ref([])

const columnsType = computed(() =>
  props.precision === 'month' ? ['year', 'month'] : ['year', 'month', 'day']
)

const toolbarTitle = computed(() => {
  if (props.title) return props.title
  return props.precision === 'month' ? '选择年月' : '选择日期'
})

const displayValue = computed(() => {
  if (!props.modelValue) return ''
  return props.modelValue.replaceAll('-', ' / ')
})

/**
 * 弹窗打开时同步当前值到 picker
 * 使用 nextTick 确保 picker 已渲染
 */
watch(popupVisible, async (visible) => {
  if (!visible) return
  await nextTick()
  if (props.modelValue) {
    pickerValue.value = props.modelValue.split('-')
  } else {
    const now = new Date()
    pickerValue.value = [
      String(now.getFullYear()),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0')
    ]
  }
})

function openPicker() {
  popupVisible.value = true
}

/**
 * 确认回调 —— 由 van-date-picker 内置工具栏触发
 * @param {{ selectedValues: string[] }} param
 */
function onConfirm({ selectedValues }) {
  const values = selectedValues || pickerValue.value
  let result
  if (props.precision === 'month') {
    result = values.slice(0, 2).join('-')
  } else {
    result = values.join('-')
  }
  emit('update:modelValue', result)
  emit('change', result)
  popupVisible.value = false
}

function onCancel() {
  popupVisible.value = false
}
</script>

<style scoped>
.base-date-picker__trigger {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: #f7f8fa;
  border-radius: 8px;
  cursor: pointer;
  min-height: 36px;
  -webkit-tap-highlight-color: transparent;
}

.base-date-picker__trigger:active {
  opacity: 0.7;
}

.base-date-picker__value {
  font-size: 14px;
  color: #1e293b;
}

.base-date-picker__trigger.is-placeholder .base-date-picker__value {
  color: #c0c4cc;
}
</style>
