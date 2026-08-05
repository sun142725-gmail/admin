<template>
  <div class="todos-screen">
    <van-nav-bar title="家务待办" :border="false">
      <template #right>
        <van-icon name="plus" size="20" color="#0ea5e9" @click="showCreate = true" />
      </template>
    </van-nav-bar>

    <!-- Tab 切换 -->
    <van-tabs v-model:active="todoStore.activeTab" @change="handleTabChange" color="#0ea5e9" title-active-color="#0ea5e9" line-width="24">
      <van-tab title="未完成" name="pending" />
      <van-tab title="已完成" name="completed" />
    </van-tabs>

    <!-- 待办列表 -->
    <div class="todo-list">
      <van-skeleton v-if="todoStore.loading && !todoStore.todos.length" :row="3" />
      <template v-else-if="todoStore.todos.length">
        <div
          v-for="todo in todoStore.todos"
          :key="todo.id"
          class="todo-item"
          @click="$router.push(`/todos/${todo.id}`)"
        >
          <van-checkbox
            :model-value="todo.status === 'completed'"
            @click.stop="handleToggle(todo)"
            shape="square"
          />
          <div class="todo-item-body">
            <p class="todo-item-title" :class="{ 'is-done': todo.status === 'completed' }">
              {{ todo.title }}
            </p>
            <div class="todo-item-meta">
              <span class="todo-item-assignee">
                <van-icon name="user-o" size="12" />
                {{ todo.assigneeName }}
              </span>
              <span class="todo-item-date">
                <van-icon name="clock-o" size="12" />
                {{ todo.dueDate }}
              </span>
            </div>
          </div>
          <van-icon name="arrow" color="#cbd5e1" size="14" />
        </div>
      </template>
      <EmptyState v-else icon="todo-list-o" :text="todoStore.activeTab === 'pending' ? '暂无待办，点击右上角添加' : '暂无已完成待办'" />
    </div>

    <!-- 新建待办弹窗 -->
    <van-popup v-model:show="showCreate" round position="bottom" teleport="body">
      <div class="sheet">
        <div class="sheet-header">
          <h3 class="sheet-title">新建待办</h3>
          <van-icon name="cross" size="20" color="#94a3b8" @click="showCreate = false" />
        </div>
        <div class="sheet-body">
          <div class="sheet-field">
            <label class="sheet-label">待办标题</label>
            <van-field
              v-model="createForm.title"
              placeholder="输入待办内容"
              maxlength="50"
              show-word-limit
              :border="false"
              class="sheet-input"
            />
          </div>
          <div class="sheet-field">
            <label class="sheet-label">执行人</label>
            <van-field
              v-model="assigneeLabel"
              is-link
              readonly
              placeholder="选择执行人"
              :border="false"
              class="sheet-input"
              @click="showPicker = true"
            />
          </div>
          <div class="sheet-field">
            <label class="sheet-label">截止日期</label>
            <van-field
              v-model="createForm.dueDate"
              is-link
              readonly
              placeholder="选择日期"
              :border="false"
              class="sheet-input"
              @click="showDatePicker = true"
            />
          </div>
        </div>
        <div class="sheet-footer">
          <van-button block round type="primary" :loading="submitting" :disabled="!canSubmit" @click="handleSubmit">
            创建待办
          </van-button>
        </div>
      </div>
    </van-popup>

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
        :min-date="minDate"
      />
    </van-popup>

    <TabBar />
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { showToast } from 'vant'
import { useTodoStore } from '@/stores/todo'
import { useFamilyStore } from '@/stores/family'
import EmptyState from '@/components/EmptyState.vue'
import TabBar from '@/components/TabBar.vue'

const todoStore = useTodoStore()
const familyStore = useFamilyStore()

const showCreate = ref(false)
const showPicker = ref(false)
const showDatePicker = ref(false)
const submitting = ref(false)

const createForm = ref({
  title: '',
  assigneeId: '',
  dueDate: ''
})

const datePickerValue = ref([])
const minDate = new Date()

const memberColumns = computed(() => {
  return familyStore.members.map((m) => ({
    text: m.nickname,
    value: m.userId
  }))
})

const assigneeLabel = computed(() => {
  const m = familyStore.members.find((m) => m.userId === createForm.value.assigneeId)
  return m?.nickname || ''
})

const canSubmit = computed(() => {
  return createForm.value.title.trim() && createForm.value.assigneeId && createForm.value.dueDate
})

function handleTabChange(name) {
  todoStore.loadTodos(name)
}

async function handleToggle(todo) {
  const willComplete = todo.status !== 'completed'
  try {
    await todoStore.toggleTodoAction(todo.id, willComplete)
    await todoStore.loadTodos()
  } catch {
    // ignore
  }
}

function onPickerConfirm({ selectedValues }) {
  createForm.value.assigneeId = selectedValues[0]
  showPicker.value = false
}

function onDateConfirm({ selectedValues }) {
  createForm.value.dueDate = selectedValues.join('-')
  showDatePicker.value = false
}

async function handleSubmit() {
  if (!canSubmit.value) return
  submitting.value = true
  try {
    await todoStore.createTodoAction({
      title: createForm.value.title.trim(),
      assigneeId: createForm.value.assigneeId,
      dueDate: createForm.value.dueDate
    })
    showCreate.value = false
    createForm.value = { title: '', assigneeId: '', dueDate: '' }
  } catch {
    // toast 已处理
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  if (!familyStore.members.length) {
    await familyStore.loadMembers()
  }
  await todoStore.loadTodos()
})
</script>

<style scoped>
.todos-screen { min-height: 100vh; background: #f8fafc; }
.todos-screen :deep(.van-nav-bar) { background: #fff; }

.todo-list { padding: 12px 16px; }
.todo-item {
  background: #fff; border-radius: 12px; padding: 14px 16px; margin-bottom: 8px;
  display: flex; align-items: center; gap: 12px; box-shadow: 0 2px 8px rgba(0,0,0,0.03);
}
.todo-item:active { opacity: 0.8; }
.todo-item-body { flex: 1; min-width: 0; }
.todo-item-title { font-size: 14px; font-weight: 500; color: #1e293b; margin-bottom: 6px; }
.todo-item-title.is-done { color: #94a3b8; text-decoration: line-through; }
.todo-item-meta { display: flex; gap: 12px; }
.todo-item-assignee, .todo-item-date { display: flex; align-items: center; gap: 3px; font-size: 11px; color: #94a3b8; }

/* Sheet */
.sheet { padding: 20px 16px; }
.sheet-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
.sheet-title { font-size: 18px; font-weight: 700; color: #1e293b; }
.sheet-body { margin-bottom: 20px; }
.sheet-field { margin-bottom: 16px; }
.sheet-label { display: block; font-size: 14px; font-weight: 500; color: #475569; margin-bottom: 8px; }
.sheet-input { background: #f8fafc; border-radius: 10px; overflow: hidden; }
.sheet-footer :deep(.van-button--primary) {
  background: linear-gradient(135deg, #0ea5e9 0%, #0284c7 100%); border: none; height: 48px; font-size: 16px; font-weight: 600;
}
</style>
