import { ref } from 'vue'
import { defineStore } from 'pinia'
import { showSuccessToast } from 'vant'
import {
  getTodoList,
  getTodoDetail,
  createTodo,
  updateTodo,
  completeTodo,
  incompleteTodo,
  deleteTodo
} from '@/services/todo'
import { useFamilyStore } from './family'

export const useTodoStore = defineStore('has-web-todo', () => {
  const todos = ref([])
  const currentTodo = ref(null)
  const activeTab = ref('pending')
  const loading = ref(false)
  const total = ref(0)

  function getFamilyId() {
    const familyStore = useFamilyStore()
    return familyStore.currentFamilyId
  }

  async function loadTodos(status) {
    const fid = getFamilyId()
    if (!fid) return
    loading.value = true
    try {
      const s = status || activeTab.value
      const response = await getTodoList(fid, { status: s, page: 1, pageSize: 50 })
      const data = response.data ?? response
      todos.value = data.list || []
      total.value = data.total || 0
      return data
    } finally {
      loading.value = false
    }
  }

  async function loadTodoDetail(todoId) {
    const fid = getFamilyId()
    if (!fid) return
    const response = await getTodoDetail(fid, todoId)
    const data = response.data ?? response
    currentTodo.value = data
    return data
  }

  async function createTodoAction(payload) {
    const fid = getFamilyId()
    if (!fid) return
    const response = await createTodo(fid, payload)
    const data = response.data ?? response
    showSuccessToast('创建成功')
    await loadTodos()
    return data
  }

  async function updateTodoAction(todoId, payload) {
    const fid = getFamilyId()
    if (!fid) return
    const response = await updateTodo(fid, todoId, payload)
    const data = response.data ?? response
    showSuccessToast('更新成功')
    if (currentTodo.value?.id === todoId) {
      currentTodo.value = { ...currentTodo.value, ...payload }
    }
    return data
  }

  async function toggleTodoAction(todoId, completed) {
    const fid = getFamilyId()
    if (!fid) return
    if (completed) {
      await completeTodo(fid, todoId)
    } else {
      await incompleteTodo(fid, todoId)
    }
    const idx = todos.value.findIndex((t) => t.id === todoId)
    if (idx >= 0) {
      todos.value[idx].status = completed ? 'completed' : 'pending'
      todos.value[idx].completedAt = completed ? new Date().toISOString() : null
    }
  }

  async function deleteTodoAction(todoId) {
    const fid = getFamilyId()
    if (!fid) return
    await deleteTodo(fid, todoId)
    todos.value = todos.value.filter((t) => t.id !== todoId)
    showSuccessToast('已删除')
  }

  function reset() {
    todos.value = []
    currentTodo.value = null
    activeTab.value = 'pending'
    total.value = 0
  }

  return {
    todos,
    currentTodo,
    activeTab,
    loading,
    total,
    loadTodos,
    loadTodoDetail,
    createTodoAction,
    updateTodoAction,
    toggleTodoAction,
    deleteTodoAction,
    reset
  }
})
