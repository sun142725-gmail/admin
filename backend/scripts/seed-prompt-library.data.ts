// 玄幻/星空/修仙主题示例种子数据（curated，9 条起步）。
//
// 版权口径：全部为原创仿写（沿用 commit 922975e 的版权纪律）——只借「风格描述：{{content}}。
// 要点，要点，构图/氛围。」的通用句式与既有官方示例（官方 5 条为水彩绘本/日系赛璐璐/新海诚
// 夜景/扁平海报/UI 界面，见 prompt-mojibake.util.spec.ts 审计锚点）的栏目格式，文案逐字原创，
// 不复刻任何第三方作品的具体描述文本。
//
// 结构约定（与 prompt-template.entity.ts 容量对齐，seed-prompt-library.util.spec.ts 逐条自检）：
//   name 非空 ≤128 / category ∈ {fantasy,starry,xianxia} 且 ≤64 / template 含 {{content}} 且 1..8000 /
//   styleTags 非空 ≤255 / source='官方示例' ≤64 / negativePrompt 可选 ≤2000。
// 不配 exampleImageUrl/sourceModel：种子不触网（AGENTS 离线纪律），示例图可后续在页面补传。
export interface SeedPromptTemplateItem {
  name: string;
  category: string;
  styleTags: string;
  template: string;
  negativePrompt?: string;
  source: string;
}

export const SEED_PROMPT_TEMPLATES: SeedPromptTemplateItem[] = [
  // ---------- fantasy 玄幻 ----------
  {
    name: '玄幻大陆场景',
    category: 'fantasy',
    styleTags: '玄幻,东方玄幻,宗门,云海,金光,广角构图,电影感',
    template:
      '玄幻大陆场景：{{content}}。东方玄幻风格，巍峨宗门山门与云海翻涌，金光瑞霭，巨石古殿，气势磅礴，电影感广角构图，16:9。',
    source: '官方示例'
  },
  {
    name: '玄幻战斗瞬间',
    category: 'fantasy',
    styleTags: '玄幻,战斗,剑气,法术光效,动态构图,国漫',
    template:
      '玄幻战斗瞬间：{{content}}。剑气纵横，法术光效与碎石飞溅，动态构图，强对比光影，国漫画风，细节丰富。',
    negativePrompt: '低质量, 模糊, 变形, 多余肢体, 文字水印, 剪裁不当',
    source: '官方示例'
  },
  {
    name: '玄幻神兽昂首',
    category: 'fantasy',
    styleTags: '玄幻,神兽,雷光,鳞甲金纹,仰视构图,史诗感',
    template:
      '玄幻神兽：{{content}}。上古神兽昂首于云巅，鳞甲金纹，周身雷光缠绕，史诗感，低角度仰视构图。',
    source: '官方示例'
  },
  // ---------- starry 星空 ----------
  {
    name: '星空夜景银河',
    category: 'starry',
    styleTags: '星空,银河,星云,夜景,倒影,长曝光,宁静',
    template:
      '星空夜景：{{content}}。浩瀚银河横贯天际，紫蓝渐变星云，剪影山峦与湖面倒影，长曝光质感，宁静深邃，16:9。',
    source: '官方示例'
  },
  {
    name: '科幻星空舰船',
    category: 'starry',
    styleTags: '科幻,星空,舰船,行星环,概念设计,冷色调',
    template:
      '科幻星空舰船：{{content}}。巨舰悬停于星云边缘，舷灯点点，行星环远景，硬核科幻概念设计，冷色调。',
    source: '官方示例'
  },
  {
    name: '梦境星空人物',
    category: 'starry',
    styleTags: '星空,梦境,人物,星尘,唯美,治愈系',
    template:
      '梦境星空人物：{{content}}。人物仰望星空，发丝与衣袂融入星尘，唯美插画风格，柔和光晕，治愈系氛围。',
    source: '官方示例'
  },
  // ---------- xianxia 修仙 ----------
  {
    name: '修仙水墨山水',
    category: 'xianxia',
    styleTags: '修仙,水墨,山水,云栈,飞瀑,留白,宣纸质感',
    template:
      '修仙山水：{{content}}。水墨晕染仙侠山水，孤峰云栈，飞瀑灵泉，鹤影松涛，留白意境，宣纸质感。',
    source: '官方示例'
  },
  {
    name: '修仙御剑破云',
    category: 'xianxia',
    styleTags: '修仙,御剑,白衣修士,国风,赛璐璐,动感',
    template:
      '修仙者御剑：{{content}}。白衣修士御剑破云，衣袂翻飞，远山如芥子，国风赛璐璐上色，动感十足。',
    source: '官方示例'
  },
  {
    name: '宗门洞府灵池',
    category: 'xianxia',
    styleTags: '修仙,洞府,灵池,符文,国风幻想,幽静',
    template:
      '宗门洞府：{{content}}。灵气氤氲的洞天福地，古莲灵池，符文石壁微光，幽静神秘，国风幻想插画。',
    negativePrompt: '低质量, 模糊, 变形, 多余肢体, 文字水印, 剪裁不当',
    source: '官方示例'
  }
];
