// 2026-08-20 · parse · autoFillMissingMathField
import { describe, it, expect } from "vitest";
import { autoFillMissingMathField } from "./parse";

const HEADERS = ["품명", "수량", "단가", "금액"];

describe("autoFillMissingMathField", () => {
  it("Q + P 있음, A 없음 · A = Q × P 채움", () => {
    const rows = [["타이레놀", 10, 500, null]];
    const r = autoFillMissingMathField(HEADERS, rows);
    expect(r.filledCount).toBe(1);
    expect(r.rows[0][3]).toBe(5000);
  });

  it("Q + A 있음, P 없음 · P = A / Q 채움 (정확히 나누어질 때)", () => {
    const rows = [["타이레놀", 10, null, 5000]];
    const r = autoFillMissingMathField(HEADERS, rows);
    expect(r.filledCount).toBe(1);
    expect(r.rows[0][2]).toBe(500);
  });

  it("P + A 있음, Q 없음 · Q = A / P 채움", () => {
    const rows = [["타이레놀", null, 500, 5000]];
    const r = autoFillMissingMathField(HEADERS, rows);
    expect(r.filledCount).toBe(1);
    expect(r.rows[0][1]).toBe(10);
  });

  it("Q, P 없음 · 채우기 실패 · filledCount 0", () => {
    const rows = [["타이레놀", null, null, 5000]];
    const r = autoFillMissingMathField(HEADERS, rows);
    expect(r.filledCount).toBe(0);
  });

  it("Q, P, A 모두 있음 · 수식 일치 · 변경 없음", () => {
    const rows = [["타이레놀", 10, 500, 5000]];
    const r = autoFillMissingMathField(HEADERS, rows);
    expect(r.filledCount).toBe(0);
    expect(r.fixedCount).toBe(0);
    expect(r.rows[0][3]).toBe(5000);
  });

  it("Q, P, A 모두 있음 · 불일치 · rawText 에 정답 · fixedCount 증가", () => {
    const rows = [["타이레놀", 10, 500, 9999]]; // A=9999 (오독)
    const rawText = "타이레놀 10 500 5,000"; // rawText 에 실제 5000
    const r = autoFillMissingMathField(HEADERS, rows, rawText);
    expect(r.fixedCount).toBe(1);
    expect(r.rows[0][3]).toBe(5000);
  });

  it("Q, P, A 모두 있음 · 불일치 · rawText 없음 · 그대로", () => {
    const rows = [["타이레놀", 10, 500, 9999]];
    const r = autoFillMissingMathField(HEADERS, rows);
    expect(r.fixedCount).toBe(0);
    expect(r.rows[0][3]).toBe(9999);
  });

  it("컬럼 부족 (수량 컬럼 없음) · 원본 그대로", () => {
    const rows = [["타이레놀", 500, 5000]];
    const r = autoFillMissingMathField(["품명", "단가", "금액"], rows);
    expect(r.filledCount).toBe(0);
  });

  it("빈 rows · 그대로 · counts 0", () => {
    const r = autoFillMissingMathField(HEADERS, []);
    expect(r.rows).toEqual([]);
    expect(r.filledCount).toBe(0);
    expect(r.fixedCount).toBe(0);
  });

  it("A / Q · 나누어 떨어지지 않음 · 채우기 skip", () => {
    // 5001 / 10 = 500.1 · 오차 큼
    const rows = [["타이레놀", 10, null, 5001]];
    const r = autoFillMissingMathField(HEADERS, rows);
    expect(r.filledCount).toBe(0);
  });

  it("Q = A/P · 큰 오차 · 채우기 skip", () => {
    // 5001 / 500 = 10.002 · 오차 0.02% (1% 이하 · 채워짐)
    const rows = [["타이레놀", null, 500, 5001]];
    const r = autoFillMissingMathField(HEADERS, rows);
    expect(r.filledCount).toBe(1);
    expect(r.rows[0][1]).toBe(10);
  });

  it("여러 행 · 각각 채움", () => {
    const rows = [
      ["A", 10, 500, null],
      ["B", null, 300, 3000],
      ["C", 5, 200, 1000], // 완전 · 변화 없음
    ];
    const r = autoFillMissingMathField(HEADERS, rows);
    expect(r.filledCount).toBe(2);
    expect(r.rows[0][3]).toBe(5000);
    expect(r.rows[1][1]).toBe(10);
    expect(r.rows[2][3]).toBe(1000);
  });
});
