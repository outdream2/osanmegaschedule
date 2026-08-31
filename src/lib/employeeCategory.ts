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

// 2026-08-31 · #64 · 매장 직군 판정 · 실제 POSITIONS = ["약사","캐셔","진열","물류","거래처","기타"]
//   · 매장 = 캐셔·진열 (contract 매핑 useContractLoad 참조) · "매장" 문자열 자체도 커스텀 허용
//   · 겸직 슬래시 케이스 지원 · "물류/캐셔" · "캐셔/물류" 등 · includes 로 판정
export const isStorePosition = (position: string) => {
  const p = (position ?? "").trim();
  if (!p) return false;
  return p.includes("캐셔") || p.includes("진열") || p.includes("매장");
};

// 2026-08-31 · #64 · 매장구역도 담당자 후보 · 물류·매장 직군만
export const isStoreOrLogisticsPosition = (position: string) =>
  isLogisticsPosition(position) || isStorePosition(position);

// Employee 객체 기반 · DayTimelineModal 호환
export const isPharmEmp = (e: Employee) => isPharmPosition(e.position);
export const isOtherEmp = (e: Employee) => isOtherPosition(e.position, e.employmentType);
export const isStaffEmp = (e: Employee) => !isPharmEmp(e) && !isOtherEmp(e);
