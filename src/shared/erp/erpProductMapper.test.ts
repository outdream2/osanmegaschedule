// 2026-10-03 저녁 · Phase 2 · Product mapper unit tests
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
  Brand: "브랜드",
  Maker: "제조사",
  LastBuyDate: "2026-10-03",
  LastSaleDate: "2026-10-03",
  NowStock: 50,
  LocationName: "벽>21>전체>전체",
};

const baseDb = {
  product_code: "8806265020416",
  product_name: "테스트 상품",
  supplier: "테스트 공급사",
  supplier_code: "1058",
  unit: "EA",
  sale_status: "판매중",
  brand: "브랜드",
  manufacturer: "제조사",
  last_purchase_date: "2026-10-03",
  last_sale_date: "2026-10-03",
  current_stock: 50,
  display_location: "21",
  location: "21",
  optimal_stock: 10,       // PROTECTED
  memo: "사용자 메모",       // PROTECTED
  hidden: false,            // PROTECTED
  stock_note: "note",       // PROTECTED
  imported_at: "2026-01-01",// PROTECTED
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
});

describe("buildErpProductPayload · INSERT (ERP_NEW)", () => {
  it("DB row 없음 → INSERT · ERP non-empty field 전부 · product_code 포함", () => {
    const r = buildErpProductPayload(baseErp, null);
    expect(r.action).toBe("INSERT");
    expect(r.payload.product_code).toBe("8806265020416");
    expect(r.payload.product_name).toBe("테스트 상품");
    expect(r.payload.current_stock).toBe(50);
    expect(r.payload.display_location).toBe("21");
    expect(r.payload.location).toBe("21");
    expect(r.payload).not.toHaveProperty("memo");
    expect(r.payload).not.toHaveProperty("optimal_stock");
  });
  it("INSERT · ERP empty field 는 payload 에 포함 X", () => {
    const r = buildErpProductPayload({ ...baseErp, Brand: "" }, null);
    expect(r.payload).not.toHaveProperty("brand");
  });
});

describe("buildErpProductPayload · Location 변환", () => {
  it("벽+21 → display_location + location 양쪽 '21' 동시 UPDATE", () => {
    const r = buildErpProductPayload({ ...baseErp, LocationName: "벽>22>전체>전체" }, baseDb);
    expect(r.payload.display_location).toBe("22");
    expect(r.payload.location).toBe("22");
  });
  it("6매대+Ａ → '6A' (전각 → 반각)", () => {
    const r = buildErpProductPayload({ ...baseErp, LocationName: "6매대>Ａ>7열>전체" }, baseDb);
    expect(r.payload.display_location).toBe("6A");
    expect(r.payload.location).toBe("6A");
  });
  it("ERP Location empty + DB has → location 유지 (KEEP · payload 에 포함 X)", () => {
    const r = buildErpProductPayload({ ...baseErp, LocationName: "" }, baseDb);
    expect(r.payload).not.toHaveProperty("display_location");
    expect(r.payload).not.toHaveProperty("location");
    expect(r.locationDecision).toBe("keep");
  });
  it("뷰티 → review · derived null · payload 포함 X · locationDecision=review", () => {
    const r = buildErpProductPayload({ ...baseErp, LocationName: "뷰티>2번>전체>전체" }, baseDb);
    expect(r.payload).not.toHaveProperty("display_location");
    expect(r.locationDecision).toBe("review");
    expect(r.locationResult.reviewFlag).toBe("LOCATION_REVIEW_BEAUTY");
  });
});

describe("buildErpProductPayload · 식별자 없으면 throw", () => {
  it("ERP BarCode empty 면 throw", () => {
    expect(() => buildErpProductPayload({ ...baseErp, BarCode: "" }, baseDb)).toThrow();
  });
});
