// apps/sync-agent/src/main/scheduler.ts
// 2026-09-15 · Phase 2 · 파일별 개별 스케줄러 · node-cron
//   · loadConfig 스케줄 · 각 파일 종류 · cron job 등록
//   · 설정 변경 시 · rescheduleAll · 재등록

import cron, { ScheduledTask } from "node-cron";
import { loadConfig, type FileKind } from "./config";
import { runImport, retryQueuedItems } from "./importer";
import { notifyImportResult, setTrayState, showErrorDialog } from "./notifications";

const activeJobs: Partial<Record<FileKind, ScheduledTask>> = {};
let queueRetryJob: ScheduledTask | null = null;

/** 각 파일 종류 · 스케줄 등록 (기존 · 정지 후 재등록) */
export function rescheduleAll(): void {
  const cfg = loadConfig();
  const kinds: FileKind[] = ["products", "stock", "purchase"];

  for (const kind of kinds) {
    // 기존 job · 정지
    const existing = activeJobs[kind];
    if (existing) {
      existing.stop();
      delete activeJobs[kind];
    }

    const cronExpr = cfg.schedules[kind];
    if (!cronExpr) continue;
    if (!cron.validate(cronExpr)) {
      console.warn(`[scheduler/${kind}] 유효하지 않은 cron: ${cronExpr}`);
      continue;
    }

    const task = cron.schedule(cronExpr, async () => {
      console.log(`[scheduler/${kind}] 실행 · ${new Date().toISOString()}`);
      setTrayState("syncing", `${kind} 동기화 중...`);
      try {
        const result = await runImport(kind);
        console.log(`[scheduler/${kind}] 완료 · ${result.message}`);
        notifyImportResult(kind, result);
      } catch (err) {
        console.error(`[scheduler/${kind}] 예외:`, err);
        notifyImportResult(kind, { ok: false, message: String(err), filesProcessed: 0, filesFailed: 1 });
      }
    });

    activeJobs[kind] = task;
    console.log(`[scheduler/${kind}] 등록 · ${cronExpr}`);
  }

  // Phase 3 · 로컬 큐 재시도 · 매 5분 · 만료된 아이템 순회
  if (queueRetryJob) {
    queueRetryJob.stop();
    queueRetryJob = null;
  }
  queueRetryJob = cron.schedule("*/5 * * * *", async () => {
    try {
      const r = await retryQueuedItems();
      if (r.retried > 0) {
        console.log(`[scheduler/retry] ${r.retried}건 재시도 · 성공 ${r.succeeded} · 실패 ${r.failed}`);
      }
    } catch (err) {
      console.error("[scheduler/retry] 예외:", err);
    }
  });
  console.log("[scheduler/retry] 큐 재시도 · 매 5분 등록");
}

/** 즉시 실행 · 사용자 수동 트리거 · 스케줄 무관
 *   · 항상 결과 알림 (성공·실패·빈 폴더 · 모두 사용자에게 피드백) */
export async function runNow(kind: FileKind) {
  console.log(`[scheduler/${kind}] 수동 실행 요청`);
  setTrayState("syncing", `${kind} 동기화 중...`);
  const result = await runImport(kind);
  console.log(`[scheduler/${kind}] 수동 실행 결과 · ok=${result.ok} · processed=${result.filesProcessed} · failed=${result.filesFailed} · msg=${result.message}`);
  console.log(`[scheduler/${kind}] errors:`, result.errors);
  // 수동 실행 · 항상 알림 · 빈 폴더도 · 사용자에게 확인
  const { notify } = await import("./notifications");
  if (result.filesProcessed > 0) {
    notify(`✓ ${kindLabel(kind)} 임포트 완료`, `${result.filesProcessed}건 · ${result.message}`, "success");
    setTrayState("success", `${kind} · 완료`);
    setTimeout(() => setTrayState("idle"), 3000);
  } else if (result.filesFailed > 0) {
    notify(`✕ ${kindLabel(kind)} 임포트 실패`, result.message, "error");
    setTrayState("error", `${kind} · 실패`);
    setTimeout(() => setTrayState("idle"), 30_000);
    // 실패 · 상세 에러 창 · 사용자 인지
    const detailText = result.errors && result.errors.length > 0
      ? result.errors.join("\n\n")
      : result.message;
    showErrorDialog(
      `${kindLabel(kind)} 임포트 실패`,
      `${result.filesProcessed}건 성공 · ${result.filesFailed}건 실패`,
      detailText
    );
  } else {
    // 파일 없음 or 폴더 미설정 · 정보성 알림 · 사용자 인지
    notify(`ℹ ${kindLabel(kind)}`, result.message, "info");
    setTrayState("idle");
  }
  return result;
}

function kindLabel(kind: FileKind): string {
  return kind === "products" ? "상품정보" : kind === "stock" ? "재고정보" : kind === "purchase" ? "매입정보" : kind;
}

/** 모든 파일 · 즉시 실행 · 트레이 '지금 실행' 메뉴 */
export async function runNowAll() {
  const kinds: FileKind[] = ["products", "stock", "purchase"];
  const results: Array<{
    kind: FileKind;
    ok: boolean;
    filesProcessed: number;
    filesFailed: number;
    errors: string[];
    message: string;
  }> = [];
  for (const kind of kinds) {
    const r = await runImport(kind).catch((err) => ({
      kind, ok: false, filesProcessed: 0, filesFailed: 0, errors: [String(err)], message: String(err),
    }));
    results.push(r);
  }
  return results;
}

/** 모든 job 정지 · 앱 종료 시 */
export function stopAllJobs(): void {
  for (const kind of Object.keys(activeJobs) as FileKind[]) {
    activeJobs[kind]?.stop();
    delete activeJobs[kind];
  }
  if (queueRetryJob) {
    queueRetryJob.stop();
    queueRetryJob = null;
  }
}
