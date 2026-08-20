// 2026-08-20 · diagnostics · topValidationRules 순수 함수
import { describe, it, expect } from "vitest";
import { topValidationRules } from "./diagnostics";

describe("topValidationRules · 상위 3개 룰 집계", () => {
  it("빈 배열 · 빈 배열", () => {
    expect(topValidationRules([])).toEqual([]);
  });

  it("단일 룰 · rule×N 포맷", () => {
    const r = topValidationRules([
      { rule: "숫자아님" },
      { rule: "숫자아님" },
      { rule: "숫자아님" },
    ]);
    expect(r).toEqual(["숫자아님×3"]);
  });

  it("여러 룰 · count 내림차순 · 최대 3", () => {
    const r = topValidationRules([
      { rule: "A" }, { rule: "A" }, { rule: "A" },
      { rule: "B" }, { rule: "B" },
      { rule: "C" },
      { rule: "D" },
      { rule: "E" },
    ]);
    expect(r).toHaveLength(3);
    expect(r[0]).toBe("A×3");
    expect(r[1]).toBe("B×2");
    // C, D, E 는 같은 count 1 → 첫 3개 중 1개
    expect(r[2]).toMatch(/^[CDE]×1$/);
  });

  it("동일 count · 순서 보장 X · 3개 반환", () => {
    const r = topValidationRules([
      { rule: "X" }, { rule: "Y" }, { rule: "Z" }, { rule: "W" },
    ]);
    expect(r).toHaveLength(3);
  });

  it("2개 이하 · 그대로 반환", () => {
    const r = topValidationRules([
      { rule: "A" }, { rule: "B" },
    ]);
    expect(r).toHaveLength(2);
    expect(r).toContain("A×1");
    expect(r).toContain("B×1");
  });
});
