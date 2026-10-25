// 视频上游适配：统一「提交 → 轮询 → 取回」三段式（OpenAI Sora 形态，兼容常见聚合网关字段差异）。
// 模型注册：在 AI 模型管理里建 capabilities 含 video 的模型行即可被路由到。
import { Injectable, Logger } from '@nestjs/common';
import { ModelRouterService, RoutedCandidate } from '../../ai/core/model-router.service';
import { UsageLogService } from '../../ai/core/usage-log.service';

export interface VideoRequestOptions {
  prompt: string;
  // 图生视频的首帧图 URL（可空 = 文生视频）。
  firstFrameUrl?: string;
  seconds?: number;
  size?: string;
  // 指定模型行（可选）：优先用该行，失败回落到全部 video 候选。
  modelId?: number;
}

export interface VideoResult {
  url: string;
  taskId: string;
  modelId?: number;
  latencyMs: number;
}

const POLL_INTERVAL_MS = 5000;

interface SubmitResponse {
  id?: string | number;
  task_id?: string;
}

interface PollResponse {
  status?: string;
  state?: string;
  url?: string;
  video_url?: string;
  error?: unknown;
  output?: { url?: string } | string;
  data?: Array<{ url?: string }>;
}

// DashScope（阿里云百炼）异步任务响应。
interface DashScopeSubmitResponse {
  output?: { task_id?: string; task_status?: string };
  message?: string;
}

interface DashScopePollResponse {
  output?: {
    task_status?: string;
    video_url?: string;
    message?: string;
  };
}

@Injectable()
export class VideoUpstreamService {
  private readonly logger = new Logger(VideoUpstreamService.name);

  constructor(
    private readonly router: ModelRouterService,
    private readonly usageLog: UsageLogService
  ) {}

  /** 逐候选故障转移（指定模型行优先），全部失败抛最后一个错误。 */
  async generate(userId: number, options: VideoRequestOptions): Promise<VideoResult> {
    let candidates: RoutedCandidate[] = await this.router.candidatesByCapability('video');
    if (options.modelId) {
      const preferred = await this.router.candidatesByModel(options.modelId);
      const preferredIds = new Set(preferred.map((candidate) => candidate.model.id));
      candidates = [...preferred, ...candidates.filter((candidate) => !preferredIds.has(candidate.model.id))];
    }
    if (candidates.length === 0) {
      throw new Error('没有可用的视频模型，请在 AI 模型管理里配置 video 能力模型');
    }
    let lastError: Error | null = null;
    for (const candidate of candidates) {
      if (candidate.model.status !== 1) {
        continue;
      }
      try {
        // 协议选择：defaultParams.protocol = 'dashscope' 走百炼异步任务，默认 Sora 形态。
        const protocol = (candidate.model.defaultParams as { protocol?: string } | null)?.protocol;
        const result =
          protocol === 'dashscope'
            ? await this.generateDashScope(options, candidate)
            : await this.generateSoraShape(options, candidate);
        this.usageLog.record({
          userId,
          modelId: candidate.model.id,
          kind: 'video',
          latencyMs: result.latencyMs,
          status: 'ok'
        });
        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        this.usageLog.record({
          userId,
          modelId: candidate.model.id,
          kind: 'video',
          latencyMs: 0,
          status: 'failed',
          errorMessage: lastError.message
        });
        this.logger.warn(`视频候选 ${candidate.channel.label} 失败: ${lastError.message}`);
      }
    }
    throw lastError ?? new Error('视频生成失败');
  }

  /** Sora 形态（OpenAI /videos 提交 + 轮询取回），兼容同类聚合网关字段差异。 */
  private async generateSoraShape(
    options: VideoRequestOptions,
    candidate: RoutedCandidate
  ): Promise<VideoResult> {
    const { channel } = candidate;
    const startedAt = Date.now();
    const body: Record<string, unknown> = {
      model: channel.upstreamModel,
      prompt: options.prompt,
      seconds: options.seconds,
      size: options.size
    };
    if (options.firstFrameUrl) {
      body.first_frame_image = options.firstFrameUrl;
    }

    const submitResponse = await fetch(`${channel.baseUrl}/videos`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${channel.apiKeyPlain}`
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000)
    });
    if (!submitResponse.ok) {
      throw new Error(`视频提交响应异常: ${submitResponse.status}`);
    }
    const submitJson = (await submitResponse.json()) as SubmitResponse;
    const taskId = String(submitJson.id ?? submitJson.task_id ?? '');
    if (!taskId) {
      throw new Error('视频提交未返回任务 ID');
    }

    // 轮询直到终态；默认上限 10 分钟。
    const deadline = Date.now() + 600000;
    for (;;) {
      if (Date.now() > deadline) {
        throw new Error('视频生成超时');
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      const pollResponse = await fetch(`${channel.baseUrl}/videos/${taskId}`, {
        headers: { Authorization: `Bearer ${channel.apiKeyPlain}` },
        signal: AbortSignal.timeout(15000)
      });
      if (!pollResponse.ok) {
        throw new Error(`视频状态查询异常: ${pollResponse.status}`);
      }
      const pollJson = (await pollResponse.json()) as PollResponse;
      const status = String(pollJson.status ?? pollJson.state ?? '').toLowerCase();
      if (['failed', 'error', 'cancelled'].includes(status)) {
        throw new Error(`视频生成失败: ${JSON.stringify(pollJson.error ?? status)}`);
      }
      const url = this.extractUrl(pollJson);
      if (['succeeded', 'completed', 'success', 'done'].includes(status) || (url && status !== 'in_progress')) {
        if (!url) {
          continue; // 终态但没拿到地址：再等一轮
        }
        return { url, taskId, modelId: candidate.model.id, latencyMs: Date.now() - startedAt };
      }
    }
  }

  private extractUrl(poll: PollResponse): string | undefined {
    if (poll.url) {
      return poll.url;
    }
    if (poll.video_url) {
      return poll.video_url;
    }
    if (typeof poll.output === 'string') {
      return poll.output;
    }
    if (poll.output?.url) {
      return poll.output.url;
    }
    return poll.data?.[0]?.url;
  }

  /**
   * DashScope（阿里云百炼/通义万相）协议：POST video-synthesis 建任务 + GET tasks/:id 轮询。
   * 模型行配置：type 保持 openai-compatible（为通过模型路由），defaultParams {"protocol":"dashscope"}。
   * 图生视频需选 i2v 系列模型（如 wan2.5-i2v-preview），首帧图须为公网 URL。
   */
  private async generateDashScope(
    options: VideoRequestOptions,
    candidate: RoutedCandidate
  ): Promise<VideoResult> {
    const { channel } = candidate;
    const startedAt = Date.now();
    const parameters: Record<string, unknown> = {};
    // DashScope 分辨率格式为 1280*720。
    if (options.size) {
      parameters.size = options.size.replace('x', '*');
    }
    if (options.seconds) {
      parameters.duration = options.seconds;
    }
    const input: Record<string, unknown> = { prompt: options.prompt };
    if (options.firstFrameUrl && !options.firstFrameUrl.startsWith('data:')) {
      input.img_url = options.firstFrameUrl; // i2v 系列模型生效；data URL 不支持
    }
    const submitResponse = await fetch(`${channel.baseUrl}/services/aigc/video-generation/video-synthesis`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${channel.apiKeyPlain}`,
        'X-DashScope-Async': 'enable'
      },
      body: JSON.stringify({ model: channel.upstreamModel, input, parameters }),
      signal: AbortSignal.timeout(30000)
    });
    const submitJson = (await submitResponse.json().catch(() => ({}))) as DashScopeSubmitResponse;
    if (!submitResponse.ok || !submitJson.output?.task_id) {
      throw new Error(`百炼视频提交失败: ${submitResponse.status} ${submitJson.message ?? ''}`.trim());
    }
    const taskId = submitJson.output.task_id;

    // 通义万相生成一般 1~5 分钟，上限放宽到 15 分钟。
    const deadline = Date.now() + 900000;
    for (;;) {
      if (Date.now() > deadline) {
        throw new Error('百炼视频生成超时');
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      const pollResponse = await fetch(`${channel.baseUrl}/tasks/${taskId}`, {
        headers: { Authorization: `Bearer ${channel.apiKeyPlain}` },
        signal: AbortSignal.timeout(15000)
      });
      if (!pollResponse.ok) {
        throw new Error(`百炼任务查询异常: ${pollResponse.status}`);
      }
      const pollJson = (await pollResponse.json()) as DashScopePollResponse;
      const status = String(pollJson.output?.task_status ?? '').toUpperCase();
      if (status === 'FAILED' || status === 'CANCELED' || status === 'UNKNOWN') {
        throw new Error(`百炼视频生成失败: ${pollJson.output?.message ?? status}`);
      }
      if (status === 'SUCCEEDED') {
        const url = pollJson.output?.video_url;
        if (!url) {
          throw new Error('百炼任务成功但未返回视频地址');
        }
        return { url, taskId, modelId: candidate.model.id, latencyMs: Date.now() - startedAt };
      }
    }
  }
}
