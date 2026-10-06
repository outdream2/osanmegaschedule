// 2026-10-06 · PHASE 1 · schedule lock 공통 guard
//   · 모든 schedule writer 가 공유하는 단일 lock 검증 함수
//   · 기존 routes/schedule/schedules.ts 안의 assertScheduleNotLocked 를 라이브러리로 승격
//   · 호출자: PUT/POST /api/schedules · leave approval · leave delete cleanup · 등
//   · lv ≥ 9 bypass (긴급 수정) · 기존 semantics 유지
//   · DB 오류는 fail-open (서비스 중단 방지) · 기존 semantics 유지
//
// 사용 패턴:
//   await assertScheduleNotLocked("2026-10", authLevel);
//   await assertScheduleNotLockedForDates(["2026-10-01","2026-10-02"], authLevel);
import { supabase } from "../../src/supabase/client";
import { HttpError } from "../middleware/errorHandler";
import logger from "./logger";

/**
 * 월(YYYY-MM) 단위 schedule lock 검증.
 * - authLevel ≥ 9 → bypass (관리자 긴급 수정)
 * - lock=true 이고 authLevel < 9 → HttpError(403, SCHEDULE_LOCKED)
 * - DB 조회 오류 → fail-open (경고 로그만 남기고 통과)
 */
export async function assertScheduleNotLocked(yearMonth: string, authLevel: number): Promise<void> {
  if (authLevel >= 9) return; // 관리자 bypass
  if (!yearMonth || typeof yearMonth !== "string") return; // 비정상 입력 fail-open
  const key = `schedule_lock_${yearMonth}`;
  const { data, error } = await supabase
    .from("app_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (error) {
    logger.warn(`[schedule-lock] app_settings 조회 실패 · key=${key} · ${error.message} · lock 검증 skip`);
    return;
  }
  if (data?.value === true) {
    logger.warn(`[schedule-lock] LOCK 위반 시도 · key=${key} · authLevel=${authLevel}`);
    throw new HttpError(
      403,
      "확정된 달은 수정할 수 없습니다. 관리자(lv≥9)만 수정 가능합니다.",
      "SCHEDULE_LOCKED",
    );
  }
}

/**
 * 날짜 리스트 ("YYYY-MM-DD") 에서 고유 YYYY-MM 추출 후 각각에 대해 lock 검증.
 * 하나라도 locked 이면 즉시 403 throw.
 * - 연차 승인 (여러 날짜) · leave delete cleanup · batch upsert 등에 사용
 */
export async function assertScheduleNotLockedForDates(dates: string[], authLevel: number): Promise<void> {
  if (authLevel >= 9) return;
  const months = Array.from(
    new Set((dates ?? []).map(d => String(d ?? "").slice(0, 7)).filter(m => /^\d{4}-\d{2}$/.test(m))),
  );
  for (const ym of months) {
    await assertScheduleNotLocked(ym, authLevel);
  }
}
