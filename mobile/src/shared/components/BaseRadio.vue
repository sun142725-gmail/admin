<!--
 * BaseRadio 单选组件
 * 用途：纯 CSS+HTML 单选组件，不依赖 Vant Radio，避免 shared/ 目录下的
 *       Vant 组件渲染问题。统一项目中所有 radio 样式与行为。
 *       放入 shared/components/ 即自动全局注册为 <base-radio />。
 -->
<template>
  <div class="base-radio" :class="rootClass">
    <label
      v-for="opt in normalizedOptions"
      :key="String(opt.value)"
      class="base-radio__item"
      :class="{
        'is-checked': model === opt.value,
        'is-disabled': disabled || opt.disabled
      }"
    >
      <span class="base-radio__circle">
        <span v-if="model === opt.value" class="base-radio__dot" :style="dotStyle"></span>
      </span>
      <input
        type="radio"
        class="base-radio__input"
        :value="opt.value"
        :checked="model === opt.value"
        :disabled="disabled || opt.disabled"
        :name="name"
        @change="onChange(opt.value)"
      />
      <span class="base-radio__label">{{ opt.label }}</span>
    </label>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  /** v-model 绑定值，支持 string / number / boolean */
  modelValue: { type: [String, Number, Boolean], default: '' },
  /**
   * 选项数组，支持两种形态：
   * 1. 简单数组：['男', '女']
   * 2. 对象数组：[{ label: '男', value: 'male', disabled: false }]
   */
  options: { type: Array, default: () => [] },
  /** 排列方向：horizontal 横向 / vertical 纵向 */
  direction: { type: String, default: 'horizontal' },
  /** 整组禁用 */
  disabled: { type: Boolean, default: false },
  /** 颜色主题：primary（默认）/ success / warning / danger */
  theme: { type: String, default: 'primary' }
})

const emit = defineEmits(['update:modelValue', 'change'])

// 唯一 name 属性，确保同一组内 radio 互斥
let uidCounter = 0
const name = `base-radio-${++uidCounter}`

const model = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const rootClass = computed(() => [
  `base-radio--${props.direction}`,
  `base-radio--${props.theme}`
])

const themeColor = computed(() => {
  const map = {
    primary: '#0ea5e9',
    success: '#10b981',
    warning: '#f59e0b',
    danger: '#ef4444'
  }
  return map[props.theme] || map.primary
})

const dotStyle = computed(() => ({ backgroundColor: themeColor.value }))

/**
 * 统一转换为 { label, value, disabled } 形态
 */
const normalizedOptions = computed(() => {
  return props.options.map((opt) => {
    if (typeof opt === 'object' && opt !== null) {
      return {
        label: opt.label ?? '',
        value: opt.value,
        disabled: !!opt.disabled
      }
    }
    return { label: String(opt), value: opt, disabled: false }
  })
})

function onChange(value) {
  model.value = value
  emit('change', value)
}
</script>

<style scoped>
.base-radio {
  display: flex;
  flex-wrap: wrap;
}

.base-radio--horizontal {
  flex-direction: row;
  gap: 20px;
}

.base-radio--vertical {
  flex-direction: column;
  gap: 12px;
}

.base-radio__item {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  user-select: none;
  font-size: 14px;
  color: #334155;
}

.base-radio__item.is-disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

/* 隐藏原生 radio，使用自定义圆形 */
.base-radio__input {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
  pointer-events: none;
}

.base-radio__circle {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 1.5px solid #cbd5e1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: border-color 0.2s ease, background-color 0.2s ease;
}

.base-radio__item:hover:not(.is-disabled) .base-radio__circle {
  border-color: var(--base-radio-accent, #0ea5e9);
}

.base-radio__item.is-checked .base-radio__circle {
  border-color: var(--base-radio-accent, #0ea5e9);
}

.base-radio__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--base-radio-accent, #0ea5e9);
}

/* 主题色：主色 */
.base-radio--primary {
  --base-radio-accent: #0ea5e9;
}

/* 主题色：金色 */
.base-radio--warning {
  --base-radio-accent: #f59e0b;
}

/* 主题色：成功 */
.base-radio--success {
  --base-radio-accent: #10b981;
}

/* 主题色：危险 */
.base-radio--danger {
  --base-radio-accent: #ef4444;
}

.base-radio__label {
  margin-left: 6px;
  line-height: 1.4;
}

.base-radio__item.is-disabled .base-radio__label {
  color: #94a3b8;
}
</style>