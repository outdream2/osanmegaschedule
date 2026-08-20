// 2026-08-20 · employmentStatus · retire_date → 3-state 파생
import { describe, it, expect } from "vitest";
import {
  getEmploymentStatus,
  canWriteResignation,
  EMPLOYMENT_STATUS_LABEL,
} from "./employmentStatus";

const today = new Date("2026-08-20T12:00:00");

describe("getEmploymentStatus", () => {
  it("retire_date null · active", () => {
    expect(getEmploymentStatus(null, today)).toBe("active");
    expect(getEmploymentStatus(undefined, today)).toBe("active");
    expect(getEmploymentStatus("", today)).toBe("active");
  });

  it("retire_date 미래 · pending_resignation", () => {
    expect(getEmploymentStatus("2026-08-21", today)).toBe("pending_resignation");
    expect(getEmploymentStatus("2026-12-31", today)).toBe("pending_resignation");
    expect(getEmploymentStatus("2027-01-01", today)).toBe("pending_resignation");
  });

  it("retire_date 오늘 · retired (경계 · 오늘 = 퇴사)", () => {
    expect(getEmploymentStatus("2026-08-20", today)).toBe("retired");
  });

  it("retire_date 과거 · retired", () => {
    expect(getEmploymentStatus("2026-08-19", today)).toBe("retired");
    expect(getEmploymentStatus("2020-01-01", today)).toBe("retired");
  });

  it("ISO datetime (T포함) · 앞 10자만 사용", () => {
    expect(getEmploymentStatus("2026-08-21T23:00:00Z", today)).toBe("pending_resignation");
  });

  it("잘못된 포맷 · active fallback (안전)", () => {
    expect(getEmploymentStatus("invalid-date", today)).toBe("active");
    expect(getEmploymentStatus("2026/08/21", today)).toBe("active");
  });
});

describe("canWriteResignation", () => {
  it("pending_resignation 만 · true", () => {
    expect(canWriteResignation("2026-08-25", today)).toBe(true);
  });

  it("재직·퇴사 · false", () => {
    expect(canWriteResignation(null, today)).toBe(false);
    expect(canWriteResignation("2026-08-19", today)).toBe(false);
    expect(canWriteResignation("2026-08-20", today)).toBe(false);
  });
});

describe("EMPLOYMENT_STATUS_LABEL · 한글 라벨", () => {
  it("3-state 매핑", () => {
    expect(EMPLOYMENT_STATUS_LABEL.active).toBe("재직");
    expect(EMPLOYMENT_STATUS_LABEL.pending_resignation).toBe("퇴사예정");
    expect(EMPLOYMENT_STATUS_LABEL.retired).toBe("퇴사");
  });
});
