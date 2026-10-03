// 2026-10-03 저녁 · READ ONLY · 가격 field 분석
//   · CostPrice ↔ products.purchase_price
//   · PriceA/B/C/D ↔ products.sale_price
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import * as dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const pl = JSON.parse(readFileSync("data/snapshots/product-list-2026-10-03.json", "utf8"));
const plRows = pl.rows;

// ERP by Barcode
const erpByBC = new Map();
for (const r of plRows) {
  const bc = String(r.BarCode ?? "").trim();
  if (!bc) continue;
  erpByBC.set(bc, r);
}

// Supabase products
const sb = [];
let from = 0;
while (true) {
  const { data } = await supabase.from("products").select("product_code, product_name, purchase_price, sale_price").range(from, from + 999);
  if (!data || !data.length) break;
  for (const r of data) sb.push(r);
  if (data.length < 1000) break;
  from += 1000;
}
const sbByCode = new Map(sb.map((r) => [String(r.product_code ?? "").trim(), r]));

// ── CostPrice 분석 (Product_List 전체) ────────────────────────────────────────
let costNonEmpty = 0, costEmpty = 0, costZero = 0;
let costSum = 0;
const costHist = new Map();
for (const r of plRows) {
  const v = r.CostPrice;
  const n = typeof v === "number" ? v : Number(v);
  if (n == null || isNaN(n)) { costEmpty++; continue; }
  if (n === 0) costZero++;
  else { costNonEmpty++; costSum += n; }
  const bucket = n === 0 ? "zero" : n < 1000 ? "<1k" : n < 10000 ? "<10k" : n < 100000 ? "<100k" : ">=100k";
  costHist.set(bucket, (costHist.get(bucket) || 0) + 1);
}
console.log("===== ERP CostPrice 분석 (4,007) =====");
console.log(`Non-zero: ${costNonEmpty} (${((costNonEmpty / plRows.length) * 100).toFixed(1)}%)`);
console.log(`Zero: ${costZero}`);
console.log(`Empty/invalid: ${costEmpty}`);
console.log(`Range buckets:`);
[...costHist.entries()].forEach(([k, v]) => console.log(`  ${k} : ${v}`));

// ── PriceA/B/C/D 분석 ────────────────────────────────────────────────────────
for (const col of ["PriceA", "PriceB", "PriceC", "PriceD", "EvSaleUnit", "EvCostUnit"]) {
  let ne = 0, ze = 0, em = 0;
  for (const r of plRows) {
    const v = r[col];
    const n = typeof v === "number" ? v : Number(v);
    if (n == null || isNaN(n)) em++;
    else if (n === 0) ze++;
    else ne++;
  }
  console.log(`\n===== ERP ${col} =====`);
  console.log(`Non-zero: ${ne} (${((ne / plRows.length) * 100).toFixed(1)}%)  Zero: ${ze}  Invalid: ${em}`);
  // first non-zero samples
  const samples = plRows.filter((r) => Number(r[col]) > 0).slice(0, 5);
  samples.forEach((s) => console.log(`  sample · BarCode=${s.BarCode} · ${s.ProductName?.slice(0, 20)} · ${col}=${s[col]} · CostPrice=${s.CostPrice}`));
}

// ── purchase_price (Supabase) vs CostPrice (ERP) · Barcode matched ──────────
console.log(`\n===== purchase_price · ERP CostPrice vs Supabase (Barcode matched) =====`);
const cp = { same: 0, different: 0, erpEmpty_dbHas: 0, dbEmpty_erpHas: 0, bothEmpty: 0 };
const cpDiffSamples = [];
for (const [bc, erp] of erpByBC) {
  const sbp = sbByCode.get(bc);
  if (!sbp) continue;
  const erpVal = Number(erp.CostPrice);
  const dbVal = sbp.purchase_price == null ? null : Number(sbp.purchase_price);
  const erpHas = erpVal > 0 && !isNaN(erpVal);
  const dbHas = dbVal != null && dbVal > 0 && !isNaN(dbVal);
  if (!erpHas && !dbHas) cp.bothEmpty++;
  else if (!erpHas && dbHas) cp.erpEmpty_dbHas++;
  else if (erpHas && !dbHas) cp.dbEmpty_erpHas++;
  else if (Math.abs(erpVal - dbVal) < 0.01) cp.same++;
  else {
    cp.different++;
    if (cpDiffSamples.length < 30) cpDiffSamples.push({ bc, name: (erp.ProductName || "").slice(0, 25), erpVal, dbVal });
  }
}
Object.entries(cp).forEach(([k, v]) => console.log(`  ${k} : ${v}`));
console.log(`\nCostPrice Different samples (first 20):`);
cpDiffSamples.slice(0, 20).forEach((s) => console.log(`  ${s.bc} "${s.name}" · ERP CostPrice=${s.erpVal} · DB purchase_price=${s.dbVal}`));

// ── sale_price (Supabase) vs ERP · 어떤 field 가 더 유사? ───────────────────
console.log(`\n===== sale_price · ERP PriceA/B/C/D vs Supabase (Barcode matched) =====`);
for (const col of ["PriceA", "PriceB", "PriceC", "PriceD"]) {
  const sp = { same: 0, different: 0, erpEmpty_dbHas: 0, dbEmpty_erpHas: 0, bothEmpty: 0 };
  const spDiff = [];
  for (const [bc, erp] of erpByBC) {
    const sbp = sbByCode.get(bc);
    if (!sbp) continue;
    const erpVal = Number(erp[col]);
    const dbVal = sbp.sale_price == null ? null : Number(sbp.sale_price);
    const erpHas = erpVal > 0 && !isNaN(erpVal);
    const dbHas = dbVal != null && dbVal > 0 && !isNaN(dbVal);
    if (!erpHas && !dbHas) sp.bothEmpty++;
    else if (!erpHas && dbHas) sp.erpEmpty_dbHas++;
    else if (erpHas && !dbHas) sp.dbEmpty_erpHas++;
    else if (Math.abs(erpVal - dbVal) < 0.01) sp.same++;
    else { sp.different++; if (spDiff.length < 5) spDiff.push({ bc, name: (erp.ProductName || "").slice(0, 20), erpVal, dbVal }); }
  }
  console.log(`\n  ${col} vs sale_price:`);
  Object.entries(sp).forEach(([k, v]) => console.log(`    ${k} : ${v}`));
  if (spDiff.length > 0) console.log(`    diff samples:`);
  spDiff.forEach((s) => console.log(`      ${s.bc} "${s.name}" · ${col}=${s.erpVal} · DB=${s.dbVal}`));
}

// 가장 많이 일치하는 ERP sale 후보 식별
console.log(`\n===== PriceA 가 sale_price 와 가장 비슷한지 확인 =====`);
let priceAMatchCount = 0, priceAWithinPct = { "0%": 0, "1%": 0, "5%": 0, "10%": 0, ">10%": 0 };
for (const [bc, erp] of erpByBC) {
  const sbp = sbByCode.get(bc);
  if (!sbp || sbp.sale_price == null) continue;
  const a = Number(erp.PriceA);
  const db = Number(sbp.sale_price);
  if (isNaN(a) || isNaN(db) || a <= 0 || db <= 0) continue;
  const diff = Math.abs(a - db);
  const pct = diff / Math.max(a, db);
  if (diff < 0.01) priceAMatchCount++;
  if (pct <= 0.01) priceAWithinPct["0%"]++;
  else if (pct <= 0.05) priceAWithinPct["1%"]++;
  else if (pct <= 0.10) priceAWithinPct["5%"]++;
  else priceAWithinPct[">10%"]++;
}
console.log(`PriceA == sale_price (exact): ${priceAMatchCount}`);
console.log(`PriceA ≈ sale_price within:`);
Object.entries(priceAWithinPct).forEach(([k, v]) => console.log(`  ${k} : ${v}`));
