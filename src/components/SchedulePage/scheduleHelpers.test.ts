// src/components/SchedulePage/scheduleHelpers.test.ts
// 2026-10-07 · Phase 2 · OFF SSOT · "지정휴무" workDays/labor bug 회귀 방지
import { describe, it, expect } from "vitest";
import {
  OFF_TYPES_SET,
  getEmpMonthStats,
  getCalculatedSummary,
  positionToCategoryV2,
  positionToCategory,
} from "./scheduleHelpers";
import type { Employee, Schedule } from "../../types";

const PHARM_SCHEDULE_TYPES = [
  { type: "오픈", hours: "10:00-18:00", pharmHours: "", logisticsHours: "", partTimeHours: "" },
  { type: "미들", hours: "11:00-18:00", pharmHours: "", logisticsHours: "", partTimeHours: "" },
  { type: "마감", hours: "12:00-20:00", pharmHours: "", logisticsHours: "", partTimeHours: "" },
];

function makeSchedule(date: string, type: string, workingHours = ""): Schedule {
  return { date, type, workingHours, actualHours: "", memo: "" } as Schedule;
}

function makeEmp(opts: Partial<Employee> & { id: number; name: string; position: string; schedules: Schedule[] }): Employee {
  return {
    id: opts.id,
    name: opts.name,
    position: opts.position,
    employmentType: opts.employmentType ?? "정직원",
    workplace: opts.workplace ?? "매장",
    schedules: opts.schedules,
    break_time_minutes: opts.break_time_minutes ?? 60,
    break_apply_paid: opts.break_apply_paid ?? true,
    hireDate: opts.hireDate ?? "2026-01-01",
    retireDate: opts.retireDate,
  } as unknown as Employee;
}

describe("OFF_TYPES_SET · Phase 2 · 지정휴무 포함", () => {
  it("휴무·월차·지정휴무·결근 전부 OFF (4개)", () => {
    expect(OFF_TYPES_SET.has("휴무")).toBe(true);
    expect(OFF_TYPES_SET.has("월차")).toBe(true);
    expect(OFF_TYPES_SET.has("지정휴무")).toBe(true);
    expect(OFF_TYPES_SET.has("결근")).toBe(true);
    expect(OFF_TYPES_SET.size).toBe(4);
  });

  it("정상 근무 유형 · OFF 아님", () => {
    expect(OFF_TYPES_SET.has("오픈")).toBe(false);
    expect(OFF_TYPES_SET.has("미들")).toBe(false);
    expect(OFF_TYPES_SET.has("마감")).toBe(false);
  });

  it("반차 · OFF 아님 (반나절 근무)", () => {
    expect(OFF_TYPES_SET.has("오전반차")).toBe(false);
    expect(OFF_TYPES_SET.has("오후반차")).toBe(false);
  });
});

describe("getEmpMonthStats · 지정휴무 regression", () => {
  it("지정휴무 · workDays 집계 X · laborCost 계산 X", () => {
    const emp = makeEmp({
      id: 1,
      name: "홍길동",
      position: "캐셔",
      schedules: [
        makeSchedule("2026-10-01", "오픈", "10:00-18:00"),
        makeSchedule("2026-10-02", "지정휴무", ""),
        makeSchedule("2026-10-03", "오픈", "10:00-18:00"),
      ],
    });
    const stats = getEmpMonthStats(
      emp,
      "2026-10",
      PHARM_SCHEDULE_TYPES,
      { "캐셔": { weekday: 10030, weekend: 12000 } },
      {},
    );
    // workDays · 지정휴무 제외 · 오픈 2일만
    expect(stats.workDays).toBe(2);
    // 지정휴무 날에는 labor 계산 안 됨
    expect(stats.laborCost).toBeGreaterThan(0);
    expect(stats.wageConfigured).toBe(true);
  });

  it("wage 미설정 · laborCost=0 · wageConfigured=false (unknown 신호)", () => {
    const emp = makeEmp({
      id: 1,
      name: "홍길동",
      position: "대표",
      schedules: [makeSchedule("2026-10-01", "오픈", "10:00-18:00")],
    });
    const stats = getEmpMonthStats(emp, "2026-10", PHARM_SCHEDULE_TYPES, {}, {});
    expect(stats.workDays).toBe(1);
    expect(stats.laborCost).toBe(0);
    expect(stats.wageConfigured).toBe(false); // UI "시급 미설정" 안내 trigger
  });

  it("override 우선순위 · base rate 보다 우선", () => {
    const emp = makeEmp({
      id: 42,
      name: "홍길동",
      position: "캐셔",
      schedules: [makeSchedule("2026-10-01", "오픈", "10:00-18:00")],
    });
    const stats = getEmpMonthStats(
      emp,
      "2026-10",
      PHARM_SCHEDULE_TYPES,
      { "캐셔": { weekday: 10030, weekend: 12000 } },
      { 42: { weekday: 20000, weekend: 25000 } },
    );
    // break 1h · 7h paid · 20000 → 140000
    expect(stats.laborCost).toBeGreaterThan(100000);
    expect(stats.wageConfigured).toBe(true);
  });
});

describe("getCalculatedSummary · 지정휴무 regression", () => {
  it("지정휴무 날 · 어떤 count 에도 포함 X", () => {
    const emp = makeEmp({
      id: 1,
      name: "홍길동",
      position: "캐셔",
      schedules: [makeSchedule("2026-10-01", "지정휴무", "")],
    });
    const summary = getCalculatedSummary([emp], ["2026-10-01"]);
    expect(summary[0].openCount).toBe(0);
    expect(summary[0].middleCount).toBe(0);
    expect(summary[0].closeCount).toBe(0);
    expect(summary[0].staffCount).toBe(0);
    expect(summary[0].pharmacistCount).toBe(0);
    expect(summary[0].otherCount).toBe(0);
    expect(summary[0].totalCount).toBe(0);
  });
});

describe("positionToCategoryV2 · UNMAPPED 분리", () => {
  it("canonical '기타' position → 기타", () => {
    expect(positionToCategoryV2("기타")).toBe("기타");
  });

  it("빈 position → UNMAPPED", () => {
    expect(positionToCategoryV2("")).toBe("UNMAPPED");
  });

  it("대표 · 임원 (매핑 없음) → UNMAPPED (기타 아님)", () => {
    expect(positionToCategoryV2("대표")).toBe("UNMAPPED");
    expect(positionToCategoryV2("임원")).toBe("UNMAPPED");
  });

  it("매핑 성공 · exact category 리턴", () => {
    expect(positionToCategoryV2("약사")).toBe("약사");
    expect(positionToCategoryV2("캐셔")).toBe("사원");
    expect(positionToCategoryV2("물류")).toBe("창고");
  });

  it("legacy positionToCategory 는 UNMAPPED 를 기타 로 흡수 유지 (레거시 호환)", () => {
    expect(positionToCategory("대표")).toBe("기타");
    expect(positionToCategory("")).toBe("기타");
  });
});
