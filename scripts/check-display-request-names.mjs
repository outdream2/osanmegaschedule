// scripts/check-display-request-names.mjs
// 2026-09-11 · #75 · 진열요청 · 상품명 안 나옴 · 원인 조사
//   · display_requests · product_code · JOIN products · product_name 확인
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

console.log("━━━ 진열요청 · 상품명 · 원인 조사 ━━━\n");

// 1. display_requests · 최근 20건
const { data: reqs } = await supabase
  .from("display_requests")
  .select("id, product_code, zone_id, zone_label, status, requested_at, note")
  .order("requested_at", { ascending: false })
  .limit(20);

console.log(`[A] display_requests · 최근 ${reqs?.length ?? 0}건`);
const codes = (reqs ?? []).map(r => r.product_code).filter(Boolean);
console.log(`  product_code 있음 · ${codes.length}건`);
console.log(`  product_code 없음 · ${(reqs?.length ?? 0) - codes.length}건`);

if (codes.length === 0) {
  console.log("\n· product_code 없음 · display_requests 생성 시 · code 미저장");
  process.exit(0);
}

// 2. products JOIN · product_name 확인
const { data: prods } = await supabase
  .from("products")
  .select("product_code, product_name")
  .in("product_code", codes);

const infoMap = new Map();
for (const p of prods ?? []) infoMap.set(String(p.product_code), p.product_name);

console.log(`\n[B] products JOIN · 매치 ${infoMap.size}/${codes.length}건`);

console.log("\n[C] 개별 매칭 결과:");
for (const r of reqs ?? []) {
  const c = r.product_code;
  if (!c) {
    console.log(`  id=${r.id} · code=null · zone=${r.zone_label ?? r.zone_id} · note="${r.note ?? ""}"`);
    continue;
  }
  const nm = infoMap.get(String(c));
  const status = nm ? `✓ "${nm}"` : `✗ products에 없음`;
  console.log(`  id=${r.id} · code=${c} · ${status} · zone=${r.zone_label ?? r.zone_id}`);
}

console.log("\n━━━ 완료 ━━━");
