// 2026-10-03 · READ ONLY · 초기 데이터 구축 전 데이터 분류 분석
//   · products 7,078 중 ERP 매칭 vs 사전설정 vs 샘플 분리
//   · purchase_details / stock_history / inventory_checks 성격 조사

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import * as dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const inv = JSON.parse(readFileSync("tools/iregen-bridge/output/inventory-full-full.json", "utf8"));
const erpNameSet = new Set(inv.tables[0].rows.map((r) => String(r.ProductName ?? "").trim()).filter(Boolean));

// ============================================================================
// 1. products 분류
// ============================================================================
console.log("===== 1. products 7,078 분류 =====\n");

// 전체 products 불러오기
const products = [];
let from = 0;
const PAGE = 1000;
while (true) {
  const { data } = await supabase
    .from("products")
    .select("product_code, product_name, supplier, sale_price, purchase_price, optimal_stock, memo, hidden, display_location, current_stock, imported_at, registered_at")
    .range(from, from + PAGE - 1);
  if (!data || data.length === 0) break;
  products.push(...data);
  if (data.length < PAGE) break;
  from += PAGE;
}
console.log(`총 products: ${products.length}`);

// 분류 bucket
let bothErp = 0;        // ERP 매칭 (ProductName)
let onlySB = 0;         // ERP 없음
let hasOptimalStock = 0; // optimal_stock > 0 입력됨 (운영 설정)
let hasMemo = 0;        // memo 입력됨
let hasHidden = 0;      // hidden=true
let hasDisplayLoc = 0;  // display_location 입력됨
let sbCategory = { erpOnly_withOperational: 0, erpOnly_noOperational: 0, bothErp_withOperational: 0, bothErp_noOperational: 0 };

for (const p of products) {
  const name = String(p.product_name ?? "").trim();
  const inERP = erpNameSet.has(name);
  const hasOp = (Number(p.optimal_stock) > 0) || (p.memo && String(p.memo).trim()) || (p.display_location && String(p.display_location).trim());
  if (inERP) bothErp++; else onlySB++;
  if (Number(p.optimal_stock) > 0) hasOptimalStock++;
  if (p.memo && String(p.memo).trim()) hasMemo++;
  if (p.hidden === true) hasHidden++;
  if (p.display_location && String(p.display_location).trim()) hasDisplayLoc++;
  if (inERP && hasOp) sbCategory.bothErp_withOperational++;
  else if (inERP) sbCategory.bothErp_noOperational++;
  else if (hasOp) sbCategory.erpOnly_withOperational++;
  else sbCategory.erpOnly_noOperational++;
}

console.log(`ERP ProductName 매칭 (Both):           ${bothErp.toLocaleString()}`);
console.log(`ERP 없음 (Supabase Only):              ${onlySB.toLocaleString()}`);
console.log("---");
console.log(`optimal_stock > 0 (운영 설정 흔적):     ${hasOptimalStock.toLocaleString()}`);
console.log(`memo 입력됨:                            ${hasMemo.toLocaleString()}`);
console.log(`hidden = true (숨김 처리):              ${hasHidden.toLocaleString()}`);
console.log(`display_location 입력됨:                ${hasDisplayLoc.toLocaleString()}`);
console.log("---");
console.log(`[A] ERP O · 운영흔적 O (REAL_PRECONFIG · 최우선 보존): ${sbCategory.bothErp_withOperational.toLocaleString()}`);
console.log(`[B] ERP O · 운영흔적 X (ERP sync 대상):                 ${sbCategory.bothErp_noOperational.toLocaleString()}`);
console.log(`[C] ERP X · 운영흔적 O (사용자 자체등록):               ${sbCategory.erpOnly_withOperational.toLocaleString()}`);
console.log(`[D] ERP X · 운영흔적 X (SAMPLE 후보):                   ${sbCategory.erpOnly_withOperational === 0 ? "0" : sbCategory.erpOnly_noOperational.toLocaleString()}`);

// imported_at 분포
console.log("\n--- imported_at 분포 (월별) ---");
const impMonth = {};
for (const p of products) {
  if (!p.imported_at) continue;
  const m = String(p.imported_at).slice(0, 7);
  impMonth[m] = (impMonth[m] || 0) + 1;
}
Object.entries(impMonth).sort().forEach(([m, c]) => console.log(`  ${m}: ${c.toLocaleString()}`));

// ============================================================================
// 2. purchase_details 성격 분석
// ============================================================================
console.log("\n\n===== 2. purchase_details 12,939 분석 =====");

const { count: totalPd } = await supabase.from("purchase_details").select("*", { count: "exact", head: true });
console.log(`총 rows: ${totalPd?.toLocaleString()}`);

const { count: verifiedCount } = await supabase
  .from("purchase_details").select("*", { count: "exact", head: true }).not("verified_by", "is", null);
console.log(`verified_by 입력 (사용자 검수 완료):  ${verifiedCount?.toLocaleString()}`);

const { count: expiryCount } = await supabase
  .from("purchase_details").select("*", { count: "exact", head: true }).not("expiry_date", "is", null);
console.log(`expiry_date 입력 (유통기한 검수):     ${expiryCount?.toLocaleString()}`);

// 날짜 분포
const { data: pdMin } = await supabase.from("purchase_details").select("purchase_date").order("purchase_date", { ascending: true }).limit(1);
const { data: pdMax } = await supabase.from("purchase_details").select("purchase_date").order("purchase_date", { ascending: false }).limit(1);
console.log(`purchase_date 범위: ${pdMin?.[0]?.purchase_date} ~ ${pdMax?.[0]?.purchase_date}`);

// imported_at 분포
const { data: pdImpMin } = await supabase.from("purchase_details").select("imported_at").order("imported_at", { ascending: true }).limit(1);
const { data: pdImpMax } = await supabase.from("purchase_details").select("imported_at").order("imported_at", { ascending: false }).limit(1);
console.log(`imported_at 범위:  ${pdImpMin?.[0]?.imported_at?.slice(0, 10)} ~ ${pdImpMax?.[0]?.imported_at?.slice(0, 10)}`);

// ============================================================================
// 3. stock_history 성격 분석
// ============================================================================
console.log("\n\n===== 3. stock_history 53,641 분석 =====");

const { count: totalSh } = await supabase.from("stock_history").select("*", { count: "exact", head: true });
console.log(`총 rows: ${totalSh?.toLocaleString()}`);

const { data: shMin } = await supabase.from("stock_history").select("snapshot_date").order("snapshot_date", { ascending: true }).limit(1);
const { data: shMax } = await supabase.from("stock_history").select("snapshot_date").order("snapshot_date", { ascending: false }).limit(1);
console.log(`snapshot_date 범위: ${shMin?.[0]?.snapshot_date} ~ ${shMax?.[0]?.snapshot_date}`);

// 월별 count (snapshot_date 기준)
const { data: shAll } = await supabase.from("stock_history").select("snapshot_date").limit(60000);
if (shAll) {
  const monthCount = {};
  for (const r of shAll) {
    const m = String(r.snapshot_date).slice(0, 7);
    monthCount[m] = (monthCount[m] || 0) + 1;
  }
  console.log("월별 분포:");
  Object.entries(monthCount).sort().forEach(([m, c]) => console.log(`  ${m}: ${c.toLocaleString()}`));
}

// ============================================================================
// 4. inventory_checks 성격 분석
// ============================================================================
console.log("\n\n===== 4. inventory_checks 3,400 분석 =====");

const { count: totalIc } = await supabase.from("inventory_checks").select("*", { count: "exact", head: true });
console.log(`총 rows: ${totalIc?.toLocaleString()}`);

const icCols = ["store1_stock", "warehouse1_stock", "warehouse2_stock", "store3_stock", "shelf_positions", "expiry_date"];
for (const col of icCols) {
  const { count } = await supabase.from("inventory_checks").select("*", { count: "exact", head: true }).not(col, "is", null);
  console.log(`  ${col.padEnd(20)} non-null: ${count?.toLocaleString()}`);
}

const { count: realCheck } = await supabase
  .from("inventory_checks").select("*", { count: "exact", head: true }).neq("checked_by", "system:backfill");
console.log(`\n사용자 수동 입력 (checked_by != 'system:backfill'): ${realCheck?.toLocaleString()}`);

// ============================================================================
// 5. vendors 분석
// ============================================================================
console.log("\n\n===== 5. vendors 156 분석 =====");
const vcolls = ["phone", "contact_name", "email", "business_number", "team_leader_name", "team_leader_phone", "emergency_contact", "note", "order_method", "approval_status"];
for (const col of vcolls) {
  const { count } = await supabase.from("vendors").select("*", { count: "exact", head: true }).not(col, "is", null);
  console.log(`  ${col.padEnd(24)} non-null: ${count?.toLocaleString() ?? "?"}`);
}

console.log("\n===== 완료 (READ ONLY) =====");
