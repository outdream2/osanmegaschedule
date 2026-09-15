// apps/sync-agent/src/main/importer.ts
// 2026-09-15 · Phase 2 · xlsx 파일 · 서버 API 업로드
//   · 각 파일 종류 · 매핑된 endpoint 로 · multipart POST
//   · 성공 · _processed/ 이동 · 실패 · _failed/ 이동 + .log
//   · 서버 다운 시 · 오류 반환 · 재시도는 스케줄러에서

import { readFileSync, readdirSync, statSync, existsSync, mkdirSync, renameSync, writeFileSync } from "fs";
import { join, basename } from "path";
import FormData from "form-data";
import { getApiClient } from "./auth";
import { loadConfig, patchConfig, type FileKind, type LastRun } from "./config";
import { enqueue, getReadyItems, markSuccess, markFailure } from "./queue";

// 파일 종류 · 서버 endpoint · 매핑
const ENDPOINT_MAP: Record<FileKind, string> = {
  products: "/api/upload-products",
  stock:    "/api/upload-stock",
  purchase: "/api/upload-purchase-details",
};

export interface ImportResult {
  kind: FileKind;
  ok: boolean;
  filesProcessed: number;
  filesFailed: number;
  errors: string[];
  message: string;
}

/** 한 파일 종류 · 폴더 스캔 · xlsx 발견 시 · 서버 업로드 */
export async function runImport(kind: FileKind): Promise<ImportResult> {
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
        // 대신 · 큐에 등록만
        enqueue(kind, filePath, fileName, msg);
        console.log(`[importer/${kind}] 재시도 대상 · 큐 등록 · ${fileName}`);
      } else {
        // 영구 실패 (4xx · validation 등) · _failed 이동 · 큐 X
        const failPath = join(failedDir, `${Date.now()}_${fileName}`);
        try {
          renameSync(filePath, failPath);
          writeFileSync(`${failPath}.log`, `${new Date().toISOString()}\n${kind}\n${msg}\n\n${err.stack ?? ""}`, "utf-8");
        } catch (moveErr) {
          console.warn(`[importer/${kind}] _failed 이동 실패:`, moveErr);
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

/** 실제 서버 업로드 · multipart/form-data */
async function uploadFile(kind: FileKind, filePath: string): Promise<void> {
  const endpoint = ENDPOINT_MAP[kind];
  const api = getApiClient();

  const buf = readFileSync(filePath);
  const fileName = basename(filePath);

  // 서버 · upload-stock 은 · express.raw 로 raw body 수신
  //   · Content-Type: application/octet-stream + managerId 쿼리
  // 다른 endpoint · multipart 여부는 · 각각 확인 필요
  // 일단 · 모든 파일 · multipart 방식으로 시도 · 서버 지원 여부 · Phase 2 후반 재검토
  if (kind === "stock") {
    // 서버 · express.raw · Content-Type: application/octet-stream · managerId 쿼리
    // 관리자 ID · JWT 에서 서버가 추출 · 별도 전달 X (또는 · 로그인 시 저장 필요)
    // Phase 2 · JWT 만 사용 · managerId 미지원 → 실패 예상
    // 우선 · multipart 로 시도 · 서버 방식 변경 필요 시 Phase 2 후반 확인
    const form = new FormData();
    form.append("file", buf, { filename: fileName });
    await api.post(endpoint, form, {
      headers: form.getHeaders(),
      maxBodyLength: 100 * 1024 * 1024,
      maxContentLength: 100 * 1024 * 1024,
    });
    return;
  }

  // 기타 · multipart · file 필드
  const form = new FormData();
  form.append("file", buf, { filename: fileName });
  await api.post(endpoint, form, {
    headers: form.getHeaders(),
    maxBodyLength: 100 * 1024 * 1024,
    maxContentLength: 100 * 1024 * 1024,
  });
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
