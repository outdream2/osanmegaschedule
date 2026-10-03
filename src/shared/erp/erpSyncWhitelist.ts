// src/shared/erp/erpSyncWhitelist.ts
// 2026-10-03 저녁 · Phase 2 · ERP ↔ Supabase sync 명시적 whitelist
//   · 절대 원칙:
//     1. ERP update payload 는 explicit whitelist 로만 작성 · spread/Object.assign 금지
//     2. PROTECTED field 는 payload 에 포함 자체 금지
//     3. NULL overwrite 금지 default · nullOverwrite=true 명시 field 만 예외
//     4. identity field 는 UPDATE 대상 아님 (lookup / INSERT 용도만)
//
// 사용자 확정 2026-10-03 저녁:
//   products.current_stock ← Product_List.NowStock · ERP_OWNED · Source of Truth: ERP
//   inventory_checks.store*_stock → PROTECTED · 사용자 실사재고 · 완전 별개
//   Inventory_Status 42-col 공식 → current_stock 계산에 사용하지 않음

/** ERP mapping field 설명 */
export interface ErpFieldMapping {
  /** ERP source field 이름 (Product_List primary table column) */
  readonly erp: string;
  /** ERP 값이 null/undefined/empty 일 때 DB 값 덮어쓰기 허용 여부 (default false) */
  readonly nullOverwrite: boolean;
  /** 선택 설명 (문서화용) */
  readonly note?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. ERP_IDENTITY
//    identity field · UPDATE 대상 아님 · lookup + INSERT identity 로만 사용
// ─────────────────────────────────────────────────────────────────────────────
export const ERP_IDENTITY = Object.freeze({
  /** products.product_code ← Product_List.BarCode · 93.1% match · 1:1 완벽 */
  productCode: "BarCode",
  /** purchase_details (bm_code, row_num) ← Buy_Status (BmCode, ROWNUM) · unique transaction key */
  purchaseKey: Object.freeze({ bmCode: "BmCode", rowNum: "ROWNUM" }),
} as const);

// ─────────────────────────────────────────────────────────────────────────────
// 2. ERP_OWNED_PRODUCT_FIELDS
//    products 테이블 field 중 ERP 가 authoritative source 인 것
//    Normal Sync 시 ERP overwrite 가능 (nullOverwrite 규칙 준수)
// ─────────────────────────────────────────────────────────────────────────────
export const ERP_OWNED_PRODUCT_FIELDS: Readonly<Record<string, ErpFieldMapping>> = Object.freeze({
  product_name:       { erp: "ProductName",     nullOverwrite: false },
  supplier:           { erp: "CorpNameView",    nullOverwrite: false },
  supplier_code:      { erp: "CtCode",          nullOverwrite: false },
  unit:               { erp: "UnitCode",        nullOverwrite: false },
  sale_status:        { erp: "SaleStatusName",  nullOverwrite: false, note: "hidden 과 완전 분리" },
  brand:              { erp: "Brand",           nullOverwrite: false },
  manufacturer:       { erp: "Maker",           nullOverwrite: false },
  last_purchase_date: { erp: "LastBuyDate",     nullOverwrite: false, note: "KST 날짜 string" },
  last_sale_date:     { erp: "LastSaleDate",    nullOverwrite: false, note: "KST 날짜 string" },
  // 2026-10-03 저녁 · 사용자 확정 · NowStock = ERP 전산 현재고 · Source of Truth: ERP
  //   · 사용자 ERP 화면 5 샘플 검증 완료 (15208 / 12035 / 10001 / 10696 / 10805)
  //   · Inventory_Status 42-col 공식은 current_stock 계산에 사용하지 않음
  //   · inventory_checks.store*_stock 은 실사재고 (별개 · PROTECTED)
  //   · null overwrite 허용: ERP 가 NowStock 을 명시적으로 0 또는 null 로 반환 가능
  current_stock:      { erp: "NowStock",        nullOverwrite: true,  note: "ERP 전산 현재고 · ERP_OWNED · 2026-10-03 확정" },
  // category 는 LcateName/McateName/ScateName/DcateName 중 결정 (CATEGORY_MAPPING_DECISION 참조)
  //   현재 보류 · DRY-RUN Preview 에서 사용자 결정 수집 후 활성화
  // category:        { erp: "McateName",       nullOverwrite: false },
  // 가격 field 는 USER DECISION 미완료 · 현재 whitelist 비활성화
  //   · purchase_price ← CostPrice · 44 different · USER DECISION 후 활성
  //   · sale_price ← PriceA (94.8% exact) · 189 different · USER DECISION 후 활성
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. ERP_DERIVED_PRODUCT_FIELDS
//    ERP 원본에서 변환 로직 거쳐 생성되는 field
//    변환 함수는 각 모듈에서 구현 (erpLocationTransform.ts 등)
// ─────────────────────────────────────────────────────────────────────────────
export const ERP_DERIVED_PRODUCT_FIELDS = Object.freeze({
  display_location: { source: "LocationName", transform: "majorPlusMiddle" },
  location:         { source: "LocationName", transform: "majorPlusMiddle", note: "display_location 과 동시 UPDATE 필수" },
} as const);

// ─────────────────────────────────────────────────────────────────────────────
// 4. PROTECTED_PRODUCT_FIELDS
//    payload 에 포함되면 안 되는 field (방어 체크용)
// ─────────────────────────────────────────────────────────────────────────────
export const PROTECTED_PRODUCT_FIELDS: readonly string[] = Object.freeze([
  "optimal_stock",
  "optimal_stock_backup",
  "memo",             // ERP Product_List.Memo (col[93]) 와 완전 분리 · DB memo = 사용자 입력
  "hidden",           // sale_status 와 분리 · 사용자 토글
  "stock_note",
  "imported_at",
  // UI 운영 관련 field 가 추가로 발견되면 여기에 추가
]);

// ─────────────────────────────────────────────────────────────────────────────
// 5. ERP_OWNED_PURCHASE_FIELDS (Buy_Status → purchase_details)
//    사용자 검수 메타 (verified_*, expiry_date) 는 명시 제외 · payload 에 포함 금지
// ─────────────────────────────────────────────────────────────────────────────
export const ERP_OWNED_PURCHASE_FIELDS: Readonly<Record<string, ErpFieldMapping>> = Object.freeze({
  purchase_date:  { erp: "BuyDate",      nullOverwrite: false },
  supplier_code:  { erp: "CtCode",       nullOverwrite: false },
  supplier_name:  { erp: "CorpNameView", nullOverwrite: false },
  // product_code 는 PCode→BarCode 변환이 필요하므로 별도 처리 (buildBuyRowFromErp 참조)
  product_name:   { erp: "ProductName",  nullOverwrite: false },
  spec:           { erp: "Specification", nullOverwrite: false },
  quantity:       { erp: "StockCnt",     nullOverwrite: false, note: "numeric cast 필수" },
  unit_price:     { erp: "UnitCost",     nullOverwrite: false, note: "numeric cast 필수" },
  amount:         { erp: "BuyPrice",     nullOverwrite: false, note: "VAT 제외 공급가" },
  vat:            { erp: "BuyTax",       nullOverwrite: false },
  total:          { erp: "BuyTotal",     nullOverwrite: false, note: "VAT 포함 총액" },
  bm_code:        { erp: "BmCode",       nullOverwrite: false, note: "ERP 매입 문서 ID · unique key 1/2" },
  row_num:        { erp: "ROWNUM",       nullOverwrite: false, note: "라인 번호 · unique key 2/2" },
});

export const PROTECTED_PURCHASE_FIELDS: readonly string[] = Object.freeze([
  "verified_by",
  "verify_status",
  "verify_note",
  "verified_at",
  "verified_expiring",
  "expiry_date",      // 사용자 검수 시 입력 · ERP 가 overwrite 하지 않음
  "imported_at",
]);

// ─────────────────────────────────────────────────────────────────────────────
// 6. 방어 유틸 · payload 에 PROTECTED field 가 들어있으면 즉시 throw
//    buildErpProductUpdatePayload / buildBuyRowFromErp 에서 반드시 호출
// ─────────────────────────────────────────────────────────────────────────────
export function assertNoProtectedField(payload: Record<string, unknown>, protectedList: readonly string[], context: string): void {
  const violated = Object.keys(payload).filter((k) => protectedList.includes(k));
  if (violated.length > 0) {
    throw new Error(
      `[erpSyncWhitelist] ${context}: PROTECTED field 가 payload 에 포함됨 (${violated.join(", ")}). ` +
      `whitelist 밖 field 는 명시적으로 제거해야 함.`
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. ERP empty 판정 공통 유틸
// ─────────────────────────────────────────────────────────────────────────────
export function isErpEmpty(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string" && v.trim() === "") return true;
  return false;
}
