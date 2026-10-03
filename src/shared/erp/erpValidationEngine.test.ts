// 2026-10-03 저녁 · Phase 2 · Validation Engine tests
import { describe, it, expect } from "vitest";
import { validateErpSnapshot, type ValidationErpRow } from "./erpValidationEngine";

const okRow: ValidationErpRow = {
  BarCode: "8806265020416",
  PCode: "10001",
  ProductName: "삼양연고 100g",
  NowStock: 10,
  UnitCode: "EA",
  SaleStatusName: "판매중",
  LocationName: "벽>21>전체>전체",
};

describe("validateErpSnapshot · 기본 NORMAL", () => {
  it("완벽한 1행 · ERROR 0 · REVIEW 0", () => {
    const r = validateErpSnapshot([okRow], null);
    expect(r.totalRows).toBe(1);
    expect(r.error).toBe(0);
    expect(r.review).toBe(0);
    expect(r.normal).toBe(1);
    expect(r.blockingErrors).toBe(false);
  });
});

describe("validateErpSnapshot · ERROR 분류", () => {
  it("BARCODE_MISSING", () => {
    const r = validateErpSnapshot([{ ...okRow, BarCode: "" }], null);
    expect(r.byCode.BARCODE_MISSING).toBe(1);
    expect(r.blockingErrors).toBe(true);
  });

  it("BARCODE_DUPLICATE (한 번만 보고)", () => {
    const r = validateErpSnapshot([
      okRow,
      { ...okRow, PCode: "99999" }, // 같은 BarCode · 다른 PCode
    ], null);
    expect(r.byCode.BARCODE_DUPLICATE).toBe(1);
    expect(r.blockingErrors).toBe(true);
  });

  it("PCODE_MISSING", () => {
    const r = validateErpSnapshot([{ ...okRow, PCode: "" }], null);
    expect(r.byCode.PCODE_MISSING).toBe(1);
    expect(r.blockingErrors).toBe(true);
  });

  it("PCODE_DUPLICATE", () => {
    const r = validateErpSnapshot([
      okRow,
      { ...okRow, BarCode: "9999999999999" }, // 같은 PCode · 다른 BarCode
    ], null);
    expect(r.byCode.PCODE_DUPLICATE).toBe(1);
    expect(r.blockingErrors).toBe(true);
  });

  it("PCODE_BARCODE_CONFLICT · 중복 체크와 중첩", () => {
    const r = validateErpSnapshot([
      okRow,
      { ...okRow, BarCode: "9999999999999" },
    ], null);
    // (PCode, Barcode1) + (PCode, Barcode2) 두 쌍 모두 conflict
    expect(r.byCode.PCODE_BARCODE_CONFLICT).toBe(2);
    expect(r.blockingErrors).toBe(true);
  });

  it("PRODUCT_NAME_MISSING", () => {
    const r = validateErpSnapshot([{ ...okRow, ProductName: "" }], null);
    expect(r.byCode.PRODUCT_NAME_MISSING).toBe(1);
    expect(r.blockingErrors).toBe(true);
  });

  it("INVALID_NOW_STOCK · 숫자 cast 불가 문자열", () => {
    const r = validateErpSnapshot([{ ...okRow, NowStock: "abc" }], null);
    expect(r.byCode.INVALID_NOW_STOCK).toBe(1);
    expect(r.blockingErrors).toBe(true);
  });

  it("ROW_COUNT_CRITICAL_DROP · 30%+ 급감", () => {
    const r = validateErpSnapshot([okRow], null, { previousRowCount: 1000 });
    expect(r.byCode.ROW_COUNT_CRITICAL_DROP).toBe(1);
    expect(r.blockingErrors).toBe(true);
  });

  it("BARCODE_MATCH_RATE_CRITICAL_DROP · 20%+ 하락", () => {
    const r = validateErpSnapshot(
      [okRow, { ...okRow, BarCode: "", PCode: "x1" }, { ...okRow, BarCode: "", PCode: "x2" }],
      null,
      { previousBarcodeNonEmptyRate: 0.95 },
    );
    expect(r.byCode.BARCODE_MATCH_RATE_CRITICAL_DROP).toBe(1);
    expect(r.blockingErrors).toBe(true);
  });
});

describe("validateErpSnapshot · REVIEW 분류 (Sync 차단 안 함)", () => {
  it("LOCATION_REVIEW · 뷰티", () => {
    const r = validateErpSnapshot([{ ...okRow, LocationName: "뷰티>2번>전체>전체" }], null);
    expect(r.byCode.LOCATION_REVIEW).toBe(1);
    expect(r.blockingErrors).toBe(false);
    expect(r.issues[0].reviewFlag).toBe("LOCATION_REVIEW_BEAUTY");
  });

  it("LOCATION_REVIEW · 매대+뒤", () => {
    const r = validateErpSnapshot([{ ...okRow, LocationName: "6매대>뒤>전체>전체" }], null);
    expect(r.byCode.LOCATION_REVIEW).toBe(1);
    expect(r.issues[0].reviewFlag).toBe("LOCATION_REVIEW_REAR_FRONT");
  });

  it("STOCK_SPIKE · DB 35 · ERP 35000 → REVIEW", () => {
    const db = new Map<string, number | null>([[okRow.BarCode as string, 35]]);
    const r = validateErpSnapshot([{ ...okRow, NowStock: 35000 }], { currentStockByBarcode: db });
    expect(r.byCode.STOCK_SPIKE).toBe(1);
    expect(r.blockingErrors).toBe(false);
  });

  it("STOCK_SPIKE 안 함 · DB 35 · ERP 38 (NORMAL)", () => {
    const db = new Map<string, number | null>([[okRow.BarCode as string, 35]]);
    const r = validateErpSnapshot([{ ...okRow, NowStock: 38 }], { currentStockByBarcode: db });
    expect(r.byCode.STOCK_SPIKE).toBe(0);
    expect(r.normal).toBe(1);
  });

  it("UNKNOWN_UNIT · knownUnits 밖", () => {
    const r = validateErpSnapshot(
      [{ ...okRow, UnitCode: "KG" }],
      null,
      { knownUnits: new Set(["EA", "BOX"]) },
    );
    expect(r.byCode.UNKNOWN_UNIT).toBe(1);
    expect(r.blockingErrors).toBe(false);
  });

  it("UNKNOWN_SALE_STATUS · knownSaleStatus 밖", () => {
    const r = validateErpSnapshot(
      [{ ...okRow, SaleStatusName: "일시중지" }],
      null,
      { knownSaleStatus: new Set(["판매중", "판매중지"]) },
    );
    expect(r.byCode.UNKNOWN_SALE_STATUS).toBe(1);
  });

  it("UNKNOWN_LOCATION_PATTERN · 알 수 없는 대분류", () => {
    const r = validateErpSnapshot([{ ...okRow, LocationName: "창고>99>전체>전체" }], null);
    expect(r.byCode.UNKNOWN_LOCATION_PATTERN).toBe(1);
    expect(r.blockingErrors).toBe(false);
  });
});

describe("validateErpSnapshot · 혼합 시나리오", () => {
  it("ERROR + REVIEW + NORMAL 동시 집계", () => {
    const rows: ValidationErpRow[] = [
      okRow, // NORMAL
      { ...okRow, BarCode: "9999999999999", PCode: "20002", LocationName: "뷰티>1번>전체>전체" }, // REVIEW
      { ...okRow, BarCode: "", PCode: "20003", ProductName: "에러상품" }, // ERROR
    ];
    const r = validateErpSnapshot(rows, null);
    expect(r.totalRows).toBe(3);
    expect(r.error).toBeGreaterThanOrEqual(1);
    expect(r.review).toBeGreaterThanOrEqual(1);
    expect(r.normal).toBeGreaterThanOrEqual(1);
    expect(r.blockingErrors).toBe(true);
  });

  it("ERROR 가 하나라도 있으면 blockingErrors = true", () => {
    const r = validateErpSnapshot(
      [okRow, { ...okRow, BarCode: "" }],
      null,
    );
    expect(r.blockingErrors).toBe(true);
  });

  it("REVIEW 만 있으면 blockingErrors = false", () => {
    const r = validateErpSnapshot(
      [{ ...okRow, LocationName: "뷰티>2번>전체>전체" }],
      null,
    );
    expect(r.blockingErrors).toBe(false);
    expect(r.review).toBe(1);
  });
});

describe("validateErpSnapshot · snapshot-level NORMAL 유지", () => {
  it("row count 소폭 감소 → ERROR 아님", () => {
    const r = validateErpSnapshot(
      Array(950).fill(okRow).map((r, i) => ({ ...r, BarCode: `99999999${String(i).padStart(5, "0")}`, PCode: String(10000 + i) })),
      null,
      { previousRowCount: 1000 },
    );
    expect(r.byCode.ROW_COUNT_CRITICAL_DROP).toBe(0);
  });
});
