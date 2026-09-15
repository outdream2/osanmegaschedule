// apps/sync-agent/src/main/watcher.ts
// 2026-09-15 · Phase 3 · chokidar · 폴더 감시 · 새 파일 시 · 10분 debounce · 자동 임포트
//   · 사용자 요청 · 시간별 스케줄 X · 파일 생성 시 · 자동 임포트
//   · 10분 delay · Google Drive sync 안정화 · 사용자 다른 파일 추가 대비

import chokidar, { FSWatcher } from "chokidar";
import { basename } from "path";
import { loadConfig, type FileKind } from "./config";
import { runImport } from "./importer";
import { notifyImportResult, setTrayState, notify } from "./notifications";

const IMPORT_DELAY_MS = 10 * 60 * 1000; // 10분

const activeWatchers: Partial<Record<FileKind, FSWatcher>> = {};
const pendingTimers: Partial<Record<FileKind, NodeJS.Timeout>> = {};

const KIND_LABEL: Record<FileKind, string> = {
  products: "상품정보",
  stock:    "재고정보",
  purchase: "매입정보",
};

/** 파일 종류별 · 폴더 감시 재등록 (설정 변경 시 재호출) */
export function rescanWatchers(): void {
  const cfg = loadConfig();
  const kinds: FileKind[] = ["products", "stock", "purchase"];
  for (const kind of kinds) {
    // 기존 감시 중단
    const existing = activeWatchers[kind];
    if (existing) {
      existing.close().catch(() => { /* silent */ });
      delete activeWatchers[kind];
    }
    // 대기 중 timer 취소
    const timer = pendingTimers[kind];
    if (timer) {
      clearTimeout(timer);
      delete pendingTimers[kind];
    }

    const folder = cfg.folders[kind];
    if (!folder) {
      console.log(`[watcher/${kind}] 폴더 미설정 · skip`);
      continue;
    }

    // chokidar · 폴더 감시 · xlsx 파일만
    //   · depth 0 · _processed·_failed 제외
    //   · awaitWriteFinish · 파일 완전히 쓰여진 후 이벤트 (부분 다운로드 방지)
    const watcher = chokidar.watch(folder, {
      persistent: true,
      ignoreInitial: true, // 초기 파일 X · 신규 파일만
      depth: 0,
      awaitWriteFinish: { stabilityThreshold: 5_000, pollInterval: 500 },
      ignored: [/[\\/]_processed[\\/]/, /[\\/]_failed[\\/]/, /^\./],
    });

    watcher.on("add", (path) => {
      const name = basename(path);
      const lower = name.toLowerCase();
      if (!lower.endsWith(".xlsx") && !lower.endsWith(".xls")) return;
      console.log(`[watcher/${kind}] 새 파일 · ${name} · 10분 후 임포트 예약`);

      // 기존 예약 · 취소 후 · 재설정 (debounce · 여러 파일 · 마지막 파일 기준)
      const prev = pendingTimers[kind];
      if (prev) {
        clearTimeout(prev);
        console.log(`[watcher/${kind}] 기존 예약 · 취소 · 새 예약`);
      }

      // Windows toast · 예약 알림
      notify(
        `📥 ${KIND_LABEL[kind]}`,
        `새 파일 감지 · ${name}\n10분 후 · 자동 임포트`,
        "info"
      );

      pendingTimers[kind] = setTimeout(async () => {
        delete pendingTimers[kind];
        console.log(`[watcher/${kind}] 10분 경과 · 임포트 시작`);
        setTrayState("syncing", `${kind} 임포트 중...`);
        try {
          const result = await runImport(kind);
          notifyImportResult(kind, result);
        } catch (err) {
          console.error(`[watcher/${kind}] 자동 임포트 예외:`, err);
        }
      }, IMPORT_DELAY_MS);
    });

    watcher.on("error", (err) => {
      console.error(`[watcher/${kind}] chokidar 오류:`, err);
    });

    activeWatchers[kind] = watcher;
    console.log(`[watcher/${kind}] 감시 시작 · ${folder}`);
  }
}

/** 앱 종료 시 · 모든 watcher · timer 정리 */
export function stopAllWatchers(): void {
  for (const kind of Object.keys(activeWatchers) as FileKind[]) {
    activeWatchers[kind]?.close().catch(() => { /* silent */ });
    delete activeWatchers[kind];
  }
  for (const kind of Object.keys(pendingTimers) as FileKind[]) {
    const t = pendingTimers[kind];
    if (t) clearTimeout(t);
    delete pendingTimers[kind];
  }
}

/** 현재 대기 중인 예약 · Renderer UI 용 */
export function listPendingImports(): Array<{ kind: FileKind; scheduledAt: string }> {
  // pendingTimers 자체는 · 예약 시각 저장 안 함 · 최소 정보만
  // TODO Phase 3 · timer 시작 시각 · Map 별도 추적 · 남은 시간 계산
  const now = Date.now();
  return (Object.keys(pendingTimers) as FileKind[])
    .filter(k => pendingTimers[k])
    .map(k => ({
      kind: k,
      scheduledAt: new Date(now + IMPORT_DELAY_MS).toISOString(), // 대략치
    }));
}
