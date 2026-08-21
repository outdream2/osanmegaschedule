// 2026-08-20 · OCR pipeline benchmark · 매칭율 리포트 헬퍼
//   · benchmarkPage · PageContext + ExpectedInvoice → PageBenchmarkResult
//   · formatBenchmarkReport · 여러 결과 · 표 문자열
//   · types.makeInitialContext · 초기 PageContext 생성
import { describe, it, expect } from "vitest";
import { benchmarkPage, formatBenchmarkReport, type ExpectedInvoice } from "./benchmark";
import { makeInitialContext } from "./types";

// PageContext 헬퍼
function mkCtx(overrides: any = {}): any {
  return {
    page: 1,
    rawB64: "",
    rawMime: "",
    approach: "default",
    rawText: "",
    headers: ["품명", "수량", "단가", "금액"],
    rows: [],
    meta: {},
    startTs: Date.now() - 100,
    diagnostics: [],
    errors: [],
    ...overrides,
  };
}

describe("makeInitialContext · 초기 PageContext", () => {
  it("기본 · page/rawB64/rawMime 필드 · approach=default", () => {
    const ctx = makeInitialContext({
      page: 1,
      rawB64: "abc",
      rawMime: "image/jpeg",
    });
    expect(ctx.page).toBe(1);
    expect(ctx.rawB64).toBe("abc");
    expect(ctx.rawMime).toBe("image/jpeg");
    expect(ctx.approach).toBe("default");
    expect(ctx.rawText).toBe("");
    expect(ctx.headers).toEqual([]);
    expect(ctx.rows).toEqual([]);
    expect(ctx.meta).toEqual({});
    expect(ctx.diagnostics).toEqual([]);
    expect(ctx.errors).toEqual([]);
  });

  it("startTs · Date.now 근접 값", () => {
    const before = Date.now();
    const ctx = makeInitialContext({ page: 1, rawB64: "", rawMime: "" });
    const after = Date.now();
    expect(ctx.startTs).toBeGreaterThanOrEqual(before);
    expect(ctx.startTs).toBeLessThanOrEqual(after);
  });

  it("approach · 명시 override", () => {
    const ctx = makeInitialContext({ page: 1, rawB64: "", rawMime: "", approach: "rearrange" });
    expect(ctx.approach).toBe("rearrange");
  });

  it("supplierHint · cachedRawText · 옵션 전달", () => {
    const ctx = makeInitialContext({
      page: 1, rawB64: "", rawMime: "",
      supplierHint: "지오영",
      cachedRawText: "prev text",
    });
    expect(ctx.supplierHint).toBe("지오영");
    expect(ctx.cachedRawText).toBe("prev text");
  });
});

describe("benchmarkPage · 필드 매칭 검증", () => {
  it("완전 일치 · totalScore 100", () => {
    const ctx = mkCtx({
      meta: { supplier: "A제약", total: 10000, subtotal: 9091, vat: 909, supplyAmount: 9091 },
      rows: [["타이레놀", 5, 1000, 5000]],
    });
    const expected: ExpectedInvoice = {
      page: 1,
      supplier: "A제약",
      productCount: 1,
      subtotal: 9091,
      supplyAmount: 9091,
      vat: 909,
      total: 10000,
    };
    const r = benchmarkPage(ctx, expected);
    // supplier · subtotal · supplyAmount · vat · total · discount(null) · return(null) · vatSeparate(false) · productCount = 9 match
    expect(r.totalScore).toBe(100);
    expect(r.page).toBe(1);
    expect(r.supplier).toBe("A제약");
  });

  it("supplier 불일치 · productCount 불일치", () => {
    const ctx = mkCtx({ meta: { supplier: "B제약" }, rows: [] });
    const expected: ExpectedInvoice = { page: 1, supplier: "A제약", productCount: 5 };
    const r = benchmarkPage(ctx, expected);
    const supplierF = r.fields.find(f => f.field === "supplier");
    const countF = r.fields.find(f => f.field === "productCount");
    expect(supplierF?.match).toBe(false);
    expect(countF?.match).toBe(false);
  });

  it("norm(supplier) 매칭 · 공백·특수문자 제거 후 비교", () => {
    const ctx = mkCtx({ meta: { supplier: "A 제약(주)" } });
    const expected: ExpectedInvoice = { page: 1, supplier: "A제약주", productCount: 0 };
    const r = benchmarkPage(ctx, expected);
    // norm 이 공백 제거 · "()" 제거 · 동일
    const supplierF = r.fields.find(f => f.field === "supplier");
    expect(supplierF?.match).toBe(true);
  });

  it("expected.supplier 없음 · 항상 match=true", () => {
    const ctx = mkCtx({ meta: {} });
    const expected: ExpectedInvoice = { page: 1, productCount: 0 };
    const r = benchmarkPage(ctx, expected);
    const supplierF = r.fields.find(f => f.field === "supplier");
    expect(supplierF?.match).toBe(true);
  });

  it("approxEqual · 1% 오차 허용 (금액)", () => {
    const ctx = mkCtx({ meta: { total: 10099 } });
    const expected: ExpectedInvoice = { page: 1, productCount: 0, total: 10000 };
    // 10099 vs 10000 = 0.99% 오차 · max(1, 100) = 100 · pass
    const r = benchmarkPage(ctx, expected);
    const totalF = r.fields.find(f => f.field === "total");
    expect(totalF?.match).toBe(true);
  });

  it("approxEqual · 1% 초과 · match=false", () => {
    const ctx = mkCtx({ meta: { total: 20000 } });
    const expected: ExpectedInvoice = { page: 1, productCount: 0, total: 10000 };
    const r = benchmarkPage(ctx, expected);
    const totalF = r.fields.find(f => f.field === "total");
    expect(totalF?.match).toBe(false);
  });

  it("productMatchRate · 상품 매칭 · 완전 일치", () => {
    const ctx = mkCtx({
      rows: [["타이레놀정500mg", 5, 1000, 5000], ["게보린", 3, 2000, 6000]],
    });
    const expected: ExpectedInvoice = {
      page: 1, productCount: 2,
      products: [
        { name: "타이레놀정500mg" },
        { name: "게보린" },
      ],
    };
    const r = benchmarkPage(ctx, expected);
    expect(r.productMatchRate).toBe(1);
  });

  it("productMatchRate · substring 매칭 (포함)", () => {
    const ctx = mkCtx({
      rows: [["타이레놀정500mg", 5, 1000, 5000]],
    });
    const expected: ExpectedInvoice = {
      page: 1, productCount: 1,
      products: [{ name: "타이레놀" }],
    };
    const r = benchmarkPage(ctx, expected);
    // norm(타이레놀정500mg) · length>=4 · includes(타이레놀) · match
    expect(r.productMatchRate).toBe(1);
  });

  it("productMatchRate · 절반 매칭 · 0.5", () => {
    const ctx = mkCtx({
      rows: [["타이레놀", 5, 1000, 5000]],
    });
    const expected: ExpectedInvoice = {
      page: 1, productCount: 1,
      products: [{ name: "타이레놀" }, { name: "게보린" }],
    };
    const r = benchmarkPage(ctx, expected);
    expect(r.productMatchRate).toBe(0.5);
  });

  it("productMatchRate · qty 불일치 · 상품 매칭 X", () => {
    const ctx = mkCtx({
      rows: [["타이레놀", 3, 1000, 3000]],
    });
    const expected: ExpectedInvoice = {
      page: 1, productCount: 1,
      products: [{ name: "타이레놀", qty: 5 }],
    };
    const r = benchmarkPage(ctx, expected);
    expect(r.productMatchRate).toBe(0);
  });

  it("expected.products 없음 · productMatchRate=1 (기본)", () => {
    const ctx = mkCtx({ rows: [["A", 1, 1, 1]] });
    const expected: ExpectedInvoice = { page: 1, productCount: 1 };
    const r = benchmarkPage(ctx, expected);
    expect(r.productMatchRate).toBe(1);
  });

  it("errors 전달 · 결과에 포함", () => {
    const ctx = mkCtx({ errors: ["OCR error 1", "vendor mismatch"] });
    const expected: ExpectedInvoice = { page: 1, productCount: 0 };
    const r = benchmarkPage(ctx, expected);
    expect(r.errors).toEqual(["OCR error 1", "vendor mismatch"]);
  });

  it("duration · Date.now - startTs (양수)", () => {
    const ctx = mkCtx({ startTs: Date.now() - 500 });
    const expected: ExpectedInvoice = { page: 1, productCount: 0 };
    const r = benchmarkPage(ctx, expected);
    expect(r.duration).toBeGreaterThanOrEqual(500);
  });

  it("meta.supplier 없음 · '미상' 반환", () => {
    const ctx = mkCtx({ meta: {} });
    const expected: ExpectedInvoice = { page: 1, productCount: 0 };
    const r = benchmarkPage(ctx, expected);
    expect(r.supplier).toBe("미상");
  });
});

describe("formatBenchmarkReport · 요약 문자열", () => {
  it("빈 결과 · 헤더 · 평균 0", () => {
    const r = formatBenchmarkReport([]);
    expect(r).toContain("OCR 매칭율 벤치마크 리포트");
    expect(r).toContain("전체 페이지: 0");
  });

  it("여러 페이지 · 페이지별 점수 · 필드별 실패율", () => {
    const results = [
      { page: 1, supplier: "A", fields: [{ field: "total", expected: 100, actual: 100, match: true }], productMatchRate: 1, totalScore: 100, duration: 500, errors: [] },
      { page: 2, supplier: "B", fields: [{ field: "total", expected: 200, actual: 100, match: false }], productMatchRate: 0, totalScore: 0, duration: 300, errors: ["err"] },
    ];
    const r = formatBenchmarkReport(results);
    expect(r).toContain("전체 페이지: 2");
    expect(r).toContain("평균 매칭 점수: 50.0%");
    expect(r).toContain("[페이지 1]");
    expect(r).toContain("[페이지 2]");
    expect(r).toContain("에러:");
    // 필드별 실패율
    expect(r).toContain("total");
  });

  it("100% 성공 · ✅ 마커", () => {
    const results = [
      { page: 1, supplier: "A", fields: [{ field: "total", expected: 100, actual: 100, match: true }], productMatchRate: 1, totalScore: 100, duration: 100, errors: [] },
    ];
    const r = formatBenchmarkReport(results);
    expect(r).toContain("✅");
  });

  it("0% 성공 · 🔴 마커", () => {
    const results = [
      { page: 1, supplier: "A", fields: [{ field: "total", expected: 100, actual: 200, match: false }], productMatchRate: 0, totalScore: 0, duration: 100, errors: [] },
    ];
    const r = formatBenchmarkReport(results);
    expect(r).toContain("🔴");
  });

  it("전체 소요 시간 · 초 단위 표시", () => {
    const results = [
      { page: 1, supplier: "A", fields: [], productMatchRate: 1, totalScore: 100, duration: 2500, errors: [] },
    ];
    const r = formatBenchmarkReport(results);
    expect(r).toContain("2.5초");
  });

  it("필드 실패 이유 · reason 포함", () => {
    const results = [
      { page: 1, supplier: "A", fields: [{ field: "products", expected: 5, actual: 3, match: false, reason: "3/5 매칭" }], productMatchRate: 0.6, totalScore: 0, duration: 100, errors: [] },
    ];
    const r = formatBenchmarkReport(results);
    expect(r).toContain("3/5 매칭");
  });
});
