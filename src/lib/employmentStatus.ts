// 2026-08-20 · #175 · 퇴사예정 분류
//
// 원칙 (사용자 확정 · 2026-08-20):
//   · retire_date 하나로 3-state 파생 · DB 컬럼 추가 없음 (feedback_no_derived_columns)
//   · retire_date = null            → "active"                (재직)
//   · retire_date > 오늘             → "pending_resignation"   (퇴사예정 · 등록됐지만 미도래)
//   · retire_date <= 오늘            → "retired"               (퇴사)
//
// DB 저장:
//   · retire_date · employees.retire_date · 이미 DATE 컬럼 존재
//   · 상태 자체는 파생 · 별도 컬럼 불필요 · retire_date 세팅이 곧 DB 저장
//
// 사용처:
//   · EmployeeProfileCard · 배지 표시
//   · ApprovalRequestPage · 사직서 작성 서브탭 gate
//   · SideNav · 필요 시 사이드바 항목 gate

export type EmploymentStatus = "active" | "pending_resignation" | "retired";

export const EMPLOYMENT_STATUS_LABEL: Record<EmploymentStatus, string> = {
  active: "재직",
  pending_resignation: "퇴사예정",
  retired: "퇴사",
};

/**
 * retire_date 로부터 3-state 상태 파생.
 * @param retireDate YYYY-MM-DD 문자열 또는 null/undefined
 * @param today 기준일 (기본: 오늘) · 테스트 편의
 * @returns "active" (null) · "pending_resignation" (미래) · "retired" (오늘 이하)
 */
export function getEmploymentStatus(
  retireDate: string | null | undefined,
  today: Date = new Date(),
): EmploymentStatus {
  if (!retireDate) return "active";
  const trimmed = String(retireDate).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return "active";
  const todayYmd = ymdOf(today);
  return trimmed > todayYmd ? "pending_resignation" : "retired";
}

/** Date → "YYYY-MM-DD" (로컬 타임존 기준) */
function ymdOf(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** 사직서 작성 가능 여부 · 퇴사예정 상태만 허용 */
export function canWriteResignation(retireDate: string | null | undefined, today?: Date): boolean {
  return getEmploymentStatus(retireDate, today) === "pending_resignation";
}
