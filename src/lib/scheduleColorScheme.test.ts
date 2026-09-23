// src/lib/scheduleColorScheme.test.ts
import { describe, it, expect } from "vitest";
import {
  detectStatusTone,
  getStatusBadgeClass,
  getSummaryLabelClasses,
  getLeaveTypeColor,
} from "./scheduleColorScheme";

describe("detectStatusTone", () => {
  it("null/undefined/empty → default", () => {
    expect(detectStatusTone(null)).toBe("default");
    expect(detectStatusTone(undefined)).toBe("default");
    expect(detectStatusTone("")).toBe("default");
  });

  it("지각 포함 → late", () => {
    expect(detectStatusTone("지각")).toBe("late");
    expect(detectStatusTone("10분 지각")).toBe("late");
  });

  it("조퇴 포함 → leave-early", () => {
    expect(detectStatusTone("조퇴")).toBe("leave-early");
    expect(detectStatusTone("2시간 조퇴")).toBe("leave-early");
  });

  it("결근 포함 → absent", () => {
    expect(detectStatusTone("결근")).toBe("absent");
    expect(detectStatusTone("무단결근")).toBe("absent");
  });

  it("기타 텍스트 → extended", () => {
    expect(detectStatusTone("2시간 연장")).toBe("extended");
    expect(detectStatusTone("10-20")).toBe("extended");
  });
});

describe("getStatusBadgeClass", () => {
  it("지각 → amber 클래스 + ⚠️ 아이콘", () => {
    const r = getStatusBadgeClass("지각");
    expect(r.tone).toBe("late");
    expect(r.container).toContain("amber-700");
    expect(r.icon).toBe("⚠️ ");
  });

  it("조퇴 → purple 클래스 + 🏃 아이콘", () => {
    const r = getStatusBadgeClass("조퇴");
    expect(r.tone).toBe("leave-early");
    expect(r.container).toContain("purple-700");
    expect(r.icon).toBe("🏃 ");
  });

  it("결근 → rose-700 클래스 + 🚨 아이콘", () => {
    const r = getStatusBadgeClass("결근");
    expect(r.tone).toBe("absent");
    expect(r.container).toContain("rose-700");
    expect(r.icon).toBe("🚨 ");
  });

  it("연장 → rose-600 클래스 + 아이콘 없음", () => {
    const r = getStatusBadgeClass("2시간 연장");
    expect(r.tone).toBe("extended");
    expect(r.container).toContain("rose-600");
    expect(r.icon).toBe("");
  });

  it("null → default (rose-600, 아이콘 없음)", () => {
    const r = getStatusBadgeClass(null);
    expect(r.tone).toBe("default");
    expect(r.container).toContain("rose-600");
    expect(r.icon).toBe("");
  });
});

describe("getSummaryLabelClasses", () => {
  it("약사 → emerald 팔레트", () => {
    const c = getSummaryLabelClasses("약사");
    expect(c.label).toContain("emerald-600");
    expect(c.valActive).toContain("emerald-50");
    expect(c.monthTotal).toContain("emerald-50");
  });

  it("사원 → zinc 팔레트", () => {
    const c = getSummaryLabelClasses("사원");
    expect(c.label).toContain("zinc-600");
  });

  it("물류 → sky 팔레트", () => {
    const c = getSummaryLabelClasses("물류");
    expect(c.label).toContain("sky-600");
  });

  it("창고 → amber 팔레트", () => {
    const c = getSummaryLabelClasses("창고");
    expect(c.label).toContain("amber-600");
  });

  it("근무인원 → brand-deep/indigo 팔레트", () => {
    const c = getSummaryLabelClasses("근무인원");
    expect(c.label).toContain("brand-deep");
    expect(c.valActive).toContain("indigo-50");
  });
});

describe("getLeaveTypeColor", () => {
  it("월차 → amber-700", () => {
    expect(getLeaveTypeColor("월차")).toBe("text-amber-700");
  });

  it("오전반차 → sky-700", () => {
    expect(getLeaveTypeColor("오전반차")).toBe("text-sky-700");
  });

  it("오후반차 → indigo-700", () => {
    expect(getLeaveTypeColor("오후반차")).toBe("text-indigo-700");
  });

  it("미등록 유형 → zinc-600 폴백", () => {
    expect(getLeaveTypeColor("연차")).toBe("text-zinc-600");
    expect(getLeaveTypeColor("")).toBe("text-zinc-600");
  });
});
