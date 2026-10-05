// src/shared/erp/erpInventoryMapper.ts
// 2026-10-04 · Phase 1 · ERP Inventory_Status → stock_history payload builder
//   · identity: (period_start, period_end, st_code, pcode)
//   · ERP 재고 raw 17 field 저장 (ERP_OWNED_INVENTORY_FIELDS whitelist)
//   · PROTECTED (product_code · product_name · 중복상품정보 · 금액 · xlsx 전용) 는 payload 포함 X
//   · pure function · DB WRITE 없음
//   · period_start · period_end 는 ERP row 에 없음 → metadata 로 외부 주입

import {
  ERP_OWNED_INVENTORY_FIELDS,
  PROTECTED_INVENTORY_FIELDS,
  assertNoProtectedField,
  isErpEmpty,
} from "./erpSyncWhitelist";

/** ERP Inventory_Status 한 row (관심 field 명시 · 그 외 untyped) */
export interface ErpInventoryRow {
  PCode?: unknown;
  StCode?: unknown;
  StorageName?: unknown;
  ProductName?: unknown;
  PrvStock?: unknown;
  BuyStock?: unknown;
  BuyReturnStock?: unknown;
  StorageMoveIn?: unknown;
  StorageMoveOut?: unknown;
  StorageMoveAutoIn?: unknown;
  StorageMoveAutoOut?: unknown;
  SaleStock?: unknown;
  SaleReturnStock?: unknown;
  ProductUseStock?: unknown;
  ProductReturnUseStock?: unknown;
  ProductBadStock?: unknown;
  ProductReturnBadStock?: unknown;
  PlusStock?: unknown;
  MinusStock?: unknown;
  SubdivisionPlus?: unknown;
  SubdivisionMinus?: unknown;
  [k: string]: unknown;
}

export interface InventoryMetadata {
  readonly period_start: string;  // YYYY-MM-DD (envelope StartDate)
  readonly period_end: string;    // YYYY-MM-DD (envelope EndDate)
}

export interface InventoryMapperResult {
  readonly payload: Record<string, unknown>;
  readonly uniqueKey: {
    readonly period_start: string;
    readonly period_end: string;
    readonly st_code: string;
    readonly pcode: string;
  };
  readonly erpPCode: string;
  readonly stCode: string;
}

/**
 * ERP Inventory_Status row → stock_history payload 변환.
 *
 * @param erpRow Inventory_Status primary table row
 * @param metadata 조회기간 (period_start · period_end) · ERP row 에 없음 · envelope 에서 주입
 * @param pcodeToBarcodeMap ERP.PCode → products.product_code (Barcode) · INSERT payload 에 product_code 저장용
 * @returns payload + unique key
 *
 * 변환 규칙:
 *   · identity: period_start · period_end · st_code · pcode · INSERT payload 에 포함
 *   · product_code = pcodeToBarcodeMap.get(pcode) · 상품 JOIN 용 (INSERT only · UPDATE skip)
 *   · 17 ERP 재고 수량: ERP_OWNED_INVENTORY_FIELDS 매핑 (nullOverwrite=false · empty 는 skip)
 *   · PROTECTED (product_name · 금액 · period_type 등): payload 포함 X
 *
 * 에러:
 *   · PCode 또는 StCode 가 빈 값이면 throw (identity 불가)
 */
export function buildInventoryRowFromErp(
  erpRow: ErpInventoryRow,
  metadata: InventoryMetadata,
  pcodeToBarcodeMap?: ReadonlyMap<string, string>,
): InventoryMapperResult {
  const pcode = String(erpRow.PCode ?? "").trim();
  const stCode = String(erpRow.StCode ?? "").trim();
  if (!pcode) throw new Error("[erpInventoryMapper] PCode empty · identity 불가");
  if (!stCode) throw new Error(`[erpInventoryMapper] StCode empty (PCode=${pcode}) · identity 불가`);
  if (!metadata.period_start) throw new Error("[erpInventoryMapper] metadata.period_start 필요");
  if (!metadata.period_end) throw new Error("[erpInventoryMapper] metadata.period_end 필요");

  const payload: Record<string, unknown> = {
    period_start: metadata.period_start,
    period_end: metadata.period_end,
    st_code: stCode,
    pcode,
  };

  const barcode = pcodeToBarcodeMap?.get(pcode);
  if (barcode) payload.product_code = barcode;

  for (const [dbField, mapping] of Object.entries(ERP_OWNED_INVENTORY_FIELDS)) {
    const raw = erpRow[mapping.erp];
    if (isErpEmpty(raw) && !mapping.nullOverwrite) continue;
    const n = typeof raw === "number" ? raw : Number(String(raw).trim());
    if (!Number.isFinite(n)) continue;
    payload[dbField] = n;
  }

  assertNoProtectedField(payload, PROTECTED_INVENTORY_FIELDS, `buildInventoryRowFromErp(${stCode}/${pcode})`);

  return {
    payload,
    uniqueKey: {
      period_start: metadata.period_start,
      period_end: metadata.period_end,
      st_code: stCode,
      pcode,
    },
    erpPCode: pcode,
    stCode,
  };
}
