<!--
 * SelfFormItem 单行表单项包装器
 * 用途：渲染标签/必填星/控件容器/错误提示，承接 SelfForm 上下文完成字段级校验。
 * 依赖：SelfForm（inject 上下文）、async-validator
 -->
<template>
  <div
    ref="rootRef"
    class="self-form-item"
    :class="[
      `label-${labelPos}`,
      { 'is-error': isError, 'is-required': isRequired, 'is-disabled': mergedDisabled }
    ]"
  >
    <label v-if="label || $slots.label" class="self-form-item__label" :class="labelBlock ? 'block': ''" :style="labelStyle">
      <slot name="label" :label="label">
        <span v-if="form?.requiredMark && isRequired" class="self-form-item__mark">*</span>
        {{ label }}
      </slot>
    </label>
    <div
      class="self-form-item__content min-h-touch flex flex-col"
      @input="onInput"
      @focusout="onBlur"
      @change="onChange"
    >
      <slot :blur="onBlur" :change="onInput" :disabled="mergedDisabled" />
      <transition name="self-fade">
        <p v-if="isError && showErrMsg" class="self-form-item__error">{{ errMsg }}</p>
      </transition>
    </div>
  </div>
</template>

<script lang="ts">
import type { SelfRuleItem, LabelPosition } from './SelfForm.vue'

export interface ItemProps {
  /** 字段名，对应 SelfForm modelValue 的 key */
  prop?: string
  /** 标签文本 */
  label?: string
  /** 当前项校验规则（优先于 SelfForm.rules[prop]） */
  rules?: SelfRuleItem[]
  /** 是否必填（仅控制红星展示，实际校验仍以 rules 为准） */
  required?: boolean
  /** 标签位置，覆盖 SelfForm 的 labelPosition */
  labelPosition?: LabelPosition
  /** 标签宽度，覆盖 SelfForm 的 labelWidth */
  labelWidth?: string | number
  /** 外部传入的错误文案（受控错误） */
  error?: string
  /** 是否展示该项错误提示，覆盖 SelfForm.showErrorMessage */
  showError?: boolean
}
</script>

<script setup lang="ts">
import { ref, computed, inject, onMounted, onBeforeUnmount, watch } from 'vue'
import Schema from 'async-validator'
import type { ValidateError } from 'async-validator'
import type {
  FormContext,
  FieldContext,
  ValidateTrigger,
  ValidateResult
} from './SelfForm.vue'

const props = withDefaults(defineProps<ItemProps>(), {
  required: false,
  labelPosition: 'top',
  labelWidth: undefined,
  error: '',
  showError: true
})

const form = inject<FormContext | null>('selfForm', null)

const rootRef = ref<HTMLElement | null>(null)
const errState = ref(false)
const errMsg = ref('')

const labelPos = computed<LabelPosition>(() => props.labelPosition || form?.labelPosition || 'top')
const mergedLabelWidth = computed(() => props.labelWidth ?? form?.labelWidth ?? 'auto')
const mergedDisabled = computed(() => !!form?.disabled)
const showErrMsg = computed(() => props.showError && form?.showErrorMessage !== false)

const mergedRules = computed<SelfRuleItem[]>(() => {
  if (props.rules && props.rules.length) return props.rules
  if (props.prop && form?.rules?.[props.prop]) {
    const r = form.rules[props.prop]
    return Array.isArray(r) ? r : [r]
  }
  return []
})

const isRequired = computed(() => {
  if (props.required) return true
  return mergedRules.value.some((r) => r.required === true)
})

const isError = computed(() => errState.value || !!props.error)

const labelStyle = computed(() => {
  const w = mergedLabelWidth.value
  if (!w || w === 'auto') return {}
  return { width: typeof w === 'number' ? `${w}px` : w }
})

/** 字段级校验：按 trigger 过滤规则，submit 校验全部 */
async function validate(trigger: ValidateTrigger = 'blur'): Promise<ValidateResult> {
  const rules = mergedRules.value
  if (!rules.length) {
    errState.value = false
    errMsg.value = ''
    return { valid: true, message: '' }
  }
  const value = form?.model?.[props.prop!]
  const used =
    trigger === 'submit'
      ? rules
      : rules.filter(
          (r) =>
            !r.trigger ||
            r.trigger === trigger ||
            (Array.isArray(r.trigger) && r.trigger.includes(trigger))
        )
  if (!used.length) return { valid: true, message: '' }

  const schema = new Schema({ [props.prop!]: used })
  try {
    await schema.validate({ [props.prop!]: value })
    errState.value = false
    errMsg.value = ''
    return { valid: true, message: '' }
  } catch (e: unknown) {
    const list = Array.isArray(e)
      ? (e as ValidateError[])
      : ((e as { errors?: ValidateError[] })?.errors ?? [])
    errState.value = true
    errMsg.value = list[0]?.message || '校验未通过'
    return { valid: false, message: errMsg.value }
  }
}

function clearValidate() {
  errState.value = false
  errMsg.value = ''
}

let initialValue: unknown = undefined
function resetField() {
  if (form?.model && props.prop) {
    form.model[props.prop] = initialValue
  }
  clearValidate()
}

// 外部 error 受控同步
watch(
  () => props.error,
  (v) => {
    if (v) {
      errState.value = true
      errMsg.value = v
    }
  }
)

function onInput() {
  if (props.prop) form?.onFieldInput(props.prop)
}
function onBlur() {
  if (props.prop) form?.onFieldBlur(props.prop)
}
function onChange() {
  if (props.prop) form?.onFieldInput(props.prop)
}

onMounted(() => {
  if (props.prop && form?.model) {
    initialValue = form.model[props.prop]
  }
  if (props.prop && form) {
    const ctx: FieldContext = {
      prop: props.prop,
      validate,
      clearValidate,
      resetField,
      getEl: () => rootRef.value
    }
    form.registerField(ctx)
  }
})

onBeforeUnmount(() => {
  if (props.prop) form?.unregisterField(props.prop)
})

defineExpose({ validate, clearValidate, resetField })
</script>

<style scoped>
.self-form-item {
  margin-bottom: theme('spacing.16');
}
.self-form-item__label {
  display: block;
  font-size: theme('fontSize.sm');
  color: theme('colors.gray.700');
  margin-bottom: theme('spacing.8');
  line-height: 1.4;
}
.self-form-item__mark {
  color: theme('colors.danger');
  margin-right: theme('spacing.4');
}
.self-form-item__content {
  position: relative;
}
/* 标签左侧布局 */
.self-form-item.label-left {
  display: flex;
  align-items: flex-start;
}
.self-form-item.label-left .self-form-item__label {
  flex-shrink: 0;
  margin-bottom: 0;
  padding-top: theme('spacing.12');
}
.self-form-item.label-left .self-form-item__content {
  flex: 1;
  min-width: 0;
}
/* 错误态：内部原生控件边框变红 */
.self-form-item.is-error .self-form-item__content :deep(input),
.self-form-item.is-error .self-form-item__content :deep(textarea),
.self-form-item.is-error .self-form-item__content :deep(select) {
  border-color: theme('colors.danger');
}
.self-form-item__error {
  margin-top: theme('spacing.4');
  font-size: theme('fontSize.xs');
  color: theme('colors.danger');
  line-height: 1.4;
}
.self-form-item.is-disabled {
  opacity: 0.6;
}
/* 错误提示淡入淡出 */
.self-fade-enter-active,
.self-fade-leave-active {
  transition: opacity 0.2s ease;
}
.self-fade-enter-from,
.self-fade-leave-to {
  opacity: 0;
}
</style>
