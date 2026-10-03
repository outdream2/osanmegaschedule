// 2026-10-03 저녁 · Phase 2 · Buy Sync Runner tests
import { describe, it, expect, vi } from "vitest";

vi.mock("./syncSource", () => ({
  loadProductListSnapshot: vi.fn(() => ({
    rows: [
      { PCode: "12035", BarCode: "8806119821800" },
      { PCode: "10805", BarCode: "18806446004911" },
    ],
    path: "/mock/pl.json",
  })),
  loadBuyStatusSnapshot: vi.fn(() => ({
    rows: [
      { BmCode: "12261003000009", ROWNUM: 1, PCode: "12035", BuyDate: "2026-10-03", CtCode: "1058", CorpNameView: "코", ProductName: "P1", UnitCode: "EA", UnitCost: 16500, StockCnt: 10, BuyPrice: 150000, BuyTax: 15000, BuyTotal: 165000 },
      { BmCode: "12261003000009", ROWNUM: 2, PCode: "99999", BuyDate: "2026-10-03", CtCode: "1058", CorpNameView: "코", ProductName: "매핑실패", UnitCode: "EA", UnitCost: 1000, StockCnt: 5, BuyPrice: 5000, BuyTax: 500, BuyTotal: 5500 },
      { BmCode: "12261003000009", ROWNUM: 3, PCode: "10805", BuyDate: "2026-10-03", CtCode: "1058", CorpNameView: "코", ProductName: "P3", UnitCode: "EA", UnitCost: 24200, StockCnt: 10, BuyPrice: 220000, BuyTax: 22000, BuyTotal: 242000 },
    ],
    path: "/mock/buy.json",
  })),
}));

import { syncPurchases } from "./buySyncRunner";

function makeMockSupabase(opts: {
  bmCodeColumnMissing?: boolean;
  existingKeys?: Array<{ bm_code: string; row_num: number }>;
  upsertError?: string | null;
}) {
  const writeOps: Array<{ op: "upsert"; payload: unknown }> = [];
  const client = {
    from(_table: string) {
      return {
        select(cols: string) {
          const builder: any = {
            _cols: cols,
            _not: null,
            limit: async (_n: number) => {
              if (opts.bmCodeColumnMissing && cols.includes("bm_code")) {
                return { data: null, error: { message: "column purchase_details.bm_code does not exist" } };
              }
              return { data: [], error: null };
            },
            not: (_c: string, _is: string, _v: any) => {
              builder._not = { _c, _is, _v };
              return {
                range: async (_a: number, _b: number) => {
                  const rows = (opts.existingKeys ?? []).map((k) => ({ bm_code: k.bm_code, row_num: k.row_num }));
                  return { data: rows, error: null };
                },
              };
            },
            range: async (_a: number, _b: number) => ({ data: [], error: null }),
          };
          return builder;
        },
        upsert(payload: unknown, _opts: unknown) {
          writeOps.push({ op: "upsert", payload });
          return Promise.resolve({ data: null, error: opts.upsertError ? { message: opts.upsertError } : null });
        },
      };
    },
    _writeOps: writeOps,
  };
  return client as any;
}

describe("syncPurchases · migration gate", () => {
  it("bm_code column 없으면 BLOCKED · DB WRITE 0", async () => {
    const mockSb = makeMockSupabase({ bmCodeColumnMissing: true });
    const r = await syncPurchases(mockSb, { mode: "WRITE", allowWrite: true });
    expect(r.blocked).toBe(true);
    expect(r.blockReason).toBe("MIGRATION_REQUIRED");
    expect(r.actualWriteExecuted).toBe(false);
    expect(mockSb._writeOps).toHaveLength(0);
    expect(r.migrationStatus).toBe("missing");
  });
});

describe("syncPurchases · DRY_RUN", () => {
  it("기본값 DRY_RUN · DB WRITE 0 · 분류 정확", async () => {
    const mockSb = makeMockSupabase({});
    const r = await syncPurchases(mockSb);
    expect(r.mode).toBe("DRY_RUN");
    expect(r.actualWriteExecuted).toBe(false);
    expect(mockSb._writeOps).toHaveLength(0);
    expect(r.erpRows).toBe(3);
    expect(r.mapped).toBe(2); // 12035, 10805
    expect(r.unmapped).toBe(1); // 99999
    expect(r.wouldInsert).toBe(2);
    expect(r.blocked).toBe(false);
    expect(r.migrationStatus).toBe("present");
  });

  it("existing (bm_code, row_num) 는 skip · existingDuplicate 집계", async () => {
    const mockSb = makeMockSupabase({
      existingKeys: [{ bm_code: "12261003000009", row_num: 1 }],
    });
    const r = await syncPurchases(mockSb);
    expect(r.existingDuplicate).toBe(1);
    expect(r.wouldInsert).toBe(1); // row 1 skip · row 3 만 신규
  });
});

describe("syncPurchases · WRITE lock", () => {
  it("mode='WRITE' + allowWrite=false → DB WRITE 0", async () => {
    const mockSb = makeMockSupabase({});
    const r = await syncPurchases(mockSb, { mode: "WRITE", allowWrite: false });
    expect(r.actualWriteExecuted).toBe(false);
    expect(mockSb._writeOps).toHaveLength(0);
  });

  it("double gate 통과 → upsert 실행 (ignoreDuplicates=true)", async () => {
    const mockSb = makeMockSupabase({});
    const r = await syncPurchases(mockSb, { mode: "WRITE", allowWrite: true });
    expect(r.actualWriteExecuted).toBe(true);
    expect(mockSb._writeOps.length).toBeGreaterThan(0);
    expect(mockSb._writeOps[0].op).toBe("upsert");
    // 매핑 성공 2건 중 신규 2건 insert
    expect(r.inserted).toBe(2);
  });
});

describe("syncPurchases · unique key", () => {
  it("(BmCode, ROWNUM) 조합 · 반복 호출 시 duplicate prevention", async () => {
    // 1차 WRITE
    const mockSb = makeMockSupabase({});
    await syncPurchases(mockSb, { mode: "WRITE", allowWrite: true });
    // 2차 호출 (existing 에 1차 결과 반영 가정)
    const mockSb2 = makeMockSupabase({
      existingKeys: [
        { bm_code: "12261003000009", row_num: 1 },
        { bm_code: "12261003000009", row_num: 3 },
      ],
    });
    const r2 = await syncPurchases(mockSb2);
    expect(r2.existingDuplicate).toBe(2);
    expect(r2.wouldInsert).toBe(0);
  });
});
