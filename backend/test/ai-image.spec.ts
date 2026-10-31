// AiImageService 单元测试：纯 DI stub，不起 HTTP/DB/Nest 容器（AGENTS 规则 1，照
// internal-ai.service.spec.ts 先例）。覆盖：参考图 data URL 校验纯函数白名单口径、
// generate 对 adapter.images 的参考图透传（图生图链路）、不带参考图不污染 generations 通道、
// 候选无 images 方法时跳过切下一候选（既有故障转移行为防回归）。
// data URL 落盘 mock：persistDataUrl 写 process.cwd()/uploads/ai-images，用例断言调用与返回短路径
jest.mock('fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined)
}));
import { mkdir, writeFile } from 'fs/promises';
import { AiImageService } from '../src/modules/ai/image/image.service';
import { GenerateImageDto, isValidReferenceDataUrl } from '../src/modules/ai/image/dto/image.dto';
import { ModelRouterService, RoutedCandidate } from '../src/modules/ai/core/model-router.service';
import { UsageLogService } from '../src/modules/ai/core/usage-log.service';
import { AiModel } from '../src/common/entities/ai-model.entity';
import { AiImage } from '../src/common/entities/ai-image.entity';
import { LlmAdapter } from '../src/modules/ai/core/llm-adapter.interface';
import { Repository } from 'typeorm';

describe('isValidReferenceDataUrl（参考图 data URL 校验纯函数）', () => {
  it('合法 png/jpeg/jpg/webp data URL 放行', () => {
    expect(isValidReferenceDataUrl('data:image/png;base64,iVBORw0KGgo=')).toBe(true);
    expect(isValidReferenceDataUrl('data:image/jpeg;base64,/9j/4AAQ')).toBe(true);
    expect(isValidReferenceDataUrl('data:image/jpg;base64,/9j/4AAQ')).toBe(true);
    expect(isValidReferenceDataUrl('data:image/webp;base64,UklGRh4A')).toBe(true);
  });

  it('非白名单 MIME / 非法形态 / 非字符串一律拒绝', () => {
    expect(isValidReferenceDataUrl('data:image/gif;base64,R0lGODlh')).toBe(false); // gif 不收
    expect(isValidReferenceDataUrl('data:text/html;base64,PGgxPg==')).toBe(false); // 非图片 MIME
    expect(isValidReferenceDataUrl('data:image/png,iVBORw0KGgo=')).toBe(false); // 缺 base64 段
    expect(isValidReferenceDataUrl('iVBORw0KGgo=')).toBe(false); // 纯 base64 无 data: 前缀
    expect(isValidReferenceDataUrl('')).toBe(false); // 空串
    expect(isValidReferenceDataUrl(null)).toBe(false); // 非字符串
    expect(isValidReferenceDataUrl(undefined)).toBe(false);
    expect(isValidReferenceDataUrl(123)).toBe(false);
  });
});

// ---------- AiImageService.generate 参考图透传（纯 DI stub） ----------

const candidate = (modelId: number, adapter: LlmAdapter): RoutedCandidate => ({
  model: { id: modelId } as AiModel,
  adapter,
  channel: {
    modelRowId: modelId,
    label: `model-${modelId}`,
    type: adapter.type,
    baseUrl: 'http://upstream.invalid',
    apiKeyPlain: 'key',
    upstreamModel: 'fake-model'
  }
});

const makeRouter = (candidates: RoutedCandidate[]): ModelRouterService =>
  ({
    candidatesByCapability: jest.fn().mockResolvedValue(candidates),
    candidatesByModel: jest.fn().mockResolvedValue(candidates)
  }) as unknown as ModelRouterService;

const makeUsage = (): { service: UsageLogService; record: jest.Mock } => {
  const record = jest.fn();
  return { service: { record } as unknown as UsageLogService, record };
};

/** imageRepo stub：create 直通补 id，save 原样返回（服务返回结构同构断言依赖 id/prompt/size/url）。 */
const makeImageRepo = (): { repo: Repository<AiImage>; save: jest.Mock } => {
  let autoId = 0;
  const create = jest.fn((data: Record<string, unknown>) => ({ id: ++autoId, ...data }));
  const save = jest.fn(async (entities: Array<Record<string, unknown>>) => entities);
  return { repo: { create, save } as unknown as Repository<AiImage>, save };
};

const makeImageAdapter = (urls: string[]): { adapter: LlmAdapter; images: jest.Mock } => {
  const images = jest.fn().mockResolvedValue(urls.map((url) => ({ url })));
  return { adapter: { type: 'fake-image', images, probe: async () => ({ ok: true }) } as unknown as LlmAdapter, images };
};

describe('AiImageService.generate 参考图透传（纯 DI 单测）', () => {
  it('带 referenceImages：完整 options（含参考图）透传 adapter.images，落库与返回同构', async () => {
    const referenceImages = ['data:image/png;base64,iVBORw0KGgo=', 'data:image/jpeg;base64,/9j/4AAQ'];
    const { adapter, images } = makeImageAdapter(['https://img.example/a.png']);
    const { repo, save } = makeImageRepo();
    const { record, service: usage } = makeUsage();
    const service = new AiImageService(repo, makeRouter([candidate(7, adapter)]), usage);

    const result = await service.generate(1, {
      prompt: '把这只猫变成水彩风',
      size: '1024x1024',
      count: 2,
      referenceImages
    } as GenerateImageDto);

    expect(images).toHaveBeenCalledTimes(1);
    const [options, channel] = images.mock.calls[0] as [Record<string, unknown>, Record<string, unknown>];
    expect(options).toEqual({
      prompt: '把这只猫变成水彩风',
      size: '1024x1024',
      count: 2,
      referenceImages
    });
    expect(channel.label).toBe('model-7'); // 第二参数仍是被路由候选的 channel
    // 落库记录：userId/modelId/prompt/size/url 齐备（图生图结果与 generations 共用落库口径）
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0]).toEqual([
      { id: 1, userId: 1, modelId: 7, prompt: '把这只猫变成水彩风', size: '1024x1024', url: 'https://img.example/a.png' }
    ]);
    expect(record).toHaveBeenCalledWith(expect.objectContaining({ modelId: 7, kind: 'image', status: 'ok' }));
    expect(result.images).toEqual([
      { id: 1, url: 'https://img.example/a.png', prompt: '把这只猫变成水彩风', size: '1024x1024' }
    ]);
  });

  it('不带 referenceImages：options.referenceImages 为 undefined（不污染 generations 通道）', async () => {
    const { adapter, images } = makeImageAdapter(['https://img.example/b.png']);
    const { repo } = makeImageRepo();
    const service = new AiImageService(repo, makeRouter([candidate(3, adapter)]), makeUsage().service);

    await service.generate(1, { prompt: '普通文生图', size: '512x512' } as GenerateImageDto);

    expect(images).toHaveBeenCalledTimes(1);
    const options = images.mock.calls[0][0] as { referenceImages?: string[] };
    expect(options.referenceImages).toBeUndefined();
  });

  it('候选无 images 方法：跳过切下一候选（既有故障转移行为防回归）', async () => {
    const noImages = { type: 'fake-chat-only', probe: async () => ({ ok: true }) } as unknown as LlmAdapter;
    const { adapter, images } = makeImageAdapter(['https://img.example/c.png']);
    const { repo } = makeImageRepo();
    const service = new AiImageService(
      repo,
      makeRouter([candidate(1, noImages), candidate(2, adapter)]),
      makeUsage().service
    );

    const result = await service.generate(1, { prompt: '跳过无生图能力候选' } as GenerateImageDto);

    expect(result.images).toHaveLength(1);
    expect(result.images[0].url).toBe('https://img.example/c.png');
    // 首候选无 images 方法直接 continue，只有第二候选真正被调用
    expect(images).toHaveBeenCalledTimes(1);
    expect((images.mock.calls[0][1] as { label: string }).label).toBe('model-2');
  });
});

// ---------- data URL 结果落盘（修 ai_images.url varchar(512) 溢出 422） ----------
describe('AiImageService.generate data URL 结果落盘', () => {
  const mockedWriteFile = writeFile as jest.Mock;
  const mockedMkdir = mkdir as jest.Mock;

  beforeEach(() => {
    mockedWriteFile.mockClear().mockResolvedValue(undefined);
    mockedMkdir.mockClear().mockResolvedValue(undefined);
  });

  it('b64_json 转出的 data URL 结果：落盘并返回 /uploads/ai-images 短路径', async () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
    const { adapter, images } = makeImageAdapter([dataUrl]);
    const { repo, save } = makeImageRepo();
    const service = new AiImageService(repo, makeRouter([candidate(7, adapter)]), makeUsage().service);

    const result = await service.generate(1, { prompt: '测试', size: '1024x1024' });

    expect(mockedMkdir).toHaveBeenCalled();
    expect(mockedWriteFile).toHaveBeenCalledTimes(1);
    const [writtenPath, writtenBuffer] = mockedWriteFile.mock.calls[0];
    expect(writtenPath).toMatch(/uploads[\\/]ai-images[\\/]\d+-0\.png$/);
    // 断言写入非空 Buffer：用 Uint8Array 语义的 .length（Node 原生 Buffer 无 .data 属性，
    // 旧 jest 的 feross/buffer polyfill 才有 —— .data 口径在 jest ≥28 下恒为 undefined 必红）。
    expect((writtenBuffer as Buffer).length).toBeGreaterThan(0);
    expect(result.images[0].url).toMatch(/^\/uploads\/ai-images\/\d+-0\.png$/);
    expect(save.mock.calls[0][0][0].url).toMatch(/^\/uploads\/ai-images\//);
  });

  it('落盘失败 best-effort：保留原 data URL 不阻塞返回', async () => {
    mockedWriteFile.mockRejectedValue(new Error('disk full'));
    const dataUrl = 'data:image/jpeg;base64,/9j/4AAQ';
    const { adapter } = makeImageAdapter([dataUrl]);
    const { repo } = makeImageRepo();
    const service = new AiImageService(repo, makeRouter([candidate(7, adapter)]), makeUsage().service);

    const result = await service.generate(1, { prompt: '测试' });

    expect(result.images[0].url).toBe(dataUrl);
  });

  it('http(s) 结果不落盘直接透传', async () => {
    const { adapter, images } = makeImageAdapter(['https://img.example/a.png']);
    const { repo } = makeImageRepo();
    const service = new AiImageService(repo, makeRouter([candidate(7, adapter)]), makeUsage().service);

    const result = await service.generate(1, { prompt: '测试' });

    expect(images).toHaveBeenCalledTimes(1);
    expect(mockedWriteFile).not.toHaveBeenCalled();
    expect(result.images[0].url).toBe('https://img.example/a.png');
  });
});
