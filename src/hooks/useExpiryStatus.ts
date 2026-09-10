// src/hooks/useExpiryStatus.ts
// 2026-09-10 · #36 · 유통기한 임박 판정 · 공통 훅
//   · 사용자 지시 · 유의기간 6-12개월 · 실제 만료일 (products.expiry_date) 기준
//   · D-180 이내 · 임박 (빨강 강조) · D-365 이내 · 유의 (앰버) · 만료 · 진한 빨강
//   · 해제 · expiry_date = NULL 리셋 (별도 dismiss 컬럼 없음)

export type ExpiryLevel = "none" | "normal" | "watch" | "imminent" | "expired";

export interface ExpiryStatus {
  level: ExpiryLevel;
  dDay: number | null;      // 오늘 vs expiry_date · D-day (미래 양수 · 만료 음수)
  isImminent: boolean;      // 임박 or 만료
  isWatch: boolean;         // 유의
  label: string;            // 예: "D-30", "만료 5일 지남", "오늘 만료"
  colorClass: string;       // Tailwind text·bg·border 통합 클래스
  hasExpiry: boolean;
}

const DAY_MS = 86_400_000;

/**
 * 유통기한 상태 훅 · 단순 함수 (state 없음 · 순수 계산)
 * @param expiryDate ISO date string · products.expiry_date · null 허용 (해제 상태)
 */
export function useExpiryStatus(
  expiryDate: string | null | undefined,
): ExpiryStatus {
  if (!expiryDate) {
    return {
      level: "none",
      dDay: null,
      isImminent: false,
      isWatch: false,
      label: "",
      colorClass: "",
      hasExpiry: false,
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let dDay: number | null = null;
  try {
    const exp = new Date(String(expiryDate).slice(0, 10) + "T00:00:00");
    dDay = Math.round((exp.getTime() - today.getTime()) / DAY_MS);
  } catch {
    dDay = null;
  }

  if (dDay == null) {
    return {
      level: "none",
      dDay: null,
      isImminent: false,
      isWatch: false,
      label: "",
      colorClass: "",
      hasExpiry: true,
    };
  }

  // 만료
  if (dDay < 0) {
    return {
      level: "expired",
      dDay,
      isImminent: true,
      isWatch: false,
      label: `만료 ${Math.abs(dDay)}일 지남`,
      colorClass: "text-red-800 bg-red-100 border-red-300",
      hasExpiry: true,
    };
  }

  // 오늘 만료
  if (dDay === 0) {
    return {
      level: "imminent",
      dDay,
      isImminent: true,
      isWatch: false,
      label: "오늘 만료",
      colorClass: "text-red-700 bg-red-50 border-red-300",
      hasExpiry: true,
    };
  }

  // 임박 · D-180 이내
  if (dDay <= 180) {
    return {
      level: "imminent",
      dDay,
      isImminent: true,
      isWatch: false,
      label: `D-${dDay}`,
      colorClass: "text-red-700 bg-red-50 border-red-200",
      hasExpiry: true,
    };
  }

  // 유의 · D-181~D-365
  if (dDay <= 365) {
    return {
      level: "watch",
      dDay,
      isImminent: false,
      isWatch: true,
      label: `D-${dDay}`,
      colorClass: "text-amber-700 bg-amber-50 border-amber-200",
      hasExpiry: true,
    };
  }

  // 정상 · D>365 · 표시 없음
  return {
    level: "normal",
    dDay,
    isImminent: false,
    isWatch: false,
    label: `D-${dDay}`,
    colorClass: "text-emerald-700 bg-emerald-50 border-emerald-200",
    hasExpiry: true,
  };
}
