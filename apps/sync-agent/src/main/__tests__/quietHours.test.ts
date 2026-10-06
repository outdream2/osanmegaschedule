// 2026-10-06 · 야간 동기화 금지 (quiet hours) 테스트
//   · production function (../quietHours) 직접 import · 로직 복제 금지
//   · now injection 으로 시간 결정론 테스트

import { describe, it, expect } from "vitest";
import { parseHM, isInQuietHoursPure, type QuietHours } from "../quietHours";

const at = (h: number, m = 0): Date => new Date(2026, 0, 1, h, m);
const QH = (enabled: boolean, startTime: string, endTime: string): QuietHours => ({ enabled, startTime, endTime });

describe("parseHM", () => {
  it("정상 포맷 → 분단위 숫자", () => {
    expect(parseHM("00:00")).toBe(0);
    expect(parseHM("01:30")).toBe(90);
    expect(parseHM("23:59")).toBe(23 * 60 + 59);
  });
  it("비정상 포맷 → NaN", () => {
    expect(parseHM("25:00")).toBeNaN();
    expect(parseHM("abc")).toBeNaN();
    expect(parseHM("")).toBeNaN();
    expect(parseHM(null)).toBeNaN();
    expect(parseHM(undefined)).toBeNaN();
    expect(parseHM("12:60")).toBeNaN();
    expect(parseHM("-1:00")).toBeNaN();
  });
});

describe("isInQuietHoursPure", () => {
  describe("[A] enabled=false", () => {
    const cfg = QH(false, "23:00", "08:00");
    it("23:00 → false (disabled)", () => expect(isInQuietHoursPure(cfg, at(23))).toBe(false));
    it("03:00 → false (disabled)", () => expect(isInQuietHoursPure(cfg, at(3))).toBe(false));
  });

  describe("[B] 23:00~08:00 (자정 crossing)", () => {
    const cfg = QH(true, "23:00", "08:00");
    it("22:59 → false (아직 영업)",   () => expect(isInQuietHoursPure(cfg, at(22, 59))).toBe(false));
    it("23:00 → true (금지 시작)",    () => expect(isInQuietHoursPure(cfg, at(23, 0))).toBe(true));
    it("23:30 → true (금지 중)",      () => expect(isInQuietHoursPure(cfg, at(23, 30))).toBe(true));
    it("00:00 → true (자정)",         () => expect(isInQuietHoursPure(cfg, at(0, 0))).toBe(true));
    it("03:00 → true (새벽 중간)",    () => expect(isInQuietHoursPure(cfg, at(3, 0))).toBe(true));
    it("07:59 → true (아직 금지)",    () => expect(isInQuietHoursPure(cfg, at(7, 59))).toBe(true));
    it("08:00 → false (금지 해제)",   () => expect(isInQuietHoursPure(cfg, at(8, 0))).toBe(false));
    it("08:01 → false (영업)",        () => expect(isInQuietHoursPure(cfg, at(8, 1))).toBe(false));
    it("12:00 → false (영업)",        () => expect(isInQuietHoursPure(cfg, at(12, 0))).toBe(false));
  });

  describe("[C] 01:30~09:30 (minute precision)", () => {
    const cfg = QH(true, "01:30", "09:30");
    it("01:29 → false",   () => expect(isInQuietHoursPure(cfg, at(1, 29))).toBe(false));
    it("01:30 → true",    () => expect(isInQuietHoursPure(cfg, at(1, 30))).toBe(true));
    it("05:00 → true",    () => expect(isInQuietHoursPure(cfg, at(5, 0))).toBe(true));
    it("09:29 → true",    () => expect(isInQuietHoursPure(cfg, at(9, 29))).toBe(true));
    it("09:30 → false",   () => expect(isInQuietHoursPure(cfg, at(9, 30))).toBe(false));
    it("09:31 → false",   () => expect(isInQuietHoursPure(cfg, at(9, 31))).toBe(false));
  });

  describe("[D] 비정상 입력 → crash 없이 false", () => {
    it("startTime 25:00 → false",     () => expect(isInQuietHoursPure(QH(true, "25:00", "08:00"), at(3))).toBe(false));
    it("startTime 'abc' → false",     () => expect(isInQuietHoursPure(QH(true, "abc", "08:00"), at(3))).toBe(false));
    it("start === end → false",       () => expect(isInQuietHoursPure(QH(true, "08:00", "08:00"), at(8))).toBe(false));
    it("empty string → false",        () => expect(isInQuietHoursPure(QH(true, "", ""), at(3))).toBe(false));
    it("quietHours undefined → false", () => expect(isInQuietHoursPure(undefined, at(23))).toBe(false));
  });

  describe("[E] 10:00~14:00 (start < end · 낮 금지 case)", () => {
    const cfg = QH(true, "10:00", "14:00");
    it("09:59 → false",   () => expect(isInQuietHoursPure(cfg, at(9, 59))).toBe(false));
    it("10:00 → true",    () => expect(isInQuietHoursPure(cfg, at(10, 0))).toBe(true));
    it("12:00 → true",    () => expect(isInQuietHoursPure(cfg, at(12, 0))).toBe(true));
    it("13:59 → true",    () => expect(isInQuietHoursPure(cfg, at(13, 59))).toBe(true));
    it("14:00 → false",   () => expect(isInQuietHoursPure(cfg, at(14, 0))).toBe(false));
  });

  describe("[F] 경계값 inclusive start / exclusive end", () => {
    const cfg = QH(true, "23:00", "08:00");
    it("22:59 → false (minute 59)",   () => expect(isInQuietHoursPure(cfg, at(22, 59))).toBe(false));
    it("23:00 → true (딱 start)",     () => expect(isInQuietHoursPure(cfg, at(23, 0))).toBe(true));
    it("07:59 → true",                () => expect(isInQuietHoursPure(cfg, at(7, 59))).toBe(true));
    it("08:00 → false (딱 end)",      () => expect(isInQuietHoursPure(cfg, at(8, 0))).toBe(false));
  });
});
