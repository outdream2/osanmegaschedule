// apps/sync-agent/src/main/erpSyncOrchestrator.ts
// 2026-10-03 저녁 · Phase 2 · ERP → Supabase 전체 파이프라인 (sync-agent main)
//
// 역할:
//   · Fetch (ERP SOAP · 기존 queryProductList 재사용) → in-memory snapshot
//   · Decode / JSON (iregenSoap.ts 가 이미 수행)
//   · Normalize + Validate (erpValidationEngine)
//   · Mapping + Diff (erpProductMapper + Supabase READ)
//   · Preview (summary + issues + change rows)
//   · Apply (DRY_RUN 기본 · WRITE 는 double-gate)
//
// 반환은 IPC 를 통해 Renderer 로 전달 · 민감정보 노출 금지

import { queryProductList } from "./iregenSoap";
import { getSupabaseClient, getSupabaseStatus } from "./supabaseClient";
import {
  validateErpSnapshot,
  type ValidationReport,
  type ValidationErpRow,
  type ValidationDbSnapshot,
} from "../../../../src/shared/erp/erpValidationEngine";
import {
  buildErpProductPayload,
  type ErpProductRow,
  type DbProductRow,
} from "../../../../src/shared/erp/erpProductMapper";

export type OrchestratorPhase =
  | "IDLE"
  | "FETCHING"
  | "DECODED"
  | "VALIDATING"
  | "PREVIEW_READY"
  | "SYNCING"
  | "COMPLETED"
  | "FAILED"
  | "ERROR_BLOCKED";

export interface SyncSummary {
  readonly erpProducts: number;
  readonly dbProducts: number;
  readonly matched: number;
  readonly newInsert: number;
  readonly dbOnly: number;
  readonly conflict: number;
  readonly wouldInsert: number;
  readonly wouldUpdate: number;
  readonly wouldDelete: 0;
  readonly currentStockChanges: number;
  readonly locationChanges: number;
  readonly locationReview: number;
}

export interface ChangeRow {
  readonly barcode: string;
  readonly pcode: string;
  readonly productName: string;
  readonly action: "INSERT" | "UPDATE" | "SAME";
  readonly changedFields: readonly string[];
}

export interface PreviewPayload {
  readonly phase: OrchestratorPhase;
  readonly fetchedAt: string;
  readonly erpConfig: { present: boolean };
  readonly supabaseConfig: { present: boolean; urlSuffix: string | null };
  readonly summary: SyncSummary;
  readonly validation: ValidationReport;
  readonly changes: readonly ChangeRow[];
  readonly dryRunOnly: true;
  readonly blockingErrors: boolean;
}

/** session 상태 · Renderer 가 Preview → Apply 호출 사이에 재사용 */
interface SessionState {
  snapshot: ErpProductRow[] | null;
  dbRows: DbProductRow[] | null;
  preview: PreviewPayload | null;
  fetchedAt: string | null;
}

const session: SessionState = {
  snapshot: null,
  dbRows: null,
  preview: null,
  fetchedAt: null,
};

/** Supabase products 전수 READ (payload build 용) */
async function loadAllProductsFromDb(): Promise<DbProductRow[]> {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error("Supabase 미설정 · SUPABASE_URL/KEY 확인");
  const PAGE = 1000;
  const out: DbProductRow[] = [];
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
    out.push(...(data as unknown as DbProductRow[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

/** 1. Fetch (ERP SOAP · in-memory snapshot) · concurrency=1 유지 */
export async function fetchErpSnapshot(): Promise<
  | { ok: true; rows: number; fetchedAt: string }
  | { ok: false; stage: string; error: string }
> {
  const t0 = Date.now();
  console.log("[erpSyncOrchestrator] FETCH 시작 · concurrency=1");
  const result = await queryProductList({ pageSize: 50, concurrency: 1 });
  const ms = Date.now() - t0;
  if (!result.ok) {
    console.error(`[erpSyncOrchestrator] FETCH 실패 · ${ms}ms · ${result.stage}: ${result.error}`);
    return { ok: false, stage: result.stage, error: result.error };
  }
  session.snapshot = result.rows as unknown as ErpProductRow[];
  session.fetchedAt = new Date().toISOString();
  session.preview = null;
  console.log(`[erpSyncOrchestrator] FETCH 완료 · ${ms}ms · rows=${result.rowCount}`);
  return { ok: true, rows: result.rowCount, fetchedAt: session.fetchedAt };
}

/** 2. Validate + Diff + Preview 생성 */
export async function buildPreview(): Promise<PreviewPayload> {
  if (!session.snapshot) throw new Error("ERP snapshot 없음 · 먼저 Fetch 수행");

  // DB 로드
  const dbRows = await loadAllProductsFromDb();
  session.dbRows = dbRows;

  // Validation (DB snapshot 포함 · stock spike 체크)
  const dbStockMap = new Map<string, number | null>();
  for (const r of dbRows) {
    const bc = String(r.product_code).trim();
    const stock = r.current_stock == null ? null : Number(r.current_stock);
    dbStockMap.set(bc, Number.isFinite(stock as number) ? (stock as number) : null);
  }
  const dbSnapshotForValidation: ValidationDbSnapshot = { currentStockByBarcode: dbStockMap };
  const validation = validateErpSnapshot(
    session.snapshot as unknown as ValidationErpRow[],
    dbSnapshotForValidation,
    {},
  );

  // Diff / Preview summary
  const dbByCode = new Map(dbRows.map((p) => [String(p.product_code).trim(), p]));
  const seenErp = new Set<string>();
  let matched = 0, newInsert = 0, conflict = 0;
  let wouldUpdate = 0, wouldInsert = 0;
  let currentStockChanges = 0, locationChanges = 0, locationReview = 0;
  const changes: ChangeRow[] = [];

  for (const er of session.snapshot) {
    const bc = String(er.BarCode ?? "").trim();
    if (!bc) continue;
    if (seenErp.has(bc)) { conflict++; continue; }
    seenErp.add(bc);
    const dbRow = dbByCode.get(bc) ?? null;
    try {
      const result = buildErpProductPayload(er, dbRow);
      if (result.locationDecision === "review") locationReview++;
      if (result.payload.current_stock !== undefined) currentStockChanges++;
      if (result.payload.display_location !== undefined) locationChanges++;
      if (dbRow) {
        matched++;
        if (result.changedCount > 0) {
          wouldUpdate++;
          const changedFields = Object.keys(result.payload);
          // 최대 500 행만 상세 보존 (Renderer DOM 폭주 방지)
          if (changes.length < 500) {
            changes.push({
              barcode: bc,
              pcode: String(er.PCode ?? ""),
              productName: String(er.ProductName ?? ""),
              action: "UPDATE",
              changedFields,
            });
          }
        }
      } else {
        newInsert++;
        wouldInsert++;
        if (changes.length < 500) {
          changes.push({
            barcode: bc,
            pcode: String(er.PCode ?? ""),
            productName: String(er.ProductName ?? ""),
            action: "INSERT",
            changedFields: Object.keys(result.payload),
          });
        }
      }
    } catch {
      // mapper 실패 시 skip (validation 에서 이미 분류됨)
    }
  }
  const dbOnly = dbRows.filter((p) => !seenErp.has(String(p.product_code).trim())).length;

  const summary: SyncSummary = {
    erpProducts: session.snapshot.length,
    dbProducts: dbRows.length,
    matched,
    newInsert,
    dbOnly,
    conflict,
    wouldInsert,
    wouldUpdate,
    wouldDelete: 0,
    currentStockChanges,
    locationChanges,
    locationReview,
  };

  const preview: PreviewPayload = {
    phase: validation.blockingErrors ? "ERROR_BLOCKED" : "PREVIEW_READY",
    fetchedAt: session.fetchedAt ?? new Date().toISOString(),
    erpConfig: { present: true },
    supabaseConfig: getSupabaseStatus(),
    summary,
    validation,
    changes,
    dryRunOnly: true,
    blockingErrors: validation.blockingErrors,
  };
  session.preview = preview;
  return preview;
}

/** 3. Apply · Supabase WRITE · 반드시 double gate */
export async function applySync(opts: {
  mode?: "DRY_RUN" | "WRITE";
  allowWrite?: boolean;
}): Promise<{ ok: boolean; dryRun: boolean; inserted: number; updated: number; failed: number; message?: string }> {
  const mode = opts.mode ?? "DRY_RUN";
  const allowWrite = opts.allowWrite === true;
  if (!session.preview) throw new Error("Preview 없음 · 먼저 Preview 생성");
  if (session.preview.blockingErrors) {
    return { ok: false, dryRun: true, inserted: 0, updated: 0, failed: 0, message: "ERROR 가 존재하여 Sync 차단됨" };
  }
  if (mode === "WRITE" && !allowWrite) {
    return { ok: false, dryRun: true, inserted: 0, updated: 0, failed: 0, message: "WRITE 요청 거부 · allowWrite=false" };
  }
  // 이번 단계에서는 전체 WRITE 를 활성화하지 않음 · Phase 3 명시 승인 후 productSyncRunner 를 호출하는 경로를 추가 예정
  return {
    ok: false,
    dryRun: mode !== "WRITE" || !allowWrite,
    inserted: 0,
    updated: 0,
    failed: 0,
    message: "전체 WRITE 는 Phase 3 사용자 승인 후 활성화. 현재는 DRY-RUN 전용.",
  };
}

export function getSessionStatus(): {
  snapshotRows: number | null;
  fetchedAt: string | null;
  previewReady: boolean;
  blockingErrors: boolean | null;
} {
  return {
    snapshotRows: session.snapshot?.length ?? null,
    fetchedAt: session.fetchedAt,
    previewReady: !!session.preview,
    blockingErrors: session.preview?.blockingErrors ?? null,
  };
}
