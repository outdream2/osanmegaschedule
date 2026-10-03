// 2026-10-03 저녁 · READ ONLY · Barcode 기준 상품 재분류
//   · ERP_MATCHED / ERP_NEW / DB_ONLY / BARCODE_CONFLICT / ERP_MISSING_BARCODE / REVIEW
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import * as dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const pl = JSON.parse(readFileSync("data/snapshots/product-list-2026-10-03.json", "utf8"));
const plRows = pl.rows;

const erpByBarcode = new Map();
for (const r of plRows) {
  const bc = String(r.BarCode ?? "").trim();
  if (!bc) continue;
  erpByBarcode.set(bc, r);
}

const sb = [];
let from = 0;
while (true) {
  const { data } = await supabase.from("products")
    .select("product_code, product_name, supplier, optimal_stock, memo, display_location, hidden, sale_price, purchase_price, imported_at")
    .range(from, from + 999);
  if (!data || !data.length) break;
  for (const r of data) sb.push(r);
  if (data.length < 1000) break;
  from += 1000;
}

const hasActivity = (sbp) => {
  const o = Number(sbp.optimal_stock);
  if (!isNaN(o) && o > 0) return true;
  if (sbp.memo && String(sbp.memo).trim()) return true;
  if (sbp.display_location && String(sbp.display_location).trim()) return true;
  if (sbp.hidden === true) return true;
  return false;
};

const buckets = {
  ERP_MATCHED_ACTIVE: 0,       // Supabase 운영흔적 ✓ · ERP ↔ DB Barcode match ✓
  ERP_MATCHED_INACTIVE: 0,     // Supabase 운영흔적 X · ERP ↔ DB Barcode match ✓
  ERP_NEW: 0,                  // ERP 에만 있음 · DB 신규 INSERT 후보
  DB_ONLY_ACTIVE: 0,           // DB 에만 있음 · 운영흔적 ✓ · 자체 상품/과거 상품
  DB_ONLY_INACTIVE: 0,         // DB 에만 있음 · 운영흔적 X · REVIEW 후보
  ERP_MISSING_BARCODE: 0,      // ERP 에서 BarCode empty · 수동 매핑 필요
};

const dbOnlyActiveSamples = [];
const dbOnlyInactiveSamples = [];
const erpNewSamples = [];

const sbByCode = new Map(sb.map((r) => [String(r.product_code ?? "").trim(), r]));

for (const sbp of sb) {
  const code = String(sbp.product_code ?? "").trim();
  if (!code) continue;
  if (erpByBarcode.has(code)) {
    if (hasActivity(sbp)) buckets.ERP_MATCHED_ACTIVE++;
    else buckets.ERP_MATCHED_INACTIVE++;
  } else {
    if (hasActivity(sbp)) {
      buckets.DB_ONLY_ACTIVE++;
      if (dbOnlyActiveSamples.length < 15) dbOnlyActiveSamples.push({ code, name: String(sbp.product_name || "").slice(0, 30), optimal_stock: sbp.optimal_stock, display_location: sbp.display_location, hidden: sbp.hidden });
    } else {
      buckets.DB_ONLY_INACTIVE++;
      if (dbOnlyInactiveSamples.length < 15) dbOnlyInactiveSamples.push({ code, name: String(sbp.product_name || "").slice(0, 30), imported_at: sbp.imported_at });
    }
  }
}

for (const [bc, erp] of erpByBarcode) {
  if (!sbByCode.has(bc)) {
    buckets.ERP_NEW++;
    if (erpNewSamples.length < 15) erpNewSamples.push({ barcode: bc, pcode: erp.PCode, name: String(erp.ProductName || "").slice(0, 30), supplier: erp.CorpNameView });
  }
}

const erpNoBarcode = plRows.filter((r) => !String(r.BarCode ?? "").trim());
buckets.ERP_MISSING_BARCODE = erpNoBarcode.length;

console.log("===== Barcode 기준 상품 재분류 =====");
console.log(`Supabase products: ${sb.length}`);
console.log(`ERP Product_List: ${plRows.length}`);
console.log(`ERP BarCode non-empty: ${erpByBarcode.size}`);
console.log(``);
Object.entries(buckets).forEach(([k, v]) => console.log(`  ${k.padEnd(25)} : ${v}`));
console.log(``);
console.log(`BARCODE_CONFLICT (same Barcode · 상품명 완전 다름): 0  (확인됨 · analyze-barcode 결과)`);
console.log(`REVIEW (수동 확인 필요): DB_ONLY_INACTIVE 와 겹침`);

console.log(`\n===== DB_ONLY_ACTIVE sample (사용자 운영 상품 · 자체 등록 or 과거) =====`);
dbOnlyActiveSamples.forEach((s) => console.log(`  ${s.code} "${s.name}" · optimal=${s.optimal_stock} · loc="${s.display_location}" · hidden=${s.hidden}`));

console.log(`\n===== DB_ONLY_INACTIVE sample (순수 샘플 후보 · 자동 DELETE 금지) =====`);
dbOnlyInactiveSamples.forEach((s) => console.log(`  ${s.code} "${s.name}" · imported=${s.imported_at}`));

console.log(`\n===== ERP_NEW sample (ERP 신규 상품 · 매칭 Barcode 없음) =====`);
erpNewSamples.forEach((s) => console.log(`  ${s.barcode} PCode=${s.pcode} "${s.name}" · ${s.supplier}`));

// Supabase product_code length 분포 (DB_ONLY 특성 분석용)
const sbCodeLenHist = new Map();
for (const sbp of sb) {
  const c = String(sbp.product_code ?? "").trim();
  const len = c.length;
  sbCodeLenHist.set(len, (sbCodeLenHist.get(len) || 0) + 1);
}
console.log(`\n===== Supabase product_code length distribution =====`);
[...sbCodeLenHist.entries()].sort((a, b) => a[0] - b[0]).forEach(([k, v]) => console.log(`  len=${k} : ${v}`));

// DB_ONLY product_code length 분포 (ERP 가 못 가진 상품 특성)
const dbOnlyLenHist = new Map();
for (const sbp of sb) {
  const c = String(sbp.product_code ?? "").trim();
  if (erpByBarcode.has(c)) continue;
  dbOnlyLenHist.set(c.length, (dbOnlyLenHist.get(c.length) || 0) + 1);
}
console.log(`\n===== DB_ONLY product_code length distribution =====`);
[...dbOnlyLenHist.entries()].sort((a, b) => a[0] - b[0]).forEach(([k, v]) => console.log(`  len=${k} : ${v}`));
