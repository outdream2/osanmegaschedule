// src/utils/productClassify.ts
// 상비약(1~9구역) / 일반약(10구역이상) / 미분류 · 공용 분류 유틸
// 2026-08-03 · 통계 메뉴 상비약/일반약/전체 필터 도입
//
// 규칙 (real_map 앞자리 숫자 기준):
//   · 1~9   → 상비약 (stationery)
//   · 10~   → 일반약 (general)
//   · 없음/파싱실패 → 미분류 (unknown)  ※ "전체" 필터에만 포함
//
// 다중 구역 (예 "1A/10B") 의 경우 첫 구역 앞자리만 사용 (1A → 상비약)
//   슬래시·하이픈·언더스코어·공백 중 첫 구분자로 자름 (CategoryTab 관행과 정합)

export type ProductClass = "stationery" | "general" | "unknown";
export type ClassFilter = "all" | "stationery" | "general";

export const REAL_MAP_ZONE_REGEX = /^(\d+)/;
const PRIMARY_SPLIT_REGEX = /[\/\-_\s]/;

export function classifyProduct(realMap: string | null | undefined): ProductClass {
  if (!realMap) return "unknown";
  const first = String(realMap).split(PRIMARY_SPLIT_REGEX)[0]?.trim() ?? "";
  if (!first) return "unknown";
  const m = first.match(REAL_MAP_ZONE_REGEX);
  if (!m) return "unknown";
  const num = parseInt(m[1], 10);
  if (!Number.isFinite(num) || num <= 0) return "unknown";
  return num <= 9 ? "stationery" : "general";
}

export function matchClassFilter(realMap: string | null | undefined, filter: ClassFilter): boolean {
  if (filter === "all") return true;
  return classifyProduct(realMap) === filter;
}

// 라벨/색상 매핑 (UI 공용)
export const CLASS_FILTER_LABEL: Record<ClassFilter, string> = {
  all: "전체",
  stationery: "상비약",
  general: "일반약",
};

// 라벨 옆 구역 범위 표시 (2026-08-04 · 사용자 요청 · "(1-9)" · "(10-45)" 형식)
// 상비약 · 고정 1-9 · 일반약 · 10 ~ 매핑된 최대 번호 (동적 · getZoneMappings 사용)
import { getZoneMappings } from "../constants/zoneLabels";
export function getClassFilterRange(cls: ClassFilter): string {
  if (cls === "all") return "";
  if (cls === "stationery") return "(1-9)";
  // general · 10~마지막
  const maps = getZoneMappings();
  const nums = maps.map(m => Number(m.number)).filter(n => Number.isFinite(n) && n >= 10);
  if (nums.length === 0) return "(10-)";
  const max = Math.max(...nums);
  return `(10-${max})`;
}
// 하위 호환 (기존 정적 라벨 · deprecated · getClassFilterRange 사용 권장)
export const CLASS_FILTER_RANGE: Record<ClassFilter, string> = {
  all: "",
  stationery: "(1-9)",
  general: "(10-)",
};
