<!--
 * SelfForm 表单根容器
 * 用途：自研移动端表单核心容器，基于 async-validator 统一校验；
 *       通过 provide/inject 与 SelfFormItem 通信，支持实时防抖校验与提交校验失败滚动定位。
 * 依赖：async-validator；(可选) BaseScroll（通过 scroller prop 传入，用于错误项滚动定位）
 -->
<template>
  <form class="self-form" :class="{ 'is-disabled': disabled }" @submit.prevent="handleSubmit">
    <slot />
  </form>
</template>

<script lang="ts">
import type { RuleItem } from 'async-validator'

export type LabelPosition = 'top' | 'left'
export type ValidateTrigger = 'blur' | 'change' | 'submit'
export interface ValidateResult {
  valid: boolean
  message: string
}

/** 扩展 async-validator 的 RuleItem，增加 trigger 字段以区分失焦/输入/提交触发 */
export type SelfRuleItem = RuleItem & { trigger?: ValidateTrigger | ValidateTrigger[] }
export type SelfRules = Record<string, SelfRuleItem | SelfRuleItem[]>

/** 外部滚动实例约束：需暴露 scrollToElement（与 BaseScroll 的 defineExpose 对齐） */
export interface ScrollerLike {
  scrollToElement: (
    el: HTMLElement,
    time?: number,
    offsetX?: boolean | number,
    offsetY?: boolean | number
  ) => void
}

/** SelfFormItem 向上注册的上下文 */
export interface FieldContext {
  prop: string
  validate: (trigger?: ValidateTrigger) => Promise<ValidateResult>
  clearValidate: () => void
  resetField: () => void
  getEl: () => HTMLElement | null
}

/** SelfForm 向下 provide 的上下文 */
export interface FormContext {
  model: Record<string, any>
  rules: SelfRules
  labelPosition: LabelPosition
  labelWidth: string | number
  requiredMark: boolean
  disabled: boolean
  showErrorMessage: boolean
  registerField: (field: FieldContext) => void
  unregisterField: (prop: string) => void
  onFieldBlur: (prop: string) => void
  onFieldInput: (prop: string) => void
  validateField: (prop: string, trigger?: ValidateTrigger) => Promise<ValidateResult>
}

/** 内置通用校验规则集，便于快速拼装 rules */
export const formRules = {
  required: (msg = '该项为必填'): SelfRuleItem => ({ required: true, message: msg, trigger: 'blur' }),
  mobile: (msg = '请输入正确的手机号'): SelfRuleItem => ({
    pattern: /^1[3-9]\d{9}$/,
    message: msg,
    trigger: 'blur'
  }),
  email: (msg = '请输入正确的邮箱'): SelfRuleItem => ({ type: 'email', message: msg, trigger: 'blur' }),
  number: (msg = '请输入数字'): SelfRuleItem => ({ type: 'number', message: msg, trigger: 'blur' }),
  length: (min: number, max: number, msg?: string): SelfRuleItem => ({
    min,
    max,
    message: msg || `长度需在 ${min}-${max} 之间`,
    trigger: 'blur'
  })
}
</script>

<script setup lang="ts">
import { provide, onUnmounted } from 'vue'
import Schema from 'async-validator'

interface FormProps {
  /** 表单数据对象（子控件直接修改其属性即可，对象引用同步） */
  modelValue?: Record<string, any>
  /** 表单数据对象兼容入口，支持 :model 与 v-model 两种写法 */
  model?: Record<string, any>
  /** 校验规则，key 对应 model/modelValue 的字段名 */
  rules?: SelfRules
  /** 标签位置：top 标签在上 / left 标签在左 */
  labelPosition?: LabelPosition
  /** 标签宽度（left 模式生效），数字按 px，字符串直接使用 */
  labelWidth?: string | number
  /** 是否显示必填红星 */
  requiredMark?: boolean
  /** 整表禁用 */
  disabled?: boolean
  /** 是否展示错误提示 */
  showErrorMessage?: boolean
  /** 滚动实例（BaseScroll），校验失败滚动到首个错误项；不传则用原生 scrollIntoView 兜底 */
  scroller?: ScrollerLike | null
}

const props = withDefaults(defineProps<FormProps>(), {
  rules: () => ({}),
  labelPosition: 'top',
  labelWidth: 'auto',
  requiredMark: true,
  disabled: false,
  showErrorMessage: true,
  scroller: null
})

const emit = defineEmits<{
  (e: 'update:modelValue', val: Record<string, any>): void
  (e: 'submit'): void
  (e: 'validate', prop: string, valid: boolean, message: string): void
}>()

// 收集 FormItem
const fieldMap = new Map<string, FieldContext>()

function registerField(field: FieldContext) {
  if (field.prop) fieldMap.set(field.prop, field)
}
function unregisterField(prop: string) {
  fieldMap.delete(prop)
}

// 防抖 300ms 实时校验
const changeTimers = new Map<string, ReturnType<typeof setTimeout>>()
function onFieldInput(prop: string) {
  const old = changeTimers.get(prop)
  if (old) clearTimeout(old)
  changeTimers.set(
    prop,
    setTimeout(() => {
      changeTimers.delete(prop)
      validateField(prop, 'change').catch(() => {})
    }, 300)
  )
}
function onFieldBlur(prop: string) {
  validateField(prop, 'blur').catch(() => {})
}

async function validateField(prop: string, trigger: ValidateTrigger = 'blur'): Promise<ValidateResult> {
  const field = fieldMap.get(prop)
  if (!field) return { valid: true, message: '' }
  const res = await field.validate(trigger)
  emit('validate', prop, res.valid, res.message)
  return res
}

/** 全量校验，失败时滚动到第一个错误项 */
async function validate(): Promise<{ valid: boolean; errors: Record<string, string> }> {
  const errors: Record<string, string> = {}
  let firstErrorProp = ''
  for (const field of fieldMap.values()) {
    const res = await field.validate('submit')
    if (!res.valid) {
      errors[field.prop] = res.message
      if (!firstErrorProp) firstErrorProp = field.prop
    }
  }
  if (firstErrorProp) scrollToError(firstErrorProp)
  return { valid: Object.keys(errors).length === 0, errors }
}

function clearValidate(prop?: string | string[]) {
  const keys = prop ? (Array.isArray(prop) ? prop : [prop]) : Array.from(fieldMap.keys())
  keys.forEach((k) => fieldMap.get(k)?.clearValidate())
}

function resetFields(prop?: string | string[]) {
  const keys = prop ? (Array.isArray(prop) ? prop : [prop]) : Array.from(fieldMap.keys())
  keys.forEach((k) => fieldMap.get(k)?.resetField())
}

function scrollToError(prop: string) {
  const el = fieldMap.get(prop)?.getEl()
  if (!el) return
  if (props.scroller?.scrollToElement) {
    props.scroller.scrollToElement(el, 300, true, true)
  } else {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

function handleSubmit() {
  validate().then((res) => {
    if (res.valid) emit('submit')
  })
}

// 用 getter 保持对 props 的响应式追踪（inject 端读取时即响应）
const ctx: FormContext = {
  get model() {
    return props.modelValue ?? props.model ?? {}
  },
  get rules() {
    return props.rules
  },
  get labelPosition() {
    return props.labelPosition
  },
  get labelWidth() {
    return props.labelWidth
  },
  get requiredMark() {
    return props.requiredMark
  },
  get disabled() {
    return props.disabled
  },
  get showErrorMessage() {
    return props.showErrorMessage
  },
  registerField,
  unregisterField,
  onFieldBlur,
  onFieldInput,
  validateField
}
provide<FormContext>('selfForm', ctx)

onUnmounted(() => {
  changeTimers.forEach((t) => clearTimeout(t))
  changeTimers.clear()
})

defineExpose({ validate, validateField, clearValidate, resetFields })
</script>

<style scoped>
.self-form {
  width: 100%;
}
.self-form.is-disabled {
  opacity: 0.6;
  pointer-events: none;
}
</style>
