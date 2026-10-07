// 2026-10-07 · PHASE 3A · 퇴직 직원 신규 write 차단 helper
//   · 사용자 지시 · ACTIVE/RETIRED/HISTORICAL 분리
//   · 과거 날짜 schedule / historical leave 조회는 유지 (DELETE 금지)
//   · 신규 write (신규 schedule 생성 · 신규 leave 신청) 는 차단
//
// 사용 패턴:
//   await assertEmployeeActiveForWrite(employeeId, "YYYY-MM-DD");
//     · retireDate 가 null  → 활성 → 통과
//     · retireDate 가 미래  → 활성 → 통과
//     · retireDate 가 과거/오늘  AND target 날짜 > retireDate → 409 EMPLOYEE_RETIRED
//     · retireDate 가 과거  AND target 날짜 ≤ retireDate (historical) → 통과 (과거 보정 허용)
//
//   · 미존재 직원 → 404 EMPLOYEE_NOT_FOUND
//   · DB 오류 → fail-open (서비스 중단 방지 · 기존 lock guard 와 동일 정책)

import { supabase } from "../../src/supabase/client";
import { HttpError } from "../middleware/errorHandler";
import logger from "./logger";

export async function assertEmployeeActiveForWrite(
  employeeId: number,
  targetDate: string,
): Promise<void> {
  if (!Number.isFinite(employeeId) || employeeId <= 0) {
    throw new HttpError(400, "유효하지 않은 직원 ID", "INVALID_EMPLOYEE_ID");
  }
  const target = String(targetDate ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(target)) {
    // date 형식 이상 · lock guard 와 동일하게 skip (상위 Zod 가 이미 검증)
    return;
  }

  const { data, error } = await supabase
    .from("employees")
    .select('id, name, "retireDate", "hireDate"')
    .eq("id", employeeId)
    .maybeSingle();
  if (error) {
    logger.warn(`[employee-active] 조회 실패 · id=${employeeId} · ${error.message} · 검증 skip`);
    return;
  }
  if (!data) {
    throw new HttpError(404, `직원을 찾을 수 없습니다 (id=${employeeId})`, "EMPLOYEE_NOT_FOUND");
  }

  const retire = String(data.retireDate ?? "").slice(0, 10);
  if (retire && /^\d{4}-\d{2}-\d{2}$/.test(retire)) {
    // target > retire → 퇴직 이후 · 신규 write 차단
    if (target > retire) {
      throw new HttpError(
        409,
        `퇴직한 직원의 ${target} 스케줄은 생성/수정할 수 없습니다 · ${data.name ?? ""} · 퇴직일 ${retire}`,
        "EMPLOYEE_RETIRED",
      );
    }
  }
}

/**
 * 복수 직원 · 복수 날짜 일괄 검증 (batch upsert · leave 신청 날짜범위용).
 * 하나라도 EMPLOYEE_RETIRED 면 즉시 throw.
 */
export async function assertEmployeesActiveForWrite(
  pairs: Array<{ employeeId: number; date: string }>,
): Promise<void> {
  // 중복 (employeeId, date) 제거
  const seen = new Set<string>();
  const dedupPairs = pairs.filter(p => {
    const k = `${p.employeeId}|${String(p.date ?? "").slice(0, 10)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  // 직원별 최대 target date 만 사용 (더 큰 날짜가 통과하면 작은 날짜도 자동 통과)
  const maxByEmp = new Map<number, string>();
  for (const p of dedupPairs) {
    const d = String(p.date ?? "").slice(0, 10);
    const cur = maxByEmp.get(p.employeeId);
    if (!cur || d > cur) maxByEmp.set(p.employeeId, d);
  }
  for (const [empId, maxDate] of maxByEmp) {
    await assertEmployeeActiveForWrite(empId, maxDate);
  }
}
