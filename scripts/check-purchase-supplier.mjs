// 매입상세(purchase_details) 에서 경방신약 관련 데이터 진단
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;
const sb = createClient(url, key);

console.log("\n=== purchase_details · 경방신약 관련 조회 ===\n");

// 1) supplier_name 부분일치
const { data: bySup, error: err1 } = await sb
  .from("purchase_details")
  .select("id, purchase_date, supplier_name, product_name, quantity, amount")
  .ilike("supplier_name", "%경방%")
  .order("purchase_date", { ascending: false })
  .limit(20);
if (err1) console.error("[X]", err1.message);
console.log(`[1] supplier_name ilike '%경방%': ${bySup?.length ?? 0}건`);
(bySup ?? []).slice(0, 10).forEach((r, i) => console.log(`  ${i + 1}. [${r.purchase_date}] ${r.supplier_name} · ${r.product_name} · 수량 ${r.quantity} · 금액 ${r.amount}`));

// 2) 정확 매칭
const exactCandidates = ["경방신약", "경방신약(주)", "(주)경방신약", "경방신약주식회사"];
for (const s of exactCandidates) {
  const { data } = await sb.from("purchase_details").select("id", { count: "exact", head: true }).eq("supplier_name", s);
  console.log(`  ▪ 정확 매칭 "${s}": (일부 데이터만 head 조회)`);
}

// 3) ocr_confirmed_items 에는?
console.log("\n=== ocr_confirmed_items · 경방신약 ===");
const { data: byConf } = await sb
  .from("ocr_confirmed_items")
  .select("id, saved_at, supplier, product_name, quantity, amount")
  .ilike("supplier", "%경방%")
  .order("saved_at", { ascending: false })
  .limit(20);
console.log(`[2] ocr_confirmed_items ilike '%경방%': ${byConf?.length ?? 0}건`);
(byConf ?? []).slice(0, 10).forEach((r, i) => console.log(`  ${i + 1}. [${r.saved_at}] ${r.supplier} · ${r.product_name} · 수량 ${r.quantity} · 금액 ${r.amount}`));

// 4) 전체 supplier_name 종류 (샘플)
console.log("\n=== purchase_details · 전체 공급사명 상위 20종 (건수 기준) ===");
const { data: allSup } = await sb.from("purchase_details").select("supplier_name").limit(10000);
const cnt = new Map();
for (const r of allSup ?? []) {
  const s = String(r.supplier_name ?? "").trim();
  if (!s) continue;
  cnt.set(s, (cnt.get(s) ?? 0) + 1);
}
[...cnt.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([s, c], i) => {
  console.log(`  ${i + 1}. ${c}건 · "${s}"`);
});
