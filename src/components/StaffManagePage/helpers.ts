// src/components/StaffManagePage/helpers.ts
// 2026-08-21 · Framework Phase 4 · StaffManagePage 대형 파일 분리 · helper 함수 이관

import type { Employee } from "./types";
import { AVATAR_COLORS, CONTRACT_TYPES } from "./types";

// ─── 헬퍼: 직군 컬러 ────────────────────────────────────────────────────────
export function positionColor(pos: string | null | undefined) {
  if (!pos) return "bg-zinc-100 text-zinc-500 border-line";
  if (pos.includes("약사"))              return "bg-violet-100 text-violet-700 border-violet-200";
  if (pos.includes("매장"))              return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (pos.includes("창고"))              return "bg-orange-100 text-orange-700 border-orange-200";
  if (pos.includes("물류") || pos.includes("진열") || pos.includes("캐셔"))
                                          return "bg-orange-100 text-orange-700 border-orange-200"; // 하위 호환
  if (pos.includes("매니저"))            return "bg-rose-100 text-rose-700 border-rose-200";
  return "bg-zinc-100 text-zinc-600 border-line";
}

export function scheduleTypeColor(t: string | null | undefined) {
  if (!t) return "bg-zinc-100 text-zinc-400 border-line";
  if (t === "오픈")    return "bg-amber-100 text-amber-700 border-amber-200";
  if (t === "미들")    return "bg-teal-100 text-teal-700 border-teal-200";
  if (t === "마감")    return "bg-indigo-100 text-indigo-700 border-indigo-200";
  if (t === "클로징")  return "bg-purple-100 text-purple-700 border-purple-200";
  if (t === "풀타임")  return "bg-blue-100 text-blue-700 border-blue-200";
  return "bg-zinc-100 text-zinc-500 border-line";
}

// 계약유형 · 배지 컬러 + 한글 라벨
export function contractTypeMeta(t: string | null | undefined): { label: string; short: string; color: string } | null {
  if (!t) return null;
  const found = CONTRACT_TYPES.find((c) => c.value === t);
  const short = found?.short ?? t;
  const label = found?.label ?? t;
  let color: string;
  switch (t) {
    case "regular":    color = "bg-blue-100 text-blue-700 border-blue-200"; break;
    case "fixed_term": color = "bg-amber-100 text-amber-700 border-amber-200"; break;
    case "part_time":  color = "bg-zinc-100 text-zinc-600 border-line"; break;
    case "daily":      color = "bg-rose-100 text-rose-700 border-rose-200"; break;
    case "intern":     color = "bg-lime-100 text-lime-700 border-lime-200"; break;
    default:           color = "bg-zinc-100 text-zinc-500 border-line";
  }
  return { label, short, color };
}

// 인사평가 · 배지 컬러
export function performanceRatingColor(r: string | null | undefined): string {
  if (!r) return "bg-zinc-100 text-zinc-400 border-line";
  switch (r.toUpperCase()) {
    case "S": return "bg-fuchsia-100 text-fuchsia-700 border-fuchsia-200";
    case "A": return "bg-emerald-100 text-emerald-700 border-emerald-200";
    case "B": return "bg-sky-100 text-sky-700 border-sky-200";
    case "C": return "bg-amber-100 text-amber-700 border-amber-200";
    case "D": return "bg-rose-100 text-rose-700 border-rose-200";
    default:  return "bg-zinc-100 text-zinc-500 border-line";
  }
}

// 퇴직금 지급대상 판단 · 계속근로 1년 이상 · 주 15시간 이상
//   · 근로기준법 상 최소 조건 (working_hours_per_week 없으면 정규직/계약직만 인정)
export function isSeveranceEligible(emp: Employee): boolean {
  if (!emp.hire_date) return false;
  const hire = new Date(String(emp.hire_date));
  if (isNaN(hire.getTime())) return false;
  const end = emp.retire_date ? new Date(String(emp.retire_date)) : new Date();
  const years = (end.getTime() - hire.getTime()) / (365.25 * 24 * 3600 * 1000);
  if (years < 1) return false;
  const hoursPerWeek = Number(emp.working_hours_per_week);
  if (Number.isFinite(hoursPerWeek) && hoursPerWeek > 0 && hoursPerWeek < 15) return false;
  return true;
}

// #219 · 근로계약서(employee_contracts) 기반 · 계약 개월수 자동 산출
//   · start_date ~ end_date · 총 개월 <= 4 → "계약 N개월"
//   · 그 외(장기 · 무기한 · 미매핑) → null (호출자가 fallback 처리)
export function contractPeriodMonths(startIso: string | null | undefined, endIso: string | null | undefined): number | null {
  if (!startIso || !endIso) return null;
  const s = new Date(String(startIso));
  const e = new Date(String(endIso));
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return null;
  if (e.getTime() < s.getTime()) return null;
  let months = (e.getFullYear() - s.getFullYear()) * 12 + (e.getMonth() - s.getMonth());
  // 종료일이 시작일 "일자보다 크거나 같으면" · 1개월 더 인정 (예 2026-01-01 ~ 2026-01-31 → 1개월)
  if (e.getDate() >= s.getDate() - 1) months += 1;
  return months > 0 ? months : null;
}

// #219 · 계약 자동 라벨 산출 (근로계약서 이력 우선 · 없으면 contract_type)
//   · 총 개월 <= 4 → "계약 N개월" (amber 배지)
//   · 그 외 → contract_type 기반 (기존 contractTypeMeta 그대로 유지)
export function autoContractBadge(
  latest: { start_date?: string | null; end_date?: string | null } | null | undefined,
  contractType: string | null | undefined,
): { label: string; color: string; source: "auto" | "manual" } | null {
  if (latest) {
    const months = contractPeriodMonths(latest.start_date, latest.end_date);
    if (months != null && months <= 4) {
      return {
        label: `계약 ${months}개월`,
        color: "bg-amber-100 text-amber-800 border-amber-300",
        source: "auto",
      };
    }
  }
  const meta = contractTypeMeta(contractType);
  return meta ? { label: meta.label, color: meta.color, source: "manual" } : null;
}

// 근속기간 계산 · hire_date 기반 · "3년 2개월" · 없으면 "-"
export function calcTenure(hireDate: string | null | undefined): string {
  if (!hireDate) return "-";
  const start = new Date(hireDate);
  if (Number.isNaN(start.getTime())) return "-";
  const now = new Date();
  let months = (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth());
  // 일자 보정 · 아직 이번 달의 입사일이 안 지났다면 -1
  if (now.getDate() < start.getDate()) months -= 1;
  if (months < 0) return "-";
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years === 0 && rem === 0) return "이번 달";
  if (years === 0) return `${rem}개월`;
  if (rem === 0)   return `${years}년`;
  return `${years}년 ${rem}개월`;
}

// ─── 헬퍼: 아바타 그라디언트 ────────────────────────────────────────────────
export function avatarGradient(name: string) {
  const code = [...name].reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return AVATAR_COLORS[code % AVATAR_COLORS.length];
}

// 2026-08-17 · 사용자 지시 · 성씨 하나만 크게 표시 지양 (촌스러움)
//   · 최신 트렌드 (Linear/Notion/Slack) · 이름 2글자 (성+이름 첫 글자) · 색 subtle
export function initials(name: string) {
  if (!name) return "?";
  const trimmed = name.trim();
  // Korean · 3자 이상은 성 + 이름 첫 글자 (홍길동 → 홍길)
  // 2자면 그대로 (김철 · 이순 등)
  // Latin · 두 단어면 각 첫 글자 (John Doe → JD) · 한 단어면 앞 2자
  if (/^[가-힣]/.test(trimmed)) {
    return trimmed.slice(0, 2);
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return trimmed.slice(0, 2).toUpperCase();
}
