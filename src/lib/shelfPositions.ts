// src/lib/shelfPositions.ts
// 2026-09-20 · buildInitialShelfPositions · SSOT → src/shared/warehouseZones.ts
//   · isValidZoneCode · WAREHOUSE_1_CODES 내부 복사 제거
//   · 나머지 UI 헬퍼 (mergeShelfPositionsWithFallback · formatShelfPositions 등) 유지
//   · 기존 import 경로 하위호환

import type { StorageLocation } from "@/shared/schemas/settings";
import { buildInitialShelfPositions as _buildInitialShelfPositions } from "@/shared/warehouseZones";

export type ShelfPositions = Record<string, string | null | undefined>;

// re-export · 기존 사용처 호환
export { buildInitialShelfPositions } from "@/shared/warehouseZones";

/**
 * shelf_positions (DB 저장값) + location (진열구역) → 렌더용 병합 결과
 *   · shelf_positions 있고 · key 있으면 그대로 사용
 *   · shelf_positions 비어있거나 · key 없으면 · location 기반 default 자리 확보 (값 null)
 *   · **계층 2 클라 폴백** · 레거시 상품 · DB 미갱신 상태에서도 UI 즉시 표시
 */
export function mergeShelfPositionsWithFallback(
  shelf: ShelfPositions | null | undefined,
  location: string | null | undefined,
  categoryCode?: string | null,
): Record<string, string | null> {
  const existing = { ...(shelf ?? {}) } as Record<string, string | null>;
  const fallback = _buildInitialShelfPositions(location, categoryCode);
  for (const [k, v] of Object.entries(fallback)) {
    if (!Object.prototype.hasOwnProperty.call(existing, k)) {
      existing[k] = v;
    }
  }
  return existing;
}

/** 3자리 → 하이픈 표시 · "332" → "3-3-2" */
export function formatShelfDetail(v: string | null | undefined): string {
  if (typeof v !== "string" || v.length !== 3) return typeof v === "string" ? v : "";
  return `${v[0]}-${v[1]}-${v[2]}`;
}

export interface FormattedShelfPosition {
  code: string;
  name: string;
  kind: "store" | "warehouse";
  detail: string | null;
  isMissing: boolean;
}

/** shelf_positions + storage_locations → 표시용 정렬 리스트
 *  · storage_locations sort_order 순 · active=true 만
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

/** 짧은 문자열 요약 · "매장1:3-3-2 · 매장2:2-1-2 · 창고1" */
export function summarizeShelfPositions(list: FormattedShelfPosition[]): string {
  return list
    .map(p => (p.detail ? `${p.name}:${formatShelfDetail(p.detail)}` : p.isMissing ? `${p.name}:미입력` : p.name))
    .join(" · ");
}
