<template>
  <div class="detail-screen">
    <van-nav-bar title="待办详情" left-arrow @click-left="$router.back()" :border="false" />

    <div v-if="todo" class="detail-content">
      <!-- 标题 -->
      <div class="detail-card">
        <van-field
          v-model="editForm.title"
          label="标题"
          :border="false"
          input-align="right"
          class="detail-input"
        />
      </div>

      <!-- 信息 -->
      <div class="detail-card">
        <div class="detail-row" @click="showPicker = true">
          <span class="detail-row-label">执行人</span>
          <div class="detail-row-value">
            <span>{{ assigneeLabel || '未指定' }}</span>
            <van-icon name="arrow" color="#cbd5e1" size="14" />
          </div>
        </div>
        <div class="detail-row" @click="showDatePicker = true">
          <span class="detail-row-label">截止日期</span>
          <div class="detail-row-value">
            <span>{{ editForm.dueDate || '未设置' }}</span>
            <van-icon name="arrow" color="#cbd5e1" size="14" />
          </div>
        </div>
        <div class="detail-row">
          <span class="detail-row-label">创建人</span>
          <span class="detail-row-value">{{ todo.creatorName }}</span>
        </div>
        <div class="detail-row">
          <span class="detail-row-label">状态</span>
          <span class="detail-row-value">
            <van-tag :type="todo.status === 'completed' ? 'success' : 'primary'" round>
              {{ todo.status === 'completed' ? '已完成' : '未完成' }}
            </van-tag>
          </span>
        </div>
      </div>

      <!-- 操作 -->
      <div class="detail-actions">
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

    <van-skeleton v-else :row="4" title style="padding: 16px" />

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
import { showConfirmDialog, showSuccessToast } from 'vant'
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
.detail-screen { min-height: 100vh; background: #f8fafc; }
.detail-screen :deep(.van-nav-bar) { background: #fff; }
.detail-content { padding: 12px 16px; }
.detail-card {
  background: #fff; border-radius: 16px; margin-bottom: 12px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.03); overflow: hidden;
}
.detail-input :deep(.van-field__label) { color: #64748b; font-weight: 500; }
.detail-row {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px; border-bottom: 1px solid #f1f5f9;
}
.detail-row:last-child { border-bottom: none; }
.detail-row-label { font-size: 14px; color: #64748b; font-weight: 500; }
.detail-row-value { display: flex; align-items: center; gap: 4px; font-size: 14px; color: #1e293b; }
.detail-actions { display: flex; flex-direction: column; gap: 8px; padding-top: 8px; }
.detail-actions :deep(.van-button--primary) {
  background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); border: none; height: 46px; font-size: 15px;
}
</style>
