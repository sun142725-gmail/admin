// 运行事件广播：SSE 推送节点/运行状态变化（内存态，重启丢失由前端回退轮询兜底）。
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { MessageEvent } from '@nestjs/common';
import { Subject } from 'rxjs';

export interface RunEventPayload {
  type: 'node' | 'run';
  runId: number;
  data: Record<string, unknown>;
}

@Injectable()
export class RunEventsService implements OnModuleDestroy {
  private readonly logger = new Logger(RunEventsService.name);
  private readonly subjects = new Map<number, Subject<MessageEvent>>();

  onModuleDestroy() {
    for (const [runId, subject] of this.subjects) {
      subject.complete();
      this.subjects.delete(runId);
    }
  }

  /** 订阅运行事件：无订阅者时懒创建，运行结束 complete 后自动清理。 */
  subscribe(runId: number): Subject<MessageEvent> {
    let subject = this.subjects.get(runId);
    if (!subject) {
      subject = new Subject<MessageEvent>();
      this.subjects.set(runId, subject);
    }
    return subject;
  }

  /** 广播事件；终态事件（run 的 succeeded/failed/cancelled）后结束流并延迟清理。 */
  publish(event: RunEventPayload): void {
    const subject = this.subjects.get(event.runId);
    if (!subject) {
      return;
    }
    subject.next({ type: event.type, data: event });
    const terminal =
      event.type === 'run' && ['succeeded', 'failed', 'cancelled'].includes(String(event.data.status));
    if (terminal) {
      subject.complete();
      this.subjects.delete(event.runId);
    }
  }
}
