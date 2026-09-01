// 2026-09-01 · vendors in-memory cache · 순수 로직 검증
//   원본: server/routes/purchase/vendors.ts (vendorCache · invalidateVendorCache · TTL)
//   Supabase / Express mocking 없이 캐시 자체 동작만 검증 (supplierPayments.test.ts 패턴)
import { describe, it, expect, beforeEach } from "vitest";

// ── 캐시 로직 사본 ────────────────────────────────────────────────────────────

const VENDOR_CACHE_TTL_MS = 5 * 60 * 1000; // 5분
const CACHE_KEY_BALANCES = "withBalances";

function makeCache() {
  const cache = new Map<string, { data: any; expiresAt: number }>();

  function invalidate(): void {
    cache.clear();
  }

  function set(data: any, now = Date.now()): void {
    cache.set(CACHE_KEY_BALANCES, { data, expiresAt: now + VENDOR_CACHE_TTL_MS });
  }

  function get(now = Date.now()): { hit: boolean; data?: any } {
    const entry = cache.get(CACHE_KEY_BALANCES);
    if (entry && now < entry.expiresAt) return { hit: true, data: entry.data };
    return { hit: false };
  }

  return { cache, invalidate, set, get };
}

// ─── tests ────────────────────────────────────────────────────────────────────

describe("vendors cache · 기본 hit/miss", () => {
  let c: ReturnType<typeof makeCache>;
  beforeEach(() => { c = makeCache(); });

  it("초기 상태 · miss", () => {
    expect(c.get().hit).toBe(false);
  });

  it("set 후 즉시 · hit", () => {
    c.set([{ id: 1 }]);
    const r = c.get();
    expect(r.hit).toBe(true);
    expect(r.data).toEqual([{ id: 1 }]);
  });

  it("TTL 이내 · hit", () => {
    const now = 1_000_000;
    c.set([{ id: 2 }], now);
    // 4분 59초 후
    expect(c.get(now + VENDOR_CACHE_TTL_MS - 1).hit).toBe(true);
  });

  it("TTL 만료 · miss", () => {
    const now = 1_000_000;
    c.set([{ id: 3 }], now);
    // 5분 경과
    expect(c.get(now + VENDOR_CACHE_TTL_MS).hit).toBe(false);
  });

  it("TTL = 5분 (300,000 ms)", () => {
    expect(VENDOR_CACHE_TTL_MS).toBe(300_000);
  });
});

describe("vendors cache · invalidate", () => {
  let c: ReturnType<typeof makeCache>;
  beforeEach(() => { c = makeCache(); });

  it("invalidate 후 · miss", () => {
    c.set([{ id: 1 }]);
    c.invalidate();
    expect(c.get().hit).toBe(false);
  });

  it("invalidate 후 재set · hit", () => {
    c.set([{ id: 1 }]);
    c.invalidate();
    c.set([{ id: 2 }]);
    const r = c.get();
    expect(r.hit).toBe(true);
    expect(r.data).toEqual([{ id: 2 }]);
  });

  it("빈 캐시에 invalidate · 에러 없음", () => {
    expect(() => c.invalidate()).not.toThrow();
  });
});

describe("vendors cache · 데이터 무결성", () => {
  let c: ReturnType<typeof makeCache>;
  beforeEach(() => { c = makeCache(); });

  it("저장된 데이터 그대로 반환", () => {
    const payload = [
      { id: 1, company_name: "경방신약", latestBalance: { balance: 500_000, total_purchase: 1_000_000, total_payment: 500_000, invoice_date: "2026-08-31", created_at: "2026-09-01T00:00:00Z" } },
      { id: 2, company_name: "코스트팜", latestBalance: null },
    ];
    c.set(payload);
    expect(c.get().data).toEqual(payload);
  });

  it("빈 배열 캐싱 · hit + 빈 배열 반환", () => {
    c.set([]);
    const r = c.get();
    expect(r.hit).toBe(true);
    expect(r.data).toEqual([]);
  });

  it("키는 CACHE_KEY_BALANCES 단일 버킷", () => {
    c.set([{ id: 1 }]);
    // 내부 Map 에 하나만 있어야 함
    expect(c.cache.size).toBe(1);
  });
});

describe("vendors cache · 연속 set (갱신)", () => {
  let c: ReturnType<typeof makeCache>;
  beforeEach(() => { c = makeCache(); });

  it("set 두 번 · 최신값 반환", () => {
    c.set([{ id: 1 }]);
    c.set([{ id: 2 }]);
    expect(c.get().data).toEqual([{ id: 2 }]);
  });

  it("set 두 번 · Map 크기 여전히 1", () => {
    c.set([{ id: 1 }]);
    c.set([{ id: 2 }]);
    expect(c.cache.size).toBe(1);
  });
});
