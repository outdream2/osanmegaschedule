// src/lib/shelfPositions.ts
// 2026-09-08 · 상세 진열위치 표시·조회 헬퍼
//   · shelf_positions JSON · key=location code · value=3자리 or null
//   · storage_locations KV · location code → name·kind·required_detail 매핑
//   · UI 32개 파일에서 진열위치 옆에 뱃지로 표시 · 매장 미입력 빨간 강조

import type { StorageLocation } from "@/shared/schemas/settings";

export type ShelfPositions = Record<string, string | null | undefined>;

export interface FormattedShelfPosition {
  code: string;                        // "store1" · "warehouse1"
  name: string;                        // "매장1" · "창고1"
  kind: "store" | "warehouse";
  detail: string | null;               // "332" or null
  isMissing: boolean;                  // 매장이면서 미입력 (빨간 강조 대상)
}

/** shelf_positions + storage_locations → 표시용 정렬 리스트
 *  · storage_locations sort_order 순 · active=true 만
 *  · 값이 없어도 shelf_positions 에 key 있으면 포함 (미입력 뱃지)
 *  · 값이 없고 key 도 없으면 · 제외 (해당 위치 미보유)
 */
export function formatShelfPositions(
  shelf: ShelfPositions | null | undefined,
  locations: StorageLocation[],
): FormattedShelfPosition[] {
  if (!locations?.length) return [];
  const posMap = (shelf ?? {}) as ShelfPositions;
  const activeLocs = locations.filter(l => l.active).sort((a, b) => a.sort_order - b.sort_order);
  const out: FormattedShelfPosition[] = [];
  for (const loc of activeLocs) {
    const hasKey = Object.prototype.hasOwnProperty.call(posMap, loc.code);
    if (!hasKey) continue;
    const raw = posMap[loc.code];
    const detail = typeof raw === "string" && raw.length === 3 ? raw : null;
    out.push({
      code: loc.code,
      name: loc.name,
      kind: loc.kind,
      detail,
      isMissing: loc.required_detail && !detail,
    });
  }
  return out;
}

/** 짧은 문자열 요약 · "매장1:332 · 매장2:212 · 창고1"
 *  · null 값은 "미입력" 대신 그냥 이름만 표시 (공간 절약)
 */
export function summarizeShelfPositions(list: FormattedShelfPosition[]): string {
  return list
    .map(p => (p.detail ? `${p.name}:${p.detail}` : p.isMissing ? `${p.name}:미입력` : p.name))
    .join(" · ");
}
