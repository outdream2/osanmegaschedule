// scripts/check-display-requests-all.mjs
// 2026-09-11 · #75 · display_requests 전체 스캔 · product_code null·미매칭 확인
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const { data: reqs } = await supabase
  .from("display_requests")
  .select("id, product_code, zone_id, zone_label, status, requested_at, note, request_count")
  .order("requested_at", { ascending: false });

console.log(`display_requests 전체 · ${reqs?.length ?? 0}건\n`);

let noCodeCnt = 0, matchedCnt = 0, notMatchedCnt = 0;
const codes = (reqs ?? []).map(r => r.product_code).filter(Boolean);
const { data: prods } = await supabase
  .from("products")
  .select("product_code, product_name")
  .in("product_code", codes);
const nameMap = new Map();
for (const p of prods ?? []) nameMap.set(String(p.product_code), p.product_name);

for (const r of reqs ?? []) {
  if (!r.product_code) {
    noCodeCnt++;
    console.log(`✗ code null · zone=${r.zone_label ?? r.zone_id} · status=${r.status} · note="${r.note ?? ""}"`);
  } else {
    const nm = nameMap.get(String(r.product_code));
    if (nm) {
      matchedCnt++;
      console.log(`✓ ${r.product_code} · "${nm}" · zone=${r.zone_label ?? r.zone_id} · status=${r.status}`);
    } else {
      notMatchedCnt++;
      console.log(`✗ ${r.product_code} · products 미매칭 · zone=${r.zone_label ?? r.zone_id} · note="${r.note ?? ""}"`);
    }
  }
}

console.log(`\n요약:`);
console.log(`  code 없음 · ${noCodeCnt}`);
console.log(`  products 매칭 · ${matchedCnt}`);
console.log(`  products 미매칭 · ${notMatchedCnt}`);
