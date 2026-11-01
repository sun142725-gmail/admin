// 分镜提示词合成纯函数：首帧图 / 视频运动的提示词由多个片段拼接而成，
// 拆成无副作用的纯函数便于单测（AGENTS 规则 4：可测逻辑与网络层分离）。

export interface ShotImagePromptInput {
  // 分镜画面提示词（英文，LLM 分镜产出）。
  scenePrompt: string;
  // 角色外观描述串（角色卡 `Name: appearance`，主角色在前），保证多镜头角色形象一致；缺省/空数组不输出。
  characterDescriptions?: Array<string | null | undefined>;
  // 视觉任务（本镜要传达的关键信息，可空）。
  visualTask?: string | null;
  // 全片风格提示词（项目级，可空）。
  stylePrompt?: string | null;
}

export interface ShotMotionPromptInput {
  // 镜头运动提示词（英文）。
  motionPrompt: string;
  // 推进方式（中文短语，如「缓慢推进」，可空）。
  progression?: string | null;
  // 视频生成模式：i2v 首帧图生视频 / t2v 文生视频。
  shotMode?: string | null;
}

// i2v 模式的运动提示词后缀：要求生成画面与首帧图保持一致。
export const I2V_MOTION_SUFFIX =
  'The video must start from and stay visually consistent with the provided first frame image.';

/** 归一化一个提示词片段：去首尾空白与多余标点分隔符，空段返回 null。 */
const normalizeSegment = (raw: string | null | undefined): string | null => {
  const text = (raw ?? '').trim().replace(/^[,，、.。\s]+|[,，、.。\s]+$/g, '');
  return text || null;
};

/**
 * 合成首帧图提示词：scenePrompt + characterDescriptions（逐条展平）+ visualTask + stylePrompt 依次拼接。
 * 规则：空段跳过；重复段（完全一致，忽略首尾空白）只保留一次；逗号连接；
 * characterDescriptions 缺省/空数组时输出与未引入该参数前逐字节一致。
 */
export const composeShotImagePrompt = (input: ShotImagePromptInput): string => {
  const segments = [
    input.scenePrompt,
    ...(input.characterDescriptions ?? []),
    input.visualTask,
    input.stylePrompt
  ]
    .map(normalizeSegment)
    .filter((segment): segment is string => segment !== null);
  const unique = [...new Set(segments)];
  return unique.join(', ');
};

/**
 * 合成视频运动提示词：motionPrompt + progression 拼接；
 * shotMode === 'i2v' 时追加首帧一致性后缀（t2v 或缺省走 i2v 语义由调用方保证）。
 */
export const composeShotMotionPrompt = (input: ShotMotionPromptInput): string => {
  const segments = [input.motionPrompt, input.progression]
    .map(normalizeSegment)
    .filter((segment): segment is string => segment !== null);
  const unique = [...new Set(segments)];
  if ((input.shotMode ?? 'i2v') === 'i2v') {
    unique.push(I2V_MOTION_SUFFIX);
  }
  return unique.join(', ');
};
