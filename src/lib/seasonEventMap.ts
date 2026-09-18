// src/lib/seasonEventMap.ts
// 2026-09-18 · SeasonKey ↔ event.type 매핑 유틸
//   · 프론트 SeasonKey ("autumn") ↔ 서버 event.type ("fall") 정합
//   · 계절 정의 탭 · 계절별 추천 상품 매핑 UI 공통 사용
import type { SeasonKey } from "../hooks/useSeasonRanges";

// event.type · 서버 스키마 상수 (spring / summer / fall / winter / holiday / school / custom)
export type EventSeasonType = "spring" | "summer" | "fall" | "winter";

/** SeasonKey → event.type (autumn ↔ fall) */
export function seasonKeyToEventType(key: SeasonKey): EventSeasonType {
  return key === "autumn" ? "fall" : (key as EventSeasonType);
}

/** event.type → SeasonKey (fall ↔ autumn) */
export function eventTypeToSeasonKey(type: string): SeasonKey | null {
  if (type === "spring" || type === "summer" || type === "winter") return type;
  if (type === "fall" || type === "autumn") return "autumn";
  return null;
}

/** SeasonKey · UI 라벨 (label 은 useSeasonRanges 의 SEASON_LABEL 재사용) */
export const SEASON_KEYS: readonly SeasonKey[] = ["spring", "summer", "autumn", "winter"] as const;
