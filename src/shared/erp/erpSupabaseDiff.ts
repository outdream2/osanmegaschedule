// src/shared/erp/erpSupabaseDiff.ts
// 2026-10-04 · Phase 2 · Supabase Final Diff · candidate vs 현재 Supabase
//
// 역할:
//   · NEW/CHANGED (Local Diff 결과) 상품만 받아서
//   · 현재 Supabase 값과 최종 비교 → WRITE 후보 선정
//   · pure function · DB WRITE 없음 · Supabase client 는 호출부에서 주입
//
// 분류:
//   · DB_MISSING_WOULD_INSERT    (DB 없음 · ERP INSERT 후보)
//   · DB_DIFFERENT_WOULD_UPDATE  (DB 있지만 값 다름 · UPDATE 후보)
//   · DB_SAME_SKIP               (ERP 값과 DB 가 이미 동일 · SKIP)
//
// DELETE 는 영구 금지 · 분류 자체 없음

import { buildErpProductPayload, type ErpProductRow, type DbProductRow } from "./erpProductMapper";

export type SupabaseDiffAction = "DB_MISSING_WOULD_INSERT" | "DB_DIFFERENT_WOULD_UPDATE" | "DB_SAME_SKIP";

export interface SupabaseDiffEntry {
  readonly barcode: string;
  readonly productName: string;
  readonly action: SupabaseDiffAction;
  /** UPDATE/INSERT 시 Supabase 에 WRITE 될 explicit whitelist payload (SKIP 이면 {}) */
  readonly payload: Record<string, unknown>;
  /** 변경 field 이름 (UI 표시용) */
  readonly changedFields: readonly string[];
  /** 현재 DB row 참조 (SKIP · UPDATE 때만 non-null) */
  readonly dbRow: DbProductRow | null;
}

export interface SupabaseDiffSummary {
  readonly totalChecked: number;
  readonly wouldInsert: number;
  readonly wouldUpdate: number;
  readonly wouldSkipSame: number;
  readonly wouldDelete: 0;
  readonly entries: readonly SupabaseDiffEntry[];
}

/** DbProductRow index · product_code → row */
export function indexDbByCode(dbRows: readonly DbProductRow[]): Map<string, DbProductRow> {
  const m = new Map<string, DbProductRow>();
  for (const r of dbRows) {
    const code = String(r.product_code ?? "").trim();
    if (code) m.set(code, r);
  }
  return m;
}

/**
 * ERP candidate (NEW + CHANGED 로 filter 된 subset) 와 현재 DB 비교.
 *
 * @param candidateRows 로컬 diff 에서 NEW/CHANGED 로 분류된 ERP rows
 * @param dbIndex 현재 Supabase products 전수 (product_code 로 indexed)
 */
export function diffProductsVsSupabase(
  candidateRows: readonly ErpProductRow[],
  dbIndex: ReadonlyMap<string, DbProductRow>,
): SupabaseDiffSummary {
  const entries: SupabaseDiffEntry[] = [];
  let wouldInsert = 0, wouldUpdate = 0, wouldSkip = 0;

  for (const er of candidateRows) {
    const barcode = String(er.BarCode ?? "").trim();
    if (!barcode) continue;
    const dbRow = dbIndex.get(barcode) ?? null;
    try {
      const result = buildErpProductPayload(er, dbRow);
      const name = String(er.ProductName ?? "").trim();
      if (!dbRow) {
        // DB 없음 → INSERT 후보
        wouldInsert++;
        entries.push({
          barcode, productName: name,
          action: "DB_MISSING_WOULD_INSERT",
          payload: result.payload,
          changedFields: Object.keys(result.payload),
          dbRow: null,
        });
      } else if (result.changedCount === 0) {
        // 변경할 field 없음 (DB 가 이미 ERP 와 동일 또는 PROTECTED/NULL 로 처리됨) → SKIP
        wouldSkip++;
        entries.push({
          barcode, productName: name,
          action: "DB_SAME_SKIP",
          payload: {},
          changedFields: [],
          dbRow,
        });
      } else {
        // 변경 field 존재 → UPDATE 후보
        wouldUpdate++;
        entries.push({
          barcode, productName: name,
          action: "DB_DIFFERENT_WOULD_UPDATE",
          payload: result.payload,
          changedFields: Object.keys(result.payload),
          dbRow,
        });
      }
    } catch {
      // mapper 실패 (identity 없음 등) · 집계 제외 · Validation 에서 이미 분리
    }
  }

  return {
    totalChecked: candidateRows.length,
    wouldInsert,
    wouldUpdate,
    wouldSkipSame: wouldSkip,
    wouldDelete: 0,
    entries,
  };
}
