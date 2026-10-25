<template>
  <div class="page-screen">
    <!-- 顶部导航 -->
    <van-nav-bar
      title="家庭大事纪"
      left-arrow
      @click-left="$router.back()"
      fixed
      placeholder
    >
      <template #right>
        <span class="text-sm text-primary-500 font-medium press" @click="goSummary">碑文汇总</span>
      </template>
    </van-nav-bar>

    <!-- Tab 切换 -->
    <van-tabs v-model:active="activeTabName" shrink @change="onTabChange">
      <van-tab title="个人大事纪" name="personal" />
      <van-tab title="家庭大事纪" name="family" />
    </van-tabs>

    <!-- 列表区 -->
    <van-pull-refresh v-model="refreshing" @refresh="onRefresh" class="ms-list-wrap">
      <!-- 加载中 -->
      <div v-if="milestoneStore.loading && !currentList.length" class="flex justify-center py-64">
        <van-loading size="24" color="#0ea5e9">加载中...</van-loading>
      </div>

      <!-- 空状态 -->
      <base-empty
        v-else-if="!currentList.length"
        icon="medal-o"
        :icon-size="56"
        icon-color="#a9b1bf"
        :description="activeTabName === 'personal' ? '还没有人生里程碑，记录下你的重要时刻吧' : '还没有家庭大事纪，记录家庭的珍贵瞬间'"
        :show-button="true"
        button-text="记录大事纪"
        @click="openCreate"
      />

      <!-- 时间轴列表 -->
      <div v-else class="px-16 pt-12 pb-80">
        <MilestoneCard
          v-for="item in currentList"
          :key="item.id"
          :milestone="item"
          :can-edit="milestoneStore.canEdit(item)"
          :can-delete="milestoneStore.canDelete(item)"
          :can-toggle-core="milestoneStore.canToggleCore(item)"
          @edit="openEdit"
          @delete="handleDelete"
          @toggle-core="handleToggleCore"
        />
      </div>
    </van-pull-refresh>

    <!-- 悬浮新增按钮 -->
    <div
      class="ms-fab fab-right press"
      role="button"
      aria-label="新增大事纪"
      @click="openCreate"
    >
      <van-icon name="plus" size="24" color="#fff" />
    </div>

    <!-- 新增/编辑弹窗 -->
    <MilestoneEditDialog
      v-model:show="showEdit"
      :mode="editMode"
      :milestone="editingMilestone"
      :default-type="activeTabName"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useMilestoneStore } from '@/stores/milestone'
import { useFamilyStore } from '@/stores/family'
import MilestoneCard from '@/components/MilestoneCard.vue'
import MilestoneEditDialog from '@/components/MilestoneEditDialog.vue'

const router = useRouter()
const milestoneStore = useMilestoneStore()
const familyStore = useFamilyStore()

const refreshing = ref(false)
const showEdit = ref(false)
const editMode = ref('create')
const editingMilestone = ref(null)

const activeTabName = computed({
  get: () => milestoneStore.activeTab,
  set: () => {}
})

const currentList = computed(() => milestoneStore.currentList)

function onTabChange(name) {
  milestoneStore.switchTab(name)
}

async function onRefresh() {
  refreshing.value = true
  try {
    await milestoneStore.loadMilestones(milestoneStore.activeTab)
  } finally {
    refreshing.value = false
  }
}

function openCreate() {
  editMode.value = 'create'
  editingMilestone.value = null
  showEdit.value = true
}

function openEdit(milestone) {
  editMode.value = 'edit'
  editingMilestone.value = { ...milestone }
  showEdit.value = true
}

async function handleDelete(milestone) {
  try {
    await milestoneStore.deleteMilestoneAction(milestone.id, milestone.type)
  } catch {
    // 用户取消或删除失败
  }
}

async function handleToggleCore(milestone) {
  try {
    await milestoneStore.toggleCoreAction(milestone.id, milestone.isCore, milestone.type)
  } catch {
    // 操作失败
  }
}

function goSummary() {
  router.push(`/milestones/summary?type=${milestoneStore.activeTab}`)
}

onMounted(async () => {
  if (!familyStore.currentFamilyId) {
    try {
      await familyStore.loadFamilies()
    } catch {
      // ignore
    }
  }
  if (familyStore.currentFamilyId) {
    await milestoneStore.loadMilestones('personal')
  }
})
</script>

<style scoped>
.ms-list-wrap {
  min-height: calc(100vh - 90px);
}

/* 悬浮按钮：高度避让 tabbar + 手势条；宽屏时由 shell 的 .fab-right 约束到列内 */
.ms-fab {
  position: fixed;
  right: 20px;
  bottom: calc(var(--van-tabbar-height, 56px) + env(safe-area-inset-bottom, 0px) + 16px);
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: linear-gradient(135deg, theme('colors.primary.500'), theme('colors.primary.600'));
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 16px rgba(14, 165, 233, 0.4); /* primary 投影 */
  z-index: 10;
}

.ms-fab:active {
  transform: scale(0.92);
}
</style>
