// 2026-09-08 · A안 · 기존 상품 shelf_positions 백필 스크립트
//   · **판매중 상품만** 순회 · products.location(구역) → 자동배정 (매장1 default + 창고1/2)
//   · 판매중지·숨김 상품 · 실재고 없어야 정상 · skip
//   · 값 · null (미입력 · 사용자가 편집으로 채움)
//   · 기존 shelf_positions 에 값이 이미 있으면 · 덮어쓰지 않고 병합 (사용자 입력 보존)
//   · inventory_checks row 있으면 UPDATE · 없으면 INSERT (checked_at=now · status=pending)
//
// 실행 · node scripts/backfill-shelf-positions.mjs [--dry-run]

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnv() {
  const raw = readFileSync(".env", "utf8"); const env = {};
  for (const l of raw.split(/\r?\n/)) { const m = /^([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(l); if (m) env[m[1]] = m[2]; }
  return env;
}
const env = loadEnv();
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);
const dryRun = process.argv.includes("--dry-run");

// ─── warehouseZoneMap 로직 사본 (서버 utils/shelfPositionAssign.ts 와 동일) ───
const WAREHOUSE_1_CODES = new Set(["24", "25", "26", "27", "7B", "8A"]);

function isValidZoneCode(c) {
  if (!c || c.length > 4) return false;
  const num = parseInt(c, 10);
  if (!isNaN(num) && String(num) === c) return num >= 1 && num <= 99;
  return /^[0-9A-Z]{2,4}$/.test(c);
}

function buildInitialShelfPositions(location, categoryCode) {
  const positions = { store1: null };
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

// ─── main ──────────────────────────────────────────────────────────────────
async function main() {
  const t0 = Date.now();
  console.log(`[backfill] shelf_positions 시작 · dry-run=${dryRun}`);

  // 1) 판매중 상품만 조회 (paginated · 1000건씩)
  //   · 사용자 지시 · 판매중지·숨김은 실재고 row 없어야 정상 · 백필 대상 아님
  const products = [];
  let offset = 0;
  const PAGE = 1000;
  while (true) {
    const { data, error } = await sb
      .from("products")
      .select("product_code, location, display_location, category_code, product_name, sale_status")
      .eq("sale_status", "판매중")
      .range(offset, offset + PAGE - 1);
    if (error) { console.error("[backfill] products 조회 실패:", error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    products.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
    console.log(`  · products (판매중) 로드 ${products.length}건...`);
  }
  console.log(`[backfill] 판매중 상품 총 ${products.length}건`);

  // 2) 기존 inventory_checks 최신 row (product_code · shelf_positions) 로드
  const existingMap = new Map();  // product_code → { id, shelf_positions }
  const checks = [];
  offset = 0;
  while (true) {
    const { data, error } = await sb
      .from("inventory_checks")
      .select("id, product_code, shelf_positions, checked_at")
      .order("checked_at", { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (error) { console.error("[backfill] inventory_checks 조회 실패:", error.message); process.exit(1); }
    if (!data || data.length === 0) break;
    checks.push(...data);
    if (data.length < PAGE) break;
    offset += PAGE;
  }
  for (const r of checks) {
    const code = String(r.product_code ?? "").trim();
    if (!code || existingMap.has(code)) continue;  // 최신 row 만
    existingMap.set(code, { id: r.id, shelf_positions: r.shelf_positions ?? {} });
  }
  console.log(`[backfill] inventory_checks 최신 row · ${existingMap.size}개 상품`);

  // 3) 각 상품별 · shelf_positions 병합 (기존 값 보존) · UPDATE or INSERT
  let updated = 0, inserted = 0, skipped = 0, failed = 0;
  const now = new Date().toISOString();
  for (const p of products) {
    const code = String(p.product_code ?? "").trim();
    if (!code) { skipped++; continue; }
    const location = p.location ?? p.display_location ?? null;
    const initial = buildInitialShelfPositions(location, p.category_code);
    const existing = existingMap.get(code);
    const existingPos = (existing?.shelf_positions && typeof existing.shelf_positions === "object")
      ? existing.shelf_positions : {};

    // 병합 · 기존 키는 보존 · initial 키가 아직 없으면 추가 (값 null)
    const merged = { ...existingPos };
    let changed = false;
    for (const [k, v] of Object.entries(initial)) {
      if (!Object.prototype.hasOwnProperty.call(merged, k)) {
        merged[k] = v;
        changed = true;
      }
    }
    if (!changed) { skipped++; continue; }

    if (dryRun) {
      if (existing) updated++; else inserted++;
      continue;
    }

    if (existing) {
      const { error } = await sb
        .from("inventory_checks")
        .update({ shelf_positions: merged })
        .eq("id", existing.id);
      if (error) { failed++; console.warn(`  ! UPDATE 실패 · ${code} · ${error.message}`); }
      else updated++;
    } else {
      const { error } = await sb
        .from("inventory_checks")
        .insert([{
          product_code: code,
          product_name: p.product_name ?? "",
          shelf_positions: merged,
          checked_at: now,
          status: "pending",
          checked_by: "system:backfill",
        }]);
      if (error) { failed++; console.warn(`  ! INSERT 실패 · ${code} · ${error.message}`); }
      else inserted++;
    }

    if ((updated + inserted + skipped + failed) % 200 === 0) {
      console.log(`  · 진행 ${updated + inserted + skipped + failed} / ${products.length} · U=${updated} I=${inserted} S=${skipped} F=${failed}`);
    }
  }

  const ms = Date.now() - t0;
  console.log(`\n[backfill] 완료 · ${ms}ms`);
  console.log(`  · UPDATE   · ${updated}건 (기존 row 병합)`);
  console.log(`  · INSERT   · ${inserted}건 (신규 row 생성)`);
  console.log(`  · SKIP     · ${skipped}건 (이미 완비 · 코드 누락)`);
  console.log(`  · FAILED   · ${failed}건`);
  if (dryRun) console.log(`\n※ dry-run 모드 · 실제 저장 안 됨 · --dry-run 제거 후 재실행`);
}

main().catch(e => { console.error(e); process.exit(1); });
