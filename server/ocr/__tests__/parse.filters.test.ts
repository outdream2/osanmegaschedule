// server/ocr/__tests__/parse.filters.test.ts
// filterMetadataBleedRows · filterCodeOnlyRows 회귀 방지 테스트 (Phase 4 · 2026-07-14)

import { describe, it, expect } from "vitest";
import { filterMetadataBleedRows, filterCodeOnlyRows } from "../parse";

const headers = ["품명", "수량", "단가", "금액", "규격", "유통기한", "비고"];

describe("filterMetadataBleedRows", () => {
  it("경방신약 케이스 · 회사명·인명·주소·수신처 6행 제거 · 상품 1행만 유지", () => {
    const meta = { supplier: "경방신약(주)", total: 156000, subtotal: 1092000, supplyAmount: 141818, vat: 14182 };
    const rows = [
      ["경방신약(주)", 11, 14182, 156000, null, null, null],
      ["김충환", 11, 14182, 156000, null, null, null],
      ["코스트탐약국", 5, 31200, 156000, "90p", null, null],
      ["인천남동구남동대로394(남촌동경방신약(주)", 5, 31200, 156000, "90p", null, null],
      ["경기용인시기구용구데로2427-1", 5, 31200, 156000, "90p", null, null],
      ["진경안신엑스과립(가미귀비탕엑스과립)", 5, 31200, 156000, "90p", null, null],
      ["한태호", 31200, 5, 156000, null, null, null],
    ];
    const result = filterMetadataBleedRows(headers, rows, meta);
    expect(result.length).toBe(1);
    expect(result[0][0]).toBe("진경안신엑스과립(가미귀비탕엑스과립)");
  });

  it("정상 상품 3행 · 노이즈 없음 · 3행 그대로 유지", () => {
    const meta = { supplier: "유한양행", total: 88500 };
    const rows = [
      ["타이레놀정 500mg", 10, 5000, 50000, "30정", null, null],
      ["이부프로펜 400mg", 5, 300, 1500, "20정", null, null],
      ["비타민씨 1000mg", 3, 12000, 36000, "200T", null, null],
    ];
    const result = filterMetadataBleedRows(headers, rows, meta);
    expect(result.length).toBe(3);
  });

  it("안전가드 · 필터가 모두 지우면 원본 반환", () => {
    const meta = { supplier: "미상" };
    const rows = [
      ["짧은", null, null, null, null, null, null],
      ["잘못", null, null, null, null, null, null],
    ];
    const result = filterMetadataBleedRows(headers, rows, meta);
    // 원본 그대로 반환 (안전가드 발동)
    expect(result.length).toBe(2);
  });

  it("공통 라인 있으면 그 라인 매칭 행 제거 (다중 페이지)", () => {
    const meta = { supplier: "유한양행", total: 50000, subtotal: 50000 };
    // 코스트팜약국 행: 금액=50000 (=total) → -5 penalty · 수신처 -5 · 공통라인 -5 · math 실패
    const rows = [
      ["타이레놀 500mg", 10, 5000, 50000, "30정", null, null],
      ["코스트팜약국", null, null, 50000, null, null, null],
    ];
    const commonLines = ["코스트팜약국"];
    const result = filterMetadataBleedRows(headers, rows, meta, commonLines);
    expect(result.length).toBe(1);
    expect(result[0][0]).toBe("타이레놀 500mg");
  });
});

describe("filterCodeOnlyRows", () => {
  it("상품 코드만 있는 행 (A200893 · 순수 숫자) 제거", () => {
    const rows = [
      ["A200893", null, null, null, null, null, null],
      ["7302378", null, null, null, null, null, null],
      ["타이레놀정 500mg", 10, 5000, 50000, "30정", null, null],
    ];
    const result = filterCodeOnlyRows(headers, rows);
    expect(result.length).toBe(1);
    expect(result[0][0]).toBe("타이레놀정 500mg");
  });

  it("정상 상품 (한글 품명) 유지 · 회귀 방지", () => {
    const rows = [
      ["광동원탕", 10, 508, 5080, "100ML", null, null],
    ];
    const result = filterCodeOnlyRows(headers, rows);
    expect(result.length).toBe(1);
  });
});
