// 2026-10-03 저녁 · Phase 2 · Buy mapper unit tests
import { describe, it, expect } from "vitest";
import { buildBuyRowFromErp, buildPCodeToBarcodeMap } from "./erpBuyMapper";

const sampleErpBuy = {
  BmCode: "12261003000009",
  ROWNUM: 1,
  PCode: "12035",
  BuyDate: "2026-10-03",
  BuyMonth: "2026/10",
  CtCode: "1058",
  CorpNameView: "코스트팜",
  ProductName: "젤리잘크톤(망고맛) 15g*30포",
  Specification: "15g*30포",
  UnitCode: "EA",
  UnitCost: 16500,
  StockCnt: 10,
  BuyPrice: 150000,
  BuyTax: 15000,
  BuyTotal: 165000,
};

const map = buildPCodeToBarcodeMap([
  { PCode: "12035", BarCode: "8806119821800" },
  { PCode: "10805", BarCode: "18806446004911" },
]);

describe("buildPCodeToBarcodeMap", () => {
  it("PCode → BarCode 사전 구축", () => {
    expect(map.get("12035")).toBe("8806119821800");
    expect(map.get("10805")).toBe("18806446004911");
    expect(map.get("99999")).toBeUndefined();
  });
  it("empty PCode / empty BarCode 제외", () => {
    const m = buildPCodeToBarcodeMap([
      { PCode: "", BarCode: "123" },
      { PCode: "100", BarCode: "" },
      { PCode: "101", BarCode: "456" },
    ]);
    expect(m.size).toBe(1);
    expect(m.get("101")).toBe("456");
  });
});

describe("buildBuyRowFromErp · mapped product", () => {
  it("정상 → product_code 로 변환 · payload 완성", () => {
    const r = buildBuyRowFromErp(sampleErpBuy, map);
    expect(r.productMatchStatus).toBe("mapped");
    expect(r.productCode).toBe("8806119821800");
    expect(r.payload.product_code).toBe("8806119821800");
    expect(r.payload.bm_code).toBe("12261003000009");
    expect(r.payload.row_num).toBe(1);
    expect(r.payload.quantity).toBe(10);
    expect(r.payload.total).toBe(165000);
    expect(r.payload.purchase_date).toBe("2026-10-03");
    expect(r.payload.supplier_code).toBe("1058");
    expect(r.uniqueKey).toEqual({ bm_code: "12261003000009", row_num: 1 });
  });
  it("numeric cast (string → number)", () => {
    const r = buildBuyRowFromErp({ ...sampleErpBuy, UnitCost: "16500.00", StockCnt: "10.00" }, map);
    expect(r.payload.unit_price).toBe(16500);
    expect(r.payload.quantity).toBe(10);
  });
});

describe("buildBuyRowFromErp · PROTECTED 제외", () => {
  it("verified_* 는 payload 에 절대 포함되지 않음", () => {
    const erp = { ...sampleErpBuy, verified_by: "someone", expiry_date: "2027-01-01" };
    const r = buildBuyRowFromErp(erp, map);
    expect(r.payload).not.toHaveProperty("verified_by");
    expect(r.payload).not.toHaveProperty("expiry_date");
    expect(r.payload).not.toHaveProperty("verify_status");
  });
});

describe("buildBuyRowFromErp · unmapped product", () => {
  it("PCode 가 매핑 사전에 없음 → unmapped · product_code null", () => {
    const r = buildBuyRowFromErp({ ...sampleErpBuy, PCode: "99999" }, map);
    expect(r.productMatchStatus).toBe("unmapped");
    expect(r.productCode).toBeNull();
    expect(r.payload).not.toHaveProperty("product_code");
    // bm_code + row_num 은 여전히 포함 (unique key 유지)
    expect(r.payload.bm_code).toBe("12261003000009");
  });
});

describe("buildBuyRowFromErp · identity 없으면 throw", () => {
  it("BmCode empty 면 throw", () => {
    expect(() => buildBuyRowFromErp({ ...sampleErpBuy, BmCode: "" }, map)).toThrow();
  });
  it("ROWNUM invalid 면 throw", () => {
    expect(() => buildBuyRowFromErp({ ...sampleErpBuy, ROWNUM: 0 }, map)).toThrow();
    expect(() => buildBuyRowFromErp({ ...sampleErpBuy, ROWNUM: "abc" as any }, map)).toThrow();
    expect(() => buildBuyRowFromErp({ ...sampleErpBuy, ROWNUM: -1 }, map)).toThrow();
  });
});
