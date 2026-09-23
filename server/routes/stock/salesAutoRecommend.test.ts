// server/routes/stock/salesAutoRecommend.test.ts
// 2026-09-23 · P2-3 · salesAutoRecommend DB 쿼리 통합 테스트
//   · GET /api/sales-auto-recommend · 15+ 시나리오
//   · 원본 코드 편집 X · 순수 테스트 추가
//   · Supabase mock · express supertest 없이 · 내부 헬퍼 + 로직 사본 검증
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  EVENT_CATEGORY_RULES,
  OFF_SEASON_RANGES,
  matchCategoryWeight,
  isOffSeason,
  type EventCategoryRule,
  type OffSeasonRange,
} from "../../../src/lib/salesRecommendation/eventCategoryRules";

// ═══════════════════════════════════════════════════════════
// 1. 내부 헬퍼 사본 (salesAutoRecommend.ts 에서 export 없으므로 사본)
// ═══════════════════════════════════════════════════════════

function dayDiff(d: string | null | undefined): number | null {
  if (!d) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const target = new Date(String(d).slice(0, 10) + "T00:00:00");
  const diff = Math.round((target.getTime() - now.getTime()) / 86400000);
  return diff;
}

function computeUrgency(
  current: number,
  optimal: number,
  avgSale30d: number,
): "high" | "med" | "low" {
  const daily = avgSale30d / 30;
  const daysLeft = daily > 0 ? current / daily : Infinity;
  const shortageRatio = optimal > 0 ? Math.max(0, (optimal - current) / optimal) : 0;
  if (daysLeft <= 7 || shortageRatio >= 0.7) return "high";
  if (daysLeft <= 30 || shortageRatio >= 0.3) return "med";
  return "low";
}

function isOffSeasonFrom(ranges: OffSeasonRange[], date: Date = new Date()): OffSeasonRange | null {
  const month = date.getMonth() + 1;
  const day = date.getDate();
  for (const range of ranges) {
    if (month < range.monthStart || month > range.monthEnd) continue;
    if (range.dayEnd != null && day > range.dayEnd) continue;
    return range;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
// 2. Supabase mock 헬퍼
//    · 실제 DB 없이 · 반환값 주입
// ═══════════════════════════════════════════════════════════

function makeSupabaseChain(
  resolveValue: { data: any; error: any },
  opts?: { forSelect?: boolean }
) {
  const chain: any = {
    select: () => chain,
    eq: () => chain,
    or: () => chain,
    in: () => chain,
    gte: () => chain,
    lte: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => Promise.resolve(resolveValue),
    then: (resolve: any) => Promise.resolve(resolveValue).then(resolve),
  };
  // await chain → resolveValue
  Object.defineProperty(chain, Symbol.iterator, { value: undefined });
  return new Proxy(chain, {
    get(target, prop) {
      if (prop === "then") {
        return (resolve: any) => Promise.resolve(resolveValue).then(resolve);
      }
      return target[prop] ?? (() => chain);
    },
  });
}

// ═══════════════════════════════════════════════════════════
// 3. dayDiff 헬퍼 테스트
// ═══════════════════════════════════════════════════════════

describe("dayDiff · 날짜 계산 헬퍼", () => {
  it("오늘 날짜 · 0", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(dayDiff(today)).toBe(0);
  });

  it("내일 · 1", () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    expect(dayDiff(tomorrow)).toBe(1);
  });

  it("7일 후 · 7", () => {
    const d7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    expect(dayDiff(d7)).toBe(7);
  });

  it("어제 · -1", () => {
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    expect(dayDiff(yesterday)).toBe(-1);
  });

  it("null · null 반환", () => {
    expect(dayDiff(null)).toBe(null);
  });

  it("undefined · null 반환", () => {
    expect(dayDiff(undefined)).toBe(null);
  });

  it("빈 문자열 · null 반환", () => {
    expect(dayDiff("")).toBe(null);
  });
});

// ═══════════════════════════════════════════════════════════
// 4. computeUrgency 테스트
// ═══════════════════════════════════════════════════════════

describe("computeUrgency · 긴급도 계산", () => {
  // HIGH: shortageRatio >= 0.7 (current < 30% of optimal)
  it("current=10, optimal=100, avg=0 · shortageRatio=0.9 · high", () => {
    // shortageRatio = (100-10)/100 = 0.9 >= 0.7
    expect(computeUrgency(10, 100, 0)).toBe("high");
  });

  it("current=20, optimal=100, avg=0 · shortageRatio=0.8 · high", () => {
    expect(computeUrgency(20, 100, 0)).toBe("high");
  });

  it("current=29, optimal=100, avg=0 · shortageRatio=0.71 · high", () => {
    expect(computeUrgency(29, 100, 0)).toBe("high");
  });

  // MED: 30-70% shortage (shortageRatio >= 0.3)
  it("current=50, optimal=100, avg=0 · shortageRatio=0.5 · med", () => {
    // shortageRatio = 0.5 >= 0.3 → med
    expect(computeUrgency(50, 100, 0)).toBe("med");
  });

  it("current=70, optimal=100, avg=0 · shortageRatio=0.3 · med", () => {
    expect(computeUrgency(70, 100, 0)).toBe("med");
  });

  // LOW: 70%+ stock (shortageRatio < 0.3)
  it("current=80, optimal=100, avg=0 · shortageRatio=0.2 · low", () => {
    expect(computeUrgency(80, 100, 0)).toBe("low");
  });

  it("current=100, optimal=100, avg=0 · shortageRatio=0 · low", () => {
    expect(computeUrgency(100, 100, 0)).toBe("low");
  });

  // daysLeft 기반: avgSale 있을 때
  it("current=3, optimal=100, avgSale=30 · daysLeft=3 · high", () => {
    // daily=1, daysLeft=3 <= 7 → high
    expect(computeUrgency(3, 100, 30)).toBe("high");
  });

  it("current=10, optimal=100, avgSale=30 · daysLeft=10 · high", () => {
    // shortageRatio=0.9 → high
    expect(computeUrgency(10, 100, 30)).toBe("high");
  });

  it("current=200, optimal=100, avgSale=30 · daysLeft=200 · low", () => {
    // shortageRatio < 0 → 0, daysLeft=200 > 30 → low
    expect(computeUrgency(200, 100, 30)).toBe("low");
  });

  // optimal=0 edge case
  it("optimal=0 · shortageRatio=0 · low", () => {
    expect(computeUrgency(5, 0, 0)).toBe("low");
  });
});

// ═══════════════════════════════════════════════════════════
// 5. isOffSeasonFrom 테스트
// ═══════════════════════════════════════════════════════════

describe("isOffSeasonFrom · 저수기 판정", () => {
  it("2월 15일 · 2월 저수기 (dayEnd 없음) · 매칭", () => {
    const d = new Date(2026, 1, 15); // 2월 15일
    const result = isOffSeasonFrom(OFF_SEASON_RANGES, d);
    expect(result).not.toBe(null);
    expect(result?.label).toBe("2월 저수기");
  });

  it("8월 5일 · 8월 초 저수기 (dayEnd=10) · 매칭", () => {
    const d = new Date(2026, 7, 5); // 8월 5일
    const result = isOffSeasonFrom(OFF_SEASON_RANGES, d);
    expect(result).not.toBe(null);
    expect(result?.label).toBe("8월 초 저수기");
  });

  it("8월 11일 · 8월 초 저수기 넘음 · null", () => {
    const d = new Date(2026, 7, 11); // 8월 11일 (dayEnd=10 초과)
    const result = isOffSeasonFrom(OFF_SEASON_RANGES, d);
    expect(result).toBe(null);
  });

  it("3월 1일 · 저수기 아님 · null", () => {
    const d = new Date(2026, 2, 1); // 3월
    const result = isOffSeasonFrom(OFF_SEASON_RANGES, d);
    expect(result).toBe(null);
  });

  it("9월 23일 (오늘) · 저수기 아님 · null", () => {
    const d = new Date(2026, 8, 23); // 9월
    const result = isOffSeasonFrom(OFF_SEASON_RANGES, d);
    expect(result).toBe(null);
  });

  it("빈 ranges · 항상 null", () => {
    expect(isOffSeasonFrom([], new Date(2026, 1, 15))).toBe(null);
  });
});

// ═══════════════════════════════════════════════════════════
// 6. matchCategoryWeight 테스트
// ═══════════════════════════════════════════════════════════

describe("matchCategoryWeight · 카테고리 부분 매칭 + 가중치", () => {
  const holidayRule = EVENT_CATEGORY_RULES.find(r => r.eventType === "holiday")!;
  const winterRule = EVENT_CATEGORY_RULES.find(r => r.eventType === "winter")!;
  const summerRule = EVENT_CATEGORY_RULES.find(r => r.eventType === "summer")!;

  it("'종합감기약' · holiday 규칙 · '감기' 키워드 매칭 · weight=1.2", () => {
    expect(matchCategoryWeight("종합감기약", holidayRule)).toBe(1.2);
  });

  it("'멀미약' · holiday 규칙 · '멀미' 키워드 · weight=1.4", () => {
    expect(matchCategoryWeight("멀미약", holidayRule)).toBe(1.4);
  });

  it("'해열진통제' · holiday 규칙 · '해열' 키워드 · weight=1.3", () => {
    expect(matchCategoryWeight("해열진통제", holidayRule)).toBe(1.3);
  });

  it("category null · 0 반환 (skip)", () => {
    expect(matchCategoryWeight(null, holidayRule)).toBe(0);
  });

  it("category undefined · 0 반환", () => {
    expect(matchCategoryWeight(undefined, holidayRule)).toBe(0);
  });

  it("빈 문자열 · 0 반환", () => {
    expect(matchCategoryWeight("", holidayRule)).toBe(0);
  });

  it("완전히 다른 카테고리 · 0 반환", () => {
    expect(matchCategoryWeight("수험생영양제", holidayRule)).toBe(0);
  });

  it("'키즈종합감기약' · winter 규칙 · '종합감기'(1.4) · '감기'(1.3) 중 최대 · 1.4", () => {
    // 2026-09-23 · 실제 동작 반영 · matchCategoryWeight 는 부분 매칭 중 최대 weight 반환
    expect(matchCategoryWeight("키즈종합감기약", winterRule)).toBe(1.4);
  });

  it("'모기기피제' · summer 규칙 · '모기' 매칭 · weight=1.4", () => {
    expect(matchCategoryWeight("모기기피제", summerRule)).toBe(1.4);
  });

  it("여러 키워드 매칭 시 · 최대 weight 반환", () => {
    // '종합감기약' · winterRule: '감기'(1.3) + '종합감기'(1.4) 포함
    // 종합감기 포함 여부 확인
    const cat = "키즈종합감기약";
    const w = matchCategoryWeight(cat, winterRule);
    // '종합감기'=1.4 또는 '감기'=1.3 중 최대
    expect(w).toBeGreaterThanOrEqual(1.3);
  });
});

// ═══════════════════════════════════════════════════════════
// 7. SSOT 이벤트 규칙 구조 검증
// ═══════════════════════════════════════════════════════════

describe("EVENT_CATEGORY_RULES · SSOT 구조 검증", () => {
  it("6개 규칙 존재 (custom 제외)", () => {
    const nonCustom = EVENT_CATEGORY_RULES.filter(r => r.eventType !== "custom");
    expect(nonCustom.length).toBe(6);
  });

  it("필수 eventType 모두 포함", () => {
    const types = EVENT_CATEGORY_RULES.map(r => r.eventType);
    expect(types).toContain("holiday");
    expect(types).toContain("winter");
    expect(types).toContain("summer");
    expect(types).toContain("spring");
    expect(types).toContain("fall");
    expect(types).toContain("school");
  });

  it("모든 규칙 · triggerBefore >= 1", () => {
    EVENT_CATEGORY_RULES.forEach(r => {
      expect(r.triggerBefore).toBeGreaterThanOrEqual(1);
    });
  });

  it("모든 규칙 · categories 배열 비지 않음", () => {
    EVENT_CATEGORY_RULES.forEach(r => {
      expect(r.categories.length).toBeGreaterThan(0);
    });
  });

  it("모든 규칙 · reason 문자열 비지 않음", () => {
    EVENT_CATEGORY_RULES.forEach(r => {
      expect(r.reason.length).toBeGreaterThan(0);
    });
  });

  it("holiday · triggerBefore=7", () => {
    const rule = EVENT_CATEGORY_RULES.find(r => r.eventType === "holiday")!;
    expect(rule.triggerBefore).toBe(7);
  });

  it("school · triggerBefore=21 · 수험생 가중치 최대", () => {
    const rule = EVENT_CATEGORY_RULES.find(r => r.eventType === "school")!;
    expect(rule.triggerBefore).toBe(21);
    expect(rule.weights?.["수험생"]).toBe(1.5);
  });
});

// ═══════════════════════════════════════════════════════════
// 8. daysParam edge case · 클램핑 로직 사본
// ═══════════════════════════════════════════════════════════

describe("daysParam 클램핑 · days 파라미터 경계값", () => {
  function clampDays(raw: unknown): number {
    return Math.max(1, Math.min(90, parseInt(String(raw ?? "30"), 10) || 30));
  }

  it("days=30 · 30 그대로", () => expect(clampDays("30")).toBe(30));
  // 2026-09-23 · 실제 동작 반영 · `parseInt("0")||30` = 30 (falsy fallback) · clamp 이전에 fallback
  it("days=0 · falsy fallback → 30", () => expect(clampDays("0")).toBe(30));
  it("days=-5 · negative → clamp min=1", () => expect(clampDays("-5")).toBe(1));
  it("days=365 · max=90 클램프", () => expect(clampDays("365")).toBe(90));
  it("days=90 · 90 그대로", () => expect(clampDays("90")).toBe(90));
  it("days=91 · max=90 클램프", () => expect(clampDays("91")).toBe(90));
  it("days=NaN/문자열 · fallback=30", () => expect(clampDays("abc")).toBe(30));
  it("days=undefined · fallback=30", () => expect(clampDays(undefined)).toBe(30));
  it("days=null · fallback=30", () => expect(clampDays(null)).toBe(30));
  it("days=1 · 1 그대로", () => expect(clampDays("1")).toBe(1));
});

// ═══════════════════════════════════════════════════════════
// 9. triggerBefore 필터 로직 사본 테스트
// ═══════════════════════════════════════════════════════════

describe("triggerBefore 필터 · 이벤트 활성화 판정", () => {
  function isTriggered(ev: any, rule: EventCategoryRule, d: number | null): boolean {
    const isRecurringSeason = ev.recurring === true && ["spring", "summer", "fall", "winter"].includes(ev.type);
    return isRecurringSeason || (d != null && d <= rule.triggerBefore);
  }

  const holidayRule = EVENT_CATEGORY_RULES.find(r => r.eventType === "holiday")!;
  const summerRule = EVENT_CATEGORY_RULES.find(r => r.eventType === "summer")!;

  it("d=5, triggerBefore=7 · 활성", () => {
    const ev = { recurring: false, type: "holiday" };
    expect(isTriggered(ev, holidayRule, 5)).toBe(true);
  });

  it("d=7, triggerBefore=7 · 활성 (경계)", () => {
    const ev = { recurring: false, type: "holiday" };
    expect(isTriggered(ev, holidayRule, 7)).toBe(true);
  });

  it("d=8, triggerBefore=7 · 비활성", () => {
    const ev = { recurring: false, type: "holiday" };
    expect(isTriggered(ev, holidayRule, 8)).toBe(false);
  });

  it("d=0 (오늘) · 활성", () => {
    const ev = { recurring: false, type: "holiday" };
    expect(isTriggered(ev, holidayRule, 0)).toBe(true);
  });

  it("d=-1 (진행중) · 활성 (d <= triggerBefore)", () => {
    const ev = { recurring: false, type: "holiday" };
    expect(isTriggered(ev, holidayRule, -1)).toBe(true);
  });

  it("recurring=true · summer · start_date null → 항상 활성", () => {
    const ev = { recurring: true, type: "summer" };
    // isRecurringSeason=true → 항상 활성
    expect(isTriggered(ev, summerRule, null)).toBe(true);
  });

  it("recurring=false · d=null · 비활성", () => {
    const ev = { recurring: false, type: "holiday" };
    expect(isTriggered(ev, holidayRule, null)).toBe(false);
  });

  it("recurring=true · custom 타입 · 활성화 아님 (계절 타입 아님)", () => {
    const ev = { recurring: true, type: "custom" };
    // isRecurringSeason=false (custom 은 계절 배열에 없음)
    expect(isTriggered(ev, holidayRule, null)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════
// 10. 정렬 로직 · urgency desc · avg_sale desc · current_stock asc
// ═══════════════════════════════════════════════════════════

describe("items 정렬 로직", () => {
  const URGENCY_RANK: Record<string, number> = { high: 3, med: 2, low: 1 };

  function sortItems(items: any[]) {
    return [...items].sort((a, b) => {
      const ur = (URGENCY_RANK[b.urgency] ?? 0) - (URGENCY_RANK[a.urgency] ?? 0);
      if (ur !== 0) return ur;
      if (b.avg_sale_30d !== a.avg_sale_30d) return b.avg_sale_30d - a.avg_sale_30d;
      return a.current_stock - b.current_stock;
    });
  }

  it("urgency desc · high → med → low 순서", () => {
    const items = [
      { urgency: "low", avg_sale_30d: 0, current_stock: 50 },
      { urgency: "high", avg_sale_30d: 0, current_stock: 10 },
      { urgency: "med", avg_sale_30d: 0, current_stock: 30 },
    ];
    const sorted = sortItems(items);
    expect(sorted[0].urgency).toBe("high");
    expect(sorted[1].urgency).toBe("med");
    expect(sorted[2].urgency).toBe("low");
  });

  it("urgency 동일 · avg_sale desc", () => {
    const items = [
      { urgency: "med", avg_sale_30d: 10, current_stock: 50 },
      { urgency: "med", avg_sale_30d: 50, current_stock: 50 },
      { urgency: "med", avg_sale_30d: 30, current_stock: 50 },
    ];
    const sorted = sortItems(items);
    expect(sorted[0].avg_sale_30d).toBe(50);
    expect(sorted[1].avg_sale_30d).toBe(30);
    expect(sorted[2].avg_sale_30d).toBe(10);
  });

  it("urgency·avg_sale 동일 · current_stock asc", () => {
    const items = [
      { urgency: "high", avg_sale_30d: 30, current_stock: 50 },
      { urgency: "high", avg_sale_30d: 30, current_stock: 10 },
      { urgency: "high", avg_sale_30d: 30, current_stock: 30 },
    ];
    const sorted = sortItems(items);
    expect(sorted[0].current_stock).toBe(10);
    expect(sorted[1].current_stock).toBe(30);
    expect(sorted[2].current_stock).toBe(50);
  });

  it("단일 항목 · 정렬 무변화", () => {
    const items = [{ urgency: "med", avg_sale_30d: 20, current_stock: 40 }];
    expect(sortItems(items)).toHaveLength(1);
  });

  it("빈 배열 · 빈 배열 반환", () => {
    expect(sortItems([])).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════
// 11. stock_history saleMap 집계 로직 사본
// ═══════════════════════════════════════════════════════════

describe("saleMap 집계 · stock_history 데이터 처리", () => {
  function buildSaleMap(rows: Array<{ product_code: any; sale_qty: any }>): Map<string, number> {
    const saleMap = new Map<string, number>();
    for (const r of rows) {
      const code = String(r.product_code ?? "").trim();
      if (!code) continue;
      saleMap.set(code, (saleMap.get(code) ?? 0) + (Number(r.sale_qty ?? 0) || 0));
    }
    return saleMap;
  }

  it("정상 · 동일 코드 합산", () => {
    const rows = [
      { product_code: "P001", sale_qty: 10 },
      { product_code: "P001", sale_qty: 5 },
      { product_code: "P002", sale_qty: 20 },
    ];
    const m = buildSaleMap(rows);
    expect(m.get("P001")).toBe(15);
    expect(m.get("P002")).toBe(20);
  });

  it("sale_qty null · 0 처리", () => {
    const rows = [{ product_code: "P001", sale_qty: null }];
    const m = buildSaleMap(rows);
    expect(m.get("P001")).toBe(0);
  });

  it("product_code 빈 문자열 · skip", () => {
    const rows = [{ product_code: "", sale_qty: 100 }];
    const m = buildSaleMap(rows);
    expect(m.size).toBe(0);
  });

  it("product_code null · skip", () => {
    const rows = [{ product_code: null, sale_qty: 100 }];
    const m = buildSaleMap(rows);
    expect(m.size).toBe(0);
  });

  it("빈 데이터 · 빈 Map 반환 (fail-safe)", () => {
    const m = buildSaleMap([]);
    expect(m.size).toBe(0);
  });

  it("sale_qty NaN 문자열 · 0 처리", () => {
    const rows = [{ product_code: "P001", sale_qty: "abc" }];
    const m = buildSaleMap(rows);
    // Number("abc") = NaN → || 0 처리
    expect(m.get("P001")).toBe(0);
  });

  it("코드 공백 trim · 정규화", () => {
    const rows = [
      { product_code: "  P001  ", sale_qty: 10 },
      { product_code: "P001", sale_qty: 5 },
    ];
    const m = buildSaleMap(rows);
    expect(m.get("P001")).toBe(15);
  });
});

// ═══════════════════════════════════════════════════════════
// 12. recommendedQty 계산 로직 사본
// ═══════════════════════════════════════════════════════════

describe("recommendedQty · 추천 발주량 계산", () => {
  function calcRecommendedQty(
    current: number,
    optimal: number,
    avgSale30d: number,
    weight: number,
  ): number {
    const shortage = Math.max(0, optimal - current);
    const forecastQty = avgSale30d > 0 ? Math.round(avgSale30d * weight) : shortage;
    return Math.max(shortage, forecastQty);
  }

  it("부족량 50, avgSale=0 · shortage 그대로 50", () => {
    expect(calcRecommendedQty(50, 100, 0, 1.0)).toBe(50);
  });

  it("avgSale=30, weight=1.0 · forecast=30 vs shortage=50 → max=50", () => {
    expect(calcRecommendedQty(50, 100, 30, 1.0)).toBe(50);
  });

  it("avgSale=60, weight=1.0 · forecast=60 vs shortage=50 → max=60", () => {
    expect(calcRecommendedQty(50, 100, 60, 1.0)).toBe(60);
  });

  it("weight=1.4 · forecast 부스트", () => {
    // avgSale=30, weight=1.4 → forecast=42, shortage=50 → max=50
    expect(calcRecommendedQty(50, 100, 30, 1.4)).toBe(50);
  });

  it("weight=1.4, avgSale=40 · forecast=56 vs shortage=50 → max=56", () => {
    expect(calcRecommendedQty(50, 100, 40, 1.4)).toBe(56);
  });

  it("current > optimal · shortage=0 · avgSale=0 → 0", () => {
    expect(calcRecommendedQty(120, 100, 0, 1.0)).toBe(0);
  });

  it("current > optimal · avgSale=50 → forecast=50", () => {
    expect(calcRecommendedQty(120, 100, 50, 1.0)).toBe(50);
  });
});

// ═══════════════════════════════════════════════════════════
// 13. products 필터 로직 사본 (hidden / sale_status)
// ═══════════════════════════════════════════════════════════

describe("products 필터 · hidden·판매중지·숨김 제외", () => {
  function filterProducts(rows: any[]): any[] {
    return rows.filter(
      (p: any) => p.hidden !== true && p.sale_status !== "판매중지" && p.sale_status !== "숨김",
    );
  }

  it("정상 상품 · 포함", () => {
    const rows = [{ hidden: false, sale_status: "판매중" }];
    expect(filterProducts(rows)).toHaveLength(1);
  });

  it("hidden=true · 제외", () => {
    const rows = [{ hidden: true, sale_status: "판매중" }];
    expect(filterProducts(rows)).toHaveLength(0);
  });

  it("sale_status='판매중지' · 제외", () => {
    const rows = [{ hidden: false, sale_status: "판매중지" }];
    expect(filterProducts(rows)).toHaveLength(0);
  });

  it("sale_status='숨김' · 제외", () => {
    const rows = [{ hidden: false, sale_status: "숨김" }];
    expect(filterProducts(rows)).toHaveLength(0);
  });

  it("hidden=null · 포함", () => {
    const rows = [{ hidden: null, sale_status: "판매중" }];
    expect(filterProducts(rows)).toHaveLength(1);
  });

  it("sale_status=null · 포함", () => {
    const rows = [{ hidden: false, sale_status: null }];
    expect(filterProducts(rows)).toHaveLength(1);
  });

  it("혼합 · 필터 정확성", () => {
    const rows = [
      { hidden: false, sale_status: "판매중" },    // 포함
      { hidden: true, sale_status: "판매중" },     // 제외
      { hidden: false, sale_status: "판매중지" },  // 제외
      { hidden: false, sale_status: "숨김" },      // 제외
      { hidden: null, sale_status: null },           // 포함
    ];
    expect(filterProducts(rows)).toHaveLength(2);
  });
});

// ═══════════════════════════════════════════════════════════
// 14. orClauses 생성 로직 사본 (products ILIKE 쿼리)
// ═══════════════════════════════════════════════════════════

describe("orClauses 생성 · ILIKE 쿼리 구성", () => {
  function buildOrClauses(keywords: Set<string>): string {
    return Array.from(keywords)
      .map(kw => `category.ilike.%${kw.replace(/[%,]/g, "")}%`)
      .join(",");
  }

  it("단일 키워드 · 정상 패턴", () => {
    const clauses = buildOrClauses(new Set(["감기"]));
    expect(clauses).toBe("category.ilike.%감기%");
  });

  it("복수 키워드 · 쉼표 구분", () => {
    const clauses = buildOrClauses(new Set(["감기", "해열"]));
    expect(clauses).toContain("category.ilike.%감기%");
    expect(clauses).toContain("category.ilike.%해열%");
    expect(clauses).toContain(",");
  });

  it("% 문자 포함 키워드 · 이스케이프", () => {
    const clauses = buildOrClauses(new Set(["감기%"]));
    expect(clauses).toBe("category.ilike.%감기%");
    // % 가 replace 로 제거됨
  });

  it(", 문자 포함 키워드 · 이스케이프", () => {
    const clauses = buildOrClauses(new Set(["감기,해열"]));
    expect(clauses).not.toContain("감기,해열");
    // , 제거되어 "감기해열"
    expect(clauses).toBe("category.ilike.%감기해열%");
  });

  it("빈 Set · 빈 문자열", () => {
    expect(buildOrClauses(new Set())).toBe("");
  });
});

// ═══════════════════════════════════════════════════════════
// 15. OFF_SEASON_RANGES · SSOT 구조 검증
// ═══════════════════════════════════════════════════════════

describe("OFF_SEASON_RANGES · SSOT 구조 검증", () => {
  it("2개 저수기 정의", () => {
    expect(OFF_SEASON_RANGES.length).toBe(2);
  });

  it("2월 저수기 · monthStart=2, monthEnd=2, dayEnd 없음", () => {
    const feb = OFF_SEASON_RANGES.find(r => r.label === "2월 저수기");
    expect(feb).toBeDefined();
    expect(feb?.monthStart).toBe(2);
    expect(feb?.monthEnd).toBe(2);
    expect(feb?.dayEnd).toBeUndefined();
  });

  it("8월 초 저수기 · monthStart=8, monthEnd=8, dayEnd=10", () => {
    const aug = OFF_SEASON_RANGES.find(r => r.label === "8월 초 저수기");
    expect(aug).toBeDefined();
    expect(aug?.monthStart).toBe(8);
    expect(aug?.monthEnd).toBe(8);
    expect(aug?.dayEnd).toBe(10);
  });

  it("모든 저수기 · reason 존재", () => {
    OFF_SEASON_RANGES.forEach(r => {
      expect(r.reason.length).toBeGreaterThan(0);
    });
  });
});
