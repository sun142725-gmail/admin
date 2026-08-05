import request from './request'

export function getTodoList(familyId, params) {
  // params: { status?, page?, pageSize? }
  return request.get(`/family/${familyId}/todos`, { params })
}

export function getTodoDetail(familyId, todoId) {
  return request.get(`/family/${familyId}/todos/${todoId}`)
}

export function createTodo(familyId, payload) {
  // payload: { title, assigneeId, dueDate }
  return request.post(`/family/${familyId}/todos`, payload)
}

export function updateTodo(familyId, todoId, payload) {
  // payload: { title?, assigneeId?, dueDate? }
  return request.put(`/family/${familyId}/todos/${todoId}`, payload)
}

export function completeTodo(familyId, todoId) {
  return request.patch(`/family/${familyId}/todos/${todoId}/complete`)
}

export function incompleteTodo(familyId, todoId) {
  return request.patch(`/family/${familyId}/todos/${todoId}/incomplete`)
}

export function deleteTodo(familyId, todoId) {
  return request.delete(`/family/${familyId}/todos/${todoId}`)
}
