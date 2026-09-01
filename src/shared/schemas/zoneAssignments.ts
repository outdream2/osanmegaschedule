// 2026-09-01 · 서버·클라 공유 · 구역 배정 Zod 스키마
import { z } from "zod";

const ZoneSlotsSchema = z.record(z.string(), z.unknown());

const ZoneDayBaseSchema = z.object({
  zone_slots: ZoneSlotsSchema.optional(),
  lunch_slots: ZoneSlotsSchema.optional(),
  rest_slots: ZoneSlotsSchema.optional(),
  lunch_offset: z.number().optional(),
  rest_offset: z.number().optional(),
  lunch_interval: z.number().optional(),
  rest_interval: z.number().optional(),
  lunch_count: z.number().int().optional(),
  rest_count: z.number().int().optional(),
});

/** PUT /api/zone-assignments/:dow · 요일 템플릿 upsert */
export const UpsertZoneAssignmentDowSchema = ZoneDayBaseSchema;
export type UpsertZoneAssignmentDowInput = z.infer<typeof UpsertZoneAssignmentDowSchema>;

/** PUT /api/zone-day/:date · 날짜별 배정 upsert */
export const UpsertZoneDaySchema = ZoneDayBaseSchema.extend({
  is_confirmed: z.boolean().optional(),
});
export type UpsertZoneDayInput = z.infer<typeof UpsertZoneDaySchema>;

/** POST /api/zone-day/copy-month · 전월 복사 */
export const CopyZoneDayMonthSchema = z.object({
  targetYear: z.number().int().min(2020).max(2100),
  targetMonth: z.number().int().min(1).max(12),
  overwrite: z.boolean().optional(),
});
export type CopyZoneDayMonthInput = z.infer<typeof CopyZoneDayMonthSchema>;
