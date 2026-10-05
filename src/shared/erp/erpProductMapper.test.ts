// 2026-10-04 · Product mapper unit tests · Location 정책 변경 반영
//   · display_location ← LocationName raw (변환 없음)
//   · brand/manufacturer whitelist 제외
//   · purchase_price/sale_price/category 활성화
//   · erp_registered_at/erp_modified_at 신규 column 매핑
//   · products.location 참조 제거
import { describe, it, expect } from "vitest";
import { buildErpProductPayload } from "./erpProductMapper";

const baseErp = {
  BarCode: "8806265020416",
  PCode: "12345",
  ProductName: "테스트 상품",
  CorpNameView: "테스트 공급사",
  CtCode: "1058",
  UnitCode: "EA",
  SaleStatusName: "판매중",
  Brand: "브랜드",         // ERP 응답 유지 · whitelist 에서 제외됨 (비교 안 함)
  Maker: "제조사",
  LastBuyDate: "2026-10-03",
  LastSaleDate: "2026-10-03",
  NowStock: 50,
  LocationName: "벽>21>전체>전체",
  CostPrice: 1000,
  PriceA: 2000,
  McateName: "진통제",
  RegDate: "2026-01-01T10:00:00",
  EditDate: "2026-10-01T15:00:00",
};

const baseDb = {
  product_code: "8806265020416",
  pcode: "12345",
  product_name: "테스트 상품",
  supplier: "테스트 공급사",
  supplier_code: "1058",
  unit: "EA",
  sale_status: "판매중",
  brand: "브랜드",          // whitelist 외 · 비교 안 함
  manufacturer: "제조사",   // whitelist 외
  last_purchase_date: "2026-10-03",
  last_sale_date: "2026-10-03",
  current_stock: 50,
  display_location: "벽>21>전체>전체",  // raw match (LocationName 과 동일)
  purchase_price: 1000,
  sale_price: 2000,
  category: "진통제",
  erp_registered_at: "2026-01-01T10:00:00",
  erp_modified_at: "2026-10-01T15:00:00",
  optimal_stock: 10,         // PROTECTED
  memo: "사용자 메모",         // PROTECTED
  hidden: false,              // PROTECTED
  stock_note: "note",         // PROTECTED
  imported_at: "2026-01-01",  // PROTECTED
};

describe("buildErpProductPayload · identical row (no changes)", () => {
  it("ERP == DB 모두 same → changedCount=0 · payload 비어있음", () => {
    const r = buildErpProductPayload(baseErp, baseDb);
    expect(r.action).toBe("UPDATE");
    expect(r.changedCount).toBe(0);
    expect(Object.keys(r.payload)).toHaveLength(0);
  });
});

describe("buildErpProductPayload · UPDATE 변경 field", () => {
  it("ProductName 바뀌면 payload 에 포함", () => {
    const r = buildErpProductPayload({ ...baseErp, ProductName: "새 상품명" }, baseDb);
    expect(r.payload.product_name).toBe("새 상품명");
    expect(r.changedCount).toBeGreaterThan(0);
  });
  it("current_stock 바뀌면 payload 에 포함 (NowStock → ERP_OWNED)", () => {
    const r = buildErpProductPayload({ ...baseErp, NowStock: 42 }, baseDb);
    expect(r.payload.current_stock).toBe(42);
  });
  it("current_stock null overwrite 허용 (nullOverwrite=true)", () => {
    const r = buildErpProductPayload({ ...baseErp, NowStock: null }, baseDb);
    expect(r.payload.current_stock).toBeNull();
  });
  it("purchase_price (CostPrice) 변경 → payload 에 포함", () => {
    const r = buildErpProductPayload({ ...baseErp, CostPrice: 1500 }, baseDb);
    expect(r.payload.purchase_price).toBe(1500);
  });
  it("sale_price (PriceA) 변경 → payload 에 포함", () => {
    const r = buildErpProductPayload({ ...baseErp, PriceA: 2500 }, baseDb);
    expect(r.payload.sale_price).toBe(2500);
  });
  it("category (McateName) 변경 → payload 에 포함", () => {
    const r = buildErpProductPayload({ ...baseErp, McateName: "소화제" }, baseDb);
    expect(r.payload.category).toBe("소화제");
  });
  it("erp_registered_at (RegDate) 변경 → payload 에 포함", () => {
    const r = buildErpProductPayload({ ...baseErp, RegDate: "2026-02-01T10:00:00" }, baseDb);
    expect(r.payload.erp_registered_at).toBe("2026-02-01T10:00:00");
  });
  it("erp_modified_at (EditDate) 변경 → payload 에 포함", () => {
    const r = buildErpProductPayload({ ...baseErp, EditDate: "2026-11-01T15:00:00" }, baseDb);
    expect(r.payload.erp_modified_at).toBe("2026-11-01T15:00:00");
  });
});

describe("buildErpProductPayload · NULL overwrite 금지 (default)", () => {
  it("ERP ProductName empty + DB has → payload 에 포함 X", () => {
    const r = buildErpProductPayload({ ...baseErp, ProductName: "" }, baseDb);
    expect(r.payload).not.toHaveProperty("product_name");
  });
  it("ERP supplier null + DB has → payload 에 포함 X", () => {
    const r = buildErpProductPayload({ ...baseErp, CorpNameView: null }, baseDb);
    expect(r.payload).not.toHaveProperty("supplier");
  });
});

describe("buildErpProductPayload · PROTECTED field 절대 포함 금지", () => {
  it("ERP Memo 가 있어도 DB memo 는 payload 에 포함되지 않음", () => {
    const erp = { ...baseErp, Memo: "ERP 쪽 메모" };
    const r = buildErpProductPayload(erp, baseDb);
    expect(r.payload).not.toHaveProperty("memo");
    expect(r.payload).not.toHaveProperty("optimal_stock");
    expect(r.payload).not.toHaveProperty("hidden");
    expect(r.payload).not.toHaveProperty("stock_note");
    expect(r.payload).not.toHaveProperty("imported_at");
  });
  it("ERP SaleStatus 변경 → sale_status 는 포함되지만 hidden 은 절대 포함 X", () => {
    const r = buildErpProductPayload({ ...baseErp, SaleStatusName: "판매중지" }, baseDb);
    expect(r.payload.sale_status).toBe("판매중지");
    expect(r.payload).not.toHaveProperty("hidden");
  });
  it("ERP Brand/Maker 변경되어도 ERP Sync whitelist 에서 제외 (2026-10-04) · payload 에 포함 X", () => {
    const r = buildErpProductPayload({ ...baseErp, Brand: "새 브랜드", Maker: "새 제조사" }, baseDb);
    expect(r.payload).not.toHaveProperty("brand");
    expect(r.payload).not.toHaveProperty("manufacturer");
  });
});

describe("buildErpProductPayload · INSERT (ERP_NEW)", () => {
  it("DB row 없음 → INSERT · ERP non-empty field 전부 · product_code 포함", () => {
    const r = buildErpProductPayload(baseErp, null);
    expect(r.action).toBe("INSERT");
    expect(r.payload.product_code).toBe("8806265020416");
    expect(r.payload.pcode).toBe("12345");
    expect(r.payload.product_name).toBe("테스트 상품");
    expect(r.payload.current_stock).toBe(50);
    expect(r.payload.display_location).toBe("벽>21>전체>전체");  // raw
    expect(r.payload.purchase_price).toBe(1000);
    expect(r.payload.sale_price).toBe(2000);
    expect(r.payload.category).toBe("진통제");
    expect(r.payload).not.toHaveProperty("memo");
    expect(r.payload).not.toHaveProperty("optimal_stock");
    expect(r.payload).not.toHaveProperty("brand");       // whitelist 외
    expect(r.payload).not.toHaveProperty("manufacturer");
    expect(r.payload).not.toHaveProperty("location");    // products.location column 없음 · 참조 제거됨
  });
});

describe("buildErpProductPayload · Location raw 저장 (2026-10-04 정책 변경)", () => {
  it("벽+22 → raw '벽>22>전체>전체' 저장 (변환 없음)", () => {
    const r = buildErpProductPayload({ ...baseErp, LocationName: "벽>22>전체>전체" }, baseDb);
    expect(r.payload.display_location).toBe("벽>22>전체>전체");
    expect(r.payload).not.toHaveProperty("location");
  });
  it("6매대+Ａ → raw 저장 (전각 변환 없음)", () => {
    const r = buildErpProductPayload({ ...baseErp, LocationName: "6매대>Ａ>7열>전체" }, baseDb);
    expect(r.payload.display_location).toBe("6매대>Ａ>7열>전체");
  });
  it("ERP LocationName empty + DB has → KEEP (payload 포함 X)", () => {
    const r = buildErpProductPayload({ ...baseErp, LocationName: "" }, baseDb);
    expect(r.payload).not.toHaveProperty("display_location");
  });
  it("뷰티 → raw 그대로 저장 (REVIEW 분리 없음 · 2026-10-04 정책)", () => {
    const r = buildErpProductPayload({ ...baseErp, LocationName: "뷰티>2번>전체>전체" }, baseDb);
    expect(r.payload.display_location).toBe("뷰티>2번>전체>전체");
  });
});

describe("buildErpProductPayload · 식별자 없으면 throw", () => {
  it("ERP BarCode empty 면 throw", () => {
    expect(() => buildErpProductPayload({ ...baseErp, BarCode: "" }, baseDb)).toThrow();
  });
});
