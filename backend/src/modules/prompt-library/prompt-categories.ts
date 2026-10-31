// 提示词分类常量单一来源（2026-10 主题分类体系）。
//
// PROMPT_CATEGORIES 是 5 个流水线基础风格 key：图文流水线（Go categoryHints，
// services/core/internal/graphic/service.go）按此引用模板；主题细分（风格细节标签）仍走 styleTags。
//
// 分类校验已放开为自由字符串（Length(1,64)，与实体 prompt-template.entity.ts varchar(64) 容量
// 一致，sync 轨本就允许自由扩展）——此表不再是校验白名单，而是「常用值 + 中文名」的单一来源：
//   - PROMPT_CATEGORY_LABELS 覆盖 8 key 中文名（5 流水线基础 key + fantasy/starry/xianxia 三个主题 key）；
//   - 前端 frontend/src/api/promptLibrary.ts 的 PROMPT_CATEGORIES 表与本表注释互指，
//     新增常用分类时两端各补一行（暂不做后端下发，避免接口契约变更）。
export const PROMPT_CATEGORIES = ['illustrated', 'poster', 'anime', 'ui', 'general'] as const;

export type PromptCategory = (typeof PROMPT_CATEGORIES)[number];

/** 常用分类中文名：5 个流水线基础 key + 3 个主题分类 key（fantasy 玄幻 / starry 星空 / xianxia 修仙）。 */
export const PROMPT_CATEGORY_LABELS: Record<string, string> = {
  illustrated: '插画绘本',
  poster: '海报设计',
  anime: '动漫',
  ui: 'UI 界面',
  general: '通用',
  fantasy: '玄幻',
  starry: '星空',
  xianxia: '修仙'
};
