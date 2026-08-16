// 2026-08-16 · #91 · 직원 카테고리 판별 · 공통 헬퍼
// 여러 페이지 (SchedulePage · DayTimelineModal 등) 반복 하드코딩 통일
import type { Employee } from "../types";

// String 기반 (position 만 필요)
export const isPharmPosition = (position: string) => position === "약사";
export const isLogisticsPosition = (position: string) => position.includes("물류");
export const isWarehousePosition = (position: string) => position.includes("물류") || position === "창고";
export const isPartTimeEmployment = (employmentType: string) => employmentType === "알바";
export const isOtherPosition = (position: string, employmentType: string = "") =>
  position === "기타" || position === "알바" || employmentType === "알바";

// Employee 객체 기반 · DayTimelineModal 호환
export const isPharmEmp = (e: Employee) => isPharmPosition(e.position);
export const isOtherEmp = (e: Employee) => isOtherPosition(e.position, e.employmentType);
export const isStaffEmp = (e: Employee) => !isPharmEmp(e) && !isOtherEmp(e);
