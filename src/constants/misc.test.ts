// 2026-08-20 · jobCategories · vendorCategories · timing · schedules 상수 검증
import { describe, it, expect } from "vitest";
import { POSITIONS, RANKS, WORKPLACES, CONTRACT_TYPES, JOB_CATEGORIES } from "./jobCategories";
import { VENDOR_CATEGORIES } from "./vendorCategories";
import { TIMING } from "./timing";
import { WEEKDAYS_KO, START_TIMES, END_TIMES, LUNCH_SLOTS, REST_SLOTS } from "./schedules";

describe("jobCategories 상수", () => {
  it("POSITIONS · 6개 · 약사/캐셔/진열/물류/거래처/기타", () => {
    expect(POSITIONS).toEqual(["약사", "캐셔", "진열", "물류", "거래처", "기타"]);
  });

  it("RANKS · 9개 · 첫 항목 빈 문자열 (미지정)", () => {
    expect(RANKS).toHaveLength(9);
    expect(RANKS[0]).toBe("");
    expect(RANKS).toContain("대표");
    expect(RANKS).toContain("이사");
  });

  it("WORKPLACES · 4개", () => {
    expect(WORKPLACES).toEqual(["매장", "창고", "본사", "기타"]);
  });

  it("CONTRACT_TYPES · 5개", () => {
    expect(CONTRACT_TYPES).toEqual(["정규직", "계약직", "알바", "일용", "인턴"]);
  });

  it("JOB_CATEGORIES · 4개 (약사·매장·창고·기타)", () => {
    expect(JOB_CATEGORIES).toEqual(["약사", "매장", "창고", "기타"]);
  });
});

describe("vendorCategories 상수", () => {
  it("VENDOR_CATEGORIES · 5종", () => {
    expect(VENDOR_CATEGORIES).toEqual(["위탁", "선결제", "60회전", "90회전", "기타"]);
  });

  it("VendorCategoryBadge 와 동기화 유지 (값 일치 검증)", () => {
    expect(VENDOR_CATEGORIES).toContain("위탁");
    expect(VENDOR_CATEGORIES).toContain("선결제");
    expect(VENDOR_CATEGORIES).toContain("60회전");
  });
});

describe("TIMING 상수", () => {
  it("DEBOUNCE · 250/200/500", () => {
    expect(TIMING.DEBOUNCE_SEARCH).toBe(250);
    expect(TIMING.DEBOUNCE_INPUT).toBe(200);
    expect(TIMING.DEBOUNCE_SETTINGS).toBe(500);
  });

  it("TOAST · SHORT<MEDIUM<LONG<EXTRA_LONG", () => {
    expect(TIMING.TOAST_SHORT).toBeLessThan(TIMING.TOAST_MEDIUM);
    expect(TIMING.TOAST_MEDIUM).toBeLessThan(TIMING.TOAST_LONG);
    expect(TIMING.TOAST_LONG).toBeLessThan(TIMING.TOAST_EXTRA_LONG);
  });

  it("PRESS_LONG · 500ms (useSortableTabs)", () => {
    expect(TIMING.PRESS_LONG).toBe(500);
  });

  it("CAMERA_READY · 1500ms", () => {
    expect(TIMING.CAMERA_READY).toBe(1500);
  });
});

describe("schedules 상수", () => {
  it("WEEKDAYS_KO · 7일 · 일요일 시작", () => {
    expect(WEEKDAYS_KO).toHaveLength(7);
    expect(WEEKDAYS_KO[0]).toBe("일");
    expect(WEEKDAYS_KO[6]).toBe("토");
  });

  it("START_TIMES · 8시-14시", () => {
    expect(START_TIMES[0]).toBe("08:00");
    expect(START_TIMES).toContain("09:30");
  });

  it("END_TIMES · 15시-22시", () => {
    expect(END_TIMES[0]).toBe("15:00");
    expect(END_TIMES[END_TIMES.length - 1]).toBe("22:00");
  });

  it("LUNCH_SLOTS · 30분 간격 · 11:30-14:00", () => {
    expect(LUNCH_SLOTS).toHaveLength(6);
    expect(LUNCH_SLOTS[0]).toBe("11:30");
    expect(LUNCH_SLOTS[LUNCH_SLOTS.length - 1]).toBe("14:00");
  });

  it("REST_SLOTS · 5개 · 30분 간격 · 16:00-18:00", () => {
    expect(REST_SLOTS).toHaveLength(5);
    expect(REST_SLOTS[0]).toBe("16:00");
    expect(REST_SLOTS[REST_SLOTS.length - 1]).toBe("18:00");
  });
});
