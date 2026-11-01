// 封面导出选档纯函数：canvas.toBlob 依赖 DOM 无法离线测，把「按候选序选出首个不超上传上限的档、
// 全超限兜底最后一个档」的决策抽成纯函数（vitest 覆盖），组件只负责逐档渲染出 blob。
// 背景：files/upload 硬限 fileSize 2MB（files.controller.ts），而封面导出尺寸随底图（生图首帧
// 1024²+ 或本地上传大图），PNG 常超限；coverUrl 只存 URL 不要求 PNG，故超限时降质转 JPEG。

/** 与 backend files.controller.ts 的 limits.fileSize 保持一致。 */
export const MAX_COVER_UPLOAD_BYTES = 2 * 1024 * 1024;

export interface CoverExportCandidate {
  /** 绘制缩放档：1 = 原尺寸，<1 经离屏 canvas 等比缩小重绘。 */
  scale: number;
  /** 导出质量：null = PNG 无损；0~1 = JPEG 质量。 */
  quality: number | null;
}

export interface CoverExportMeasured {
  candidate: CoverExportCandidate;
  bytes: number;
}

/** 候选档序列：原尺寸 PNG → 原尺寸 JPEG 质量档 → 缩档 × 质量档（字节随缩放近平方级下降）。 */
export const coverExportCandidates = (
  scales: number[] = [1, 0.75, 0.5],
  qualities: number[] = [0.92, 0.85, 0.75, 0.65]
): CoverExportCandidate[] => [
  { scale: 1, quality: null },
  ...scales.flatMap((scale) => qualities.map((quality) => ({ scale, quality })))
];

/** 按候选序选出首个 ≤ 上限的档；全超限返回最后一个成功档（最小档兜底，尽量让上传成功）。泛型保留调用方的扩展字段（如 blob）。 */
export const pickCoverExportCandidate = <T extends CoverExportMeasured>(measured: T[]): T | null => {
  if (measured.length === 0) {
    return null;
  }
  return measured.find((item) => item.bytes <= MAX_COVER_UPLOAD_BYTES) ?? measured[measured.length - 1];
};
