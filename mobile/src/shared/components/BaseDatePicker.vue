<!--
 * BaseDatePicker 日期选择器
 * 用途：封装 Vant DatePicker + Popup，支持年月日 / 仅年月两种精度，
 *       统一项目中所有日期选择交互。放入 shared/components/ 即自动全局注册为 <base-date-picker />。
 * 依赖：vant（van-popup / van-date-picker / van-icon）
 -->
<template>
  <div class="base-date-picker">
    <div
      class="base-date-picker__trigger"
      :class="{ 'is-placeholder': !displayValue }"
      @click="openPicker"
    >
      <span class="base-date-picker__value">{{ displayValue || placeholder }}</span>
      <van-icon name="arrow-down" size="14" color="#c0c4cc" />
    </div>

    <van-popup
      v-model:show="popupVisible"
      round
      position="bottom"
      teleport="body"
    >
      <div class="base-date-picker__toolbar">
        <span class="base-date-picker__cancel" @click="popupVisible = false">取消</span>
        <span class="base-date-picker__title">{{ toolbarTitle }}</span>
        <span class="base-date-picker__confirm" @click="onConfirm">确认</span>
      </div>
      <van-date-picker
        v-model="pickerValue"
        :columns-type="columnsType"
        :min-date="minDate"
        :max-date="maxDate"
      />
    </van-popup>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

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
  return props.modelValue.replaceAll('-', '/')
})

// 弹窗打开时同步当前值到 picker
watch(popupVisible, (visible) => {
  if (!visible) return
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

function onConfirm() {
  const values = pickerValue.value
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

.base-date-picker__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #f1f5f9;
}

.base-date-picker__cancel {
  font-size: 14px;
  color: #64748b;
  cursor: pointer;
}

.base-date-picker__title {
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
}

.base-date-picker__confirm {
  font-size: 14px;
  color: #0ea5e9;
  font-weight: 500;
  cursor: pointer;
}
</style>
