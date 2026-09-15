// apps/sync-agent/src/main/scheduler.ts
// 2026-09-15 · Phase 2 · 파일별 개별 스케줄러 · node-cron
//   · loadConfig 스케줄 · 각 파일 종류 · cron job 등록
//   · 설정 변경 시 · rescheduleAll · 재등록

import cron, { ScheduledTask } from "node-cron";
import { loadConfig, type FileKind } from "./config";
import { runImport } from "./importer";
import { notifyImportResult, setTrayState } from "./notifications";

const activeJobs: Partial<Record<FileKind, ScheduledTask>> = {};

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
}

/** 즉시 실행 · 사용자 수동 트리거 · 스케줄 무관 */
export async function runNow(kind: FileKind) {
  console.log(`[scheduler/${kind}] 수동 실행 요청`);
  setTrayState("syncing", `${kind} 동기화 중...`);
  const result = await runImport(kind);
  notifyImportResult(kind, result);
  return result;
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
}
