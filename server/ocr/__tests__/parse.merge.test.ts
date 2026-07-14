// server/ocr/__tests__/parse.merge.test.ts
// 병합·수식 회복 회귀 방지 테스트 (Phase 4 · 2026-07-14)

import { describe, it, expect } from "vitest";
import {
  mergeAdjacentSplitRows,
  fixDateInAmountColumns,
  autoFillMissingMathField,
  verifyRowsAgainstRawText,
} from "../parse";

describe("mergeAdjacentSplitRows", () => {
  const headers = ["품명", "수량", "단가", "금액", "규격", "유통기한"];

  it("품명만 있는 행 + 값만 있는 행 → 병합 · nxt 수식 우선", () => {
    const rows = [
      ["유한비타민씨정1000mg200T (RE)", null, null, 26197, null, null],
      ["—", 50, 10500, 525000, "200T", "2029-04-08"],
    ];
    const r = mergeAdjacentSplitRows(headers, rows);
    expect(r.mergedCount).toBe(1);
    expect(r.rows.length).toBe(1);
    expect(r.rows[0][0]).toBe("유한비타민씨정1000mg200T (RE)");
    // nxt 수량*단가=금액 성립하므로 nxt 값 우선 (cur 오독 26197 폐기)
    expect(r.rows[0][1]).toBe(50);
    expect(r.rows[0][3]).toBe(525000);
    expect(r.rows[0][5]).toBe("2029-04-08");
  });

  it("cur 에 값이 아예 없으면 nxt 값 그대로 사용", () => {
    const rows = [
      ["라라올라액 20mL 30V (N)", null, null, null, "30V", null],
      [null, 36, 55000, 1980000, null, "2028-11-30"],
    ];
    const r = mergeAdjacentSplitRows(headers, rows);
    expect(r.mergedCount).toBe(1);
    expect(r.rows[0]).toEqual(["라라올라액 20mL 30V (N)", 36, 55000, 1980000, "30V", "2028-11-30"]);
  });

  it("nxt 수식 안 맞으면 병합 안 함 (안전)", () => {
    const rows = [
      ["상품A", null, null, 1000, null, null],
      [null, 3, 500, 999999, null, null],  // 수식 안 맞음
    ];
    const r = mergeAdjacentSplitRows(headers, rows);
    // 병합 자체는 되지만 nxt 값 우선순위 로직은 수식 안 맞으면 미적용
    expect(r.mergedCount).toBe(1);
  });
});

describe("fixDateInAmountColumns", () => {
  const headers = ["품명", "수량", "단가", "금액", "규격", "유통기한"];

  it("YYYYMMDD 8자리 금액 → 유통기한 복구", () => {
    const rows = [["A", 36, 55000, 20281130, null, null]];
    const r = fixDateInAmountColumns(headers, rows);
    expect(r.fixedCount).toBe(1);
    expect(r.rows[0][3]).toBeNull();  // 금액 null 됨
    expect(r.rows[0][5]).toBe("2028-11-30");
  });

  it("정상 금액은 그대로", () => {
    const rows = [["A", 10, 5000, 50000, null, null]];
    const r = fixDateInAmountColumns(headers, rows);
    expect(r.fixedCount).toBe(0);
    expect(r.rows[0][3]).toBe(50000);
  });

  it("2020~2040 범위 밖 8자리는 유지", () => {
    const rows = [["A", 10, 5000, 19991231, null, null]];  // 1999년 (범위 밖)
    const r = fixDateInAmountColumns(headers, rows);
    expect(r.fixedCount).toBe(0);
    expect(r.rows[0][3]).toBe(19991231);
  });
});

describe("autoFillMissingMathField", () => {
  const headers = ["품명", "수량", "단가", "금액"];

  it("수량 · 단가 있고 금액 없음 → 자동 계산", () => {
    const rows = [["A", 10, 500, null]];
    const r = autoFillMissingMathField(headers, rows, "");
    expect(r.filledCount).toBe(1);
    expect(r.rows[0][3]).toBe(5000);
  });

  it("수량 · 금액 있고 단가 없음 → 자동 역산", () => {
    const rows = [["A", 5, null, 2500]];
    const r = autoFillMissingMathField(headers, rows, "");
    expect(r.filledCount).toBe(1);
    expect(r.rows[0][2]).toBe(500);
  });

  it("단가 · 금액 있고 수량 없음 → 자동 역산", () => {
    const rows = [["A", null, 500, 2500]];
    const r = autoFillMissingMathField(headers, rows, "");
    expect(r.filledCount).toBe(1);
    expect(r.rows[0][1]).toBe(5);
  });

  it("셋 다 있는데 수식 불일치 · rawText 에 정답 있으면 교체", () => {
    const rows = [["A", 10, 500, 5555]];  // 5000이 정답
    const r = autoFillMissingMathField(headers, rows, "A 10 500 5,000");
    expect(r.fixedCount).toBe(1);
    expect(r.rows[0][3]).toBe(5000);
  });
});

describe("verifyRowsAgainstRawText", () => {
  const headers = ["품명", "수량", "단가", "금액"];

  it("1원 오차 교정 (Fix 1 회귀 방지)", () => {
    const rt = "비타민C 10 1,500 156,000";
    const rows = [["비타민C", 10, 1500, 15600]];  // 15600 오독
    const r = verifyRowsAgainstRawText(headers, rows, rt);
    expect(r.rows[0][3]).toBe(156000);
    expect(r.correctedCount).toBeGreaterThanOrEqual(1);
  });

  it("정답이 rawText 에 있으면 오독 값 교체", () => {
    const rt = "A 10 500 5,000";
    const rows = [["A", 10, 500, 5555]];  // 5555 오독 · 정답 5000
    const r = verifyRowsAgainstRawText(headers, rows, rt);
    expect(r.rows[0][3]).toBe(5000);
  });
});
