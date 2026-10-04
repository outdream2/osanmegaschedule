// apps/sync-agent/src/main/erpQueue.ts
// 2026-10-04 · Phase 2 · ERP 요청 전역 Queue · concurrency = 1
//   · 사용자가 여러 Dataset Fetch 를 선택해도 ERP SOAP 호출은 순차 실행
//   · global lock · pending list · 상태 broadcast

import type { DatasetKey } from "./datasetTypes";

interface QueueJob {
  readonly dataset: DatasetKey;
  readonly label: string;
  readonly run: () => Promise<void>;
  /** 2026-10-04 · job 완료 시 호출 · service 가 fetch 완료를 await 가능하게 함 */
  readonly onComplete?: (ok: boolean, error?: Error) => void;
}

class ErpQueue {
  private running: boolean = false;
  private readonly pending: QueueJob[] = [];
  private currentDataset: DatasetKey | null = null;

  enqueue(job: QueueJob): void {
    this.pending.push(job);
    this.tick();
  }

  isRunning(dataset?: DatasetKey): boolean {
    if (!dataset) return this.running;
    return this.running && this.currentDataset === dataset;
  }

  waitingFor(dataset: DatasetKey): boolean {
    return this.pending.some((j) => j.dataset === dataset);
  }

  status(): { running: boolean; current: DatasetKey | null; pending: DatasetKey[]; concurrency: 1 } {
    return {
      running: this.running,
      current: this.currentDataset,
      pending: this.pending.map((j) => j.dataset),
      concurrency: 1,
    };
  }

  private async tick(): Promise<void> {
    if (this.running) return;
    const next = this.pending.shift();
    if (!next) return;
    this.running = true;
    this.currentDataset = next.dataset;
    let completeError: Error | undefined;
    try {
      await next.run();
    } catch (err) {
      completeError = err as Error;
      console.error(`[erpQueue] ${next.dataset} job 예외 ·`, completeError.message);
    } finally {
      this.running = false;
      this.currentDataset = null;
      try { next.onComplete?.(completeError == null, completeError); } catch { /* ignore */ }
      // 다음 job 처리
      setImmediate(() => this.tick());
    }
  }
}

export const erpQueue = new ErpQueue();
