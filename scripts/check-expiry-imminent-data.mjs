// scripts/check-expiry-imminent-data.mjs
// 2026-09-10 · #36 · 유통기한 임박 리스트 · DB 값 존재 여부 조사
//   · products.expiry_date IS NOT NULL · hidden=false · 개수
//   · D-day 분포 · (만료·오늘·D-30·D-60·D-90·정상)
//   · inventory_checks.expiry_date · 별도 저장 여부
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const today = new Date();
today.setHours(0, 0, 0, 0);
const todayISO = today.toISOString().slice(0, 10);

console.log(`━━━ 유통기한 임박 · DB 값 조사 (today=${todayISO}) ━━━\n`);

// A. products.expiry_date 조사
console.log("[A] products.expiry_date · 전체 상품 스캔");
const all = [];
const PAGE = 1000;
let from = 0;
while (true) {
  const { data, error } = await supabase
    .from("products")
    .select("product_code, product_name, expiry_date, hidden, sale_status")
    .range(from, from + PAGE - 1);
  if (error) { console.error("  ERROR:", error.message); break; }
  if (!data || data.length === 0) break;
  all.push(...data);
  if (data.length < PAGE) break;
  from += PAGE;
}
console.log(`  total products · ${all.length}`);

const withExpiry = all.filter(p => p.expiry_date);
console.log(`  expiry_date IS NOT NULL · ${withExpiry.length}`);

const withExpiryVisible = withExpiry.filter(p => p.hidden !== true);
console.log(`  expiry_date + hidden=false · ${withExpiryVisible.length}`);
console.log(`  ↑ endpoint /api/products/expiry-imminent · 예상 응답 개수 (limit 500 캡)\n`);

// B. D-day 분포
const buckets = { expired: 0, today: 0, d30: 0, d60: 0, d90: 0, normal: 0 };
for (const p of withExpiryVisible) {
  const exp = new Date(String(p.expiry_date).slice(0, 10) + "T00:00:00");
  const d = Math.round((exp.getTime() - today.getTime()) / 86400_000);
  if (d < 0) buckets.expired++;
  else if (d === 0) buckets.today++;
  else if (d <= 30) buckets.d30++;
  else if (d <= 60) buckets.d60++;
  else if (d <= 90) buckets.d90++;
  else buckets.normal++;
}
console.log("[B] D-day 분포 (visible only)");
console.log(`  만료 (d<0)      · ${buckets.expired}`);
console.log(`  오늘 (d=0)      · ${buckets.today}`);
console.log(`  임박 (d≤30)    · ${buckets.d30}`);
console.log(`  D-60           · ${buckets.d60}`);
console.log(`  D-90           · ${buckets.d90}`);
console.log(`  정상 (d>90)    · ${buckets.normal}`);
console.log(`  임박 합계 (만료+오늘+D30) · ${buckets.expired + buckets.today + buckets.d30}\n`);

// C. 판매중 필터 확인 (frontend saleMatches)
const withExpirySaleActive = withExpiryVisible.filter(p => {
  const s = String(p.sale_status ?? "").trim();
  return s === "판매중" || s === "" || s === "선택";
});
console.log("[C] 판매중 필터 (frontend 3-way filter 기본값)");
console.log(`  판매중·미지정 · ${withExpirySaleActive.length}`);
console.log(`  판매중지        · ${withExpiryVisible.length - withExpirySaleActive.length}\n`);

// D. inventory_checks.expiry_date · 별도 저장 여부
console.log("[D] inventory_checks.expiry_date · 저장 여부");
const { data: icData, error: icErr } = await supabase
  .from("inventory_checks")
  .select("product_code, expiry_date, expiry_input_date")
  .not("expiry_date", "is", null)
  .limit(1000);
if (icErr) console.log(`  ERROR · ${icErr.message}`);
else {
  console.log(`  inventory_checks · expiry_date NOT NULL · ${icData?.length ?? 0}`);
  if (icData && icData.length > 0) {
    console.log(`  sample:`, icData.slice(0, 3));
  }
}

// E. Sample · 임박 상품 top 10
console.log("\n[E] 임박 상품 top 10 (d≤30)");
const imminent = withExpiryVisible
  .map(p => ({
    ...p,
    d: Math.round((new Date(String(p.expiry_date).slice(0, 10) + "T00:00:00").getTime() - today.getTime()) / 86400_000),
  }))
  .filter(p => p.d <= 30)
  .sort((a, b) => a.d - b.d)
  .slice(0, 10);
for (const p of imminent) {
  console.log(`  ${p.expiry_date} · d=${p.d} · ${p.product_code} · ${p.product_name?.slice(0, 30)}`);
}

console.log("\n━━━ 조사 완료 ━━━");
