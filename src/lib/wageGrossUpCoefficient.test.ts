// 2026-08-19 · wageGrossUpCoefficient · 세후 → 세전 역산 계수표 lookup
import { describe, it, expect } from "vitest";
import { GROSSUP_COEFFICIENTS, grossUpFromNet } from "./wageGrossUpCoefficient";

describe("GROSSUP_COEFFICIENTS · 구간표", () => {
  it("10 구간 존재", () => {
    expect(GROSSUP_COEFFICIENTS).toHaveLength(10);
  });

  it("최저 · 1M~2M · coefficient 1.110", () => {
    expect(GROSSUP_COEFFICIENTS[0]).toEqual({
      minNet: 1_000_000, maxNet: 2_000_000, coefficient: 1.110, ratioLabel: "9.5%~10.5%",
    });
  });

  it("최고 · 15M~20M · coefficient 1.600", () => {
    const last = GROSSUP_COEFFICIENTS[GROSSUP_COEFFICIENTS.length - 1];
    expect(last.minNet).toBe(15_000_000);
    expect(last.maxNet).toBe(20_000_000);
    expect(last.coefficient).toBe(1.600);
  });

  it("모든 구간 · coefficient > 1 (세전 > 세후)", () => {
    GROSSUP_COEFFICIENTS.forEach((b) => expect(b.coefficient).toBeGreaterThan(1));
  });

  it("구간 · min < max · 상승 순서", () => {
    for (let i = 1; i < GROSSUP_COEFFICIENTS.length; i++) {
      expect(GROSSUP_COEFFICIENTS[i].minNet).toBeGreaterThanOrEqual(GROSSUP_COEFFICIENTS[i - 1].minNet);
      expect(GROSSUP_COEFFICIENTS[i].coefficient).toBeGreaterThan(GROSSUP_COEFFICIENTS[i - 1].coefficient);
    }
  });
});

describe("grossUpFromNet · 구간 매칭", () => {
  it("1.5M · 첫 구간 (1M~2M) · 1.110", () => {
    const r = grossUpFromNet(1_500_000);
    expect(r.coefficient).toBe(1.110);
    expect(r.gross).toBe(1_665_000);
    expect(r.bracket.ratioLabel).toBe("9.5%~10.5%");
  });

  it("2.5M · 2번째 구간 (2M~3M) · 1.135", () => {
    const r = grossUpFromNet(2_500_000);
    expect(r.coefficient).toBe(1.135);
    expect(r.gross).toBe(2_837_500);
  });

  it("5.5M · 5번째 구간 (5M~6M) · 1.230", () => {
    const r = grossUpFromNet(5_500_000);
    expect(r.coefficient).toBe(1.230);
    expect(r.gross).toBe(6_765_000);
  });

  it("10M · 8번째 구간 (10M~12M) · 1.420 (경계값 시작)", () => {
    const r = grossUpFromNet(10_000_000);
    expect(r.coefficient).toBe(1.420);
  });

  it("14M · 9번째 구간 (12M~15M) · 1.500", () => {
    const r = grossUpFromNet(14_000_000);
    expect(r.coefficient).toBe(1.500);
  });
});

describe("grossUpFromNet · 경계값 처리", () => {
  it("2M · 두번째 구간 (>= 2M) 시작", () => {
    // minNet <= net < maxNet
    const r = grossUpFromNet(2_000_000);
    expect(r.coefficient).toBe(1.135);
  });

  it("첫 구간 하한 미만 (0.5M) · 첫 구간으로 clamp", () => {
    const r = grossUpFromNet(500_000);
    expect(r.coefficient).toBe(1.110);
  });

  it("마지막 구간 상한 초과 (25M) · 마지막 구간으로 clamp", () => {
    const r = grossUpFromNet(25_000_000);
    expect(r.coefficient).toBe(1.600);
    expect(r.gross).toBe(40_000_000);
  });
});

describe("grossUpFromNet · 잘못된 입력", () => {
  it("0 · 첫 구간 · gross=0", () => {
    const r = grossUpFromNet(0);
    expect(r.gross).toBe(0);
    expect(r.coefficient).toBe(1.110);
  });

  it("음수 · 첫 구간 · gross=0", () => {
    const r = grossUpFromNet(-100);
    expect(r.gross).toBe(0);
  });

  it("NaN · 첫 구간 · gross=0", () => {
    const r = grossUpFromNet(NaN);
    expect(r.gross).toBe(0);
  });

  it("Infinity · 마지막 구간으로 clamp", () => {
    const r = grossUpFromNet(Infinity);
    // Infinity 는 Number.isFinite(false) · 초기값 반환
    expect(r.gross).toBe(0);
  });
});

describe("grossUpFromNet · gross 반올림", () => {
  it("소수점 반올림 · Math.round", () => {
    const r = grossUpFromNet(1_234_567);
    // 1234567 × 1.110 = 1370369.37 → 1370369
    expect(r.gross).toBe(1_370_369);
  });
});
