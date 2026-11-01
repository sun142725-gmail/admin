// 角色参考图合并纯函数：去重合并 + 上限截断（≤4 张，与后端 DTO ArrayMaxSize、
// 上游 images/edits 参考图上限一致）。上传多选合并 / 已有图追加新图共用。
export const MAX_CHARACTER_REFERENCE_IMAGES = 4;

export const mergeReferenceImages = (
  existing: Array<string | null | undefined>,
  added: Array<string | null | undefined>,
  max = MAX_CHARACTER_REFERENCE_IMAGES
): string[] => {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const raw of [...(existing ?? []), ...(added ?? [])]) {
    const url = (raw ?? '').trim();
    if (!url || seen.has(url)) {
      continue;
    }
    seen.add(url);
    merged.push(url);
    if (merged.length >= max) {
      break;
    }
  }
  return merged;
};
