// src/lib/wageResolver.ts
// 2026-10-07 · Phase 2 · 임금 결정 공통 helper
//   · 사용자 대원칙 · fallback 금지 · DB 연동 최우선
//   · 하드코드 wage (35000/40000, 10030/12000) runtime fallback 제거
//
// Priority:
//   1. settings.employeeWageOverrides[employee.id] (exact · identity = employees.id)
//   2. settings.wageRates[position] (exact · 임의 매핑/변환 금지)
//   3. UNCONFIGURED (null · 호출측 "시급 미설정" UX 결정)

import type { WageRate, AppSettings } from "../hooks/useSettings";

export type WageConfigurationStatus = "configured" | "unconfigured";
export type WageSource = "employee_override" | "base_rate" | null;

export interface WageResolution {
  status: WageConfigurationStatus;
  wage: WageRate | null;
  source: WageSource;
}

type WageSettingsLike = Pick<AppSettings, "wageRates" | "employeeWageOverrides">;

/**
 * 직원 임금 결정 · 공통 SSOT
 *
 * @param employeeId  employees.id · null 이면 override 건너뜀
 * @param position    employees.position (text) · base rate lookup key
 * @param settings    { wageRates, employeeWageOverrides } subset
 * @returns  WageResolution · configured 이면 wage 로드 완료 · unconfigured 이면 wage=null
 *
 * - override 가 0/0 이면 "미설정" 으로 간주 하지 않음 (사용자가 명시적으로 0 저장한 경우 존중)
 * - position 문자열이 빈 값이면 base rate skip
 * - 임의 position 매핑 금지 · exact key only (예: "대표" → "약사" 변환 X)
 */
export function resolveEmployeeWage(
  employeeId: number | null | undefined,
  position: string | null | undefined,
  settings: WageSettingsLike,
): WageResolution {
  // 1. employee-level override · identity = employees.id (name fallback 금지)
  if (employeeId != null && Number.isFinite(employeeId)) {
    const override = settings.employeeWageOverrides?.[employeeId];
    if (isValidWageRate(override)) {
      return {
        status: "configured",
        wage: { weekday: override.weekday, weekend: override.weekend },
        source: "employee_override",
      };
    }
  }

  // 2. position-level base rate · exact key only
  const posKey = typeof position === "string" ? position.trim() : "";
  if (posKey) {
    const base = settings.wageRates?.[posKey];
    if (isValidWageRate(base)) {
      return {
        status: "configured",
        wage: { weekday: base.weekday, weekend: base.weekend },
        source: "base_rate",
      };
    }
  }

  // 3. UNCONFIGURED · 호출측에서 UI "시급 미설정" · laborCost=unknown (not 0) 처리
  return { status: "unconfigured", wage: null, source: null };
}

function isValidWageRate(v: unknown): v is WageRate {
  return (
    typeof v === "object" && v !== null &&
    typeof (v as WageRate).weekday === "number" && Number.isFinite((v as WageRate).weekday) &&
    typeof (v as WageRate).weekend === "number" && Number.isFinite((v as WageRate).weekend)
  );
}
