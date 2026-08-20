// 2026-08-20 · useSeasonRanges · pure helpers (SEASON_LABEL/EMOJI/formatMonths/DEFAULT)
import { describe, it, expect } from "vitest";
import {
  SEASON_LABEL,
  SEASON_EMOJI,
  formatMonths,
  DEFAULT_SEASON_RANGES,
} from "./useSeasonRanges";

describe("SEASON_LABEL", () => {
  it("4 계절 한글 매핑", () => {
    expect(SEASON_LABEL.spring).toBe("봄");
    expect(SEASON_LABEL.summer).toBe("여름");
    expect(SEASON_LABEL.autumn).toBe("가을");
    expect(SEASON_LABEL.winter).toBe("겨울");
  });
});

describe("SEASON_EMOJI", () => {
  it("4 계절 이모지 매핑", () => {
    expect(SEASON_EMOJI.spring).toBe("🌸");
    expect(SEASON_EMOJI.summer).toBe("☀️");
    expect(SEASON_EMOJI.autumn).toBe("🍁");
    expect(SEASON_EMOJI.winter).toBe("❄️");
  });
});

describe("formatMonths", () => {
  it("빈 배열 · '-'", () => {
    expect(formatMonths([])).toBe("-");
  });

  it("null/undefined · '-'", () => {
    expect(formatMonths(null as any)).toBe("-");
    expect(formatMonths(undefined as any)).toBe("-");
  });

  it("1월 · '1월'", () => {
    expect(formatMonths([1])).toBe("1월");
  });

  it("여러 월 · '3·4·5월' 형식", () => {
    expect(formatMonths([3, 4, 5])).toBe("3·4·5월");
    expect(formatMonths([6, 7, 8])).toBe("6·7·8월");
    expect(formatMonths([12, 1, 2])).toBe("12·1·2월");
  });

  it("2개 · '3·4월'", () => {
    expect(formatMonths([3, 4])).toBe("3·4월");
  });
});

describe("DEFAULT_SEASON_RANGES", () => {
  it("4 계절 · 기본 월 배열", () => {
    expect(DEFAULT_SEASON_RANGES.spring).toEqual([3, 4, 5]);
    expect(DEFAULT_SEASON_RANGES.summer).toEqual([6, 7, 8]);
    expect(DEFAULT_SEASON_RANGES.autumn).toEqual([9, 10, 11]);
    expect(DEFAULT_SEASON_RANGES.winter).toEqual([12, 1, 2]);
  });
});
