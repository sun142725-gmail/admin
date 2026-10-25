<template>
  <div class="ms-card" :class="{ 'ms-card--core': milestone.isCore }" @click="$emit('edit', milestone)">
    <!-- 时间轴节点 -->
    <div class="ms-card-dot" :class="milestone.isCore ? 'ms-card-dot--core' : ''"></div>

    <div class="ms-card-body press">
      <!-- 顶部：时间 + 星标 -->
      <div class="flex items-center justify-between mb-6">
        <span class="text-sm text-gray-500 font-mono font-medium">{{ formatHappenDateShort(milestone.happenDate) }}</span>
        <div class="flex items-center gap-6">
          <span v-if="milestone.isCore" class="flex items-center">
            <van-icon name="star" size="14" color="#ff7d00" />
          </span>
          <span
            class="text-xs px-6 py-1 rounded font-medium"
            :class="milestone.type === 'personal' ? 'bg-primary-100 text-primary-500' : 'bg-chip-green-bg text-chip-green-fg'"
          >
            {{ milestone.type === 'personal' ? '个人' : '家庭' }}
          </span>
        </div>
      </div>

      <!-- 标题 -->
      <h4 class="text-base font-semibold text-gray-800 leading-normal">{{ milestone.title }}</h4>

      <!-- 详情 -->
      <p v-if="milestone.desc" class="text-sm text-gray-500 leading-relaxed mt-4 text-ellipsis-2">{{ milestone.desc }}</p>

      <!-- 配图 -->
      <div v-if="milestone.imageList?.length" class="flex gap-6 mt-8 overflow-x-auto">
        <div
          v-for="(img, i) in milestone.imageList"
          :key="i"
          class="w-64 h-64 rounded-md overflow-hidden flex-shrink-0"
          @click.stop="onPreview(milestone.imageList, i)"
        >
          <img :src="img" class="w-full h-full object-cover" alt="大事纪配图" />
        </div>
      </div>

      <!-- 底部操作栏 -->
      <div class="flex items-center justify-between mt-10 pt-8 border-t border-gray-50">
        <span class="text-xs text-gray-400">{{ milestone.creatorName }}</span>
        <div class="flex items-center gap-12" @click.stop>
          <!-- 核心标记切换 -->
          <span
            v-if="canToggleCore"
            class="ms-card-action"
            :class="{ 'ms-card-action--active': milestone.isCore }"
            @click="$emit('toggle-core', milestone)"
          >
            <van-icon :name="milestone.isCore ? 'star' : 'star-o'" size="14" />
            {{ milestone.isCore ? '已收录' : '入碑文' }}
          </span>
          <!-- 编辑 -->
          <span v-if="canEdit" class="ms-card-action" @click="$emit('edit', milestone)">
            <van-icon name="edit" size="14" />
            编辑
          </span>
          <!-- 删除 -->
          <span v-if="canDelete" class="ms-card-action ms-card-action--danger" @click="$emit('delete', milestone)">
            <van-icon name="delete-o" size="14" />
            删除
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { showImagePreview } from 'vant'
import { formatHappenDateShort } from '@/utils/milestone'

const props = defineProps({
  milestone: { type: Object, required: true },
  canEdit: { type: Boolean, default: false },
  canDelete: { type: Boolean, default: false },
  canToggleCore: { type: Boolean, default: false }
})

defineEmits(['edit', 'delete', 'toggle-core'])

function onPreview(images, start) {
  showImagePreview({ images, startPosition: start })
}
</script>

<style scoped>
.ms-card {
  position: relative;
  padding-left: 24px;
  margin-bottom: 4px;
}

/* 时间轴竖线 */
.ms-card::before {
  content: '';
  position: absolute;
  left: 7px;
  top: 0;
  bottom: -4px;
  width: 2px;
  background: theme('colors.gray.200');
}

.ms-card:last-child::before {
  display: none;
}

/* 时间轴圆点 */
.ms-card-dot {
  position: absolute;
  left: 2px;
  top: 4px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  border: 2px solid theme('colors.gray.300');
  z-index: 1;
}

.ms-card-dot--core {
  background: theme('colors.warning');
  border-color: theme('colors.warning');
}

.ms-card-body {
  background: #fff;
  border-radius: theme('borderRadius.lg');
  padding: 14px;
  margin-bottom: 10px;
  box-shadow: theme('boxShadow.card');
}

.ms-card--core .ms-card-body {
  background: theme('colors.chip.orange.bg');
  box-shadow: 0 2px 12px rgba(255, 125, 0, 0.08); /* warning 投影 */
}

.ms-card-action {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: theme('fontSize.xs');
  color: theme('colors.gray.500');
  cursor: pointer;
  padding: 4px 0;
}

.ms-card-action:active {
  opacity: 0.6;
}

.ms-card-action--active {
  color: theme('colors.warning');
  font-weight: 500;
}

.ms-card-action--danger {
  color: theme('colors.danger');
}
</style>
