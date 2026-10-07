// src/lib/shelfPositions.ts
// 2026-09-20 · buildInitialShelfPositions · SSOT → src/shared/warehouseZones.ts
//   · isValidZoneCode · WAREHOUSE_1_CODES 내부 복사 제거
//   · 나머지 UI 헬퍼 (mergeShelfPositionsWithFallback · formatShelfPositions 등) 유지
//   · 기존 import 경로 하위호환
// 2026-10-07 · 사용자 지시 · 현재 진열위치 compact label (structured position 입력용)
//   · formatShelfZoneLabel(position)
//   · summarizeShelfZoneLabels(positions)
//   · 공유 normalization = formatDisplayLocation.ts/normalizeShelfZoneLabel

import type { StorageLocation } from "@/shared/schemas/settings";
import { buildInitialShelfPositions as _buildInitialShelfPositions } from "@/shared/warehouseZones";
import { normalizeShelfZoneLabel } from "./formatDisplayLocation";

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

// ───────────────────────────────────────────────────────────────────────────
// 2026-10-07 · 사용자 지시 · 현재 진열위치 compact label (structured input SSOT)
// ───────────────────────────────────────────────────────────────────────────
//
// 입력: 한 position (대분류 + 중분류 가진 object)
// 출력: compact label ("9A" "21" "뷰티1")
//
// 공유 normalization = formatDisplayLocation.ts/normalizeShelfZoneLabel
// 상세 (3자리 shelf detail) 는 별개 · formatShelfDetail 유지.

/**
 * structured position 의 field 를 유연하게 읽기.
 * 실측 schema (zone_defs: {zone, category}, legacy: {major, middle}, raw: ERP string 등) 모두 허용.
 */
export interface ZoneLabelInput {
  major?: string | null;
  middle?: string | null;
  // 호환 · zone_defs/legacy 필드명 매칭 (실제 schema 와 다를 수 있어 전부 optional)
  zone?: string | null;
  category?: string | null;
  large_category?: string | null;
  section?: string | null;
}

function readMajor(p: ZoneLabelInput): string | null {
  return p.major ?? p.zone ?? p.large_category ?? p.section ?? null;
}
function readMiddle(p: ZoneLabelInput): string | null {
  return p.middle ?? p.category ?? null;
}

/**
 * 한 structured position → compact zone label.
 *
 * @example
 *   formatShelfZoneLabel({ major: "9매대", middle: "A" })   // "9A"
 *   formatShelfZoneLabel({ major: "벽", middle: "21" })      // "21"
 *   formatShelfZoneLabel({ major: "뷰티", middle: "1" })     // "뷰티1"
 *   formatShelfZoneLabel({ major: "뷰티1" })                 // "뷰티1"
 *   formatShelfZoneLabel({})                                 // ""
 */
export function formatShelfZoneLabel(position: ZoneLabelInput | null | undefined): string {
  if (!position) return "";
  const major = readMajor(position);
  const middle = readMiddle(position);
  return normalizeShelfZoneLabel(major, middle);
}

/**
 * 여러 position → " · " join compact label.
 *
 * 처리:
 *   1. 각 position → formatShelfZoneLabel
 *   2. 빈 결과 drop
 *   3. 중복 제거
 *   4. canonical sort (숫자 접두 사전식, 이름형 뒤로)
 *   5. " · " join
 *   6. 결과 비어있으면 "-"
 *
 * @example
 *   summarizeShelfZoneLabels([
 *     { major: "9매대", middle: "A" },
 *     { major: "벽", middle: "21" },
 *     { major: "뷰티", middle: "1" },
 *   ])
 *   // "9A · 21 · 뷰티1"
 */
export function summarizeShelfZoneLabels(
  positions: ReadonlyArray<ZoneLabelInput | null | undefined> | null | undefined,
): string {
  if (!positions || positions.length === 0) return "-";
  const labels: string[] = [];
  for (const p of positions) {
    const l = formatShelfZoneLabel(p);
    if (l) labels.push(l);
  }
  if (labels.length === 0) return "-";
  const uniq = Array.from(new Set(labels));
  uniq.sort((a, b) => {
    const na = a.match(/^(\d+)/)?.[1];
    const nb = b.match(/^(\d+)/)?.[1];
    if (na && nb) {
      const diff = parseInt(na, 10) - parseInt(nb, 10);
      if (diff !== 0) return diff;
      return a.localeCompare(b, "ko");
    }
    if (na && !nb) return -1;
    if (!na && nb) return 1;
    return a.localeCompare(b, "ko");
  });
  return uniq.join(" · ");
}
