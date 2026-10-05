// 2026-09-15 · T-SP-BULK · 실재고 저장 · shelf_positions 병합 로직 · 공용 헬퍼
//   · POST /api/inventory-checks (단건) · POST /api/inventory-checks/bulk 공용 사용
//   · 대원칙 · 공통 기능 = 단일 endpoint · shared helper 로 로직 통일
//
// 동작:
//   1. mergeShelfPositions · 기존 shelf_positions JSONB + 신규 병합
//      · undefined 무시 (부분 업데이트) · null/빈 문자열 → 값 clear (required_detail 예외)
//      · 문자열은 uppercase + 3자리 (0-9A-Z) 강제
//      · required_detail 인 매장 code 에 빈 문자열이 오면 · badRequest
//   2. checkShelfPositionConflicts · (display_location, key, value) 3중 유일 pre-check
//      · 신규로 바뀐 값에 대해서만 조회 (기존 값 유지 시 skip)
//      · 다른 상품이 · 같은 display_location + 같은 key + 같은 value 조합이면 · badRequest

import { supabase } from "../../../src/supabase/client";
import { badRequest } from "../../middleware/errorHandler";
import type { StorageLocation } from "../../../src/shared/schemas/settings";

export type ShelfPositionMap = Record<string, string | null>;
export type IncomingShelfPositionMap = Record<string, string | null | undefined>;

/** 신규로 바뀐 (key, value) · 중복 pre-check 대상 */
export interface DupCheckTarget {
  key: string;
  value: string;
}

export interface MergeShelfPositionsResult {
  merged: ShelfPositionMap;
  dupCheckTargets: DupCheckTarget[];
}

/**
 * shelf_positions 병합
 *   · existingPos · 기존 저장값 (DB에서 조회한 JSONB · 없으면 {})
 *   · incomingPos · 요청 payload · 부분 업데이트 · undefined 는 skip
 *   · storageLocs · storage_locations 마스터 · required_detail 판정용
 *
 * 예:
 *   existing = { store1: "332", warehouse1: null }
 *   incoming = { store2: "445", warehouse1: "112" }
 *   → merged = { store1: "332", warehouse1: "112", store2: "445" }
 *   → dupCheckTargets = [{ key: "warehouse1", value: "112" }, { key: "store2", value: "445" }]
 */
export function mergeShelfPositions(
  existingPos: ShelfPositionMap,
  incomingPos: IncomingShelfPositionMap,
  storageLocs: StorageLocation[],
): MergeShelfPositionsResult {
  const merged: ShelfPositionMap = { ...existingPos };
  const requiredCodes = new Set(
    storageLocs.filter(s => s.required_detail && s.active).map(s => s.code)
  );
  const dupCheckTargets: DupCheckTarget[] = [];

  for (const [k, v] of Object.entries(incomingPos)) {
    if (v === undefined) continue; // 부분 업데이트 · 미지정 필드 skip
    if (v === null || v === "") {
      // 빈 문자열 · required_detail 이면 · 매장 필수 위반
      if (requiredCodes.has(k) && v === "") {
        throw badRequest(`매장 위치(${k})는 상세위치가 필수입니다 · 3자리 (예 332) 입력`);
      }
      merged[k] = null;
    } else {
      const val = String(v).trim().toUpperCase();
      if (!/^[0-9A-Z]{3}$/.test(val)) {
        throw badRequest(`상세위치(${k}=${val})는 3자리 (층·칸·순서 · 예 332) 여야 합니다`);
      }
      if (existingPos[k] !== val) dupCheckTargets.push({ key: k, value: val });
      merged[k] = val;
    }
  }
  return { merged, dupCheckTargets };
}

/**
 * (display_location, key, value) 3중 유일 pre-check
 *   · productCode · 자기 자신 (제외)
 *   · currentDisplayLoc · 현재 상품의 display_location (없으면 skip · 검증 불가)
 *   · dupCheckTargets · 신규로 바뀐 (key, value) 목록
 *
 * 다른 상품이 · 같은 display_location · 같은 key · 같은 value 조합이면 · badRequest
 */
export async function checkShelfPositionConflicts(
  productCode: string,
  currentDisplayLoc: string | null,
  dupCheckTargets: DupCheckTarget[],
): Promise<void> {
  if (!currentDisplayLoc || dupCheckTargets.length === 0) return;

  for (const { key, value } of dupCheckTargets) {
    const { data: conflicts } = await supabase
      .from("inventory_checks")
      .select("product_code, product_name, shelf_positions")
      .filter("shelf_positions->>" + key, "eq", value)
      .neq("product_code", productCode);
    if (!conflicts || conflicts.length === 0) continue;

    const otherCodes = conflicts.map(c => String((c as any).product_code));
    const { data: otherProds } = await supabase
      .from("products")
      .select("product_code, product_name, display_location")
      .in("product_code", otherCodes);
    const conflictOther = (otherProds ?? []).find(op => {
      const otherLoc = (op as any).display_location ?? null;
      return String(otherLoc ?? "").trim() === String(currentDisplayLoc).trim();
    });
    if (conflictOther) {
      throw badRequest(
        `이 위치는 이미 사용 중입니다 · ${currentDisplayLoc}-${value} (${key}) · 기존 상품 · ${(conflictOther as any).product_name} (#${(conflictOther as any).product_code})`
      );
    }
  }
}

/** products 테이블에서 display_location 조회 */
// 2026-10-04 · schema fix · products.location column 없음 · display_location 단독
export async function fetchProductDisplayLoc(productCode: string): Promise<string | null> {
  const { data } = await supabase
    .from("products")
    .select("display_location")
    .eq("product_code", productCode)
    .maybeSingle();
  return (data as any)?.display_location ?? null;
}
