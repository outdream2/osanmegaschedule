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
 *
 * 2026-10-07 · PHASE 3B · F-2 · N 사원 batch 를 1건 IN(...) 쿼리로 통합
 *   · 기존: 사원 수만큼 순차 DB round-trip (19명 batch → 19 × ~90ms = ~1.7s)
 *   · 개선: 단일 SELECT ... IN (id1,id2,...) · 메모리 검사 (~90ms + O(n) check)
 *   · semantics 유지: 사원별 최대 날짜 기준 · retireDate 과거이고 maxDate>retire → 409
 *   · 미존재 사원 → 404 (기존과 동일 · 첫 missing emp 로 throw)
 *   · DB 오류 → fail-open (기존 lock guard semantics 유지)
 *   · 입력 pairs 가 비어 있으면 즉시 리턴
 */
export async function assertEmployeesActiveForWrite(
  pairs: Array<{ employeeId: number; date: string }>,
): Promise<void> {
  if (!Array.isArray(pairs) || pairs.length === 0) return;
  // 사원별 최대 target date 집계 (중복 자동 제거)
  const maxByEmp = new Map<number, string>();
  for (const p of pairs) {
    const empId = Number(p.employeeId);
    const d = String(p.date ?? "").slice(0, 10);
    if (!Number.isFinite(empId) || empId <= 0) {
      throw new HttpError(400, "유효하지 않은 직원 ID", "INVALID_EMPLOYEE_ID");
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue; // 날짜 형식 이상은 skip (상위 Zod 가 검증)
    const cur = maxByEmp.get(empId);
    if (!cur || d > cur) maxByEmp.set(empId, d);
  }
  if (maxByEmp.size === 0) return;

  const ids = Array.from(maxByEmp.keys());
  const { data, error } = await supabase
    .from("employees")
    .select('id, name, "retireDate"')
    .in("id", ids);
  if (error) {
    logger.warn(`[employee-active] batch 조회 실패 · ids=${ids.join(",")} · ${error.message} · 검증 skip`);
    return; // fail-open · 단일 버전과 동일 semantics
  }

  const retireMap = new Map<number, { name: string | null; retire: string }>();
  for (const row of (data ?? [])) {
    const r = row as { id: number; name: string | null; retireDate: string | null };
    retireMap.set(Number(r.id), {
      name: r.name,
      retire: String(r.retireDate ?? "").slice(0, 10),
    });
  }

  for (const [empId, maxDate] of maxByEmp) {
    const found = retireMap.get(empId);
    if (!found) {
      throw new HttpError(404, `직원을 찾을 수 없습니다 (id=${empId})`, "EMPLOYEE_NOT_FOUND");
    }
    const retire = found.retire;
    if (retire && /^\d{4}-\d{2}-\d{2}$/.test(retire) && maxDate > retire) {
      throw new HttpError(
        409,
        `퇴직한 직원의 ${maxDate} 스케줄은 생성/수정할 수 없습니다 · ${found.name ?? ""} · 퇴직일 ${retire}`,
        "EMPLOYEE_RETIRED",
      );
    }
  }
}
