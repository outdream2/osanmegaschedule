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
      const failPath = join(failedDir, `${Date.now()}_${fileName}`);
      try {
        renameSync(filePath, failPath);
        writeFileSync(`${failPath}.log`, `${new Date().toISOString()}\n${kind}\n${msg}\n\n${err.stack ?? ""}`, "utf-8");
      } catch (moveErr) {
        console.warn(`[importer/${kind}] _failed 이동 실패:`, moveErr);
      }
      failed++;
      console.error(`[importer/${kind}] 실패 · ${fileName} · ${msg}`);
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
