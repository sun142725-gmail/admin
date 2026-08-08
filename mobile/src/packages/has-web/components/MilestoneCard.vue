<template>
  <div class="ms-card" :class="{ 'ms-card--core': milestone.isCore }" @click="$emit('edit', milestone)">
    <!-- 时间轴节点 -->
    <div class="ms-card-dot" :class="milestone.isCore ? 'ms-card-dot--core' : ''"></div>

    <div class="ms-card-body">
      <!-- 顶部：时间 + 星标 -->
      <div class="ms-card-header">
        <span class="ms-card-date">{{ formatHappenDateShort(milestone.happenDate) }}</span>
        <div class="ms-card-badges">
          <span v-if="milestone.isCore" class="ms-card-star">
            <van-icon name="star" size="14" color="#f59e0b" />
          </span>
          <span class="ms-card-type" :class="milestone.type === 'personal' ? 'ms-card-type--personal' : 'ms-card-type--family'">
            {{ milestone.type === 'personal' ? '个人' : '家庭' }}
          </span>
        </div>
      </div>

      <!-- 标题 -->
      <h4 class="ms-card-title">{{ milestone.title }}</h4>

      <!-- 详情 -->
      <p v-if="milestone.desc" class="ms-card-desc">{{ milestone.desc }}</p>

      <!-- 配图 -->
      <div v-if="milestone.imageList?.length" class="ms-card-images">
        <div
          v-for="(img, i) in milestone.imageList"
          :key="i"
          class="ms-card-img-wrap"
          @click.stop="onPreview(milestone.imageList, i)"
        >
          <img :src="img" class="ms-card-img" />
        </div>
      </div>

      <!-- 底部操作栏 -->
      <div class="ms-card-footer">
        <span class="ms-card-creator">{{ milestone.creatorName }}</span>
        <div class="ms-card-actions" @click.stop>
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
  background: #e2e8f0;
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
  border: 2px solid #cbd5e1;
  z-index: 1;
}

.ms-card-dot--core {
  background: #f59e0b;
  border-color: #f59e0b;
}

.ms-card-body {
  background: #fff;
  border-radius: 12px;
  padding: 14px;
  margin-bottom: 10px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.03);
}

.ms-card--core .ms-card-body {
  background: #fffbeb;
  box-shadow: 0 2px 12px rgba(245, 158, 11, 0.08);
}

.ms-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.ms-card-date {
  font-size: 12px;
  color: #64748b;
  font-family: monospace;
  font-weight: 500;
}

.ms-card-badges {
  display: flex;
  align-items: center;
  gap: 6px;
}

.ms-card-star {
  display: flex;
  align-items: center;
}

.ms-card-type {
  font-size: 10px;
  padding: 1px 6px;
  border-radius: 4px;
  font-weight: 500;
}

.ms-card-type--personal {
  background: #e0f2fe;
  color: #0ea5e9;
}

.ms-card-type--family {
  background: #f0fdf4;
  color: #16a34a;
}

.ms-card-title {
  font-size: 15px;
  font-weight: 600;
  color: #1e293b;
  line-height: 1.4;
}

.ms-card-desc {
  font-size: 13px;
  color: #64748b;
  line-height: 1.5;
  margin-top: 4px;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.ms-card-images {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

.ms-card-img-wrap {
  width: 64px;
  height: 64px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
}

.ms-card-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.ms-card-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid #f1f5f9;
}

.ms-card-creator {
  font-size: 11px;
  color: #94a3b8;
}

.ms-card-actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ms-card-action {
  display: flex;
  align-items: center;
  gap: 3px;
  font-size: 11px;
  color: #64748b;
  cursor: pointer;
}

.ms-card-action:active {
  opacity: 0.6;
}

.ms-card-action--active {
  color: #f59e0b;
  font-weight: 500;
}

.ms-card-action--danger {
  color: #ef4444;
}
</style>
