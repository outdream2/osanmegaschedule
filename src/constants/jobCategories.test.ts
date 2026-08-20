// 2026-08-20 · jobCategories · 직군·직급·계약유형 상수
import { describe, it, expect } from "vitest";
import {
  POSITIONS,
  RANKS,
  WORKPLACES,
  CONTRACT_TYPES,
  JOB_CATEGORIES,
} from "./jobCategories";

describe("POSITIONS · 직군", () => {
  it("6종 · 약사/캐셔/진열/물류/거래처/기타", () => {
    expect(POSITIONS).toEqual(["약사", "캐셔", "진열", "물류", "거래처", "기타"]);
  });

  it("거래처 · 포함 (2026-08-09 추가)", () => {
    expect(POSITIONS).toContain("거래처");
  });
});

describe("RANKS · 직급", () => {
  it("9종 · 빈문자열·대표·이사·부장·팀장·과장·약사·사원·알바", () => {
    expect(RANKS).toHaveLength(9);
    expect(RANKS[0]).toBe(""); // 없음
    expect(RANKS).toContain("대표");
    expect(RANKS).toContain("알바");
  });
});

describe("WORKPLACES · 근무지", () => {
  it("4종 · 매장/창고/본사/기타", () => {
    expect(WORKPLACES).toEqual(["매장", "창고", "본사", "기타"]);
  });
});

describe("CONTRACT_TYPES · 계약유형", () => {
  it("5종 · 정규직/계약직/알바/일용/인턴", () => {
    expect(CONTRACT_TYPES).toEqual(["정규직", "계약직", "알바", "일용", "인턴"]);
  });
});

describe("JOB_CATEGORIES · 직군 대분류", () => {
  it("4종 · 약사/매장/창고/기타", () => {
    expect(JOB_CATEGORIES).toEqual(["약사", "매장", "창고", "기타"]);
  });
});
