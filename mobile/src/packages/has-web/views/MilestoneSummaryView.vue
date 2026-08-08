<template>
  <div class="stele-screen">
    <!-- 顶部导航 -->
    <van-nav-bar
      :title="pageTitle"
      left-arrow
      @click-left="$router.back()"
      fixed
      placeholder
    >
      <template #right>
        <van-icon
          name="photo-o"
          size="20"
          color="#0ea5e9"
          @click="handleScreenshot"
        />
      </template>
    </van-nav-bar>

    <!-- 类型切换 -->
    <van-tabs v-model:active="summaryType" shrink @change="onTypeChange">
      <van-tab title="个人碑文" name="personal" />
      <van-tab title="家庭碑文" name="family" />
    </van-tabs>

    <!-- 加载中 -->
    <div v-if="milestoneStore.summaryLoading && !milestoneStore.summaryList.length" class="stele-loading">
      <van-loading size="24" color="#0ea5e9">加载中...</van-loading>
    </div>

    <!-- 空状态 -->
    <base-empty
      v-else-if="!milestoneStore.summaryList.length"
      icon="star-o"
      :icon-size="56"
      icon-color="#cbd5e1"
      description="暂未挑选高光里程碑"
      :show-button="true"
      button-text="去标记核心事件"
      @click="$router.push('/milestones')"
    />

    <!-- 碑文内容 -->
    <div v-else ref="steleRef" class="stele-container">
      <!-- 顶部标题 -->
      <div class="stele-title">
        {{ summaryType === 'personal' ? '个人纪事碑文' : '家庭纪事碑文' }}
      </div>

      <!-- 事件列表 -->
      <div class="stele-list">
        <div
          v-for="item in milestoneStore.summaryList"
          :key="item.id"
          class="stele-item"
        >
          <div class="stele-date">{{ item.happenDate }}</div>
          <div class="stele-content">
            <span class="stele-sep">|</span>
            <span class="stele-text">{{ item.title }}</span>
            <span v-if="item.desc" class="stele-desc">,{{ item.desc }}</span>
          </div>
        </div>
      </div>

      <!-- 底部落款 -->
      <div class="stele-footer">纪事终章</div>
    </div>

    <!-- 底部操作 -->
    <div v-if="milestoneStore.summaryList.length" class="stele-actions">
      <base-button block round plain type="primary" @click="handleCopyText">
        复制碑文文本
      </base-button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { showToast, showSuccessToast } from 'vant'
import html2canvas from 'html2canvas'
import { useMilestoneStore } from '@/stores/milestone'
import { useFamilyStore } from '@/stores/family'
import { buildSummaryText } from '@/utils/milestone'

const route = useRoute()
const milestoneStore = useMilestoneStore()
const familyStore = useFamilyStore()

const steleRef = ref(null)
const summaryType = ref(route.query.type || 'personal')

const pageTitle = ref('纪事碑文')

function onTypeChange(name) {
  milestoneStore.loadSummary(name)
}

async function handleScreenshot() {
  if (!steleRef.value) return
  try {
    const canvas = await html2canvas(steleRef.value, {
      backgroundColor: '#faf9f6',
      scale: 2,
      useCORS: true,
      logging: false
    })
    const link = document.createElement('a')
    link.download = `纪事碑文_${Date.now()}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
    showSuccessToast('截图已保存')
  } catch {
    showToast('截图失败，请重试')
  }
}

async function handleCopyText() {
  const text = buildSummaryText(milestoneStore.summaryList, summaryType.value)
  try {
    await navigator.clipboard.writeText(text)
    showSuccessToast('已复制到剪贴板')
  } catch {
    showToast('复制失败，请手动选择文本')
  }
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
    await milestoneStore.loadSummary(summaryType.value)
  }
})
</script>

<style scoped>
.stele-screen {
  min-height: 100vh;
  background: #faf9f6;
}

.stele-loading {
  display: flex;
  justify-content: center;
  padding: 60px 0;
}

.stele-container {
  padding: 24px 24px 32px;
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
  margin-bottom: 28px;
}

.stele-list {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.stele-item {
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
  display: flex;
  align-items: flex-start;
  gap: 4px;
}

.stele-sep {
  color: #94a3b8;
  flex-shrink: 0;
}

.stele-text {
  font-weight: 500;
}

.stele-desc {
  color: #64748b;
}

.stele-footer {
  text-align: center;
  font-size: 14px;
  color: #94a3b8;
  letter-spacing: 3px;
  padding: 20px 0;
  border-top: 1px solid #cbd5e1;
  margin-top: 28px;
}

.stele-actions {
  padding: 0 24px 32px;
}
</style>
