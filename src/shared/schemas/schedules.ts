// 2026-08-17 · 서버·클라 공유 · 스케줄 Zod 스키마
import { z } from "zod";

/** PUT /api/schedules · 단건 스케줄 저장/수정 */
export const UpsertScheduleSchema = z.object({
  employeeId: z.number(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date YYYY-MM-DD 형식"),
  type: z.string().max(20),                  // 스케줄 타입 · 빈 문자열은 삭제 신호
  workingHours: z.string().max(20).optional().default(""),
  actualHours: z.string().max(20).optional().default(""),
  memo: z.string().max(500).optional().default(""),
});
export type UpsertScheduleInput = z.infer<typeof UpsertScheduleSchema>;

/** POST /api/schedules/batch · 다건 스케줄 · 배열 */
export const BatchScheduleSchema = z.object({
  items: z.array(UpsertScheduleSchema).min(1, "저장할 스케줄이 없습니다"),
});
export type BatchScheduleInput = z.infer<typeof BatchScheduleSchema>;

/** POST /api/schedules/copy · 전월 복사 (대상 월 지정 · 서버가 자동으로 전월 계산)
 *  2026-09-03 · #60 fix · 스키마-controller 불일치 근본 fix
 *   · 클라 · executeCopyFromPreviousMonth 에서 { targetYear, targetMonth } 만 전송 (useScheduleData.ts:406)
 *   · controller · scheduleController.ts:81 · { targetYear, targetMonth } destructure
 *   · 이전 스키마 · { fromYear, fromMonth, toYear, toMonth } · 완전 불일치 → 400 · 실행 불가
 *   · 사용자 리포트 · '전월복사 안 됨'
 */
export const CopyScheduleSchema = z.object({
  targetYear: z.union([z.number(), z.string()]).transform(v => Number(v)).pipe(z.number().int().min(2020).max(2100)),
  targetMonth: z.union([z.number(), z.string()]).transform(v => Number(v)).pipe(z.number().int().min(1).max(12)),
});
export type CopyScheduleInput = z.infer<typeof CopyScheduleSchema>;
