// @vitest-environment jsdom
// 2026-08-20 · balanceHelpers · 페이지별 잔고/합계 후보 검출 + config 기반 잔고
//   · computePageBalanceCandidates · 요약 라벨/총합/summary_rows/헤더/셀 인접
//   · computePageBalanceFromConfig · balanceConfig 매핑
import { describe, it, expect } from "vitest";
import { computePageBalanceCandidates, computePageBalanceFromConfig } from "./balanceHelpers";
import type { RawPage } from "./types";

// 페이지 헬퍼
const mkPage = (page: number, headers: string[], rows: any[][], meta: any = {}): RawPage => ({
  page,
  headers,
  rows,
  meta,
});

describe("computePageBalanceCandidates · 요약 라벨 셀에서 라벨+금액", () => {
  it("합계 라벨 · 값 · 후보 등록", () => {
    const pages: RawPage[] = [
      mkPage(1, ["품명", "금액"], [
        ["A", 1000],
        ["B", 2000],
        ["합계", 3000],
      ]),
    ];
    const { pageBalanceCandidates } = computePageBalanceCandidates(pages, [1], undefined);
    const cands = pageBalanceCandidates.get(1)!;
    // "합계" 라벨 · 3000 등록
    expect(cands.length).toBeGreaterThan(0);
    expect(cands.some(c => c.amount === 3000)).toBe(true);
  });

  it("meta.total · 총합계 후보", () => {
    const pages: RawPage[] = [
      mkPage(1, ["품명", "금액"], [["A", 1000]], { total: 5000 }),
    ];
    const { pageBalanceCandidates } = computePageBalanceCandidates(pages, [1], undefined);
    const cands = pageBalanceCandidates.get(1)!;
    expect(cands.some(c => c.label === "총합계" && c.amount === 5000)).toBe(true);
  });

  it("meta.summary_rows · 각 row 후보", () => {
    const pages: RawPage[] = [
      mkPage(1, ["품명"], [], {
        summary_rows: [
          { label: "부가세", amount: 900 },
          { label: "총계", amount: 9900 },
        ],
      }),
    ];
    const { pageBalanceCandidates } = computePageBalanceCandidates(pages, [1], undefined);
    const cands = pageBalanceCandidates.get(1)!;
    expect(cands.some(c => c.label === "부가세" && c.amount === 900)).toBe(true);
    expect(cands.some(c => c.label === "총계" && c.amount === 9900)).toBe(true);
  });

  it("summary_rows · label 빈값 · '요약' 기본", () => {
    const pages: RawPage[] = [
      mkPage(1, ["품명"], [], {
        summary_rows: [{ label: "", amount: 1000 }],
      }),
    ];
    const { pageBalanceCandidates } = computePageBalanceCandidates(pages, [1], undefined);
    const cands = pageBalanceCandidates.get(1);
    // 빈 label 이면서 || "요약" fallback → 정상 등록
    expect(cands?.some(c => c.amount === 1000)).toBe(true);
  });

  it("amount 0 · 등록 안 됨", () => {
    const pages: RawPage[] = [
      mkPage(1, ["품명"], [], {
        summary_rows: [{ label: "합계", amount: 0 }],
      }),
    ];
    const { pageBalanceCandidates } = computePageBalanceCandidates(pages, [1], undefined);
    const cands = pageBalanceCandidates.get(1);
    expect(cands).toBeUndefined();
  });

  it("중복 금액 · 한 번만 등록", () => {
    const pages: RawPage[] = [
      mkPage(1, ["품명", "금액"], [["A", 1000]], {
        total: 1000,
        summary_rows: [{ label: "합계", amount: 1000 }],
      }),
    ];
    const { pageBalanceCandidates } = computePageBalanceCandidates(pages, [1], undefined);
    const cands = pageBalanceCandidates.get(1)!;
    const withAmt1000 = cands.filter(c => c.amount === 1000);
    // Set<amount> · 1000 중복 · 첫번째만
    expect(withAmt1000.length).toBe(1);
  });
});

describe("computePageBalanceCandidates · balanceConfig 학습 라벨", () => {
  it("balanceConfig 에 학습된 라벨 · 매칭 후보 등록", () => {
    const pages: RawPage[] = [
      mkPage(1, ["품명", "금액"], [
        ["A", 1000],
        ["미수", 500],
      ]),
    ];
    const balanceConfig = { "공급사X": "미수" };
    const { pageBalanceCandidates } = computePageBalanceCandidates(pages, [1], balanceConfig);
    const cands = pageBalanceCandidates.get(1)!;
    expect(cands.some(c => c.label === "미수" && c.amount === 500)).toBe(true);
  });

  it("balanceConfig · '(없음)' / '직접입력' 제외", () => {
    const pages: RawPage[] = [
      mkPage(1, ["품명"], [["없음", 100]]),
    ];
    const balanceConfig = { "공급사X": "(없음)", "공급사Y": "직접입력" };
    // (없음)/직접입력은 학습 라벨로 등록 안 됨
    const { pageBalanceCandidates } = computePageBalanceCandidates(pages, [1], balanceConfig);
    // '없음' 셀 · 라벨 매치 안 되면 후보 없음 · 검사: 등록 안 됨 or 있음
    expect(pageBalanceCandidates.get(1)).toBeUndefined();
  });
});

describe("computePageBalanceCandidates · pageBalanceCandidatesForFormula (label unique)", () => {
  it("동일 라벨 여러 후보 · 첫번째만 map 에 저장", () => {
    const pages: RawPage[] = [
      mkPage(1, ["품명", "금액"], [
        ["합계", 1000],
        ["합계", 2000],
      ]),
    ];
    const { pageBalanceCandidatesForFormula } = computePageBalanceCandidates(pages, [1], undefined);
    const formula = pageBalanceCandidatesForFormula.get(1)!;
    expect(formula.get("합계")).toBe(1000);
  });

  it("페이지 없음 · Map 없음", () => {
    const { pageBalanceCandidatesForFormula } = computePageBalanceCandidates([], [99], undefined);
    // page 없어도 함수는 continue 하고 map 은 set 안 됨
    expect(pageBalanceCandidatesForFormula.get(99)).toBeUndefined();
  });
});

describe("computePageBalanceCandidates · edge cases", () => {
  it("빈 pages · 빈 map", () => {
    const { pageBalanceCandidates, pageBalanceCandidatesForFormula } =
      computePageBalanceCandidates([], [], undefined);
    expect(pageBalanceCandidates.size).toBe(0);
    expect(pageBalanceCandidatesForFormula.size).toBe(0);
  });

  it("uniquePageNums 에 있는 page 만 처리", () => {
    const pages: RawPage[] = [
      mkPage(1, ["품명"], [["합계", 100]]),
      mkPage(2, ["품명"], [["합계", 200]]),
    ];
    const { pageBalanceCandidates } = computePageBalanceCandidates(pages, [1], undefined);
    expect(pageBalanceCandidates.has(1)).toBe(true);
    expect(pageBalanceCandidates.has(2)).toBe(false);
  });

  it("Array 아닌 row · 스킵", () => {
    const pages: RawPage[] = [
      mkPage(1, ["품명"], [null as any, ["합계", 100]]),
    ];
    const { pageBalanceCandidates } = computePageBalanceCandidates(pages, [1], undefined);
    expect(pageBalanceCandidates.get(1)?.some(c => c.amount === 100)).toBe(true);
  });
});

describe("computePageBalanceFromConfig", () => {
  it("설정된 라벨 · 헤더에 있음 · 마지막 유효값 사용", () => {
    const pages: RawPage[] = [
      mkPage(1, ["품명", "미수"], [
        ["A", 100],
        ["B", 200],
        ["C", 500],  // 마지막 유효값
      ]),
    ];
    const rawSupplierByPage = { 1: "공급사X" };
    const config = { "공급사X": "미수" };
    const r = computePageBalanceFromConfig(pages, [1], rawSupplierByPage, config);
    expect(r.get(1)).toBe(500);
  });

  it("설정된 라벨이 헤더에 없음 · 값 없음", () => {
    const pages: RawPage[] = [
      mkPage(1, ["품명", "금액"], [["A", 100]]),
    ];
    const rawSupplierByPage = { 1: "공급사X" };
    const config = { "공급사X": "미수" };
    const r = computePageBalanceFromConfig(pages, [1], rawSupplierByPage, config);
    expect(r.has(1)).toBe(false);
  });

  it("config 값 '(없음)' · 스킵", () => {
    const pages: RawPage[] = [
      mkPage(1, ["품명", "미수"], [["A", 100]]),
    ];
    const rawSupplierByPage = { 1: "공급사X" };
    const config = { "공급사X": "(없음)" };
    const r = computePageBalanceFromConfig(pages, [1], rawSupplierByPage, config);
    expect(r.has(1)).toBe(false);
  });

  it("공급사 · rawSupplierByPage 없음 · meta.supplier fallback", () => {
    const pages: RawPage[] = [
      mkPage(1, ["품명", "미수"], [["A", 100]], { supplier: "메타공급사" }),
    ];
    const config = { "메타공급사": "미수" };
    const r = computePageBalanceFromConfig(pages, [1], {}, config);
    expect(r.get(1)).toBe(100);
  });

  it("숫자·문자열 값 · 모두 parseNumber", () => {
    const pages: RawPage[] = [
      mkPage(1, ["품명", "미수"], [
        ["A", "1,500"],
        ["B", "2,700"],
      ]),
    ];
    const rawSupplierByPage = { 1: "X" };
    const config = { "X": "미수" };
    const r = computePageBalanceFromConfig(pages, [1], rawSupplierByPage, config);
    expect(r.get(1)).toBe(2700);
  });

  it("빈 pages · 빈 map", () => {
    const r = computePageBalanceFromConfig([], [], {}, {});
    expect(r.size).toBe(0);
  });

  it("0 이하 값 · 유효값에서 제외", () => {
    const pages: RawPage[] = [
      mkPage(1, ["품명", "미수"], [
        ["A", 100],
        ["B", 0],
        ["C", -50],
      ]),
    ];
    const rawSupplierByPage = { 1: "X" };
    const config = { "X": "미수" };
    const r = computePageBalanceFromConfig(pages, [1], rawSupplierByPage, config);
    // 마지막 양수 = 100
    expect(r.get(1)).toBe(100);
  });
});
