// src/shared/erp/erpBuyMapper.ts
// 2026-10-03 저녁 · Phase 2 · ERP Buy_Status → purchase_details UPSERT payload builder
//   · Unique key: (bm_code, row_num) · 중복 INSERT 방지
//   · PCode → BarCode 변환 필수 (purchase_details.product_code = BarCode)
//   · verified_* 등 검수 메타는 payload 에 포함 금지 (사용자 입력 보존)
//   · pure function · DB WRITE 없음

import {
  ERP_IDENTITY,
  ERP_OWNED_PURCHASE_FIELDS,
  PROTECTED_PURCHASE_FIELDS,
  assertNoProtectedField,
  isErpEmpty,
} from "./erpSyncWhitelist";

/** ERP Buy_Status 한 row (관심 field 명시 · 그 외 untyped) */
export interface ErpBuyRow {
  BmCode?: unknown;
  ROWNUM?: unknown;
  PCode?: unknown;
  BuyDate?: unknown;
  BuyMonth?: unknown;
  CtCode?: unknown;
  CorpNameView?: unknown;
  ProductName?: unknown;
  Specification?: unknown;
  UnitCode?: unknown;
  UnitCost?: unknown;
  StockCnt?: unknown;
  BuyPrice?: unknown;
  BuyTax?: unknown;
  TaxExemption?: unknown;
  BuyTotal?: unknown;
  IsStatus?: unknown;
  IsStatusName?: unknown;
  [k: string]: unknown;
}

export interface BuyMapperResult {
  /** payload (DB UPSERT 시 그대로 전달) */
  readonly payload: Record<string, unknown>;
  /** unique key tuple (바로 ON CONFLICT 에 사용 가능) */
  readonly uniqueKey: { readonly bm_code: string; readonly row_num: number };
  /** Barcode 매핑 상태 */
  readonly productMatchStatus: "mapped" | "unmapped";
  /** 매핑된 Barcode (product_code) · unmapped 면 null */
  readonly productCode: string | null;
  /** 진단용 raw PCode */
  readonly pCode: string;
}

/**
 * ERP Buy_Status row → purchase_details payload 변환.
 *
 * @param erpRow Buy_Status primary table row
 * @param pcodeToBarcodeMap Product_List 로부터 미리 만든 PCode→BarCode 사전
 * @returns payload + unique key + 매핑 상태
 *
 * Note:
 *   - PCode→BarCode 매핑 실패 시 productMatchStatus="unmapped" · productCode=null
 *     Preview 에서 PURCHASE_UNMAPPED_PRODUCT 로 집계 · 실제 UPSERT 하지 않음
 */
export function buildBuyRowFromErp(
  erpRow: ErpBuyRow,
  pcodeToBarcodeMap: ReadonlyMap<string, string>,
): BuyMapperResult {
  const bmCode = String(erpRow[ERP_IDENTITY.purchaseKey.bmCode] ?? "").trim();
  const rowNumRaw = erpRow[ERP_IDENTITY.purchaseKey.rowNum];
  const rowNum = Number(rowNumRaw);
  if (!bmCode) throw new Error("[erpBuyMapper] BmCode empty · unique key 불가");
  if (!Number.isFinite(rowNum) || !Number.isInteger(rowNum) || rowNum < 1) {
    throw new Error(`[erpBuyMapper] ROWNUM invalid (${String(rowNumRaw)}) · unique key 불가`);
  }

  const pCode = String(erpRow.PCode ?? "").trim();
  const mapped = pcodeToBarcodeMap.get(pCode) ?? null;
  const productMatchStatus: "mapped" | "unmapped" = mapped ? "mapped" : "unmapped";

  const payload: Record<string, unknown> = {};

  // ── ERP_OWNED fields ──────────────────────────────────────────────────────
  for (const [dbField, mapping] of Object.entries(ERP_OWNED_PURCHASE_FIELDS)) {
    const raw = erpRow[mapping.erp];
    if (isErpEmpty(raw) && !mapping.nullOverwrite) continue;
    // numeric fields
    if (dbField === "quantity" || dbField === "unit_price" || dbField === "amount" || dbField === "vat" || dbField === "total") {
      const n = typeof raw === "number" ? raw : Number(String(raw).trim());
      if (!Number.isFinite(n)) continue;
      payload[dbField] = n;
    } else if (dbField === "row_num") {
      payload[dbField] = rowNum;
    } else if (typeof raw === "string") {
      payload[dbField] = raw.trim();
    } else {
      payload[dbField] = raw;
    }
  }

  // product_code 는 BarCode 변환 결과 사용 (ERP PCode 아님)
  if (mapped) {
    payload.product_code = mapped;
  }

  // ── 방어: PROTECTED field 섞여 있으면 즉시 throw ──────────────────────────
  assertNoProtectedField(payload, PROTECTED_PURCHASE_FIELDS, `buildBuyRowFromErp(${bmCode}/${rowNum})`);

  return {
    payload,
    uniqueKey: { bm_code: bmCode, row_num: rowNum },
    productMatchStatus,
    productCode: mapped,
    pCode,
  };
}

/**
 * Product_List rows → PCode → BarCode 사전 구축 (Buy mapping 사전).
 */
export function buildPCodeToBarcodeMap(productRows: Array<{ PCode?: unknown; BarCode?: unknown }>): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of productRows) {
    const pc = String(r.PCode ?? "").trim();
    const bc = String(r.BarCode ?? "").trim();
    if (pc && bc) map.set(pc, bc);
  }
  return map;
}
