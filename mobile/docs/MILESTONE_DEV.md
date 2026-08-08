# 家庭大事纪 - 前端开发文档

> 版本：v1.0  
> 日期：2026-08-08  
> 技术栈：Vue 3 + Vant 4 + Pinia + TailwindCSS + Vite  
> 关联文档：[DEVELOPMENT.md](./DEVELOPMENT.md) | [API_SPEC.md](./API_SPEC.md) | [MILESTONE_API.md](./MILESTONE_API.md)

---

## 一、功能概述

家庭大事纪是【我的家】差异化核心情怀功能，用于长期记录个人人生里程碑、家庭重大纪实事件，支持沉淀专属个人/家庭的成长履历，自动筛选核心高光事件，生成极简碑文式汇总页。

### 1.1 本期范围

| 类别 | 内容 |
|------|------|
| ✅ 必做 | 双模式记录（个人/家庭）、时间轴列表、核心事件标记、碑文汇总页、新增/编辑/删除/配图（1-3张）、页面截图留存、权限控制、空状态、加载状态 |
| ❌ 不做 | 事件分类/标签/搜索、PDF导出/外部分享、事件模板、评论点赞、复杂动画、视频上传 |

### 1.2 新增页面清单

| 编号 | 页面 | 路由 | 文件 | 说明 |
|------|------|------|------|------|
| 12 | 大事纪首页 | `/milestones` | `MilestonesView.vue` | 时间轴列表 + Tab 切换 |
| 13 | 纪事碑文汇总 | `/milestones/summary` | `MilestoneSummaryView.vue` | 核心事件碑文展示 + 截图 |
| — | 新增/编辑弹窗 | — | `MilestoneEditDialog.vue` | 全局弹窗，不新建路由 |

### 1.3 首页入口

在 `HomeView.vue` 快捷入口区新增【家庭大事纪】卡片，与成员管理、家务待办、家庭公告并列。

---

## 二、数据模型

### 2.1 FamilyMilestone（大事纪事件）

```typescript
interface FamilyMilestone {
  id: string                  // 唯一事件 ID
  type: 'personal' | 'family' // 事件类型：personal 个人 / family 家庭
  title: string               // 事件简短标题（核心概括，1-50 字符）
  happenDate: string          // 发生时间 YYYY-MM-DD 或 YYYY-MM（支持模糊日期）
  desc: string                // 事件详细描述（选填，记录细节、成就、感悟）
  isCore: boolean             // 是否为核心高光事件：true = 纳入碑文汇总
  creatorId: string           // 创建人用户 ID
  creatorName: string         // 创建人昵称（后端冗余返回）
  relatedMemberIds: string[]  // 关联家庭成员 ID 数组
  imageList: string[]         // 配图 URL 数组（最多 3 张）
  createTime: string          // 数据创建时间 ISO
  updateTime: string          // 数据更新时间 ISO
}
```

### 2.2 前端表单模型

```typescript
interface MilestoneForm {
  type: 'personal' | 'family'   // 必填
  title: string                 // 必填，1-50 字符
  happenDate: string            // 必填，YYYY-MM-DD 或 YYYY-MM
  desc: string                  // 选填
  isCore: boolean               // 默认 false
  relatedMemberIds: string[]    // 家庭事件可选关联成员
  imageList: string[]           // 选填，最多 3 张
}
```

---

## 三、页面详细设计

### 3.1 大事纪首页（`/milestones`）

**文件：** `views/MilestonesView.vue`

**布局结构：**

```
┌─────────────────────────────┐
│  ← 大事纪          [碑文汇总] │  ← 顶部导航栏
├─────────────────────────────┤
│  [个人大事纪] [家庭大事纪]    │  ← Tab 切换（默认个人）
├─────────────────────────────┤
│                              │
│  ● 2025-10-01                │  ← 时间轴节点
│  │  ⭐ 年薪突破80W            │  ← 核心事件带星标徽章
│  │  达成阶段性职业目标         │
│  │  [img] [img] [img]        │  ← 配图缩略图（最多3张）
│  │  创建人：张三              │
│  │                            │
│  ● 2023-03-20                │
│  │  考取高级专业证书           │  ← 普通事件无星标
│  │  职业能力进阶              │
│  │                            │
│  ● 2020-07-15                │
│     正式入职互联网行业         │
│     开启职业新征程            │
│                              │
├─────────────────────────────┤
│                        [ + ] │  ← 悬浮新增按钮
└─────────────────────────────┘
```

**功能点：**

1. **顶部导航栏**：左侧返回按钮，右侧【碑文汇总】按钮跳转 `/milestones/summary?type=personal|family`
2. **Tab 切换**：`个人大事纪` / `家庭大事纪`，切换时重新加载列表，记住当前 Tab
3. **时间轴列表**：
   - 按 `happenDate` 倒序排列（最新在上）
   - 左侧竖线 + 圆点节点，视觉上形成时间轴
   - 核心事件卡片：左上角带 ⭐ 星标徽章，背景微高亮
   - 普通事件卡片：常规白色卡片
   - 每张卡片展示：标题、发生时间、描述（如有）、配图缩略图（如有）、创建人
   - 点击卡片 → 打开编辑弹窗
   - 长按或左滑卡片 → 显示删除操作（需权限校验）
4. **悬浮新增按钮**：右下角固定，点击打开新增弹窗
5. **空状态**：无事件时展示 `EmptyState` 组件，文案「还没有人生里程碑，记录下你的重要时刻吧」+ 新增按钮
6. **加载状态**：列表加载时展示 `van-loading`

**交互规则：**

- 进入页面默认加载个人大事纪列表
- Tab 切换时如已有缓存数据则直接展示，否则发起请求
- 下拉刷新支持（`van-pull-refresh`）
- 删除操作需二次确认（`showConfirmDialog`）

---

### 3.2 新增/编辑大事纪弹窗（`MilestoneEditDialog.vue`）

**文件：** `components/MilestoneEditDialog.vue`

**弹窗形式：** `van-popup` 底部弹出，圆角，高度自适应

**表单字段：**

| 字段 | 组件 | 必填 | 校验规则 |
|------|------|------|----------|
| 事件归属 | `van-radio-group` | 是 | personal / family 二选一 |
| 发生时间 | `van-date-picker` | 是 | 支持选年月或完整年月日，最大不超过今天 |
| 事件标题 | `van-field` input | 是 | 1-50 字符 |
| 事件详情 | `van-field` textarea | 否 | 最多 500 字符，显示字数统计 |
| 上传配图 | `SelfUpload` | 否 | 最多 3 张，单张 ≤ 5MB |
| 核心高光 | `van-switch` | 否 | 默认关闭，开启后纳入碑文汇总 |

**布局结构：**

```
┌─────────────────────────────┐
│  新增大事纪                   │  ← 标题栏 + 关闭按钮
├─────────────────────────────┤
│  事件归属                     │
│  ○ 个人大事纪  ● 家庭大事纪   │
│                              │
│  发生时间 *                   │
│  [ 2025-10-01        📅 ]    │
│                              │
│  事件标题 *                   │
│  [ 请输入事件标题       ]     │
│                              │
│  事件详情                     │
│  [ 记录细节、成就、感悟 ]     │
│  [                     ] 0/500│
│                              │
│  上传配图（最多3张）          │
│  [📷] [  ] [  ]              │
│                              │
│  ⭐ 纳入碑文汇总   [开关 OFF]  │
│                              │
├─────────────────────────────┤
│  [        保存         ]     │
└─────────────────────────────┘
```

**交互规则：**

- **新增模式**：所有字段初始为空，事件归属默认 `personal`，核心高光默认 `false`
- **编辑模式**：回填原有数据，所有字段可修改
- **事件归属选择 `family` 时**：显示关联成员多选（从家庭成员列表中选择，默认包含创建人）
- **核心高光开关权限控制**：
  - 个人事件：仅本人可切换（`creatorId === currentUserId`）
  - 家庭事件：仅家庭房主可切换（`isOwner === true`）
  - 无权限时开关禁用并显示提示文案
- **提交校验**：标题不能为空、时间不能为空
- **提交防抖**：保存按钮点击后立即禁用，防止重复提交
- **图片上传**：使用 `SelfUpload` 组件，`uploadFn` 调用 `uploadFile(file, 'milestone')`，返回 URL 存入 `imageList`
- **提交成功**：Toast 提示「保存成功」→ 关闭弹窗 → 刷新列表

**组件 Props：**

```javascript
props: {
  show: Boolean,                          // 控制弹窗显示
  mode: 'create' | 'edit',                // 模式
  milestone: FamilyMilestone | null,      // 编辑时传入原数据
  defaultType: 'personal' | 'family'      // 默认事件归属
}
emits: ['update:show', 'saved']           // saved 事件触发列表刷新
```

---

### 3.3 纪事碑文汇总页（`/milestones/summary`）

**文件：** `views/MilestoneSummaryView.vue`

**路由参数：** `?type=personal|family`（默认 personal）

**页面逻辑：**
- 仅展示 `isCore = true` 的核心事件
- 按时间正序排列（从早到晚，符合履历阅读习惯）
- 庄重纪实碑文风格排版

**布局结构：**

```
┌─────────────────────────────┐
│  ← 纪事碑文          [截图]   │  ← 顶部导航 + 截图按钮
├─────────────────────────────┤
│                              │
│     ──────个人纪事碑文──────  │  ← 居中标题
│                              │
│  2020-07-15                  │
│  ｜正式入职互联网行业，        │  ← 时间 | 标题+简述
│  ｜开启职业新征程             │
│                              │
│  2023-03-20                  │
│  ｜考取高级专业证书，          │
│  ｜职业能力进阶               │
│                              │
│  2025-10-01                  │
│  ｜年薪突破80W，              │
│  ｜达成阶段性职业目标          │
│                              │
│     ──────纪事终章──────     │  ← 底部落款
│                              │
├─────────────────────────────┤
│  [    复制碑文文本    ]       │  ← 底部操作
└─────────────────────────────┘
```

**视觉风格：**
- 页面背景：浅米色/浅灰底色（`#faf9f6`），模拟碑文纸张质感
- 标题：居中，较大字号，字间距加宽，使用衬线风格
- 事件条目：等宽对齐，时间用分隔符 `｜` 与内容分隔
- 底部落款：居中，与标题呼应
- 整体留白充足，庄重克制

**核心功能：**

1. **页面截图**：
   - 使用 `html2canvas` 库对页面主体区域截图
   - 截图后生成 PNG，触发浏览器下载
   - 截图按钮显示 loading 状态
   - 安装依赖：`npm install html2canvas`

2. **复制碑文文本**：
   - 将碑文内容拼接为纯文本格式
   - 调用 `navigator.clipboard.writeText()` 复制
   - Toast 提示「已复制到剪贴板」

3. **空状态**：
   - 无核心事件时展示 `EmptyState` 组件
   - 文案「暂未挑选高光里程碑」
   - 提供按钮「去标记核心事件」→ 返回大事纪首页

---

## 四、前端架构

### 4.1 新增目录结构

```
src/packages/has-web/
├── views/
│   ├── MilestonesView.vue           # 新增 - 大事纪首页
│   └── MilestoneSummaryView.vue     # 新增 - 碑文汇总页
├── components/
│   ├── MilestoneEditDialog.vue      # 新增 - 新增/编辑弹窗
│   ├── MilestoneCard.vue            # 新增 - 时间轴卡片
│   └── EmptyState.vue               # 已有 - 复用
├── stores/
│   └── milestone.js                 # 新增 - 大事纪状态管理
├── services/
│   └── milestone.js                 # 新增 - 大事纪接口
├── utils/
│   └── milestone.js                 # 新增 - 大事纪工具函数
├── router/
│   └── index.js                     # 更新 - 新增路由
└── styles/
    └── index.css                    # 更新 - 新增碑文样式
```

### 4.2 Service 层（`services/milestone.js`）

```javascript
import request from './request'

/* ========== 大事纪事件 ========== */

/**
 * 获取大事纪列表
 * @param {string} familyId - 家庭 ID
 * @param {object} params - { type: 'personal'|'family', isCore?: boolean, page?, pageSize? }
 */
export function getMilestoneList(familyId, params) {
  return request.get(`/family/${familyId}/milestones`, { params })
}

/**
 * 获取大事纪详情
 */
export function getMilestoneDetail(familyId, milestoneId) {
  return request.get(`/family/${familyId}/milestones/${milestoneId}`)
}

/**
 * 创建大事纪
 * @param {object} payload - { type, title, happenDate, desc?, isCore, relatedMemberIds?, imageList? }
 */
export function createMilestone(familyId, payload) {
  return request.post(`/family/${familyId}/milestones`, payload)
}

/**
 * 更新大事纪
 */
export function updateMilestone(familyId, milestoneId, payload) {
  return request.put(`/family/${familyId}/milestones/${milestoneId}`, payload)
}

/**
 * 删除大事纪
 */
export function deleteMilestone(familyId, milestoneId) {
  return request.delete(`/family/${familyId}/milestones/${milestoneId}`)
}

/**
 * 切换核心高光标记
 * @param {boolean} isCore - 目标状态
 */
export function toggleMilestoneCore(familyId, milestoneId, isCore) {
  return request.patch(`/family/${familyId}/milestones/${milestoneId}/core`, { isCore })
}

/**
 * 获取碑文汇总（仅核心事件，按时间正序）
 * @param {string} type - 'personal' | 'family'
 */
export function getMilestoneSummary(familyId, type) {
  return request.get(`/family/${familyId}/milestones/summary`, { params: { type } })
}
```

### 4.3 Store 层（`stores/milestone.js`）

```javascript
import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { showSuccessToast, showConfirmDialog } from 'vant'
import {
  getMilestoneList,
  getMilestoneDetail,
  createMilestone,
  updateMilestone,
  deleteMilestone,
  toggleMilestoneCore,
  getMilestoneSummary
} from '@/services/milestone'
import { useFamilyStore } from './family'
import { useAuthStore } from './auth'

export const useMilestoneStore = defineStore('has-web-milestone', () => {
  const personalMilestones = ref([])
  const familyMilestones = ref([])
  const summaryList = ref([])
  const activeTab = ref('personal')   // 'personal' | 'family'
  const loading = ref(false)
  const summaryLoading = ref(false)

  const currentUserId = computed(() => {
    const authStore = useAuthStore()
    return authStore.profile?.id || ''
  })

  const isOwner = computed(() => {
    const familyStore = useFamilyStore()
    return familyStore.isOwner
  })

  const currentList = computed(() => {
    return activeTab.value === 'personal' ? personalMilestones.value : familyMilestones.value
  })

  function getFamilyId() {
    const familyStore = useFamilyStore()
    return familyStore.currentFamilyId
  }

  /* ========== 列表加载 ========== */

  async function loadMilestones(type) {
    const fid = getFamilyId()
    if (!fid) return
    loading.value = true
    try {
      const t = type || activeTab.value
      const response = await getMilestoneList(fid, { type: t, page: 1, pageSize: 100 })
      const data = response.data ?? response
      const list = data.list || []
      if (t === 'personal') {
        personalMilestones.value = list
      } else {
        familyMilestones.value = list
      }
      return data
    } finally {
      loading.value = false
    }
  }

  async function switchTab(type) {
    activeTab.value = type
    const target = type === 'personal' ? personalMilestones.value : familyMilestones.value
    if (target.length === 0) {
      await loadMilestones(type)
    }
  }

  /* ========== 详情 ========== */

  async function loadMilestoneDetail(milestoneId) {
    const fid = getFamilyId()
    if (!fid) return
    const response = await getMilestoneDetail(fid, milestoneId)
    return response.data ?? response
  }

  /* ========== 新增 ========== */

  async function createMilestoneAction(payload) {
    const fid = getFamilyId()
    if (!fid) return
    const response = await createMilestone(fid, payload)
    const data = response.data ?? response
    showSuccessToast('保存成功')
    await loadMilestones(payload.type)
    return data
  }

  /* ========== 编辑 ========== */

  async function updateMilestoneAction(milestoneId, payload) {
    const fid = getFamilyId()
    if (!fid) return
    const response = await updateMilestone(fid, milestoneId, payload)
    const data = response.data ?? response
    showSuccessToast('保存成功')
    await loadMilestones(payload.type || activeTab.value)
    return data
  }

  /* ========== 删除 ========== */

  async function deleteMilestoneAction(milestoneId, type) {
    const fid = getFamilyId()
    if (!fid) return
    await showConfirmDialog({
      title: '确认删除',
      message: '删除后不可恢复，确定要删除这条大事纪吗？'
    })
    await deleteMilestone(fid, milestoneId)
    const list = type === 'personal' ? personalMilestones : familyMilestones
    list.value = list.value.filter((m) => m.id !== milestoneId)
    showSuccessToast('已删除')
  }

  /* ========== 核心标记 ========== */

  async function toggleCoreAction(milestoneId, currentCore, type) {
    const fid = getFamilyId()
    if (!fid) return
    await toggleMilestoneCore(fid, milestoneId, !currentCore)
    const list = type === 'personal' ? personalMilestones : familyMilestones
    const idx = list.value.findIndex((m) => m.id === milestoneId)
    if (idx >= 0) {
      list.value[idx].isCore = !currentCore
    }
    showSuccessToast(currentCore ? '已取消碑文收录' : '已加入碑文汇总')
  }

  /* ========== 碑文汇总 ========== */

  async function loadSummary(type) {
    const fid = getFamilyId()
    if (!fid) return
    summaryLoading.value = true
    try {
      const response = await getMilestoneSummary(fid, type)
      const data = response.data ?? response
      summaryList.value = data.list || []
      return data
    } finally {
      summaryLoading.value = false
    }
  }

  /* ========== 权限判断 ========== */

  function canEdit(milestone) {
    if (!milestone) return false
    // 个人事件：仅本人可编辑
    if (milestone.type === 'personal') {
      return milestone.creatorId === currentUserId.value
    }
    // 家庭事件：创建人或房主可编辑
    return milestone.creatorId === currentUserId.value || isOwner.value
  }

  function canDelete(milestone) {
    return canEdit(milestone)
  }

  function canToggleCore(milestone) {
    if (!milestone) return false
    // 个人事件：仅本人
    if (milestone.type === 'personal') {
      return milestone.creatorId === currentUserId.value
    }
    // 家庭事件：仅房主
    return isOwner.value
  }

  /* ========== 重置 ========== */

  function reset() {
    personalMilestones.value = []
    familyMilestones.value = []
    summaryList.value = []
    activeTab.value = 'personal'
  }

  return {
    personalMilestones,
    familyMilestones,
    summaryList,
    activeTab,
    loading,
    summaryLoading,
    currentList,
    currentUserId,
    isOwner,
    loadMilestones,
    switchTab,
    loadMilestoneDetail,
    createMilestoneAction,
    updateMilestoneAction,
    deleteMilestoneAction,
    toggleCoreAction,
    loadSummary,
    canEdit,
    canDelete,
    canToggleCore,
    reset
  }
})
```

### 4.4 路由配置更新

在 `router/index.js` 新增两条路由：

```javascript
{
  path: '/milestones',
  name: 'Milestones',
  component: () => import('../views/MilestonesView.vue'),
  meta: { title: '家庭大事纪', requiresAuth: true }
},
{
  path: '/milestones/summary',
  name: 'MilestoneSummary',
  component: () => import('../views/MilestoneSummaryView.vue'),
  meta: { title: '纪事碑文', requiresAuth: true }
}
```

### 4.5 首页入口更新

在 `HomeView.vue` 快捷入口区 `fam-action-grid` 中新增大事纪入口：

```html
<div class="fam-action-item" @click="$router.push('/milestones')">
  <div class="fam-action-icon" style="background: #fce7f3; color: #ec4899">
    <van-icon name="medal-o" size="22" />
  </div>
  <span class="fam-action-label">大事纪</span>
</div>
```

> 注意：快捷入口网格从 4 列调整为可容纳 5 项，或改为两行布局。

---

## 五、组件设计

### 5.1 MilestoneCard.vue（时间轴卡片）

```javascript
props: {
  milestone: FamilyMilestone,   // 事件数据
  canEdit: Boolean,             // 是否可编辑
  canDelete: Boolean,           // 是否可删除
  canToggleCore: Boolean        // 是否可切换核心标记
}
emits: ['edit', 'delete', 'toggle-core']
```

**视觉细节：**
- 左侧时间轴竖线（`border-left`）+ 圆点节点
- 核心事件：圆点为金色填充 + 卡片左上角 ⭐ 徽章 + 背景微高亮 `#fffbeb`
- 普通事件：圆点为灰色描边 + 白色背景
- 配图区：横向排列最多 3 张缩略图，点击可全屏预览
- 底部：创建人昵称 + 操作按钮（编辑/删除/核心切换）

### 5.2 MilestoneEditDialog.vue（新增/编辑弹窗）

见 3.2 节详细设计。

**关键实现点：**
- 使用 `van-popup` position="bottom" round
- 表单使用 `van-form` + `van-cell-group`
- 日期选择使用 `van-date-picker`，支持年月模式和年月日模式切换
- 图片上传使用 `SelfUpload` 组件（`@c/SelfUpload.vue`），传入 `uploadFn`
- 核心高光开关根据权限动态禁用

### 5.3 工具函数（`utils/milestone.js`）

```javascript
/**
 * 格式化日期展示
 * @param {string} dateStr - YYYY-MM-DD 或 YYYY-MM
 * @returns {string} 格式化后的日期文本
 */
export function formatHappenDate(dateStr) {
  if (!dateStr) return ''
  const parts = dateStr.split('-')
  if (parts.length === 2) {
    return `${parts[0]}年${parseInt(parts[1])}月`
  }
  if (parts.length === 3) {
    return `${parts[0]}年${parseInt(parts[1])}月${parseInt(parts[2])}日`
  }
  return dateStr
}

/**
 * 碑文文本拼接
 * @param {Array} milestones - 核心事件列表（已按时间正序）
 * @param {string} type - 'personal' | 'family'
 * @returns {string} 纯文本碑文
 */
export function buildSummaryText(milestones, type) {
  const title = type === 'personal' ? '个人纪事碑文' : '家庭纪事碑文'
  const lines = [`——————${title}——————`]
  for (const m of milestones) {
    const desc = m.desc ? `，${m.desc}` : ''
    lines.push(`${m.happenDate}｜${m.title}${desc}`)
  }
  lines.push('——————纪事终章——————')
  return lines.join('\n')
}

/**
 * 校验事件标题
 */
export function validateTitle(title) {
  if (!title || !title.trim()) return '请输入事件标题'
  if (title.length > 50) return '标题不能超过50字'
  return ''
}

/**
 * 校验发生时间
 */
export function validateHappenDate(date) {
  if (!date) return '请选择发生时间'
  const today = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  if (date > todayStr) return '发生时间不能晚于今天'
  return ''
}
```

---

## 六、UI 设计规范

### 6.1 色彩方案

| 用途 | 色值 | Tailwind 类名 |
|------|------|--------------|
| 时间轴竖线 | `#e2e8f0` | `border-slate-200` |
| 普通事件圆点 | `#cbd5e1` | `bg-slate-300` |
| 核心事件圆点 | `#f59e0b` | `bg-amber-500` |
| 核心事件卡片背景 | `#fffbeb` | `bg-amber-50` |
| 星标徽章 | `#f59e0b` | `text-amber-500` |
| 碑文页面背景 | `#faf9f6` | 内联样式 |
| 碑文标题/正文 | `#1e293b` | `text-slate-800` |
| 碑文时间 | `#64748b` | `text-slate-500` |

### 6.2 样式类前缀

- 大事纪首页：`.ms-` 前缀（milestone）
- 碑文汇总页：`.stele-` 前缀（碑文）

### 6.3 碑文页面样式（`styles/index.css` 新增）

```css
/* ===== 纪事碑文汇总页 ===== */
.stele-screen {
  min-height: 100vh;
  background: #faf9f6;
}

.stele-container {
  padding: 32px 24px 48px;
}

.stele-title {
  text-align: center;
  font-size: 20px;
  font-weight: 700;
  color: #1e293b;
  letter-spacing: 4px;
  padding: 16px 0;
  border-top: 2px solid #1e293b;
  border-bottom: 1px solid #cbd5e1;
  margin-bottom: 32px;
}

.stele-item {
  margin-bottom: 24px;
  padding-left: 16px;
  border-left: 2px solid #cbd5e1;
}

.stele-date {
  font-size: 13px;
  color: #64748b;
  margin-bottom: 4px;
  font-family: monospace;
}

.stele-content {
  font-size: 15px;
  color: #1e293b;
  line-height: 1.8;
}

.stele-footer {
  text-align: center;
  font-size: 14px;
  color: #94a3b8;
  letter-spacing: 3px;
  padding: 24px 0;
  border-top: 1px solid #cbd5e1;
  margin-top: 32px;
}
```

---

## 七、权限控制前端实现

### 7.1 权限矩阵

| 操作 | 个人事件 | 家庭事件 |
|------|---------|---------|
| 创建 | 仅本人 | 所有家庭成员 |
| 编辑 | 仅本人 | 创建人 + 房主 |
| 删除 | 仅本人 | 创建人 + 房主 |
| 查看列表 | 同家庭成员只读 | 所有家庭成员 |
| 切换核心标记 | 仅本人 | 仅房主 |

### 7.2 前端权限判断

权限判断逻辑封装在 `stores/milestone.js` 的 `canEdit`、`canDelete`、`canToggleCore` 方法中，组件通过 store 调用：

```javascript
// 在组件中使用
const milestoneStore = useMilestoneStore()

// 判断是否可编辑
const editable = milestoneStore.canEdit(milestone)

// 判断是否可切换核心标记
const canCore = milestoneStore.canToggleCore(milestone)
```

> **注意**：前端权限控制仅为体验优化，最终权限校验由后端接口保证。

---

## 八、截图功能实现

### 8.1 依赖安装

```bash
npm install html2canvas
```

### 8.2 截图实现

```javascript
import html2canvas from 'html2canvas'

async function handleScreenshot() {
  const target = document.querySelector('.stele-container')
  if (!target) return
  screenshotLoading.value = true
  try {
    const canvas = await html2canvas(target, {
      backgroundColor: '#faf9f6',
      scale: 2,                    // 2倍清晰度
      useCORS: true,               // 允许跨域图片
      logging: false
    })
    const link = document.createElement('a')
    link.download = `纪事碑文_${Date.now()}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
    showSuccessToast('截图已保存')
  } catch {
    showToast('截图失败，请重试')
  } finally {
    screenshotLoading.value = false
  }
}
```

---

## 九、开发阶段划分

### 第一阶段：基础设施
1. 创建 `services/milestone.js` 接口层
2. 创建 `stores/milestone.js` 状态管理
3. 创建 `utils/milestone.js` 工具函数
4. 更新路由配置
5. 安装 `html2canvas` 依赖

### 第二阶段：大事纪首页
1. 创建 `MilestonesView.vue` 页面框架
2. 实现 Tab 切换（个人/家庭）
3. 创建 `MilestoneCard.vue` 时间轴卡片组件
4. 实现列表加载、空状态、加载状态
5. 实现下拉刷新
6. 更新 HomeView 首页入口

### 第三阶段：新增/编辑弹窗
1. 创建 `MilestoneEditDialog.vue` 组件
2. 实现表单字段（归属、时间、标题、详情、配图、核心开关）
3. 集成 `SelfUpload` 图片上传
4. 集成 `van-date-picker` 日期选择
5. 实现表单校验 + 防抖提交
6. 实现编辑回填
7. 实现权限控制（核心开关禁用逻辑）

### 第四阶段：碑文汇总页
1. 创建 `MilestoneSummaryView.vue` 页面
2. 实现碑文排版样式
3. 实现 `html2canvas` 截图功能
4. 实现纯文本复制功能
5. 实现空状态

### 第五阶段：交互完善
1. 核心标记快捷切换（卡片上直接操作）
2. 删除二次确认
3. Toast 反馈统一
4. 图片加载失败占位图
5. 整体联调测试

---

## 十、注意事项

### 10.1 TailwindCSS 限制

- spacing 只定义了 `0/2/4/6/8/10/12/16/20/24/28/32`，`14/18` 等需用任意值 `[14px]`
- borderRadius 只有 `sm/md/lg/xl/full`，没有 `2xl`
- colors 全覆盖了默认调色板，`border-transparent` 等需用内联样式或 extend 补充

### 10.2 日期选择器

- Vant 4 的 `van-date-picker` 需配置 `columnsType` 支持年月选择：
  - 年月日：`columnsType: ['year', 'month', 'day']`
  - 仅年月：`columnsType: ['year', 'month']`
- 弹窗中可提供一个「精确到日」开关，控制日期选择器粒度

### 10.3 图片上传

- 复用 `SelfUpload` 组件（`src/shared/components/SelfUpload.vue`）
- `uploadFn` 调用 `services/files.js` 的 `uploadFile(file, 'milestone')`
- 返回的 URL 存入 `imageList` 数组

### 10.4 家庭上下文

- 所有接口依赖 `familyId`，从 `useFamilyStore().currentFamilyId` 获取
- 切换家庭时需重置 milestone store：调用 `reset()`
- 在 `familyStore.switchFamilyAction` 中追加 `milestoneStore.reset()` 调用
