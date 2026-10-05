// src/shared/erp/productSyncCheck.ts
// 2026-10-04 · S2 · Product Sync Check Service · pcode primary identity
//
// 사용자 확정 설계 (2026-10-04):
//   NEW 판정 1차 기준: PCode ↔ products.pcode
//   BarCode 는 INSERT 직전 2차 충돌 검사
//   상품명 similarity 는 동기화 엔진에서 제외 · identity + whitelist 값으로만 기계 분류
//
// 분류 로직 트리:
//   PCode 있음 (ERP)
//     ├── products.pcode 매칭됨
//     │     ├── whitelist 값 동일 → SAME
//     │     └── whitelist 값 다름 → CHANGED
//     └── products.pcode 매칭 없음
//           ├── BarCode 충돌 없음 → NEW
//           └── BarCode 이미 존재  → ERROR_IDENTITY_CONFLICT
//   PCode 없음 (ERP) → SKIPPED_MISSING_PCODE (방어 · 정상 ERP 응답에선 발생 안 함)
//
// pure function · side effect 없음 · UI/IPC/Scheduler 공통 재사용
// 매핑 whitelist 는 erpSyncWhitelist.ts single source

import { ERP_OWNED_PRODUCT_FIELDS, isErpEmpty } from "./erpSyncWhitelist";
import type { ErpProductRow, DbProductRow } from "./erpProductMapper";
import { timestampsEqual } from "./timestampCompare";

export type SyncAction =
  | "SAME"
  | "CHANGED"
  | "NEW"
  | "ERROR_IDENTITY_CONFLICT"
  | "SKIPPED_MISSING_PCODE";

export interface FieldDiff {
  readonly field: string;        // DB column name
  readonly erpField: string;     // ERP source field
  readonly dbValue: unknown;
  readonly erpValue: unknown;
}

export interface SyncEntry {
  readonly pcode: string;
  readonly erpBarcode: string;
  readonly erpProductName: string;
  readonly action: SyncAction;
  /** SAME/CHANGED/ERROR 시 매칭된 DB row 의 product_code */
  readonly dbProductCode?: string;
  /** CHANGED 시 변경된 field 목록 */
  readonly changedFields?: ReadonlyArray<FieldDiff>;
  /** ERROR_IDENTITY_CONFLICT 시 충돌한 DB row */
  readonly conflictingDbRow?: { readonly product_code: string; readonly pcode: string | null; readonly product_name: string };
  /** ERROR 이유 */
  readonly errorReason?: string;
}

export interface SyncCheckSummary {
  readonly totalErp: number;
  readonly same: number;
  readonly changed: number;
  readonly new_: number;
  readonly errors: number;
  readonly skippedMissingPcode: number;
  readonly entries: ReadonlyArray<SyncEntry>;
}

/**
 * ERP 값과 DB 값 1건 비교 · 같으면 true (SAME · null-overwrite 규칙 반영).
 *
 *   nullOverwrite=true 인 field 는 ERP empty 라도 비교에 포함 (ex. current_stock=0 vs DB=5 → 다름)
 *   nullOverwrite=false 인 field 는 ERP empty 면 비교에서 skip (DB 값 유지 정책)
 */
function compareOne(dbVal: unknown, erpVal: unknown, nullOverwrite: boolean, isNumeric: boolean, isTimestamp: boolean): boolean {
  const erpEmpty = isErpEmpty(erpVal);
  if (erpEmpty && !nullOverwrite) return true;  // ERP 비어있으면 비교 skip = SAME 간주
  if (isTimestamp) {
    // 2026-10-04 · UTC instant 비교 · ERP "YYYY-MM-DD HH:MM:SS" vs Postgres TIMESTAMPTZ ISO
    return timestampsEqual(dbVal, erpVal);
  }
  if (isNumeric) {
    const d = dbVal == null ? null : Number(dbVal);
    const e = erpVal == null || erpVal === "" ? null : Number(erpVal);
    if (d == null && e == null) return true;
    if (d == null || e == null) return false;
    return d === e;
  }
  // 문자열 비교 (undefined/null → "")
  const d = dbVal == null ? "" : String(dbVal);
  const e = erpVal == null ? "" : String(erpVal);
  return d.trim() === e.trim();
}

/** DB column name → numeric 여부 */
const NUMERIC_FIELDS = new Set(["current_stock", "purchase_price", "sale_price"]);
/** DB column name → timestamp 여부 (UTC instant 비교) */
const TIMESTAMP_FIELDS = new Set(["erp_registered_at", "erp_modified_at"]);

/**
 * ERP row 와 DB row 를 whitelist 기준으로 비교.
 * @returns 변경된 field 목록 (빈 배열 = SAME)
 */
function diffWhitelistFields(erp: ErpProductRow, db: DbProductRow): FieldDiff[] {
  const diffs: FieldDiff[] = [];
  for (const [dbCol, mapping] of Object.entries(ERP_OWNED_PRODUCT_FIELDS)) {
    const erpField = mapping.erp;
    const erpVal = (erp as unknown as Record<string, unknown>)[erpField];
    const dbVal = (db as unknown as Record<string, unknown>)[dbCol];
    const isNumeric = NUMERIC_FIELDS.has(dbCol);
    const isTimestamp = TIMESTAMP_FIELDS.has(dbCol);
    if (!compareOne(dbVal, erpVal, mapping.nullOverwrite, isNumeric, isTimestamp)) {
      diffs.push({ field: dbCol, erpField, dbValue: dbVal, erpValue: erpVal });
    }
  }
  return diffs;
}

/**
 * Core: ERP Product_List 전체를 Supabase 와 비교하여 분류.
 *
 * @param erpRows   ERP Product_List rows (snapshot 로드 결과 그대로)
 * @param dbRows    Supabase products rows (whitelist + identity field 포함)
 * @returns         SAME/CHANGED/NEW/ERROR 분류 결과
 */
export function computeProductSyncCheck(
  erpRows: ReadonlyArray<ErpProductRow>,
  dbRows: ReadonlyArray<DbProductRow>,
): SyncCheckSummary {
  // Index DB by pcode (primary) + product_code (barcode conflict check)
  const dbByPcode = new Map<string, DbProductRow>();
  const dbByBarcode = new Map<string, DbProductRow>();
  for (const d of dbRows) {
    const pc = String((d as unknown as { pcode?: unknown }).pcode ?? "").trim();
    if (pc) dbByPcode.set(pc, d);
    const bc = String(d.product_code ?? "").trim();
    if (bc) dbByBarcode.set(bc, d);
  }

  let same = 0, changed = 0, new_ = 0, errors = 0, skippedMissingPcode = 0;
  const entries: SyncEntry[] = [];

  for (const r of erpRows) {
    const pcode = String((r as unknown as { PCode?: unknown }).PCode ?? "").trim();
    const barcode = String(r.BarCode ?? "").trim();
    const productName = String((r as unknown as { ProductName?: unknown }).ProductName ?? "").trim();

    if (!pcode) {
      skippedMissingPcode++;
      continue;
    }

    // Branch 1: pcode 매칭됨
    const byPcode = dbByPcode.get(pcode);
    if (byPcode) {
      const diffs = diffWhitelistFields(r, byPcode);
      if (diffs.length === 0) {
        same++;
      } else {
        changed++;
        entries.push({
          pcode, erpBarcode: barcode, erpProductName: productName,
          action: "CHANGED",
          dbProductCode: String(byPcode.product_code ?? ""),
          changedFields: diffs,
        });
      }
      continue;
    }

    // Branch 2: pcode 매칭 없음 · BarCode 충돌 검사
    if (barcode) {
      const bcConflict = dbByBarcode.get(barcode);
      if (bcConflict) {
        errors++;
        const dbPcode = String((bcConflict as unknown as { pcode?: unknown }).pcode ?? "").trim();
        entries.push({
          pcode, erpBarcode: barcode, erpProductName: productName,
          action: "ERROR_IDENTITY_CONFLICT",
          errorReason: `ERP PCode=${pcode} 는 신규지만 BarCode=${barcode} 가 이미 DB 에 존재 (DB pcode=${dbPcode || "NULL"})`,
          conflictingDbRow: {
            product_code: String(bcConflict.product_code ?? ""),
            pcode: dbPcode || null,
            product_name: String((bcConflict as unknown as { product_name?: unknown }).product_name ?? ""),
          },
        });
        continue;
      }
    }

    // Branch 3: pcode 없음 + BarCode 충돌 없음 → NEW
    new_++;
    entries.push({
      pcode, erpBarcode: barcode, erpProductName: productName,
      action: "NEW",
    });
  }

  return {
    totalErp: erpRows.length,
    same, changed, new_, errors, skippedMissingPcode,
    entries,
  };
}
