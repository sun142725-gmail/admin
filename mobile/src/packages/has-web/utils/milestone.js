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
 * 格式化简短日期（时间轴用）
 * @param {string} dateStr - YYYY-MM-DD 或 YYYY-MM
 * @returns {string} 如 2025.10 或 2025.10.01
 */
export function formatHappenDateShort(dateStr) {
  if (!dateStr) return ''
  return dateStr.replaceAll('-', '.')
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
    const desc = m.desc ? `,${m.desc}` : ''
    lines.push(`${m.happenDate}|${m.title}${desc}`)
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
