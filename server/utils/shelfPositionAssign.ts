// 2026-09-08 · 상품 등록 시 · 구역(display_location/location) → shelf_positions 자동 초기화
//   · 창고1 코드 (6개) 검출 → shelf_positions.warehouse1 = null (진열 자리만 확보)
//   · 그 외 유효 구역 코드 → shelf_positions.warehouse2 = null
//   · 매장1 (store1) · 무조건 default 자리 확보 (사용자 지시)
//   · 값은 null · 상세위치는 이후 편집 UI 에서 사용자가 입력
//   · assignZonesToSlots (src/lib/warehouseZoneMap.ts) 와 동일한 규칙 (서버 사이드 사본)
// 2026-09-18 · 사용자 지시 · xlsx 임포트·수동 트리거 등 · 코드 재사용 위해 · bulk apply 함수 추가

import type { SupabaseClient } from "@supabase/supabase-js";

const WAREHOUSE_1_CODES = new Set<string>(["24", "25", "26", "27", "7B", "8A"]);

function isValidZoneCode(c: string): boolean {
  if (!c || c.length > 4) return false;
  const num = parseInt(c, 10);
  if (!isNaN(num) && String(num) === c) return num >= 1 && num <= 99;
  return /^[0-9A-Z]{2,4}$/.test(c);
}

/** location 문자열 (예 "26" · "26/33" · "24/33/8A") 파싱 → 자동 shelf_positions 초기값
 *  · 반환 · 매장1 (필수 default) + 창고1/2 (구역에 따라)
 *  · 각 값은 null · 상세위치는 이후 편집으로 채움
 */
export function buildInitialShelfPositions(
  location: string | null | undefined,
  categoryCode?: string | null,
): Record<string, string | null> {
  const positions: Record<string, string | null> = { store1: null };
  const codes = String(location ?? "")
    .split(/[\/,·]/)
    .map(s => s.trim().toUpperCase().replace(/\s+/g, ""))
    .filter(Boolean);
  let hasW1 = false;
  let hasW2 = false;
  for (const c of codes) {
    if (!isValidZoneCode(c)) continue;
    if (WAREHOUSE_1_CODES.has(c)) hasW1 = true;
    else hasW2 = true;
  }
  if (!hasW1 && categoryCode) {
    const cat = String(categoryCode).trim().toUpperCase().replace(/\s+/g, "");
    if (WAREHOUSE_1_CODES.has(cat)) hasW1 = true;
  }
  if (hasW1) positions.warehouse1 = null;
  if (hasW2) positions.warehouse2 = null;
  return positions;
}

// ─────────────────────────────────────────────────────────────
// 2026-09-18 · 사용자 지시 · 상품 code 배열 대상 · shelf_positions 자동 배정 (bulk)
//   · xlsx 임포트 완료 후 hook · 관리자 수동 트리거 · 공용 로직
//   · 기존 inventory_checks row 있으면 · 병합 UPDATE (신규 키만 · 사용자 값 보존)
//   · 없으면 INSERT · location 없거나 판매중지·숨김 상품 · skip
// ─────────────────────────────────────────────────────────────
export interface ApplyShelfResult {
  inserted: number;
  updated: number;
  skipped: number;
  failed: number;
  ms: number;
}

/**
 * 지정된 product_code 배열 대상 · buildInitialShelfPositions 적용
 * @param supabase supabase client
 * @param codes 처리 대상 상품 코드 (dedup 됨)
 * @param options.onlyActive 판매중 상품만 (default true) · 판매중지·숨김 skip
 * @param options.chunkSize DB 조회 chunk (default 500)
 */
export async function applyInitialShelfPositionsForCodes(
  supabase: SupabaseClient,
  codes: string[],
  options: { onlyActive?: boolean; chunkSize?: number } = {},
): Promise<ApplyShelfResult> {
  const t0 = Date.now();
  const onlyActive = options.onlyActive ?? true;
  const chunkSize = options.chunkSize ?? 500;
  const uniqueCodes = Array.from(new Set(codes.map(c => String(c ?? "").trim()).filter(Boolean)));
  if (uniqueCodes.length === 0) return { inserted: 0, updated: 0, skipped: 0, failed: 0, ms: 0 };

  // 1. products 조회 · location · category_code · sale_status
  const products: Array<{ product_code: string; product_name: string | null; location: string | null; display_location: string | null; category_code: string | null; sale_status: string | null }> = [];
  for (let i = 0; i < uniqueCodes.length; i += chunkSize) {
    const chunk = uniqueCodes.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("products")
      .select("product_code, product_name, location, display_location, category_code, sale_status")
      .in("product_code", chunk);
    if (error) {
      console.warn("[applyShelfPositions] products 조회 실패:", error.message);
      continue;
    }
    products.push(...((data ?? []) as any[]));
  }

  // 2. inventory_checks 최신 row 조회 (code 별 · checked_at desc · limit 1)
  //   supabase-js · 그룹별 latest 는 · 각 code 별 조회 or 전체 조회 후 in-memory 최신값 선별
  //   대량 (수천개) · 후자가 더 빠름
  const latestIcMap = new Map<string, { id: number; shelf_positions: Record<string, string | null> | null }>();
  for (let i = 0; i < uniqueCodes.length; i += chunkSize) {
    const chunk = uniqueCodes.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("inventory_checks")
      .select("id, product_code, shelf_positions, checked_at")
      .in("product_code", chunk)
      .order("checked_at", { ascending: false });
    if (error) {
      console.warn("[applyShelfPositions] inventory_checks 조회 실패:", error.message);
      continue;
    }
    for (const r of (data ?? []) as any[]) {
      const code = String(r.product_code ?? "").trim();
      if (!code || latestIcMap.has(code)) continue; // 이미 있으면 첫 것 (최신) 이 최종
      latestIcMap.set(code, {
        id: r.id,
        shelf_positions: (r.shelf_positions ?? {}) as Record<string, string | null>,
      });
    }
  }

  let inserted = 0, updated = 0, skipped = 0, failed = 0;
  const now = new Date().toISOString();

  for (const p of products) {
    const code = String(p.product_code ?? "").trim();
    if (!code) { skipped++; continue; }
    if (onlyActive && p.sale_status && p.sale_status !== "판매중") { skipped++; continue; }
    const loc = p.location ?? p.display_location ?? null;
    if (!loc || !String(loc).trim()) { skipped++; continue; }

    const initial = buildInitialShelfPositions(loc, p.category_code);
    const existing = latestIcMap.get(code);
    const existingPos = (existing?.shelf_positions ?? {}) as Record<string, string | null>;

    // 병합 · 기존 키 보존 · 신규 initial 키만 추가
    const merged = { ...existingPos };
    let changed = false;
    for (const [k, v] of Object.entries(initial)) {
      if (!Object.prototype.hasOwnProperty.call(merged, k)) {
        merged[k] = v;
        changed = true;
      }
    }

    if (existing) {
      if (!changed) { skipped++; continue; }
      const { error } = await supabase
        .from("inventory_checks")
        .update({ shelf_positions: merged })
        .eq("id", existing.id);
      if (error) { failed++; console.warn(`[applyShelfPositions] UPDATE 실패 · ${code} · ${error.message}`); }
      else updated++;
    } else {
      const insertRow: Record<string, unknown> = {
        product_code: code,
        product_name: p.product_name ?? "",
        shelf_positions: merged,
        checked_at: now,
        status: "pending",
        checked_by: "system:auto-init",
        warehouse1_stock: null,
        warehouse2_stock: null,
        store1_stock: null,
        store2_stock: null,
        store3_stock: null,
        system_stock: null,
        note: "",
      };
      let { error: insErr } = await supabase.from("inventory_checks").insert([insertRow]);
      // 컬럼 미존재 · strip 후 재시도
      let attempt = 0;
      while (insErr && /column .* does not exist|no column named|schema cache/i.test(insErr.message ?? "") && attempt < 6) {
        attempt++;
        const m = /column\s+(?:[a-zA-Z0-9_]+\.)?["']?([a-zA-Z0-9_]+)["']?/i.exec(insErr.message);
        const colName = m?.[1];
        if (!colName || !(colName in insertRow)) break;
        if (colName === "shelf_positions") break; // 필수 컬럼 · skip 불가
        delete insertRow[colName];
        const retry = await supabase.from("inventory_checks").insert([insertRow]);
        insErr = retry.error ?? null;
      }
      if (insErr) { failed++; console.warn(`[applyShelfPositions] INSERT 실패 · ${code} · ${insErr.message}`); }
      else inserted++;
    }
  }

  const ms = Date.now() - t0;
  return { inserted, updated, skipped, failed, ms };
}

/**
 * 전체 상품 대상 (판매중만) · shelf_positions 자동 배정
 * · 관리자 수동 트리거용 (POST /api/products/backfill-shelf-positions)
 */
export async function backfillAllShelfPositions(
  supabase: SupabaseClient,
): Promise<ApplyShelfResult> {
  // 판매중 상품 전체 code 조회
  const allCodes: string[] = [];
  const PAGE = 1000;
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("products")
      .select("product_code")
      .eq("sale_status", "판매중")
      .range(offset, offset + PAGE - 1);
    if (error) {
      console.warn("[backfillAllShelfPositions] products 조회 실패:", error.message);
      break;
    }
    if (!data || data.length === 0) break;
    for (const r of data as any[]) {
      const code = String(r.product_code ?? "").trim();
      if (code) allCodes.push(code);
    }
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  return applyInitialShelfPositionsForCodes(supabase, allCodes, { onlyActive: false }); // 이미 필터 적용
}
