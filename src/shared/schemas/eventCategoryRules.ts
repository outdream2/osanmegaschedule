// src/shared/schemas/eventCategoryRules.ts
// 2026-09-21 · #330 · 발주·판매 추천 관리자 편집 UI · Zod 스키마
//   · 서버·클라 공유 · KV app_settings.event_category_rules JSON 구조 검증
//   · SSOT · src/lib/salesRecommendation/eventCategoryRules.ts 와 동일 shape
import { z } from "zod";

/** 지원되는 이벤트 타입 (custom 제외 · custom 은 event_products 수동 매핑) */
export const SALES_RECO_EVENT_TYPES = [
  "spring",
  "summer",
  "fall",
  "winter",
  "holiday",
  "school",
] as const;

export const SalesRecoEventTypeSchema = z.enum(SALES_RECO_EVENT_TYPES);

/** 개별 이벤트 규칙 · SSOT 하드코딩 형태와 1:1 매핑 */
export const EventCategoryRuleSchema = z.object({
  eventType: SalesRecoEventTypeSchema,
  triggerBefore: z.number().int().min(1).max(60),
  categories: z.array(z.string().min(1).max(30)).min(1).max(30),
  weights: z.record(z.string().min(1).max(30), z.number().min(0.1).max(10)).optional(),
  reason: z.string().min(3).max(200),
});
export type EventCategoryRuleInput = z.infer<typeof EventCategoryRuleSchema>;

/** 저수기 · 매출 저점 구간 (2월·8월 초 등) */
export const OffSeasonRangeSchema = z.object({
  monthStart: z.number().int().min(1).max(12),
  monthEnd: z.number().int().min(1).max(12),
  dayEnd: z.number().int().min(1).max(31).optional(),
  label: z.string().min(1).max(50),
  reason: z.string().min(3).max(200),
});
export type OffSeasonRangeInput = z.infer<typeof OffSeasonRangeSchema>;

/** POST /api/settings/event-category-rules · 전체 스펙 */
export const EventCategoryRulesPayloadSchema = z.object({
  rules: z.array(EventCategoryRuleSchema).max(20),
  offSeason: z.array(OffSeasonRangeSchema).max(20),
});
export type EventCategoryRulesPayload = z.infer<typeof EventCategoryRulesPayloadSchema>;
