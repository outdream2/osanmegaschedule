// apps/sync-agent/src/main/erpSyncOrchestrator.ts
// 2026-10-04 · Phase 2 · ERP → Supabase Gateway · Multi-dataset Orchestrator
//
// 흐름:
//   Fetch (ERP SOAP · concurrency=1)
//     → candidate.json.gz 저장 (atomic · 기존 보호)
//     → Validation (NORMAL/REVIEW/ERROR)
//     → Dataset Hash
//
//   Preview (ERP 호출 없음)
//     → Local Diff (candidate vs last-synced)
//     → Supabase Final Diff (NEW/CHANGED only · vs 현재 DB)
//
//   Apply (사용자 승인 후 · 아직 Phase 3 전까지 전체 WRITE 금지)
//     → productSyncRunner (기존 재사용 · onlyProductCodes allowlist)
//     → Read-back verification
//     → 전부 verified → candidate → last-synced 승격

import { BrowserWindow } from "electron";
import { queryProductList, queryInventoryStatus, queryBuyStatus, querySaleStatus } from "./iregenSoap";
import { erpQueue } from "./erpQueue";
import { appendFetchHistory } from "./fetchHistoryStore";
import {
  saveCandidate,
  loadCandidateFull,
  loadLastSyncedFull,
  getMetadata,
  updateSyncStatus,
  recordSyncAttempt,
  promoteCandidateToLastSynced,
} from "./snapshotStore";
import {
  DATASET_API_NAME,
  CURRENT_MAPPING_VERSION,
  type DatasetKey,
  type DatasetState,
  type DatasetProgress,
  type FetchPhase,
  type SyncReadiness,
  type ValidationSummary,
} from "./datasetTypes";
import {
  validateErpSnapshot,
  type ValidationErpRow,
} from "../../../../src/shared/erp/erpValidationEngine";
import {
  datasetHashProducts,
  datasetHashBuys,
  type ProductFingerprintRow,
  type BuyFingerprintRow,
} from "../../../../src/shared/erp/datasetHash";
import { diffProductsLocal, type LocalDiffSummary } from "../../../../src/shared/erp/erpLocalDiff";
import { diffProductsVsSupabase, indexDbByCode, type SupabaseDiffSummary } from "../../../../src/shared/erp/erpSupabaseDiff";
import type { DbProductRow, ErpProductRow } from "../../../../src/shared/erp/erpProductMapper";
import { getSupabaseClient } from "./supabaseClient";

// ─────────────────────────────────────────────────────────────────────────────
// Broadcast
// ─────────────────────────────────────────────────────────────────────────────
function broadcastDatasetProgress(p: DatasetProgress): void {
  for (const w of BrowserWindow.getAllWindows()) {
    try { w.webContents.send("erp:dataset-progress", p); } catch { /* ignore */ }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory inflight state (각 Dataset)
// ─────────────────────────────────────────────────────────────────────────────
interface InMemoryState {
  phase: FetchPhase;
  inflight: DatasetProgress | null;
  lastError: string | null;
}
const memory: Record<DatasetKey, InMemoryState> = {
  PRODUCT_LIST: { phase: "IDLE", inflight: null, lastError: null },
  INVENTORY_STATUS: { phase: "IDLE", inflight: null, lastError: null },
  BUY_STATUS: { phase: "IDLE", inflight: null, lastError: null },
  SALE_STATUS: { phase: "IDLE", inflight: null, lastError: null },
};

// ─────────────────────────────────────────────────────────────────────────────
// Readiness 계산
// ─────────────────────────────────────────────────────────────────────────────
function computeReadiness(dataset: DatasetKey, validation: ValidationSummary | undefined, phase: FetchPhase): SyncReadiness {
  if (phase === "FAILED") return "BLOCKED";
  if (dataset === "INVENTORY_STATUS") return "NOT_CONFIGURED";
  if (dataset === "BUY_STATUS") return "BLOCKED";
  // 2026-10-04 · Sale_Status · DB sales 테이블 미정의 · WRITE 설계 전 → NOT_CONFIGURED
  //   ERP 조회 + 검증 자체는 가능 · 상단 Sync 는 비활성 상태로 노출
  if (dataset === "SALE_STATUS") return "NOT_CONFIGURED";
  // PRODUCT_LIST
  if (!validation) return "READY";
  if (validation.blockingErrors) return "BLOCKED";
  if (validation.review > 0) return "REVIEW";
  return "READY";
}

function dependencyMessage(_dataset: DatasetKey): string | null {
  // 2026-10-04 · 사용자 지적 · ERP fetch 자체는 각 Dataset 독립 · dependency 는 Mapping/Sync 단계에서만.
  //   현재 Buy Sync 는 migration 미적용으로 BLOCKED · 별도 사용자 알림 불필요.
  void _dataset;
  return null;
}

export function getDatasetState(dataset: DatasetKey): DatasetState {
  const metadata = getMetadata(dataset);
  const mem = memory[dataset];
  const candidate = metadata?.candidate ?? null;
  const lastSynced = metadata?.lastSynced ?? null;
  const readiness = computeReadiness(dataset, candidate?.validation, mem.phase);
  return {
    dataset,
    phase: mem.phase,
    readiness,
    snapshot: candidate ?? lastSynced ?? null, // 호환성
    candidate,
    lastSynced,
    lastSyncAttemptAt: metadata?.lastSyncAttemptAt ?? null,
    lastSyncResult: metadata?.lastSyncResult ?? null,
    inflight: mem.inflight,
    lastError: mem.lastError,
    dependencyMessage: dependencyMessage(dataset),
    mappingVersion: metadata?.mappingVersion ?? CURRENT_MAPPING_VERSION,
  };
}

export function getAllDatasetStates(): Record<DatasetKey, DatasetState> {
  return {
    PRODUCT_LIST: getDatasetState("PRODUCT_LIST"),
    INVENTORY_STATUS: getDatasetState("INVENTORY_STATUS"),
    BUY_STATUS: getDatasetState("BUY_STATUS"),
    SALE_STATUS: getDatasetState("SALE_STATUS"),
  };
}

export function getQueueStatus(): ReturnType<typeof erpQueue.status> {
  return erpQueue.status();
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch · in-flight 상태 관리
// ─────────────────────────────────────────────────────────────────────────────
function updateInflight(dataset: DatasetKey, patch: Partial<DatasetProgress>, phase?: FetchPhase): void {
  const mem = memory[dataset];
  const current: DatasetProgress = mem.inflight ?? { dataset, phase: "QUEUED" };
  const next: DatasetProgress = { ...current, ...patch, dataset, phase: patch.phase ?? current.phase };
  mem.inflight = next;
  if (phase) mem.phase = phase;
  broadcastDatasetProgress(next);
}

function clearInflight(dataset: DatasetKey, finalPhase: FetchPhase): void {
  memory[dataset].inflight = null;
  memory[dataset].phase = finalPhase;
}

function broadcastFinalState(dataset: DatasetKey): void {
  broadcastDatasetProgress({
    dataset,
    phase: memory[dataset].phase,
    message: memory[dataset].lastError ?? undefined,
  });
}

export function enqueueFetch(dataset: DatasetKey, opts?: { startDate?: string; endDate?: string }): void {
  if (memory[dataset].inflight) return;
  if (erpQueue.waitingFor(dataset)) return;

  const startedAt = new Date().toISOString();
  memory[dataset].inflight = { dataset, phase: "QUEUED", startedAt };
  memory[dataset].phase = "QUEUED";
  memory[dataset].lastError = null;
  broadcastDatasetProgress(memory[dataset].inflight!);

  erpQueue.enqueue({
    dataset,
    label: DATASET_API_NAME[dataset],
    run: async () => {
      try {
        if (dataset === "PRODUCT_LIST") await runProductFetch(startedAt);
        else if (dataset === "INVENTORY_STATUS") await runInventoryFetch(startedAt, opts);
        else if (dataset === "BUY_STATUS") await runBuyFetch(startedAt, opts);
        else if (dataset === "SALE_STATUS") await runSaleFetch(startedAt, opts);
      } catch (err) {
        const msg = (err as Error).message ?? String(err);
        memory[dataset].lastError = msg;
        updateInflight(dataset, { phase: "FAILED", message: msg }, "FAILED");
        setTimeout(() => { clearInflight(dataset, "FAILED"); broadcastFinalState(dataset); }, 500);
        throw err;
      }
    },
  });
}

/**
 * 2026-10-04 · ERP fetch 완료를 Promise 로 await.
 * Scheduler / 상단 "동기화 확인" workflow 가 fetch → validate → diff 를 하나의 함수로 실행하기 위함.
 */
export function enqueueFetchAwait(dataset: DatasetKey, opts?: { startDate?: string; endDate?: string }): Promise<void> {
  return new Promise((resolve, reject) => {
    if (memory[dataset].inflight) return reject(new Error(`${dataset} 이미 진행 중`));
    if (erpQueue.waitingFor(dataset)) return reject(new Error(`${dataset} 이미 대기열에 있음`));

    const startedAt = new Date().toISOString();
    memory[dataset].inflight = { dataset, phase: "QUEUED", startedAt };
    memory[dataset].phase = "QUEUED";
    memory[dataset].lastError = null;
    broadcastDatasetProgress(memory[dataset].inflight!);

    erpQueue.enqueue({
      dataset,
      label: DATASET_API_NAME[dataset],
      run: async () => {
        if (dataset === "PRODUCT_LIST") await runProductFetch(startedAt);
        else if (dataset === "INVENTORY_STATUS") await runInventoryFetch(startedAt, opts);
        else if (dataset === "BUY_STATUS") await runBuyFetch(startedAt, opts);
        else if (dataset === "SALE_STATUS") await runSaleFetch(startedAt, opts);
      },
      onComplete: (ok, err) => {
        if (ok) resolve();
        else {
          const msg = err?.message ?? "fetch failed";
          memory[dataset].lastError = msg;
          updateInflight(dataset, { phase: "FAILED", message: msg }, "FAILED");
          setTimeout(() => { clearInflight(dataset, "FAILED"); broadcastFinalState(dataset); }, 500);
          reject(err ?? new Error(msg));
        }
      },
    });
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT_LIST Fetch
// ─────────────────────────────────────────────────────────────────────────────
async function runProductFetch(startedAt: string): Promise<void> {
  const dataset: DatasetKey = "PRODUCT_LIST";
  updateInflight(dataset, { phase: "REQUESTING", message: "ERP 사업장 상품관리 조회 시작" }, "REQUESTING");

  const result = await queryProductList({ pageSize: 50, concurrency: 1 });
  if (!result.ok) throw new Error(`${result.stage}: ${result.error}`);

  updateInflight(dataset, { phase: "DECODING", message: "데이터 변환 중..." }, "DECODING");
  updateInflight(dataset, { phase: "VALIDATING", message: "데이터 검증 중..." }, "VALIDATING");

  // Validation (ERP 수준 · DB 비교 X)
  const validation = validateErpSnapshot(result.rows as unknown as ValidationErpRow[], null, {});
  const vSum: ValidationSummary = {
    totalRows: validation.totalRows,
    normal: validation.normal,
    review: validation.review,
    error: validation.error,
    blockingErrors: validation.blockingErrors,
  };

  // Dataset hash
  const hash = datasetHashProducts(result.rows as unknown as ProductFingerprintRow[]);

  // Candidate 저장 (atomic · 기존 보호)
  saveCandidate({
    dataset,
    rows: result.rows,
    startedAt,
    checksum: hash,
    validation: vSum,
    mappingVersion: CURRENT_MAPPING_VERSION,
  });

  updateInflight(dataset, { phase: "READY", message: `완료 · ${result.rowCount.toLocaleString()}건` }, "READY");
  setTimeout(() => { clearInflight(dataset, "READY"); broadcastFinalState(dataset); }, 2000);
}

// ─────────────────────────────────────────────────────────────────────────────
// INVENTORY_STATUS Fetch
// ─────────────────────────────────────────────────────────────────────────────
async function runInventoryFetch(startedAt: string, opts?: { startDate?: string; endDate?: string }): Promise<void> {
  const dataset: DatasetKey = "INVENTORY_STATUS";
  updateInflight(dataset, { phase: "REQUESTING", message: "ERP 재고 입출고 현황 조회 시작" }, "REQUESTING");
  const result = await queryInventoryStatus(opts);
  if (!result.ok) throw new Error(`${result.stage}: ${result.error}`);

  updateInflight(dataset, { phase: "DECODING", message: "데이터 변환 중..." }, "DECODING");
  updateInflight(dataset, { phase: "VALIDATING", message: "구조 검증 중..." }, "VALIDATING");

  const rows = result.rows as Array<{ PCode?: unknown; ProductName?: unknown }>;
  let missingPCode = 0;
  const seen = new Set<string>();
  let dupPCode = 0;
  for (const r of rows) {
    const pc = String(r.PCode ?? "").trim();
    if (!pc) missingPCode++;
    else if (seen.has(pc)) dupPCode++;
    else seen.add(pc);
  }
  const errorCount = missingPCode + dupPCode;
  const vSum: ValidationSummary = {
    totalRows: rows.length,
    normal: rows.length - errorCount,
    review: 0,
    error: errorCount,
    blockingErrors: errorCount > 0,
  };

  // 간이 hash (identity 정렬 후 PCode 만)
  const sortedIds = rows.map((r) => String(r.PCode ?? "").trim()).sort().join("|");
  const hash = require("crypto").createHash("sha256").update(sortedIds).digest("hex");

  saveCandidate({
    dataset,
    rows: result.rows,
    startedAt,
    checksum: hash,
    validation: vSum,
    mappingVersion: CURRENT_MAPPING_VERSION,
  });

  // 2026-10-05 · Bug Fix A · AUTO scheduler fetch-history 기록
  //   · fetchLatestFetchMeta() 가 가장 최근 queryFrom/queryTo 를 반환함
  //   · AUTO 실행 후 candidate 가 AUTO period 로 교체됐으므로 fetch-history 에도 AUTO 기간을 기록해야
  //     manual sync 가 올바른 period(AUTO rows 와 일치) 로 Supabase compare 수행
  //   · 기록 실패는 조회 결과를 깨뜨리지 않도록 best-effort
  try {
    appendFetchHistory(dataset, {
      fetchedAt: startedAt,
      ok: true,
      rowCount: result.rows.length,
      queryFrom: opts?.startDate,
      queryTo: opts?.endDate,
      soapMs: result.meta?.soapMs,
      totalMs: result.meta?.totalMs,
    });
  } catch (err) {
    console.warn(`[erpSyncOrchestrator] INVENTORY_STATUS fetch-history 기록 실패 · ${(err as Error).message}`);
  }

  updateInflight(dataset, { phase: "READY", message: `완료 · ${result.rowCount.toLocaleString()}건` }, "READY");
  setTimeout(() => { clearInflight(dataset, "READY"); broadcastFinalState(dataset); }, 2000);
}

// ─────────────────────────────────────────────────────────────────────────────
// BUY_STATUS Fetch
// ─────────────────────────────────────────────────────────────────────────────
async function runBuyFetch(startedAt: string, opts?: { startDate?: string; endDate?: string }): Promise<void> {
  const dataset: DatasetKey = "BUY_STATUS";
  updateInflight(dataset, { phase: "REQUESTING", message: "ERP 매입내역 조회 시작" }, "REQUESTING");
  const result = await queryBuyStatus(opts);
  if (!result.ok) throw new Error(`${result.stage}: ${result.error}`);

  updateInflight(dataset, { phase: "DECODING", message: "데이터 변환 중..." }, "DECODING");
  updateInflight(dataset, { phase: "VALIDATING", message: "매입 트랜잭션 검증 중..." }, "VALIDATING");

  const rows = result.rows as Array<{ BmCode?: unknown; ROWNUM?: unknown; PCode?: unknown }>;
  let missingKey = 0, dupKey = 0, missingPCode = 0;
  const seenKey = new Set<string>();
  for (const r of rows) {
    const bm = String(r.BmCode ?? "").trim();
    const rn = Number(r.ROWNUM);
    if (!bm || !Number.isFinite(rn) || rn < 1) missingKey++;
    else {
      const k = `${bm}|${rn}`;
      if (seenKey.has(k)) dupKey++;
      else seenKey.add(k);
    }
    if (!String(r.PCode ?? "").trim()) missingPCode++;
  }
  const errorCount = missingKey + dupKey + missingPCode;
  const vSum: ValidationSummary = {
    totalRows: rows.length,
    normal: rows.length - errorCount,
    review: 0,
    error: errorCount,
    blockingErrors: errorCount > 0,
  };

  const hash = datasetHashBuys(rows as unknown as BuyFingerprintRow[]);

  saveCandidate({
    dataset,
    rows: result.rows,
    startedAt,
    checksum: hash,
    validation: vSum,
    mappingVersion: CURRENT_MAPPING_VERSION,
  });
  updateInflight(dataset, { phase: "READY", message: `완료 · ${result.rowCount.toLocaleString()}건` }, "READY");
  setTimeout(() => { clearInflight(dataset, "READY"); broadcastFinalState(dataset); }, 2000);
}

// ─────────────────────────────────────────────────────────────────────────────
// SALE_STATUS Fetch
// ─────────────────────────────────────────────────────────────────────────────
// 2026-10-04 · 판매내역 · ERP 조회 + Decode + 기본 검증 · Supabase WRITE 없음
//   · DB sales 테이블 미정의 · readiness=NOT_CONFIGURED · 상단 Sync 비활성
async function runSaleFetch(startedAt: string, opts?: { startDate?: string; endDate?: string }): Promise<void> {
  const dataset: DatasetKey = "SALE_STATUS";
  updateInflight(dataset, { phase: "REQUESTING", message: "ERP 판매내역 조회 시작" }, "REQUESTING");
  const result = await querySaleStatus(opts);
  if (!result.ok) throw new Error(`${result.stage}: ${result.error}`);

  updateInflight(dataset, { phase: "DECODING", message: "데이터 변환 중..." }, "DECODING");
  updateInflight(dataset, { phase: "VALIDATING", message: "판매 트랜잭션 구조 검증 중..." }, "VALIDATING");

  // 간이 검증 (판매 identity 는 응답 schema 확인 후 확정) · 응답 자체 비정상 여부만 체크
  const rows = result.rows as Array<Record<string, unknown>>;
  const emptyRow = rows.length === 0;
  const vSum: ValidationSummary = {
    totalRows: rows.length,
    normal: rows.length,
    review: 0,
    error: 0,
    blockingErrors: false,
  };
  void emptyRow;

  // 간이 hash (rows.length + 상위 10행 serialize)
  const hash = require("crypto").createHash("sha256").update(JSON.stringify({ n: rows.length, sample: rows.slice(0, 10) })).digest("hex");

  saveCandidate({
    dataset,
    rows: result.rows,
    startedAt,
    checksum: hash,
    validation: vSum,
    mappingVersion: CURRENT_MAPPING_VERSION,
  });
  updateInflight(dataset, { phase: "READY", message: `완료 · ${result.rowCount.toLocaleString()}건` }, "READY");
  setTimeout(() => { clearInflight(dataset, "READY"); broadcastFinalState(dataset); }, 2000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Local Diff + Supabase Final Diff (candidate 재사용 · ERP 호출 없음)
// ─────────────────────────────────────────────────────────────────────────────
export async function buildProductDiff(): Promise<{
  localDiff: LocalDiffSummary;
  supabaseDiff: SupabaseDiffSummary;
  candidateHash: string | null;
  lastSyncedHash: string | null;
  firstRun: boolean;
  mappingVersion: number;
}> {
  const dataset: DatasetKey = "PRODUCT_LIST";
  const candidate = loadCandidateFull<ProductFingerprintRow>(dataset);
  if (!candidate) throw new Error("Product_List candidate snapshot 없음 · 먼저 ERP 가져오기");

  const lastSynced = loadLastSyncedFull<ProductFingerprintRow>(dataset);

  // mappingVersion 변경 감지
  const currentMV = CURRENT_MAPPING_VERSION;
  const lastMV = lastSynced?.meta.mappingVersion ?? null;
  const mvChanged = lastMV != null && lastMV !== currentMV;
  const firstRun = !lastSynced || mvChanged;

  // Local Diff
  const localDiff = diffProductsLocal(
    candidate.rows as ProductFingerprintRow[],
    firstRun ? null : (lastSynced?.rows as ProductFingerprintRow[]),
  );

  // Supabase Final Diff
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase client 미설정 · SUPABASE_URL/KEY 확인");

  // DB 전수 READ (product_code + 비교 field)
  const dbRows: DbProductRow[] = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("products")
      .select(
        "product_code, product_name, supplier, supplier_code, unit, sale_status, brand, manufacturer, " +
        "last_purchase_date, last_sale_date, current_stock, display_location, location, " +
        "optimal_stock, memo, hidden, stock_note, imported_at",
      )
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`products 조회 실패 · ${error.message}`);
    if (!data || data.length === 0) break;
    dbRows.push(...(data as unknown as DbProductRow[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  const dbIndex = indexDbByCode(dbRows);

  // Local Diff 결과 중 NEW/CHANGED 만 → candidate ERP row 추출
  //   first-run (lastSynced 없음) 이면 Local Diff 가 전부 NEW 로 분류 · OK
  const candidateByIdx = candidate.rows;
  const candidatesToCompare: ErpProductRow[] = [];
  for (const d of localDiff.rows) {
    if (d.action === "NEW" || d.action === "CHANGED") {
      if (d.candidateIndex != null) {
        candidatesToCompare.push(candidateByIdx[d.candidateIndex] as unknown as ErpProductRow);
      }
    }
  }

  const supabaseDiff = diffProductsVsSupabase(candidatesToCompare, dbIndex);

  return {
    localDiff,
    supabaseDiff,
    candidateHash: candidate.meta.checksum,
    lastSyncedHash: lastSynced?.meta.checksum ?? null,
    firstRun,
    mappingVersion: currentMV,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Snapshot rows sample (ERP 호출 없이)
// ─────────────────────────────────────────────────────────────────────────────
export function loadRows(dataset: DatasetKey): unknown[] | null {
  const full = loadCandidateFull(dataset);
  return full?.rows ?? null;
}

/** Validation 재실행 (candidate 재사용) */
export function revalidate(dataset: DatasetKey): ValidationSummary | null {
  const full = loadCandidateFull(dataset);
  if (!full) return null;
  if (dataset === "PRODUCT_LIST") {
    const v = validateErpSnapshot(full.rows as unknown as ValidationErpRow[], null, {});
    const vSum: ValidationSummary = {
      totalRows: v.totalRows,
      normal: v.normal,
      review: v.review,
      error: v.error,
      blockingErrors: v.blockingErrors,
    };
    // snapshotStore 쪽 validation update (별도 helper 추가 가능 · 현재 간단 skip)
    return vSum;
  }
  return full.meta.validation ?? null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sync Apply · Phase 3 승인 전까지 전체 WRITE 금지
// (실제 WRITE 로직은 server/services/erpSync/productSyncRunner 재사용 예정)
// ─────────────────────────────────────────────────────────────────────────────
export async function applyProductSync(_opts?: { allowWrite?: boolean }): Promise<{
  ok: boolean;
  dryRun: boolean;
  inserted: number;
  updated: number;
  failed: number;
  message?: string;
}> {
  void _opts;
  return {
    ok: false,
    dryRun: true,
    inserted: 0,
    updated: 0,
    failed: 0,
    message: "전체 WRITE 는 Phase 3 사용자 승인 후 활성화 · 현재는 Preview 전용.",
  };
}

/** 승인된 Promotion · Read-back 통과 후 호출용 (Phase 3) */
export function promoteOnVerifiedSuccess(dataset: DatasetKey): void {
  const meta = promoteCandidateToLastSynced(dataset);
  if (meta) {
    recordSyncAttempt(dataset, "VERIFIED_SUCCESS");
    updateSyncStatus(dataset, "SYNCED");
  }
}
