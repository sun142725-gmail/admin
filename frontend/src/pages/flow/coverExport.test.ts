// 封面导出选档纯函数单测：验证候选档序列与「首个不超上限」/「全超限兜底」决策，不依赖 canvas。
import { describe, expect, it } from 'vitest';
import { coverExportCandidates, MAX_COVER_UPLOAD_BYTES, pickCoverExportCandidate } from './coverExport';

describe('coverExportCandidates', () => {
  it('默认档序列：原尺寸 PNG 打头，其后为各缩放档 × JPEG 质量档', () => {
    const candidates = coverExportCandidates();
    expect(candidates[0]).toEqual({ scale: 1, quality: null });
    // 缩放档 3 档 × 质量档 4 档 = 12 个 JPEG 档。
    expect(candidates).toHaveLength(13);
    expect(candidates.filter((candidate) => candidate.quality === null)).toHaveLength(1);
    expect(candidates.map((candidate) => candidate.scale)).toEqual([
      1, 1, 1, 1, 1, 0.75, 0.75, 0.75, 0.75, 0.5, 0.5, 0.5, 0.5
    ]);
  });

  it('支持自定义缩放与质量档', () => {
    const candidates = coverExportCandidates([1, 0.5], [0.8]);
    expect(candidates).toEqual([
      { scale: 1, quality: null },
      { scale: 1, quality: 0.8 },
      { scale: 0.5, quality: 0.8 }
    ]);
  });
});

describe('pickCoverExportCandidate', () => {
  const measured = (bytesList: number[]) =>
    bytesList.map((bytes, index) => ({
      candidate: { scale: index === 0 ? 1 : 0.5, quality: index === 0 ? null : 0.65 },
      bytes
    }));

  it('空序列返回 null（组件侧转为「封面导出失败」错误）', () => {
    expect(pickCoverExportCandidate([])).toBeNull();
  });

  it('原尺寸 PNG 未超上限：直接选中首档', () => {
    const chosen = pickCoverExportCandidate(measured([MAX_COVER_UPLOAD_BYTES, 100, 50]));
    expect(chosen?.bytes).toBe(MAX_COVER_UPLOAD_BYTES);
    expect(chosen?.candidate.quality).toBeNull();
  });

  it('PNG 超限：按序选中首个不超上限的 JPEG 档', () => {
    const overLimit = MAX_COVER_UPLOAD_BYTES + 1;
    const chosen = pickCoverExportCandidate(measured([overLimit, overLimit, 1500, 800]));
    expect(chosen?.bytes).toBe(1500);
    expect(chosen?.candidate.quality).toBe(0.65);
  });

  it('全部超限：兜底最后一个成功档（让上传尝试继续而非静默失败）', () => {
    const overLimit = MAX_COVER_UPLOAD_BYTES + 1;
    const chosen = pickCoverExportCandidate(measured([overLimit, overLimit, overLimit]));
    expect(chosen?.bytes).toBe(overLimit);
    expect(chosen?.candidate).toEqual({ scale: 0.5, quality: 0.65 });
  });

  it('恰好等于上限视为可用（≤ 语义，与服务端 limits.fileSize 拒绝 > 对齐）', () => {
    const chosen = pickCoverExportCandidate(measured([MAX_COVER_UPLOAD_BYTES]));
    expect(chosen?.bytes).toBe(MAX_COVER_UPLOAD_BYTES);
  });
});
