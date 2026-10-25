<template>
  <div class="page-screen">
    <van-nav-bar title="待办详情" left-arrow @click-left="$router.back()" :border="false" />

    <div v-if="todo" class="p-12 px-16">
      <!-- 标题 -->
      <div class="screen-card mb-12">
        <van-field
          v-model="editForm.title"
          label="标题"
          :border="false"
          input-align="right"
          class="detail-input"
        />
      </div>

      <!-- 信息 -->
      <div class="screen-card mb-12">
        <div class="press flex items-center justify-between px-16 py-14 min-h-touch border-b border-gray-50 active:bg-gray-50" @click="showPicker = true">
          <span class="text-base font-medium text-gray-600">执行人</span>
          <div class="flex items-center gap-4 text-base text-gray-800">
            <span>{{ assigneeLabel || '未指定' }}</span>
            <van-icon name="arrow" color="#a9b1bf" size="14" />
          </div>
        </div>
        <div class="press flex items-center justify-between px-16 py-14 min-h-touch border-b border-gray-50 active:bg-gray-50" @click="showDatePicker = true">
          <span class="text-base font-medium text-gray-600">截止日期</span>
          <div class="flex items-center gap-4 text-base text-gray-800">
            <span>{{ editForm.dueDate || '未设置' }}</span>
            <van-icon name="arrow" color="#a9b1bf" size="14" />
          </div>
        </div>
        <div class="flex items-center justify-between px-16 py-14 min-h-touch border-b border-gray-50">
          <span class="text-base font-medium text-gray-600">创建人</span>
          <span class="text-base text-gray-800">{{ todo.creatorName }}</span>
        </div>
        <div class="flex items-center justify-between px-16 py-14 min-h-touch">
          <span class="text-base font-medium text-gray-600">状态</span>
          <span class="text-base text-gray-800">
            <van-tag :type="todo.status === 'completed' ? 'success' : 'primary'" round>
              {{ todo.status === 'completed' ? '已完成' : '未完成' }}
            </van-tag>
          </span>
        </div>
      </div>

      <!-- 操作 -->
      <div class="flex flex-col gap-8 pt-8">
        <van-button block round type="primary" @click="handleSave">
          保存修改
        </van-button>
        <van-button
          v-if="todo.status !== 'completed'"
          block
          round
          plain
          type="success"
          @click="handleComplete"
        >
          标记完成
        </van-button>
        <van-button
          v-else
          block
          round
          plain
          @click="handleIncomplete"
        >
          取消完成
        </van-button>
        <van-button block round plain type="danger" @click="handleDelete">
          删除待办
        </van-button>
      </div>
    </div>

    <van-skeleton v-else :row="4" title class="p-16" />

    <!-- 执行人选择 -->
    <van-popup v-model:show="showPicker" round position="bottom" teleport="body">
      <van-picker
        :columns="memberColumns"
        @confirm="onPickerConfirm"
        @cancel="showPicker = false"
        title="选择执行人"
      />
    </van-popup>

    <!-- 日期选择 -->
    <van-popup v-model:show="showDatePicker" round position="bottom" teleport="body">
      <van-date-picker
        v-model="datePickerValue"
        @confirm="onDateConfirm"
        @cancel="showDatePicker = false"
        title="选择截止日期"
      />
    </van-popup>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { showConfirmDialog } from 'vant'
import { useTodoStore } from '@/stores/todo'
import { useFamilyStore } from '@/stores/family'

const route = useRoute()
const router = useRouter()
const todoStore = useTodoStore()
const familyStore = useFamilyStore()

const showPicker = ref(false)
const showDatePicker = ref(false)
const editForm = reactive({
  title: '',
  assigneeId: '',
  dueDate: ''
})

const todo = computed(() => todoStore.currentTodo)

const memberColumns = computed(() => {
  return familyStore.members.map((m) => ({
    text: m.nickname || '未设置昵称',
    value: Number(m.userId)
  }))
})

const assigneeLabel = computed(() => {
  const m = familyStore.members.find((m) => Number(m.userId) === editForm.assigneeId)
  return m?.nickname || ''
})

function onPickerConfirm({ selectedValues }) {
  editForm.assigneeId = Number(selectedValues[0])
  showPicker.value = false
}

function onDateConfirm({ selectedValues }) {
  editForm.dueDate = selectedValues.join('-')
  showDatePicker.value = false
}

async function handleSave() {
  if (!editForm.title.trim()) return
  await todoStore.updateTodoAction(route.params.id, {
    title: editForm.title.trim(),
    assigneeId: editForm.assigneeId,
    dueDate: editForm.dueDate
  })
  router.back()
}

async function handleComplete() {
  await todoStore.toggleTodoAction(route.params.id, true)
  await todoStore.loadTodoDetail(route.params.id)
}

async function handleIncomplete() {
  await todoStore.toggleTodoAction(route.params.id, false)
  await todoStore.loadTodoDetail(route.params.id)
}

function handleDelete() {
  showConfirmDialog({
    title: '删除待办',
    message: '确定要删除这条待办吗？'
  }).then(async () => {
    await todoStore.deleteTodoAction(route.params.id)
    router.back()
  }).catch(() => {})
}

onMounted(async () => {
  if (!familyStore.members.length) {
    await familyStore.loadMembers()
  }
  await todoStore.loadTodoDetail(route.params.id)
  if (todo.value) {
    editForm.title = todo.value.title
    editForm.assigneeId = Number(todo.value.assigneeId)
    editForm.dueDate = todo.value.dueDate
  }
})
</script>

<style scoped>
.detail-input :deep(.van-field__label) {
  color: theme('colors.gray.600');
  font-weight: 500;
}
</style>
