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
  // 2026-10-04 · 사용자 최종 승인 · ERP Product Sync 정식 ERP-owned 목록
  //   identity (lookup only · UPDATE 대상 아님 · identity WRITE 정책 참조)
  pcode:              { erp: "PCode",           nullOverwrite: false, note: "ERP 상품분류코드 · PCode↔pcode primary identity · UPDATE 금지" },
  // ERP 공식 상품 데이터 (ACTIVE)
  product_name:       { erp: "ProductName",     nullOverwrite: false },
  supplier:           { erp: "CorpNameView",    nullOverwrite: false },
  supplier_code:      { erp: "CtCode",          nullOverwrite: false },
  unit:               { erp: "UnitCode",        nullOverwrite: false },
  sale_status:        { erp: "SaleStatusName",  nullOverwrite: false, note: "hidden 과 완전 분리" },
  // 2026-10-05 · 사용자 확정 · spec = 상품 규격 전용 복구 · ERP Specification 매핑 추가
  //   · 실측 non-null 1/4007 (0.02%) · 희소 but 들어오면 반영
  //   · nullOverwrite=false · ERP null/empty 시 DB 기존 spec 보존 (대원칙)
  //   · "진열위치" 혼용 금지 · 진열위치는 display_location 전용
  spec:               { erp: "Specification",   nullOverwrite: false, note: "상품 규격 (ERP Specification raw)" },
  last_purchase_date: { erp: "LastBuyDate",     nullOverwrite: false, note: "KST 날짜 string" },
  last_sale_date:     { erp: "LastSaleDate",    nullOverwrite: false, note: "KST 날짜 string" },
  // 2026-10-03 저녁 · NowStock = ERP 전산 현재고 · SSOT
  //   · null overwrite 허용 · ERP 가 0 또는 null 반환 가능
  current_stock:      { erp: "NowStock",        nullOverwrite: true,  note: "ERP 전산 현재고 · nullOverwrite 허용" },
  // 2026-10-04 · WAIT_DECISION 3개 활성화 승인 (CostPrice / PriceA / McateName)
  purchase_price:     { erp: "CostPrice",       nullOverwrite: false, note: "ERP 매입가 (CostPrice)" },
  sale_price:         { erp: "PriceA",          nullOverwrite: false, note: "ERP 판매가 (PriceA)" },
  category:           { erp: "McateName",       nullOverwrite: false, note: "ERP 중분류 명" },
  // 2026-10-04 · Location 정책 변경 · raw LocationName 저장 · 변환 없음
  //   · transformErpLocation() 미사용 · raw 그대로
  //   · nullOverwrite=false · ERP empty → KEEP
  display_location:   { erp: "LocationName",    nullOverwrite: false, note: "ERP LocationName raw · 변환 없음 · SSOT" },
  // 2026-10-04 · 신규 ERP 날짜 column (Migration future_phase2_products_erp_dates.sql)
  erp_registered_at:  { erp: "RegDate",         nullOverwrite: false, note: "ERP RegDate (timestamptz) · 기존 registered_at (date) 와 분리" },
  erp_modified_at:    { erp: "EditDate",        nullOverwrite: false, note: "ERP EditDate (timestamptz) · 기존 last_modified_at (date) 와 분리" },
  // 2026-10-04 · brand/manufacturer 제외
  //   · ERP Brand/Maker 는 전수 null (실측 4,007 전수 null) · ERP Sync 비교 가치 없음
  //   · Supabase column 자체는 삭제 안 함 (추후 결정)
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. ERP_DERIVED_PRODUCT_FIELDS
//    2026-10-04 · Location 정책 변경 · display_location 은 ERP_OWNED raw 로 이동
//      · transformErpLocation() 은 Product Sync 에서 미사용 (validation/admin preview 등 다른 용도만 유지)
//      · products.location 은 live schema 에 없음 · 신규 생성 안 함 · 참조 전면 제거
//    DERIVED field 없음 · 호환성 위해 빈 object 유지 (import 깨짐 방지)
// ─────────────────────────────────────────────────────────────────────────────
export const ERP_DERIVED_PRODUCT_FIELDS = Object.freeze({} as const);

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
// 8. ERP_OWNED_INVENTORY_FIELDS (Inventory_Status → stock_history)
//    사용자 확정 2026-10-04:
//      · ERP Inventory_Status 42 field 중 재고 입출고 raw 17개만 저장
//      · 상품정보 (ProductName/카테고리/공급사/가격/과세) 는 products JOIN · stock_history 저장 X
//      · identity (period_start · period_end · st_code · pcode) 는 metadata 로 외부 주입 또는 ERP row 추출
//      · PROTECTED 는 UPDATE payload 완전 제외 (NULL overwrite 아님)
// ─────────────────────────────────────────────────────────────────────────────
export const ERP_OWNED_INVENTORY_FIELDS: Readonly<Record<string, ErpFieldMapping>> = Object.freeze({
  prv_stock:                { erp: "PrvStock",                nullOverwrite: false, note: "기간 시작 재고 (이전고)" },
  buy_stock:                { erp: "BuyStock",                nullOverwrite: false },
  buy_return_stock:         { erp: "BuyReturnStock",          nullOverwrite: false },
  storage_move_in:          { erp: "StorageMoveIn",           nullOverwrite: false },
  storage_move_out:         { erp: "StorageMoveOut",          nullOverwrite: false },
  storage_move_auto_in:     { erp: "StorageMoveAutoIn",       nullOverwrite: false },
  storage_move_auto_out:    { erp: "StorageMoveAutoOut",      nullOverwrite: false },
  sale_stock:               { erp: "SaleStock",               nullOverwrite: false },
  sale_return_stock:        { erp: "SaleReturnStock",         nullOverwrite: false },
  product_use_stock:        { erp: "ProductUseStock",         nullOverwrite: false },
  product_return_use_stock: { erp: "ProductReturnUseStock",   nullOverwrite: false },
  product_bad_stock:        { erp: "ProductBadStock",         nullOverwrite: false },
  product_return_bad_stock: { erp: "ProductReturnBadStock",   nullOverwrite: false },
  plus_stock:               { erp: "PlusStock",               nullOverwrite: false },
  minus_stock:              { erp: "MinusStock",              nullOverwrite: false },
  subdivision_plus:         { erp: "SubdivisionPlus",         nullOverwrite: false },
  subdivision_minus:        { erp: "SubdivisionMinus",        nullOverwrite: false },
});

/**
 * PROTECTED_INVENTORY_FIELDS
 * UPDATE payload 에 포함 금지 · 완전 제외 (NULL overwrite 하지 않음)
 * ERP sync 는 이 field 들을 비교·수정 하지 않음 · 기존 값 그대로 보존
 */
export const PROTECTED_INVENTORY_FIELDS: readonly string[] = Object.freeze([
  // 2026-10-05 · 사용자 지시 · ERP row 에 pcode + product_code 둘 다 저장 (상품 JOIN 용도)
  //   · product_code 는 identity 성격 (INSERT 때만 저장 · UPDATE 대상 X)
  //   · ERP_OWNED_INVENTORY_FIELDS 에는 포함 안 함 (수량만) → UPDATE loop 가 자동 skip
  //   · 아래 PROTECTED 에서는 제거 (INSERT payload 허용)
  // 중복 상품정보 (products JOIN · Phase 2 평가)
  "product_name",
  "supplier_code",
  "supplier_name",
  "spec",
  "tax_type",
  "product_type",
  // xlsx 전용 metadata
  "period_type",        // early/mid/late · xlsx 과거 데이터 전용
  // ERP 가 반환 안 하는 기존 수량 (xlsx 가 입력)
  "closing_stock",
  "internal_qty",
  "adjustment_qty",
  // ERP 가 반환 안 하는 금액 (xlsx 가 입력)
  "taxable_amount",
  "supply_amount",
  "vat",
  "duty_free_amount",
  "total_amount",
  // 관리
  "id",
  "created_at",
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
