// 2026-08-19 · contractUtils · shortContractLabel · parseContractTypeForRead
import { describe, it, expect } from "vitest";
import { shortContractLabel, parseContractTypeForRead } from "./contractUtils";

describe("shortContractLabel", () => {
  it("정규직 · 정규 (개월수 무시)", () => {
    expect(shortContractLabel("정규직")).toBe("정규");
    expect(shortContractLabel("정규직", "12")).toBe("정규");
  });

  it("정규 · 정규 그대로", () => {
    expect(shortContractLabel("정규")).toBe("정규");
  });

  it("계약직 + 개월수 · 계약N", () => {
    expect(shortContractLabel("계약직", "12")).toBe("계약12");
    expect(shortContractLabel("계약직", "2")).toBe("계약2");
    expect(shortContractLabel("계약직", 6)).toBe("계약6");
  });

  it("계약직 · 개월수 없음 · 계약", () => {
    expect(shortContractLabel("계약직")).toBe("계약");
    expect(shortContractLabel("계약직", null)).toBe("계약");
    expect(shortContractLabel("계약직", "")).toBe("계약");
  });

  it("계약N · 이미 short 형식 · 그대로", () => {
    expect(shortContractLabel("계약12")).toBe("계약12");
    expect(shortContractLabel("계약2", "3")).toBe("계약2"); // months 무시
  });

  it("알바/일용/인턴 · 그대로", () => {
    expect(shortContractLabel("알바")).toBe("알바");
    expect(shortContractLabel("일용")).toBe("일용");
    expect(shortContractLabel("인턴")).toBe("인턴");
  });

  it("빈 문자열/null · 빈 문자열", () => {
    expect(shortContractLabel("")).toBe("");
    expect(shortContractLabel(null as any)).toBe("");
    expect(shortContractLabel(undefined as any)).toBe("");
  });

  it("앞뒤 공백 · trim", () => {
    expect(shortContractLabel("  정규직  ")).toBe("정규");
  });

  it("계약직 · 잘못된 개월수 (문자) · 계약", () => {
    expect(shortContractLabel("계약직", "abc")).toBe("계약");
  });

  it("커스텀 값 · 그대로", () => {
    expect(shortContractLabel("특수")).toBe("특수");
  });
});

describe("parseContractTypeForRead", () => {
  it("정규 → { display: 정규직, months: null }", () => {
    expect(parseContractTypeForRead("정규")).toEqual({ display: "정규직", months: null });
  });

  it("정규직 → { display: 정규직, months: null }", () => {
    expect(parseContractTypeForRead("정규직")).toEqual({ display: "정규직", months: null });
  });

  it("계약N → { display: 계약직, months: N }", () => {
    expect(parseContractTypeForRead("계약12")).toEqual({ display: "계약직", months: "12" });
    expect(parseContractTypeForRead("계약2")).toEqual({ display: "계약직", months: "2" });
  });

  it("계약 · 계약직 (개월수 없음) → months: null", () => {
    expect(parseContractTypeForRead("계약")).toEqual({ display: "계약직", months: null });
    expect(parseContractTypeForRead("계약직")).toEqual({ display: "계약직", months: null });
  });

  it("null/undefined/empty · 빈 display · null months", () => {
    expect(parseContractTypeForRead(null)).toEqual({ display: "", months: null });
    expect(parseContractTypeForRead(undefined)).toEqual({ display: "", months: null });
    expect(parseContractTypeForRead("")).toEqual({ display: "", months: null });
  });

  it("알바/일용/인턴 · 그대로 display · null months", () => {
    expect(parseContractTypeForRead("알바")).toEqual({ display: "알바", months: null });
    expect(parseContractTypeForRead("일용")).toEqual({ display: "일용", months: null });
  });

  it("앞뒤 공백 · trim 후 매칭", () => {
    expect(parseContractTypeForRead("  정규  ")).toEqual({ display: "정규직", months: null });
    expect(parseContractTypeForRead("  계약6  ")).toEqual({ display: "계약직", months: "6" });
  });

  it("커스텀 값 · 그대로", () => {
    expect(parseContractTypeForRead("특수형")).toEqual({ display: "특수형", months: null });
  });
});
