// 2026-10-03 저녁 · Phase 2 · Product Sync Runner tests
//   · Mock Supabase · 실제 DB 접근 없음
//   · WRITE lock · PROTECTED exclusion · 분류 정확성 검증
import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted · syncSource.ts 를 전역 mock
vi.mock("./syncSource", () => ({
  loadProductListSnapshot: vi.fn(() => ({
    rows: [
      // ERP_MATCHED · ProductName 바뀜 (UPDATE candidate)
      { BarCode: "8806265020416", PCode: "10001", ProductName: "삼양연고 100g (변경)", CorpNameView: "라라컴퍼니", CtCode: "1134", UnitCode: "EA", SaleStatusName: "판매중", Brand: "삼양", Maker: "삼양사", LastBuyDate: "2026-10-01", LastSaleDate: "2026-10-02", NowStock: 15, LocationName: "벽>21>전체>전체" },
      // ERP_MATCHED · 모든 field same (wouldSkipSame)
      { BarCode: "0000000044820", PCode: "10002", ProductName: "변경없음", CorpNameView: "코", CtCode: "100", UnitCode: "EA", SaleStatusName: "판매중", Brand: "브", Maker: "제", LastBuyDate: "", LastSaleDate: "", NowStock: 5, LocationName: "6매대>Ａ>7열>전체" },
      // ERP_NEW · DB 에 없음
      { BarCode: "9999999999999", PCode: "10003", ProductName: "신상품", CorpNameView: "신공급", CtCode: "999", UnitCode: "EA", SaleStatusName: "판매중", Brand: "신", Maker: "신제", LastBuyDate: "2026-10-03", LastSaleDate: "", NowStock: 20, LocationName: "뷰티>2번>전체>전체" },
      // ERP_MISSING_BARCODE (empty BarCode)
      { BarCode: "", PCode: "10004", ProductName: "바코드없음", NowStock: 0, LocationName: "" },
      // Barcode conflict (중복 Barcode)
      { BarCode: "8806265020416", PCode: "10005", ProductName: "중복바코드", NowStock: 1, LocationName: "" },
    ],
    path: "/mock/product-list-2026-10-03.json",
    fetchedAt: "2026-10-03T20:00:00Z",
  })),
  loadBuyStatusSnapshot: vi.fn(),
}));

import { syncProducts } from "./productSyncRunner";

// Mock Supabase client (최소 수준)
function makeMockSupabase(opts: {
  dbRows?: Array<Record<string, unknown>>;
  updateError?: string | null;
  insertError?: string | null;
}) {
  const dbRows = opts.dbRows ?? [];
  const writeOps: Array<{ op: "update" | "insert"; payload: unknown }> = [];
  const client = {
    from(_table: string) {
      return {
        select(_cols: string) {
          return {
            range: async (_a: number, _b: number) => ({ data: dbRows, error: null }),
          };
        },
        update(payload: Record<string, unknown>) {
          writeOps.push({ op: "update", payload });
          return {
            eq: async (_c: string, _v: string) => ({ data: null, error: opts.updateError ? { message: opts.updateError } : null }),
          };
        },
        insert(payload: unknown) {
          writeOps.push({ op: "insert", payload });
          return Promise.resolve({ data: null, error: opts.insertError ? { message: opts.insertError } : null });
        },
      };
    },
    _writeOps: writeOps,
  };
  return client as any;
}

describe("syncProducts · DRY_RUN (default)", () => {
  const baseDb = [
    // ERP_MATCHED · 변경 대상 · product_name 다름
    {
      product_code: "8806265020416", product_name: "삼양연고 100g",
      supplier: "라라컴퍼니", supplier_code: "1134", unit: "EA",
      sale_status: "판매중", brand: "삼양", manufacturer: "삼양사",
      last_purchase_date: "2026-09-01", last_sale_date: "2026-09-02",
      current_stock: 15, display_location: "21", location: "21",
      optimal_stock: 10, memo: "사용자 메모", hidden: false, stock_note: null, imported_at: "2026-01-01",
    },
    // ERP_MATCHED · same
    {
      product_code: "0000000044820", product_name: "변경없음",
      supplier: "코", supplier_code: "100", unit: "EA",
      sale_status: "판매중", brand: "브", manufacturer: "제",
      last_purchase_date: null, last_sale_date: null,
      current_stock: 5, display_location: "6A", location: "6A",
      optimal_stock: 0, memo: null, hidden: false, stock_note: null, imported_at: "2026-01-01",
    },
    // DB_ONLY (ERP 에 없음)
    {
      product_code: "7777777777777", product_name: "DB 자체 상품",
      supplier: "자체", current_stock: 100, display_location: "99",
      optimal_stock: 50, memo: "자체 메모", hidden: false,
    },
  ];

  it("기본값 DRY_RUN · DB WRITE 0건", async () => {
    const mockSb = makeMockSupabase({ dbRows: baseDb });
    const r = await syncProducts(mockSb);
    expect(r.mode).toBe("DRY_RUN");
    expect(r.actualWriteExecuted).toBe(false);
    expect(mockSb._writeOps).toHaveLength(0);
    expect(r.inserted).toBe(0);
    expect(r.updated).toBe(0);
  });

  it("분류 집계 정확", async () => {
    const mockSb = makeMockSupabase({ dbRows: baseDb });
    const r = await syncProducts(mockSb);
    expect(r.erpRows).toBe(5);
    expect(r.dbRows).toBe(3);
    expect(r.matched).toBe(2);
    expect(r.newInsert).toBe(1);
    expect(r.dbOnly).toBe(1);
    expect(r.erpMissingBarcode).toBe(1);
    expect(r.conflict).toBe(1); // 중복 BarCode
  });

  it("wouldUpdate / wouldSkipSame / wouldInsert 집계", async () => {
    const mockSb = makeMockSupabase({ dbRows: baseDb });
    const r = await syncProducts(mockSb);
    expect(r.wouldUpdate).toBeGreaterThanOrEqual(1); // 삼양연고 (ProductName 변경 등)
    expect(r.wouldSkipSame).toBeGreaterThanOrEqual(1); // 변경없음
    expect(r.wouldInsert).toBe(1);
  });

  it("review location 집계 (뷰티 신상품 포함)", async () => {
    const mockSb = makeMockSupabase({ dbRows: baseDb });
    const r = await syncProducts(mockSb);
    expect(r.reviewLocation).toBeGreaterThanOrEqual(1); // 뷰티>2번>전체>전체
  });

  it("protectedMutationCount 는 반드시 0", async () => {
    const mockSb = makeMockSupabase({ dbRows: baseDb });
    const r = await syncProducts(mockSb);
    expect(r.protectedMutationCount).toBe(0);
  });
});

describe("syncProducts · WRITE lock", () => {
  const baseDb = [
    {
      product_code: "8806265020416", product_name: "삼양연고 100g",
      supplier: "라라컴퍼니", supplier_code: "1134", unit: "EA",
      sale_status: "판매중", brand: "삼양", manufacturer: "삼양사",
      last_purchase_date: "2026-09-01", last_sale_date: "2026-09-02",
      current_stock: 15, display_location: "21", location: "21",
      optimal_stock: 10, memo: "사용자 메모", hidden: false,
    },
    {
      product_code: "0000000044820", product_name: "변경없음",
      current_stock: 5, display_location: "6A", location: "6A",
      optimal_stock: 0,
    },
  ];

  it("mode='WRITE' 만 있고 allowWrite=false → DB WRITE 0", async () => {
    const mockSb = makeMockSupabase({ dbRows: baseDb });
    const r = await syncProducts(mockSb, { mode: "WRITE", allowWrite: false });
    expect(r.actualWriteExecuted).toBe(false);
    expect(mockSb._writeOps).toHaveLength(0);
    expect(r.inserted).toBe(0);
    expect(r.updated).toBe(0);
  });

  it("mode='DRY_RUN' + allowWrite=true → DB WRITE 0 (mode 가 WRITE 가 아님)", async () => {
    const mockSb = makeMockSupabase({ dbRows: baseDb });
    const r = await syncProducts(mockSb, { mode: "DRY_RUN", allowWrite: true });
    expect(r.actualWriteExecuted).toBe(false);
    expect(mockSb._writeOps).toHaveLength(0);
  });

  it("double gate 통과 (mode=WRITE + allowWrite=true) → WRITE 실행", async () => {
    const mockSb = makeMockSupabase({ dbRows: baseDb });
    const r = await syncProducts(mockSb, { mode: "WRITE", allowWrite: true });
    expect(r.actualWriteExecuted).toBe(true);
    expect(mockSb._writeOps.length).toBeGreaterThan(0);
    // insert ops 가 1건 이상 (ERP_NEW · 9999999999999)
    expect(mockSb._writeOps.some((o: any) => o.op === "insert")).toBe(true);
    // update ops 가 1건 이상 (삼양연고 · ProductName 변경)
    expect(mockSb._writeOps.some((o: any) => o.op === "update")).toBe(true);
  });
});

describe("syncProducts · PROTECTED field 자동 제외", () => {
  it("UPDATE payload 에 PROTECTED (optimal_stock · memo · hidden · stock_note) 포함되지 않음", async () => {
    const mockSb = makeMockSupabase({
      dbRows: [{
        product_code: "8806265020416", product_name: "원래이름",
        supplier: "구공급", supplier_code: "1134", unit: "EA",
        sale_status: "판매중", brand: "삼양", manufacturer: "삼양사",
        current_stock: 15, display_location: "21", location: "21",
        optimal_stock: 999, memo: "중요메모", hidden: true, stock_note: "note", imported_at: "2026-01-01",
      }],
    });
    const r = await syncProducts(mockSb, { mode: "WRITE", allowWrite: true });
    const updateOps = mockSb._writeOps.filter((o: any) => o.op === "update");
    expect(updateOps.length).toBeGreaterThan(0);
    for (const op of updateOps) {
      expect(op.payload).not.toHaveProperty("optimal_stock");
      expect(op.payload).not.toHaveProperty("memo");
      expect(op.payload).not.toHaveProperty("hidden");
      expect(op.payload).not.toHaveProperty("stock_note");
      expect(op.payload).not.toHaveProperty("imported_at");
    }
    expect(r.protectedMutationCount).toBe(0);
  });
});

describe("syncProducts · ERP null overwrite 금지", () => {
  it("ERP ProductName null + DB has → UPDATE payload 에 product_name 없음", async () => {
    const mockSb = makeMockSupabase({
      dbRows: [{
        product_code: "0000000044820", product_name: "DB 상품명 유지되어야 함",
        supplier: "코", current_stock: 5, display_location: "6A",
      }],
    });
    // Mock snapshot 재지정 · 이 테스트 전용
    const { loadProductListSnapshot } = await import("./syncSource");
    (loadProductListSnapshot as any).mockReturnValueOnce({
      rows: [{ BarCode: "0000000044820", PCode: "x", ProductName: "", CorpNameView: "코", NowStock: 5, LocationName: "6매대>Ａ>7열>전체" }],
      path: "/mock/x.json",
    });
    const r = await syncProducts(mockSb, { mode: "WRITE", allowWrite: true });
    const updateOps = mockSb._writeOps.filter((o: any) => o.op === "update");
    for (const op of updateOps) {
      expect(op.payload).not.toHaveProperty("product_name"); // null overwrite 금지
    }
    expect(r.wouldUpdate + r.wouldSkipSame).toBeGreaterThanOrEqual(1);
  });
});

describe("syncProducts · NowStock → current_stock 매핑", () => {
  it("ERP NowStock 변경 → payload.current_stock 포함", async () => {
    const mockSb = makeMockSupabase({
      dbRows: [{
        product_code: "0000000044820", product_name: "변경없음",
        supplier: "코", supplier_code: "100", unit: "EA",
        sale_status: "판매중", brand: "브", manufacturer: "제",
        current_stock: 1, display_location: "6A", location: "6A",
      }],
    });
    const { loadProductListSnapshot } = await import("./syncSource");
    (loadProductListSnapshot as any).mockReturnValueOnce({
      rows: [{ BarCode: "0000000044820", PCode: "x", ProductName: "변경없음", CorpNameView: "코", CtCode: "100", UnitCode: "EA", SaleStatusName: "판매중", Brand: "브", Maker: "제", NowStock: 42, LocationName: "6매대>Ａ>7열>전체" }],
      path: "/mock/x.json",
    });
    const r = await syncProducts(mockSb, { mode: "WRITE", allowWrite: true });
    const updateOps = mockSb._writeOps.filter((o: any) => o.op === "update");
    expect(updateOps.length).toBeGreaterThan(0);
    expect(updateOps[0].payload).toMatchObject({ current_stock: 42 });
    expect(r.updated).toBeGreaterThanOrEqual(1);
  });
});
