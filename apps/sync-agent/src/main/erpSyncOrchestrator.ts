// apps/sync-agent/src/main/erpSyncOrchestrator.ts
// 2026-10-04 · Phase 2 · ERP → Supabase Gateway · Multi-dataset Orchestrator
//
// 3개 Dataset 독립 관리:
//   PRODUCT_LIST     · Product_List (SOAP · 81 pages · ~4분)
//   INVENTORY_STATUS · Inventory_Status (SOAP · 단일 응답 · 42 field)
//   BUY_STATUS       · Buy_Status (SOAP · DevStartDate/EndDate 기간)
//
// 각 Dataset:
//   · 독립 Fetch
//   · 영속 Snapshot (userData/snapshots/{DATASET}.json)
//   · 독립 Validation 결과
//   · 독립 readiness state (READY / REVIEW / BLOCKED / NOT_CONFIGURED)
//
// ERP 호출:
//   · 전역 Queue · concurrency = 1 · 순차 실행
//   · 사용자 UI 에서 여러 선택해도 병렬 호출 금지

import { BrowserWindow } from "electron";
import { queryProductList, queryInventoryStatus, queryBuyStatus } from "./iregenSoap";
import { erpQueue } from "./erpQueue";
import {
  loadSnapshotMeta,
  loadSnapshotFull,
  saveSnapshot,
  updateSnapshotValidation,
} from "./snapshotStore";
import {
  DATASET_API_NAME,
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

// ─────────────────────────────────────────────────────────────────────────────
// Broadcast · dataset-progress
// ─────────────────────────────────────────────────────────────────────────────
function broadcastDatasetProgress(p: DatasetProgress): void {
  for (const w of BrowserWindow.getAllWindows()) {
    try {
      w.webContents.send("erp:dataset-progress", p);
    } catch {
      /* ignore */
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory state (per dataset)
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
};

// ─────────────────────────────────────────────────────────────────────────────
// Readiness 계산 (snapshot + validation + 정책)
// ─────────────────────────────────────────────────────────────────────────────
function computeReadiness(dataset: DatasetKey, validation: ValidationSummary | undefined, phase: FetchPhase): SyncReadiness {
  if (phase === "FAILED") return "BLOCKED";
  // Phase 2 정책:
  //   PRODUCT_LIST     · validation 통과하면 READY · REVIEW 있으면 REVIEW
  //   BUY_STATUS       · migration 미적용 상태 · BLOCKED (호출부가 체크)
  //   INVENTORY_STATUS · destination 미확정 · NOT_CONFIGURED
  if (dataset === "INVENTORY_STATUS") return "NOT_CONFIGURED";
  if (dataset === "BUY_STATUS") return "BLOCKED"; // migration 적용 후 Phase 3 에서 해제
  // PRODUCT_LIST
  if (!validation) return "READY";
  if (validation.blockingErrors) return "BLOCKED";
  if (validation.review > 0) return "REVIEW";
  return "READY";
}

function dependencyMessage(dataset: DatasetKey): string | null {
  if (dataset === "BUY_STATUS") {
    const prod = loadSnapshotMeta("PRODUCT_LIST");
    if (!prod) return "매입내역 매핑에는 상품정보 데이터가 필요합니다. 상품정보 를 먼저 가져오세요.";
    return null;
  }
  return null;
}

export function getDatasetState(dataset: DatasetKey): DatasetState {
  const snapshot = loadSnapshotMeta(dataset);
  const mem = memory[dataset];
  const readiness = computeReadiness(dataset, snapshot?.validation, mem.phase);
  return {
    dataset,
    phase: mem.phase,
    readiness,
    snapshot,
    inflight: mem.inflight,
    lastError: mem.lastError,
    dependencyMessage: dependencyMessage(dataset),
  };
}

export function getAllDatasetStates(): Record<DatasetKey, DatasetState> {
  return {
    PRODUCT_LIST: getDatasetState("PRODUCT_LIST"),
    INVENTORY_STATUS: getDatasetState("INVENTORY_STATUS"),
    BUY_STATUS: getDatasetState("BUY_STATUS"),
  };
}

export function getQueueStatus(): ReturnType<typeof erpQueue.status> {
  return erpQueue.status();
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch job · Dataset 별 ERP SOAP 호출 + 저장
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

/**
 * Dataset 1개 Fetch · Queue 에 enqueue · 호출자는 바로 return (비동기)
 */
export function enqueueFetch(dataset: DatasetKey, opts?: { startDate?: string; endDate?: string }): void {
  // 이미 queue 에 들어있거나 실행중이면 중복 enqueue 금지
  if (memory[dataset].inflight) return;
  if (erpQueue.waitingFor(dataset)) return;

  // 초기 Queued 상태 broadcast
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
        if (dataset === "PRODUCT_LIST") await runProductListFetch(startedAt);
        else if (dataset === "INVENTORY_STATUS") await runInventoryStatusFetch(startedAt, opts);
        else if (dataset === "BUY_STATUS") await runBuyStatusFetch(startedAt, opts);
      } catch (err) {
        const msg = (err as Error).message ?? String(err);
        memory[dataset].lastError = msg;
        updateInflight(dataset, { phase: "FAILED", message: msg }, "FAILED");
        setTimeout(() => { clearInflight(dataset, "FAILED"); broadcastFinalState(dataset); }, 500);
      }
    },
  });
}

function broadcastFinalState(dataset: DatasetKey): void {
  broadcastDatasetProgress({
    dataset,
    phase: memory[dataset].phase,
    message: memory[dataset].lastError ?? undefined,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// PRODUCT_LIST Fetch
// ─────────────────────────────────────────────────────────────────────────────
async function runProductListFetch(startedAt: string): Promise<void> {
  const dataset: DatasetKey = "PRODUCT_LIST";
  updateInflight(dataset, { phase: "REQUESTING", message: "ERP 사업장 상품관리 조회 시작" }, "REQUESTING");

  // Product_List 는 pagination · iregenSoap 가 broadcastProductProgress 를 쏘지만
  // 그건 "erp:product-progress" channel · 우리의 dataset-progress 로 bridge
  const unsubBridge = bridgeProductProgressToDataset(dataset);

  const result = await queryProductList({ pageSize: 50, concurrency: 1 });
  unsubBridge();

  if (!result.ok) {
    throw new Error(`${result.stage}: ${result.error}`);
  }

  updateInflight(dataset, { phase: "DECODING", message: "데이터 변환 중..." }, "DECODING");
  updateInflight(dataset, { phase: "VALIDATING", message: "데이터 검증 중..." }, "VALIDATING");

  // Validation (DB snapshot 없이 · 상품 수준 validation 만 실행)
  const validation = validateErpSnapshot(result.rows as unknown as ValidationErpRow[], null, {});
  const vSum: ValidationSummary = {
    totalRows: validation.totalRows,
    normal: validation.normal,
    review: validation.review,
    error: validation.error,
    blockingErrors: validation.blockingErrors,
  };

  // 저장 (기존 snapshot atomic 교체)
  saveSnapshot(dataset, result.rows, startedAt, vSum);

  updateInflight(dataset, { phase: "READY", message: `완료 · ${result.rowCount.toLocaleString()}건` }, "READY");
  setTimeout(() => { clearInflight(dataset, "READY"); broadcastFinalState(dataset); }, 2000);
}

/** Product_List pagination 진행률 (iregenSoap · erp:product-progress) 를 dataset-progress 로 bridge */
function bridgeProductProgressToDataset(dataset: DatasetKey): () => void {
  // iregenSoap 는 BrowserWindow.webContents.send 로 broadcast · 우리는 "메인 process 끼리" 수신 X
  // 대신 iregenSoap 는 매 batch 완료 시 send 를 호출하는데, 우리는 그 상태를 추적하기 위해
  // ipcMain.on 으로 받을 수 있지만 send 는 renderer 로 가는 것.
  // 대안: 바로 renderer 가 수신 가능하지만 "dataset-progress" 채널로 통일하려면
  //       iregenSoap 쪽에 변경이 필요 · 이번에는 기존 "erp:product-progress" 도 renderer 가 수신하도록
  //       그대로 두고, 추가로 "erp:dataset-progress" 를 뿌리는 timer 로 보완
  // 간단화: 상위 REQUESTING/VALIDATING/READY 만 dataset-progress 로 broadcast
  //         상세 pagination 진행률은 renderer 가 기존 onErpProductProgress 리스너로 받아 UI 매핑
  void dataset;
  return () => {};
}

// ─────────────────────────────────────────────────────────────────────────────
// INVENTORY_STATUS Fetch
// ─────────────────────────────────────────────────────────────────────────────
async function runInventoryStatusFetch(startedAt: string, opts?: { startDate?: string; endDate?: string }): Promise<void> {
  const dataset: DatasetKey = "INVENTORY_STATUS";
  updateInflight(dataset, { phase: "REQUESTING", message: "ERP 재고 입출고 현황 조회 시작" }, "REQUESTING");
  const result = await queryInventoryStatus(opts);
  if (!result.ok) throw new Error(`${result.stage}: ${result.error}`);

  updateInflight(dataset, { phase: "DECODING", message: "데이터 변환 중..." }, "DECODING");
  updateInflight(dataset, { phase: "VALIDATING", message: "구조 검증 중..." }, "VALIDATING");

  // Inventory_Status 는 필수 필드 (PCode · ProductName) 수준만 검증
  //   current_stock destination 미확정 · PRODUCT identity 수준 중복 체크만
  const rows = result.rows as Array<{ PCode?: unknown; ProductName?: unknown }>;
  let missingPCode = 0;
  const seenPCode = new Set<string>();
  let dupPCode = 0;
  for (const r of rows) {
    const pc = String(r.PCode ?? "").trim();
    if (!pc) missingPCode++;
    else {
      if (seenPCode.has(pc)) dupPCode++;
      else seenPCode.add(pc);
    }
  }
  const errorCount = missingPCode + dupPCode;
  const vSum: ValidationSummary = {
    totalRows: rows.length,
    normal: rows.length - errorCount,
    review: 0,
    error: errorCount,
    blockingErrors: errorCount > 0,
  };

  saveSnapshot(dataset, result.rows, startedAt, vSum);
  updateInflight(dataset, { phase: "READY", message: `완료 · ${result.rowCount.toLocaleString()}건` }, "READY");
  setTimeout(() => { clearInflight(dataset, "READY"); broadcastFinalState(dataset); }, 2000);
}

// ─────────────────────────────────────────────────────────────────────────────
// BUY_STATUS Fetch
// ─────────────────────────────────────────────────────────────────────────────
async function runBuyStatusFetch(startedAt: string, opts?: { startDate?: string; endDate?: string }): Promise<void> {
  const dataset: DatasetKey = "BUY_STATUS";
  updateInflight(dataset, { phase: "REQUESTING", message: "ERP 매입내역 조회 시작" }, "REQUESTING");
  const result = await queryBuyStatus(opts);
  if (!result.ok) throw new Error(`${result.stage}: ${result.error}`);

  updateInflight(dataset, { phase: "DECODING", message: "데이터 변환 중..." }, "DECODING");
  updateInflight(dataset, { phase: "VALIDATING", message: "매입 트랜잭션 검증 중..." }, "VALIDATING");

  // Buy_Status 는 (BmCode, ROWNUM) · PCode · 수량 · 금액 검증
  const rows = result.rows as Array<{ BmCode?: unknown; ROWNUM?: unknown; PCode?: unknown; StockCnt?: unknown; BuyTotal?: unknown }>;
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

  saveSnapshot(dataset, result.rows, startedAt, vSum);
  updateInflight(dataset, { phase: "READY", message: `완료 · ${result.rowCount.toLocaleString()}건` }, "READY");
  setTimeout(() => { clearInflight(dataset, "READY"); broadcastFinalState(dataset); }, 2000);
}

// ─────────────────────────────────────────────────────────────────────────────
// Snapshot 재사용 · Preview / Anomaly / Rows (ERP 호출 없음)
// ─────────────────────────────────────────────────────────────────────────────
export function loadRows(dataset: DatasetKey): unknown[] | null {
  const full = loadSnapshotFull(dataset);
  return full?.rows ?? null;
}

/** Validation 재실행 (snapshot 재사용 · ERP 호출 없음) */
export function revalidate(dataset: DatasetKey): ValidationSummary | null {
  const full = loadSnapshotFull(dataset);
  if (!full) return null;
  // Dataset 별 간이 Validation (PRODUCT 는 full engine · 그 외는 identity)
  if (dataset === "PRODUCT_LIST") {
    const v = validateErpSnapshot(full.rows as unknown as ValidationErpRow[], null, {});
    const vSum: ValidationSummary = {
      totalRows: v.totalRows,
      normal: v.normal,
      review: v.review,
      error: v.error,
      blockingErrors: v.blockingErrors,
    };
    updateSnapshotValidation(dataset, vSum);
    return vSum;
  }
  // Inventory · Buy 는 saveSnapshot 시 저장된 validation 반환
  return full.meta.validation ?? null;
}
