// 2026-08-20 · stockPeriodUtils · 순수 유틸 함수 검증 (fmt·periodLabel·fillPeriods·aggregate)
import { describe, it, expect } from "vitest";
import {
  fmt,
  fmtWon,
  periodLabel,
  fillPeriodsWithRows,
  aggregateToMonths,
  type PeriodRow,
} from "./stockPeriodUtils";

describe("fmt · 숫자 포맷", () => {
  it("null · '0'", () => {
    expect(fmt(null)).toBe("0");
  });

  it("undefined · '0'", () => {
    expect(fmt(undefined)).toBe("0");
  });

  it("NaN · '0'", () => {
    expect(fmt(NaN)).toBe("0");
  });

  it("Infinity · '0'", () => {
    expect(fmt(Infinity)).toBe("0");
  });

  it("정수 · 콤마 구분", () => {
    expect(fmt(1000)).toBe("1,000");
    expect(fmt(1234567)).toBe("1,234,567");
  });

  it("음수 · 부호 유지", () => {
    expect(fmt(-1234)).toBe("-1,234");
  });

  it("0 · '0'", () => {
    expect(fmt(0)).toBe("0");
  });
});

describe("fmtWon · 원화 축약 포맷", () => {
  it("null · '-'", () => {
    expect(fmtWon(null)).toBe("-");
  });

  it("undefined · '-'", () => {
    expect(fmtWon(undefined)).toBe("-");
  });

  it("NaN · '-'", () => {
    expect(fmtWon(NaN)).toBe("-");
  });

  it("1만 미만 · 원 단위", () => {
    expect(fmtWon(5000)).toBe("5,000원");
    expect(fmtWon(0)).toBe("0원");
  });

  it("1만 이상 1억 미만 · 만 단위", () => {
    expect(fmtWon(10000)).toBe("1.0만");
    expect(fmtWon(150000)).toBe("15.0만");
  });

  it("1억 이상 · 억 단위", () => {
    expect(fmtWon(100_000_000)).toBe("1.0억");
    expect(fmtWon(2_500_000_000)).toBe("25.0억");
  });

  it("음수 · 절대값 기준 단위 판정", () => {
    expect(fmtWon(-50000)).toBe("-5.0만");
  });
});

describe("periodLabel · 기간 라벨", () => {
  it("정상 · YYYY-MM-DD → M/D ~ M/D", () => {
    expect(periodLabel("2026-08-01", "2026-08-10")).toBe("8/1 ~ 8/10");
  });

  it("월 두자리 · zero-pad 제거", () => {
    expect(periodLabel("2026-12-01", "2026-12-31")).toBe("12/1 ~ 12/31");
  });

  it("잘못된 포맷 · 원본 그대로", () => {
    expect(periodLabel("invalid", "2026-08-10")).toBe("invalid ~ 2026-08-10");
  });

  it("빈 문자열 · fallback", () => {
    expect(periodLabel("", "")).toBe(" ~ ");
  });
});

describe("fillPeriodsWithRows · 기간 채움", () => {
  const makeEmpty = (start: string, end: string, type: "early" | "mid" | "late"): PeriodRow => ({
    period_start_date: start,
    snapshot_date: end,
    period_type: type,
  });

  it("빈 rows · 모두 empty 로 채움", () => {
    const r = fillPeriodsWithRows<PeriodRow>([], 30, makeEmpty);
    expect(r.length).toBeGreaterThan(0);
    for (const row of r) {
      expect(row.period_type).toMatch(/early|mid|late/);
    }
  });

  it("일부 rows · matching start_date 는 원본 사용 · 나머지 empty", () => {
    // UTC 기준으로 날짜 계산 (generatePeriods 와 동일 기준)
    const todayUtc = new Date().toISOString().slice(0, 10);
    const yy = todayUtc.slice(0, 4);
    const mm = todayUtc.slice(5, 7);
    const start = `${yy}-${mm}-01`;
    const existing: PeriodRow = {
      period_start_date: start,
      snapshot_date: `${yy}-${mm}-10`,
      period_type: "early" as const,
      purchase_qty: 999,
    };
    const r = fillPeriodsWithRows([existing], 30, makeEmpty);
    const matched = r.find(x => x.period_start_date === start);
    expect(matched?.purchase_qty).toBe(999);
  });

  it("반환 · 배열 · rangeDays 커버", () => {
    const r = fillPeriodsWithRows([], 60, makeEmpty);
    expect(Array.isArray(r)).toBe(true);
    // 60일 · 최소 5개 이상 (10일 단위)
    expect(r.length).toBeGreaterThanOrEqual(5);
  });
});

describe("aggregateToMonths · 10일 기간 → 월별 집계", () => {
  it("빈 배열 · 빈 배열", () => {
    expect(aggregateToMonths([])).toEqual([]);
  });

  it("동일 월 · early/mid/late · 합계 집계", () => {
    const rows = [
      { period_start_date: "2026-07-01", snapshot_date: "2026-07-10", period_type: "early",
        opening_stock: 100, purchase_qty: 10, sale_qty: 5, disposal_qty: 1,
        closing_stock: 104, supply_amount: 1000, total_amount: 1100, product_count: 50 },
      { period_start_date: "2026-07-11", snapshot_date: "2026-07-20", period_type: "mid",
        opening_stock: 104, purchase_qty: 20, sale_qty: 8, disposal_qty: 0,
        closing_stock: 116, supply_amount: 2000, total_amount: 2200, product_count: 55 },
      { period_start_date: "2026-07-21", snapshot_date: "2026-07-31", period_type: "late",
        opening_stock: 116, purchase_qty: 15, sale_qty: 10, disposal_qty: 2,
        closing_stock: 119, supply_amount: 1500, total_amount: 1650, product_count: 60 },
    ];
    const r = aggregateToMonths(rows);
    expect(r).toHaveLength(1);
    expect(r[0].period_start_date).toBe("2026-07-01");
    expect(r[0].purchase_qty).toBe(45);
    expect(r[0].sale_qty).toBe(23);
    expect(r[0].disposal_qty).toBe(3);
    expect(r[0].supply_amount).toBe(4500);
    expect(r[0].total_amount).toBe(4950);
  });

  it("opening_stock · 가장 이른 snapshot 기준", () => {
    const rows = [
      { period_start_date: "2026-07-11", snapshot_date: "2026-07-20", period_type: "mid",
        opening_stock: 200 },
      { period_start_date: "2026-07-01", snapshot_date: "2026-07-10", period_type: "early",
        opening_stock: 100 },
    ];
    const r = aggregateToMonths(rows);
    expect(r[0].opening_stock).toBe(100);
  });

  it("closing_stock · 가장 늦은 snapshot 기준", () => {
    const rows = [
      { period_start_date: "2026-07-01", snapshot_date: "2026-07-10", period_type: "early",
        closing_stock: 100 },
      { period_start_date: "2026-07-21", snapshot_date: "2026-07-31", period_type: "late",
        closing_stock: 300 },
    ];
    const r = aggregateToMonths(rows);
    expect(r[0].closing_stock).toBe(300);
    expect(r[0].snapshot_date).toBe("2026-07-31");
  });

  it("여러 월 · 각각 집계 · start 기준 정렬", () => {
    const rows = [
      { period_start_date: "2026-08-01", snapshot_date: "2026-08-10", period_type: "early",
        purchase_qty: 5 },
      { period_start_date: "2026-06-01", snapshot_date: "2026-06-10", period_type: "early",
        purchase_qty: 3 },
      { period_start_date: "2026-07-01", snapshot_date: "2026-07-10", period_type: "early",
        purchase_qty: 7 },
    ];
    const r = aggregateToMonths(rows);
    expect(r).toHaveLength(3);
    expect(r[0].period_start_date).toBe("2026-06-01");
    expect(r[1].period_start_date).toBe("2026-07-01");
    expect(r[2].period_start_date).toBe("2026-08-01");
  });

  it("잘못된 date 포맷 · skip", () => {
    const rows = [
      { period_start_date: "invalid", snapshot_date: "2026-07-10", period_type: "early",
        purchase_qty: 100 },
      { period_start_date: "2026-07-01", snapshot_date: "2026-07-10", period_type: "early",
        purchase_qty: 5 },
    ];
    const r = aggregateToMonths(rows);
    expect(r).toHaveLength(1);
    expect(r[0].purchase_qty).toBe(5);
  });

  it("_first_snap · _last_snap 은 반환 제외", () => {
    const rows = [
      { period_start_date: "2026-07-01", snapshot_date: "2026-07-10", period_type: "early",
        opening_stock: 100 },
    ];
    const r = aggregateToMonths(rows);
    expect((r[0] as any)._first_snap).toBeUndefined();
    expect((r[0] as any)._last_snap).toBeUndefined();
  });

  it("product_count · Math.max 처리", () => {
    const rows = [
      { period_start_date: "2026-07-01", snapshot_date: "2026-07-10", period_type: "early",
        product_count: 30 },
      { period_start_date: "2026-07-11", snapshot_date: "2026-07-20", period_type: "mid",
        product_count: 55 },
      { period_start_date: "2026-07-21", snapshot_date: "2026-07-31", period_type: "late",
        product_count: 40 },
    ];
    const r = aggregateToMonths(rows);
    expect(r[0].product_count).toBe(55);
  });

  it("undefined 필드 · 0으로 처리", () => {
    const rows = [
      { period_start_date: "2026-07-01", snapshot_date: "2026-07-10", period_type: "early" },
    ];
    const r = aggregateToMonths(rows);
    expect(r[0].purchase_qty).toBe(0);
    expect(r[0].sale_qty).toBe(0);
    expect(r[0].disposal_qty).toBe(0);
    expect(r[0].supply_amount).toBe(0);
    expect(r[0].total_amount).toBe(0);
  });
});
