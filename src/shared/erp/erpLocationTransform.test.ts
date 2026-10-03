// 2026-10-03 저녁 · Phase 2 · Location transform unit tests
import { describe, it, expect } from "vitest";
import { transformErpLocation, normalizeFullWidthLetters, decideLocationApply } from "./erpLocationTransform";

describe("normalizeFullWidthLetters", () => {
  it("전각 Ａ/Ｂ/Ｃ/Ｄ → 반각 A/B/C/D", () => {
    expect(normalizeFullWidthLetters("Ａ")).toBe("A");
    expect(normalizeFullWidthLetters("Ｂ")).toBe("B");
    expect(normalizeFullWidthLetters("Ｃ")).toBe("C");
    expect(normalizeFullWidthLetters("Ｄ")).toBe("D");
    expect(normalizeFullWidthLetters("Ａ열3")).toBe("A열3");
  });
  it("반각 A/B 는 유지", () => {
    expect(normalizeFullWidthLetters("A")).toBe("A");
    expect(normalizeFullWidthLetters("1매대B")).toBe("1매대B");
  });
});

describe("transformErpLocation · 벽", () => {
  it("벽 + 21 → '21'", () => {
    const r = transformErpLocation("벽>21>전체>전체");
    expect(r.derived).toBe("21");
    expect(r.reason).toBe("ok_wall");
    expect(r.major).toBe("벽");
  });
  it("벽 + 30 → '30'", () => {
    expect(transformErpLocation("벽>30>전체>전체").derived).toBe("30");
  });
});

describe("transformErpLocation · N매대 (전각 포함)", () => {
  it("6매대 + Ａ (전각) → '6A' (반각 정규화)", () => {
    const r = transformErpLocation("6매대>Ａ>7열>전체");
    expect(r.derived).toBe("6A");
    expect(r.reason).toBe("ok_madae");
    expect(r.major).toBe("6매대");
    expect(r.middleRaw).toBe("Ａ");
    expect(r.middleNormalized).toBe("A");
  });
  it("6매대 + Ｂ (전각) → '6B'", () => {
    expect(transformErpLocation("6매대>Ｂ>7열>전체").derived).toBe("6B");
  });
  it("1매대 + B (반각 · 1매대 특수) → '1B'", () => {
    const r = transformErpLocation("1매대>B>2열>전체");
    expect(r.derived).toBe("1B");
    expect(r.reason).toBe("ok_madae");
  });
  it("9매대 + Ａ → '9A'", () => {
    expect(transformErpLocation("9매대>Ａ>1열>전체").derived).toBe("9A");
  });
});

describe("transformErpLocation · REVIEW 분리", () => {
  it("뷰티 + 2번 → review_beauty · derived null", () => {
    const r = transformErpLocation("뷰티>2번>전체>전체");
    expect(r.derived).toBeNull();
    expect(r.reason).toBe("review_beauty");
    expect(r.reviewFlag).toBe("LOCATION_REVIEW_BEAUTY");
  });
  it("냉장고 + 전체 → review_fridge", () => {
    const r = transformErpLocation("냉장고>전체>전체>전체");
    expect(r.derived).toBeNull();
    expect(r.reason).toBe("review_fridge");
    expect(r.reviewFlag).toBe("LOCATION_REVIEW_FRIDGE");
  });
  it("매대 + 뒤 → review_rear_front", () => {
    const r = transformErpLocation("7매대>뒤>전체>전체");
    expect(r.derived).toBeNull();
    expect(r.reason).toBe("review_rear_front");
    expect(r.reviewFlag).toBe("LOCATION_REVIEW_REAR_FRONT");
  });
  it("매대 + 앞 → review_rear_front", () => {
    const r = transformErpLocation("5매대>앞>전체>전체");
    expect(r.reviewFlag).toBe("LOCATION_REVIEW_REAR_FRONT");
  });
});

describe("transformErpLocation · empty / 비정상", () => {
  it("null → empty", () => {
    expect(transformErpLocation(null).reason).toBe("empty");
    expect(transformErpLocation(undefined).reason).toBe("empty");
    expect(transformErpLocation("").reason).toBe("empty");
    expect(transformErpLocation("   ").reason).toBe("empty");
  });
  it("'대분류>' middle 비어있음 → empty_middle", () => {
    const r = transformErpLocation("벽>");
    expect(r.reason).toBe("empty_middle");
  });
  it("구분자 '>' 없음 → no_middle", () => {
    const r = transformErpLocation("벽");
    expect(r.reason).toBe("no_middle");
  });
  it("알 수 없는 대분류 → unknown", () => {
    const r = transformErpLocation("기타>abc>전체>전체");
    expect(r.reason).toBe("unknown");
    expect(r.derived).toBeNull();
  });
});

describe("decideLocationApply", () => {
  it("ERP ok_wall → apply", () => {
    const r = transformErpLocation("벽>21>전체>전체");
    expect(decideLocationApply(r, "")).toBe("apply");
    expect(decideLocationApply(r, "99")).toBe("apply");
  });
  it("ERP empty + DB has → keep (NULL overwrite 금지)", () => {
    const r = transformErpLocation("");
    expect(decideLocationApply(r, "37")).toBe("keep");
  });
  it("ERP empty + DB empty → keep", () => {
    const r = transformErpLocation(null);
    expect(decideLocationApply(r, null)).toBe("keep");
  });
  it("ERP review (뷰티) → review", () => {
    const r = transformErpLocation("뷰티>2번>전체>전체");
    expect(decideLocationApply(r, "32")).toBe("review");
    expect(decideLocationApply(r, null)).toBe("review");
  });
  it("ERP review (매대+뒤) → review", () => {
    const r = transformErpLocation("6매대>뒤>전체>전체");
    expect(decideLocationApply(r, null)).toBe("review");
  });
});
