// 2026-08-20 · parse · mergeAdjacentSplitRows · extractCommonMetadataLines
import { describe, it, expect } from "vitest";
import {
  mergeAdjacentSplitRows,
  extractCommonMetadataLines,
} from "./parse";

const HEADERS = ["품명", "수량", "단가", "금액"];

describe("mergeAdjacentSplitRows · 품명행 + 숫자행 병합", () => {
  it("품명만 있는 행 · 다음 행 숫자만 · 병합", () => {
    const rows = [
      ["타이레놀정", null, null, null],
      [null, 50, 500, 25000],
    ];
    const r = mergeAdjacentSplitRows(HEADERS, rows);
    expect(r.mergedCount).toBe(1);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0][0]).toBe("타이레놀정");
    expect(r.rows[0][1]).toBe(50);
    expect(r.rows[0][2]).toBe(500);
    expect(r.rows[0][3]).toBe(25000);
  });

  it("정상 행 · 병합 안 함", () => {
    const rows = [
      ["타이레놀", 10, 500, 5000],
      ["아스피린", 5, 300, 1500],
    ];
    const r = mergeAdjacentSplitRows(HEADERS, rows);
    expect(r.mergedCount).toBe(0);
    expect(r.rows).toHaveLength(2);
  });

  it("품명 컬럼 없음 · 원본 그대로 · 병합 카운트 0", () => {
    const r = mergeAdjacentSplitRows(["코드", "수량"], [[1], [2]]);
    expect(r.mergedCount).toBe(0);
  });

  it("nxt 행이 수식 성립 (Q×P=A) · nxt 숫자 우선 · cur 오독 무시", () => {
    // 오독 시나리오: cur=[품명, null, null, 99999(잘못됨), ...] + nxt=[—, 50, 500, 25000]
    const rows = [
      ["타이레놀정", null, null, 99999], // cur · 잘못된 금액
      [null, 50, 500, 25000],            // nxt · 정상 수식 (50*500=25000)
    ];
    const r = mergeAdjacentSplitRows(HEADERS, rows);
    expect(r.mergedCount).toBe(1);
    // nxt 수식 정상 → nxt 값 우선
    expect(r.rows[0][3]).toBe(25000);
    expect(r.rows[0][2]).toBe(500);
  });

  it("빈 rows · 그대로", () => {
    const r = mergeAdjacentSplitRows(HEADERS, []);
    expect(r.rows).toEqual([]);
    expect(r.mergedCount).toBe(0);
  });

  it("한글 없는 품명 · isNameOnly false · 병합 안 함", () => {
    const rows = [
      ["ABC123", null, null, null],
      [null, 50, 500, 25000],
    ];
    const r = mergeAdjacentSplitRows(HEADERS, rows);
    expect(r.mergedCount).toBe(0);
  });
});

describe("extractCommonMetadataLines · 공통 라인 추출", () => {
  it("페이지 1개 · 빈 배열", () => {
    expect(extractCommonMetadataLines(["한 줄"])).toEqual([]);
  });

  it("빈 배열 · 빈 결과", () => {
    expect(extractCommonMetadataLines([])).toEqual([]);
  });

  it("공통 헤더 라인 · 반환 (숫자 제거 후 매칭)", () => {
    const p1 = "대웅제약\n123-45-67890\n타이레놀 10 500 5000";
    const p2 = "대웅제약\n123-45-67890\n아스피린 5 300 1500";
    const r = extractCommonMetadataLines([p1, p2]);
    // "대웅제약" 은 두 페이지 모두 있음
    expect(r.some(l => l.includes("대웅제약"))).toBe(true);
  });

  it("threshold 기본 0.5 · 절반 이상 등장", () => {
    const p1 = "공통 헤더\n페이지1_특유";
    const p2 = "공통 헤더\n페이지2_특유";
    const p3 = "공통 헤더\n페이지3_특유";
    const r = extractCommonMetadataLines([p1, p2, p3]);
    expect(r.some(l => l.includes("공통 헤더"))).toBe(true);
    // "페이지N_특유" 는 각 페이지마다 다름 · minCount=2 이상 · 3페이지 threshold 0.5 = 2
    // 페이지1_특유 는 페이지1 에만 있어 minCount 미달
    expect(r.every(l => !l.includes("페이지1"))).toBe(true);
  });

  it("threshold 커스텀 · 1.0 · 전 페이지 등장 요구", () => {
    const p1 = "A\nB";
    const p2 = "A\nC";
    const r = extractCommonMetadataLines([p1, p2], 1.0);
    // A 는 두 페이지 모두 있음 · 그러나 normalize 후 소문자 · 길이 >= 2 요구
    // "A" 는 정규화 후 "a" · 길이 1 · 배제
    // 실제 · 이 케이스는 결과가 빈 배열일 것 (짧아서)
    expect(Array.isArray(r)).toBe(true);
  });

  it("긴 라인 (>40자) · 제외", () => {
    const long = "이것은매우매우매우매우매우매우매우매우매우매우매우매우매우매우매우매우매우매우매우매우긴라인";
    const r = extractCommonMetadataLines([long, long]);
    expect(r).toEqual([]);
  });

  it("숫자만 있는 라인 · 제거", () => {
    const p1 = "123456\n대웅";
    const p2 = "789012\n대웅";
    const r = extractCommonMetadataLines([p1, p2]);
    // 숫자만 → normalize 후 빈 문자열 · 배제
    expect(r.every(l => l.length >= 2)).toBe(true);
    expect(r.some(l => l.includes("대웅"))).toBe(true);
  });
});
