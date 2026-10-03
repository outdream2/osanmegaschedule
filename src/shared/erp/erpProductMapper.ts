// src/shared/erp/erpProductMapper.ts
// 2026-10-03 저녁 · Phase 2 · ERP Product_List → products UPDATE/INSERT payload builder
//   · 명시적 whitelist 방식 · spread/Object.assign 절대 금지
//   · PROTECTED field 는 payload 에 포함 자체 금지 (assertNoProtectedField 로 방어)
//   · NULL overwrite 금지 default (nullOverwrite=true field 만 예외)
//   · pure function · DB WRITE 없음
//
// 사용자 확정:
//   current_stock ← Product_List.NowStock · ERP_OWNED · Source of Truth: ERP

import {
  ERP_IDENTITY,
  ERP_OWNED_PRODUCT_FIELDS,
  PROTECTED_PRODUCT_FIELDS,
  assertNoProtectedField,
  isErpEmpty,
} from "./erpSyncWhitelist";
import { transformErpLocation, decideLocationApply } from "./erpLocationTransform";

/** ERP Product_List 한 row (관심 field 만 명시 · 그 외는 untyped) */
export interface ErpProductRow {
  BarCode?: unknown;
  PCode?: unknown;
  ProductName?: unknown;
  CorpNameView?: unknown;
  CtCode?: unknown;
  UnitCode?: unknown;
  SaleStatusName?: unknown;
  Brand?: unknown;
  Maker?: unknown;
  LastBuyDate?: unknown;
  LastSaleDate?: unknown;
  NowStock?: unknown;
  LocationName?: unknown;
  // Product_List 102 col 전체 접근 허용 · diagnostic / 미래 확장
  [k: string]: unknown;
}

/** Supabase products 한 row (관심 field 만 명시) */
export interface DbProductRow {
  product_code: string;
  product_name?: string | null;
  supplier?: string | null;
  supplier_code?: string | null;
  unit?: string | null;
  sale_status?: string | null;
  brand?: string | null;
  manufacturer?: string | null;
  last_purchase_date?: string | null;
  last_sale_date?: string | null;
  current_stock?: number | null;
  display_location?: string | null;
  location?: string | null;
  [k: string]: unknown;
}

export interface FieldDiff {
  readonly field: string;
  readonly erpSource: string;
  readonly erpValue: unknown;
  readonly dbValue: unknown;
  readonly status: "same" | "change" | "db_empty_erp_has" | "erp_empty_db_has" | "both_empty";
  readonly willApply: boolean;
}

export interface ProductMapperResult {
  /** barcode (= product_code) */
  readonly productCode: string;
  /** ERP_MATCHED / ERP_NEW / BARCODE_CONFLICT (상위에서 결정) */
  readonly action: "UPDATE" | "INSERT";
  /** 명시적 whitelist payload (DB WRITE 시 그대로 전달) */
  readonly payload: Record<string, unknown>;
  /** field 단위 diff (Preview UI 표시용) */
  readonly diffs: FieldDiff[];
  /** 변경될 field 수 (SAME 제외) */
  readonly changedCount: number;
  /** Location 변환 결과 요약 */
  readonly locationResult: ReturnType<typeof transformErpLocation>;
  /** Location apply 결정 */
  readonly locationDecision: "apply" | "keep" | "review";
}

/**
 * ERP 값과 DB 값 비교 · WHITELIST 외 field 는 건드리지 않음.
 *
 * @param erpRow ERP Product_List row
 * @param dbRow 현재 Supabase products row (UPDATE 시) · null 이면 INSERT
 */
export function buildErpProductPayload(
  erpRow: ErpProductRow,
  dbRow: DbProductRow | null,
): ProductMapperResult {
  const productCode = String(erpRow[ERP_IDENTITY.productCode] ?? "").trim();
  if (!productCode) {
    throw new Error("[erpProductMapper] ERP BarCode empty · identity 없이는 payload 생성 불가");
  }

  const action: "UPDATE" | "INSERT" = dbRow ? "UPDATE" : "INSERT";
  const payload: Record<string, unknown> = {};
  const diffs: FieldDiff[] = [];
  let changedCount = 0;

  // ── ERP_OWNED fields ──────────────────────────────────────────────────────
  for (const [dbField, mapping] of Object.entries(ERP_OWNED_PRODUCT_FIELDS)) {
    const rawErp = erpRow[mapping.erp];
    const dbValue = dbRow ? (dbRow as any)[dbField] : null;
    const erpEmpty = isErpEmpty(rawErp);
    const dbEmpty = isErpEmpty(dbValue);

    // 숫자 field 특별 처리: current_stock (Int64 string / number 혼재)
    //   · ERP 가 명시 숫자 반환 → cast · 아니면 null
    let erpValue: unknown = rawErp;
    if (dbField === "current_stock") {
      if (erpEmpty) {
        erpValue = null;
      } else {
        const n = typeof rawErp === "number" ? rawErp : Number(String(rawErp).trim());
        erpValue = Number.isFinite(n) ? n : null;
      }
    } else if (typeof rawErp === "string") {
      erpValue = rawErp.trim();
    }

    // status 결정
    let status: FieldDiff["status"];
    if (erpEmpty && dbEmpty) status = "both_empty";
    else if (erpEmpty && !dbEmpty) status = "erp_empty_db_has";
    else if (!erpEmpty && dbEmpty) status = "db_empty_erp_has";
    else {
      // 양쪽 다 non-empty · 값 비교
      const same = String(erpValue ?? "") === String(dbValue ?? "");
      status = same ? "same" : "change";
    }

    // willApply 결정 (payload 포함 여부)
    let willApply = false;
    if (action === "INSERT") {
      // INSERT 는 ERP non-empty 값만 payload 에
      willApply = !erpEmpty;
    } else {
      // UPDATE
      if (status === "change") willApply = true;
      else if (status === "db_empty_erp_has") willApply = true;
      else if (status === "erp_empty_db_has") {
        // nullOverwrite=true 인 field 만 null 로 overwrite 허용
        willApply = mapping.nullOverwrite === true;
      } else {
        willApply = false; // same / both_empty
      }
    }

    if (willApply) {
      payload[dbField] = erpValue;
      changedCount++;
    }

    diffs.push({ field: dbField, erpSource: mapping.erp, erpValue, dbValue, status, willApply });
  }

  // ── ERP_DERIVED: display_location + location (양쪽 동시) ───────────────────
  const locationResult = transformErpLocation(erpRow.LocationName as any);
  const currentDbLoc = dbRow?.display_location ?? dbRow?.location ?? null;
  const locationDecision = decideLocationApply(locationResult, currentDbLoc as any);

  if (locationDecision === "apply" && locationResult.derived != null) {
    const same = String(currentDbLoc ?? "") === locationResult.derived;
    const willApply = !same || action === "INSERT";
    if (willApply) {
      payload.display_location = locationResult.derived;
      payload.location = locationResult.derived;
      changedCount++;
    }
    diffs.push({
      field: "display_location",
      erpSource: "LocationName",
      erpValue: locationResult.derived,
      dbValue: currentDbLoc,
      status: same ? "same" : (currentDbLoc == null ? "db_empty_erp_has" : "change"),
      willApply,
    });
  } else if (locationDecision === "keep") {
    diffs.push({
      field: "display_location",
      erpSource: "LocationName",
      erpValue: null,
      dbValue: currentDbLoc,
      status: currentDbLoc == null ? "both_empty" : "erp_empty_db_has",
      willApply: false, // ERP empty · KEEP (NULL overwrite 금지)
    });
  } else if (locationDecision === "review") {
    diffs.push({
      field: "display_location",
      erpSource: "LocationName",
      erpValue: null,
      dbValue: currentDbLoc,
      status: currentDbLoc == null ? "both_empty" : "erp_empty_db_has",
      willApply: false, // REVIEW · 사용자 선택 전 KEEP
    });
  }

  // ── INSERT 추가 field: product_code (identity) ────────────────────────────
  if (action === "INSERT") {
    payload.product_code = productCode;
  }

  // ── 방어: PROTECTED field 가 payload 에 섞여 있으면 즉시 throw ─────────────
  assertNoProtectedField(payload, PROTECTED_PRODUCT_FIELDS, `buildErpProductPayload(${productCode})`);

  return {
    productCode,
    action,
    payload,
    diffs,
    changedCount,
    locationResult,
    locationDecision,
  };
}
