// apps/sync-agent/src/main/importer.ts
// 2026-09-15 · Phase 2 · xlsx 파일 · 서버 API 업로드
//   · 각 파일 종류 · 매핑된 endpoint 로 · multipart POST
//   · 성공 · _processed/ 이동 · 실패 · _failed/ 이동 + .log
//   · 서버 다운 시 · 오류 반환 · 재시도는 스케줄러에서

import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, renameSync, writeFileSync } from "fs";
import { join, basename } from "path";
import { getApiClient } from "./auth";
import { loadConfig, patchConfig, type FileKind, type LastRun } from "./config";
import { enqueue, getReadyItems, markSuccess, markFailure } from "./queue";

// 파일 종류 · 서버 endpoint · 매핑
const ENDPOINT_MAP: Record<FileKind, string> = {
  products: "/api/upload-products",
  stock:    "/api/upload-stock",
  purchase: "/api/upload-purchase-details",
};

// 2026-09-15 · Phase 3 · 파일 종류별 · 실행 중 mutex · 중복 실행 방지
const runningLocks = new Set<FileKind>();

export interface ImportResult {
  kind: FileKind;
  ok: boolean;
  filesProcessed: number;
  filesFailed: number;
  errors: string[];
  message: string;
}

/** 파일명 · 날짜 (YYYY-MM-DD or YYYYMMDD) 추출 · 없으면 파일 mtime · 없으면 오늘 */
function extractDateFromName(fileName: string, fallback: Date): string {
  // 2026-07-06 · 2026-07-01 등
  const m1 = fileName.match(/(\d{4})[-.](\d{2})[-.](\d{2})/);
  if (m1) return `${m1[1]}-${m1[2]}-${m1[3]}`;
  // 20260706 등
  const m2 = fileName.match(/(\d{4})(\d{2})(\d{2})/);
  if (m2) return `${m2[1]}-${m2[2]}-${m2[3]}`;
  return fallback.toISOString().slice(0, 10);
}

/** 날짜 (YYYY-MM-DD) → period_type · 초순(1-10)·중순(11-20)·하순(21+) */
function computePeriodType(dateStr: string): "early" | "mid" | "late" {
  const day = parseInt(dateStr.slice(8, 10), 10) || 1;
  if (day <= 10) return "early";
  if (day <= 20) return "mid";
  return "late";
}

/** 한 파일 종류 · 폴더 스캔 · xlsx 발견 시 · 서버 업로드 */
export async function runImport(kind: FileKind): Promise<ImportResult> {
  // 2026-09-15 · Phase 3 · 중복 실행 방지 mutex
  if (runningLocks.has(kind)) {
    console.warn(`[importer/${kind}] 이미 실행 중 · skip`);
    return { kind, ok: true, filesProcessed: 0, filesFailed: 0, errors: [], message: "이미 실행 중" };
  }
  runningLocks.add(kind);
  try {
    return await runImportInternal(kind);
  } finally {
    runningLocks.delete(kind);
  }
}

async function runImportInternal(kind: FileKind): Promise<ImportResult> {
  const cfg = loadConfig();
  const folder = cfg.folders[kind];
  if (!folder) {
    return recordAndReturn(kind, { ok: false, filesProcessed: 0, filesFailed: 0, errors: ["폴더 미설정"], message: "폴더 미설정" });
  }
  if (!existsSync(folder)) {
    return recordAndReturn(kind, { ok: false, filesProcessed: 0, filesFailed: 0, errors: [`폴더 없음 · ${folder}`], message: "폴더 없음" });
  }

  const processedDir = join(folder, "_processed");
  const failedDir    = join(folder, "_failed");
  ensureDir(processedDir);
  ensureDir(failedDir);

  // xlsx 파일 목록 · _processed · _failed 폴더 제외
  let files: string[] = [];
  try {
    files = readdirSync(folder)
      .filter((f) => f.toLowerCase().endsWith(".xlsx") || f.toLowerCase().endsWith(".xls"))
      .map((f) => join(folder, f))
      .filter((p) => statSync(p).isFile());
  } catch (err: any) {
    return recordAndReturn(kind, { ok: false, filesProcessed: 0, filesFailed: 0, errors: [err.message], message: "폴더 스캔 실패" });
  }

  if (files.length === 0) {
    return recordAndReturn(kind, { ok: true, filesProcessed: 0, filesFailed: 0, errors: [], message: "새 파일 없음", skipped: true });
  }

  let processed = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const filePath of files) {
    const fileName = basename(filePath);
    try {
      await uploadFile(kind, filePath);
      renameSync(filePath, join(processedDir, `${Date.now()}_${fileName}`));
      processed++;
      console.log(`[importer/${kind}] 성공 · ${fileName}`);
    } catch (err: any) {
      const msg = err.response?.data?.error?.message ?? err.response?.data?.message ?? err.message ?? "알 수 없는 오류";
      errors.push(`${fileName} · ${msg}`);

      // 네트워크·서버 다운 (5xx or timeout) · 로컬 큐 · 재시도 대상
      const isRetriable = isRetriableError(err);
      if (isRetriable) {
        // 파일 · _failed 이동 X · 원본 위치 유지 · 큐 재시도 시 다시 접근
        enqueue(kind, filePath, fileName, msg);
        console.log(`[importer/${kind}] 재시도 대상 · 큐 등록 · ${fileName}`);
      } else {
        // 영구 실패 (4xx · validation 등) · _failed 이동 · 큐 X
        // 파일 존재 확인 (동시 실행 · rename 이미 됐을 수 있음)
        if (existsSync(filePath)) {
          const failPath = join(failedDir, `${Date.now()}_${fileName}`);
          try {
            renameSync(filePath, failPath);
            writeFileSync(
              `${failPath}.log`,
              [
                `시각: ${new Date().toISOString()}`,
                `파일 종류: ${kind}`,
                `원본 파일: ${fileName}`,
                `HTTP 상태: ${err.response?.status ?? "unknown"}`,
                `서버 응답: ${JSON.stringify(err.response?.data ?? {}, null, 2)}`,
                `오류 메시지: ${msg}`,
                ``,
                `스택 트레이스:`,
                err.stack ?? "(없음)",
              ].join("\n"),
              "utf-8"
            );
          } catch (moveErr) {
            console.warn(`[importer/${kind}] _failed 이동 실패 (파일 이미 이동됨 or 권한):`, moveErr);
          }
        } else {
          console.log(`[importer/${kind}] 파일 없음 (이미 이동됨) · ${fileName}`);
        }
        console.error(`[importer/${kind}] 영구 실패 · ${fileName} · ${msg}`);
      }
      failed++;
    }
  }

  const ok = failed === 0 && processed > 0;
  return recordAndReturn(kind, {
    ok,
    filesProcessed: processed,
    filesFailed: failed,
    errors,
    message: `${processed}건 성공${failed > 0 ? ` · ${failed}건 실패` : ""}`,
  });
}

/** 실제 서버 업로드 · 웹앱 방식 · application/octet-stream + 쿼리 파라미터
 *   · POST /api/upload-products?managerId=<id>
 *   · POST /api/upload-stock?managerId=<id>&snapshot_date=YYYY-MM-DD&start_date=YYYY-MM-DD&period_type=early|mid|late&force=true
 *   · POST /api/upload-purchase-details?managerId=<id>&filename=<name>&from=YYYY-MM-DD&to=YYYY-MM-DD&force=true
 *   · Body · Buffer · Raw xlsx
 *   · 파일명 · 날짜 자동 추출 · 없으면 파일 mtime
 *   · force=true · 기존 데이터 덮어쓰기 (409 conflict 방지)
 */
async function uploadFile(kind: FileKind, filePath: string): Promise<void> {
  const endpoint = ENDPOINT_MAP[kind];
  const api = getApiClient();

  const cfg = loadConfig();
  const managerId = cfg.auth.employeeId;
  if (!managerId) {
    throw new Error("관리자 ID 없음 · 재로그인 필요");
  }

  const buf = readFileSync(filePath);
  const fileName = basename(filePath);

  // 파일 mtime · fallback 날짜
  const mtime = statSync(filePath).mtime;

  // 파라미터 · 파일 종류별
  const params = new URLSearchParams({ managerId: String(managerId) });

  if (kind === "stock") {
    // 재고 · 필수 · snapshot_date · start_date · period_type
    const snapshotDate = extractDateFromName(fileName, mtime);
    // 재고 파일 · 기본 · 시작·종료 동일 (일별 스냅샷) or 30일 범위
    const startDate = snapshotDate; // 초·중·하순 스냅샷 · 시작=종료 · 단일 시점
    const periodType = computePeriodType(snapshotDate);
    params.set("snapshot_date", snapshotDate);
    params.set("start_date", startDate);
    params.set("period_type", periodType);
    params.set("force", "true"); // 자동 임포트 · 덮어쓰기 · 409 skip
    console.log(`[importer/stock] params · snapshot=${snapshotDate} · period=${periodType}`);
  } else if (kind === "purchase") {
    // 매입 · filename 필수 · from·to 선택 (파일명 추출)
    params.set("filename", fileName);
    // filename 에서 YYYY-MM-DD 두 개 추출 시도 (from · to)
    const dates = Array.from(fileName.matchAll(/(\d{4})[-.](\d{2})[-.](\d{2})/g))
      .map(m => `${m[1]}-${m[2]}-${m[3]}`);
    if (dates.length >= 1) params.set("from", dates[0]);
    if (dates.length >= 2) params.set("to", dates[1]);
    params.set("force", "true");
    console.log(`[importer/purchase] params · filename=${fileName} · dates=${dates.join(",")}`);
  }
  // products · managerId 만 필요

  const url = `${endpoint}?${params.toString()}`;
  console.log(`[importer/${kind}] POST ${url}`);

  try {
    const res = await api.post(url, buf, {
      headers: { "Content-Type": "application/octet-stream" },
      maxBodyLength: 100 * 1024 * 1024,
      maxContentLength: 100 * 1024 * 1024,
    });
    console.log(`[importer/${kind}] 성공 · ${fileName} · 응답:`, JSON.stringify(res.data).slice(0, 200));
  } catch (err: any) {
    // 상세 서버 에러 · 로그
    const status = err.response?.status;
    const body = err.response?.data;
    console.error(`[importer/${kind}] 서버 에러 · status=${status} · body:`, JSON.stringify(body).slice(0, 500));
    // 서버 에러 메시지 · axios err.message 에 병합
    const serverMsg = body?.error?.message ?? body?.message ?? body?.error;
    if (serverMsg) {
      err.message = `[${status}] ${serverMsg}`;
    }
    throw err;
  }
}

function ensureDir(path: string): void {
  if (!existsSync(path)) mkdirSync(path, { recursive: true });
}

/** 재시도 가능 여부 · 네트워크·5xx 서버 오류·타임아웃 · true / 4xx validation · false */
function isRetriableError(err: any): boolean {
  // Axios error · response 없음 · 네트워크 오류 or timeout
  if (!err.response) return true;
  const status = err.response.status;
  // 5xx · 서버 문제 · 재시도
  if (status >= 500 && status < 600) return true;
  // 429 · rate limit · 재시도
  if (status === 429) return true;
  // 401·403 · 인증 문제 · 로그아웃 후 재로그인 필요 · 재시도 X
  // 400·404·422 · validation · 재시도 X
  return false;
}

/** 큐 재시도 · 스케줄러 매 tick 에서 호출 · 만료된 아이템 순회 · 업로드 시도 */
export async function retryQueuedItems(): Promise<{ retried: number; succeeded: number; failed: number }> {
  const ready = getReadyItems();
  if (ready.length === 0) return { retried: 0, succeeded: 0, failed: 0 };
  console.log(`[importer/retry] ${ready.length}건 재시도 시작`);
  let succeeded = 0;
  let failed = 0;
  const cfg = loadConfig();
  for (const item of ready) {
    if (!existsSync(item.filePath)) {
      // 원본 파일 사라짐 · 큐에서 제거
      markSuccess(item.id);
      console.log(`[importer/retry] 파일 없음 · 큐 정리 · ${item.originalName}`);
      continue;
    }
    try {
      await uploadFile(item.kind, item.filePath);
      // 성공 · _processed 이동 · 큐 제거
      const folder = cfg.folders[item.kind];
      if (folder) {
        const processedDir = join(folder, "_processed");
        ensureDir(processedDir);
        renameSync(item.filePath, join(processedDir, `${Date.now()}_${item.originalName}`));
      }
      markSuccess(item.id);
      succeeded++;
      console.log(`[importer/retry] 성공 · ${item.originalName}`);
    } catch (err: any) {
      const msg = err.response?.data?.error?.message ?? err.response?.data?.message ?? err.message ?? "알 수 없는 오류";
      markFailure(item.id, msg);
      failed++;
      console.warn(`[importer/retry] 실패 · ${item.originalName} · ${msg}`);
    }
  }
  return { retried: ready.length, succeeded, failed };
}

interface RecordInput {
  ok: boolean;
  filesProcessed: number;
  filesFailed: number;
  errors: string[];
  message: string;
  skipped?: boolean;
}

function recordAndReturn(kind: FileKind, input: RecordInput): ImportResult {
  const lastRun: LastRun = {
    at: new Date().toISOString(),
    status: input.skipped ? "skipped" : input.ok ? "success" : "failed",
    message: input.message,
    fileName: input.filesProcessed > 0 ? `${input.filesProcessed}건 처리` : undefined,
  };
  patchConfig({ lastRun: { [kind]: lastRun } });
  return {
    kind,
    ok: input.ok,
    filesProcessed: input.filesProcessed,
    filesFailed: input.filesFailed,
    errors: input.errors,
    message: input.message,
  };
}
