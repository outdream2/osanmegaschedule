// 2026-08-20 · schedules · WEEKDAYS_KO·START_TIMES·END_TIMES·LUNCH/REST_SLOTS
import { describe, it, expect } from "vitest";
import {
  WEEKDAYS_KO,
  START_TIMES,
  END_TIMES,
  LUNCH_SLOTS,
  REST_SLOTS,
} from "./schedules";

describe("WEEKDAYS_KO · 요일 (일요일 시작)", () => {
  it("7개 · 일·월·화·수·목·금·토", () => {
    expect(WEEKDAYS_KO).toEqual(["일", "월", "화", "수", "목", "금", "토"]);
  });

  it("일요일 시작 (index 0 = getDay() 0)", () => {
    expect(WEEKDAYS_KO[0]).toBe("일");
    expect(WEEKDAYS_KO[6]).toBe("토");
  });
});

describe("START_TIMES · 시작시간", () => {
  it("8종 (08~14시)", () => {
    expect(START_TIMES).toHaveLength(8);
  });

  it("08:00·14:00 경계", () => {
    expect(START_TIMES[0]).toBe("08:00");
    expect(START_TIMES[START_TIMES.length - 1]).toBe("14:00");
  });

  it("각 값 · HH:MM 형식", () => {
    START_TIMES.forEach((t) => {
      expect(t).toMatch(/^\d{2}:\d{2}$/);
    });
  });
});

describe("END_TIMES · 종료시간", () => {
  it("8종 (15~22시)", () => {
    expect(END_TIMES).toHaveLength(8);
  });

  it("15:00·22:00 경계", () => {
    expect(END_TIMES[0]).toBe("15:00");
    expect(END_TIMES[END_TIMES.length - 1]).toBe("22:00");
  });

  it("모든 값 · START_TIMES 마지막(14:00) 이후", () => {
    const lastStart = 14 * 60;
    END_TIMES.forEach((t) => {
      const [h, m] = t.split(":").map(Number);
      expect(h * 60 + m).toBeGreaterThan(lastStart);
    });
  });
});

describe("LUNCH_SLOTS · 점심 슬롯", () => {
  it("6종 · 30분 간격 (11:30~14:00)", () => {
    expect(LUNCH_SLOTS).toEqual(["11:30", "12:00", "12:30", "13:00", "13:30", "14:00"]);
  });
});

describe("REST_SLOTS · 휴식 슬롯", () => {
  it("5종 · 30분 간격 (16:00~18:00)", () => {
    expect(REST_SLOTS).toEqual(["16:00", "16:30", "17:00", "17:30", "18:00"]);
  });
});

describe("모든 시간 상수 · 정렬", () => {
  it("START_TIMES · 오름차순", () => {
    for (let i = 1; i < START_TIMES.length; i++) {
      expect(START_TIMES[i]).not.toBe(START_TIMES[i - 1]);
    }
  });

  it("LUNCH_SLOTS · 오름차순", () => {
    for (let i = 1; i < LUNCH_SLOTS.length; i++) {
      const [h1, m1] = LUNCH_SLOTS[i - 1].split(":").map(Number);
      const [h2, m2] = LUNCH_SLOTS[i].split(":").map(Number);
      expect(h2 * 60 + m2).toBeGreaterThan(h1 * 60 + m1);
    }
  });
});
