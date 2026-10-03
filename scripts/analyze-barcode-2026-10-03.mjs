// 2026-10-03 저녁 · READ ONLY · Barcode field 분석 + ERP ↔ Supabase 비교
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import * as dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const pl = JSON.parse(readFileSync("data/snapshots/product-list-2026-10-03.json", "utf8"));
const inv = JSON.parse(readFileSync("tools/iregen-bridge/output/inventory-full-full.json", "utf8"));
const plRows = pl.rows;
const invRows = inv.tables[0].rows;

console.log(`\n===== Product_List vs Inventory_Status 비교 =====`);
console.log(`Product_List rows: ${plRows.length}`);
console.log(`Inventory_Status rows: ${invRows.length}`);

const plByPCode = new Map(plRows.map((r) => [String(r.PCode ?? "").trim(), r]));
const invByPCode = new Map(invRows.map((r) => [String(r.PCode ?? "").trim(), r]));
const plOnly = [...plByPCode.keys()].filter((p) => !invByPCode.has(p));
const invOnly = [...invByPCode.keys()].filter((p) => !plByPCode.has(p));
console.log(`Product_List only: ${plOnly.length}`);
console.log(`Inventory_Status only: ${invOnly.length}`);
console.log(`Both: ${plByPCode.size - plOnly.length}`);
console.log(`\nInv-only sample (first 10):`);
for (const p of invOnly.slice(0, 10)) {
  const r = invByPCode.get(p);
  console.log(`  PCode=${p} · ${r.ProductName} · SaleStatus=${r.IsSaleStatusName}`);
}
console.log(`\nPL-only sample (first 10):`);
for (const p of plOnly.slice(0, 10)) {
  const r = plByPCode.get(p);
  console.log(`  PCode=${p} · ${r.ProductName} · SaleStatus=${r.SaleStatusName}`);
}

// SaleStatus 분포 (invOnly 특성 분석)
const invOnlyStatuses = new Map();
for (const p of invOnly) {
  const s = String(invByPCode.get(p).IsSaleStatusName ?? "").trim() || "(empty)";
  invOnlyStatuses.set(s, (invOnlyStatuses.get(s) || 0) + 1);
}
console.log(`\nInv-only SaleStatus 분포:`);
[...invOnlyStatuses.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k} : ${v}`));

// ── Barcode field 분석 ────────────────────────────────────────────────────────
console.log(`\n===== BarCode field 분석 (Product_List) =====`);
let bcNonEmpty = 0, bcEmpty = 0;
const bcHist = new Map();
const bcBySample = new Map();
const bcSet = new Set();
const bcDupMap = new Map();
for (const r of plRows) {
  const bc = String(r.BarCode ?? "").trim();
  if (!bc) { bcEmpty++; continue; }
  bcNonEmpty++;
  bcHist.set(bc.length, (bcHist.get(bc.length) || 0) + 1);
  if (bcSet.has(bc)) bcDupMap.set(bc, (bcDupMap.get(bc) || 1) + 1);
  bcSet.add(bc);
  if (bcBySample.size < 5) bcBySample.set(bc, { pcode: r.PCode, name: r.ProductName });
}
console.log(`BarCode non-empty: ${bcNonEmpty}`);
console.log(`BarCode empty: ${bcEmpty}`);
console.log(`BarCode unique: ${bcSet.size}`);
console.log(`BarCode duplicate: ${bcDupMap.size}`);
console.log(`Length distribution:`);
[...bcHist.entries()].sort((a, b) => a[0] - b[0]).forEach(([k, v]) => console.log(`  len=${k} : ${v}`));
console.log(`Sample:`);
for (const [bc, info] of bcBySample) console.log(`  ${bc} · PCode=${info.pcode} · ${info.name}`);
console.log(`Duplicate BarCode samples (first 10):`);
let i = 0;
for (const [bc, cnt] of bcDupMap) {
  if (i++ >= 10) break;
  // find PCodes
  const pcs = plRows.filter((r) => String(r.BarCode ?? "").trim() === bc).map((r) => `${r.PCode}(${r.ProductName})`);
  console.log(`  ${bc} × ${cnt} · ${pcs.join(" | ")}`);
}

// ── PCode ↔ Barcode cardinality ───────────────────────────────────────────────
const pCodeByBarcode = new Map();
for (const r of plRows) {
  const bc = String(r.BarCode ?? "").trim();
  if (!bc) continue;
  const pc = String(r.PCode ?? "").trim();
  if (!pCodeByBarcode.has(bc)) pCodeByBarcode.set(bc, []);
  pCodeByBarcode.get(bc).push(pc);
}
let n1to1 = 0, n1toN = 0;
for (const pcs of pCodeByBarcode.values()) {
  if (pcs.length === 1) n1to1++;
  else n1toN++;
}
console.log(`\nPCode : Barcode cardinality:`);
console.log(`  1 Barcode → 1 PCode: ${n1to1}`);
console.log(`  1 Barcode → N PCode: ${n1toN}`);

// Barcode numeric check
const nonNumericBarcodes = [...bcSet].filter((bc) => !/^[0-9]+$/.test(bc));
console.log(`\nNon-numeric Barcode: ${nonNumericBarcodes.length}`);
if (nonNumericBarcodes.length > 0) console.log(`  samples: ${nonNumericBarcodes.slice(0, 10).join(", ")}`);

// ── ERP Barcode ↔ Supabase products.product_code 전수 비교 ───────────────────
console.log(`\n===== ERP Barcode ↔ Supabase products.product_code =====`);
const sb = [];
let from = 0;
while (true) {
  const { data } = await supabase.from("products").select("product_code, product_name").range(from, from + 999);
  if (!data || !data.length) break;
  for (const r of data) sb.push(r);
  if (data.length < 1000) break;
  from += 1000;
}
console.log(`Supabase products: ${sb.length}`);
const sbByCode = new Map(sb.map((r) => [String(r.product_code ?? "").trim(), r]));
const sbCodes = new Set([...sbByCode.keys()].filter(Boolean));
console.log(`Supabase product_code unique non-empty: ${sbCodes.size}`);

let match = 0, erpOnly = 0, sbOnly = 0;
const matchSamples = [];
const nameConflictSamples = [];
for (const bc of bcSet) {
  if (sbCodes.has(bc)) {
    match++;
    if (matchSamples.length < 50) {
      const erp = plRows.find((r) => String(r.BarCode ?? "").trim() === bc);
      const sbp = sbByCode.get(bc);
      matchSamples.push({ bc, erpName: erp?.ProductName, sbName: sbp?.product_name });
      if (erp && sbp && erp.ProductName && sbp.product_name) {
        const en = String(erp.ProductName).trim();
        const sn = String(sbp.product_name).trim();
        if (en !== sn && !en.replace(/\s+/g, "").includes(sn.replace(/\s+/g, "")) && !sn.replace(/\s+/g, "").includes(en.replace(/\s+/g, ""))) {
          if (nameConflictSamples.length < 20) nameConflictSamples.push({ bc, erpName: en, sbName: sn });
        }
      }
    }
  } else {
    erpOnly++;
  }
}
for (const c of sbCodes) if (!bcSet.has(c)) sbOnly++;

console.log(`Exact Barcode Match: ${match}`);
console.log(`ERP Barcode Only (Supabase 에 없음): ${erpOnly}`);
console.log(`Supabase Only (ERP Barcode 에 없음): ${sbOnly}`);
console.log(`Match Rate (match / ERP Barcode non-empty): ${((match / bcNonEmpty) * 100).toFixed(1)}%`);
console.log(`Match Rate (match / Supabase products): ${((match / sb.length) * 100).toFixed(1)}%`);

console.log(`\nMatch sample (first 20):`);
matchSamples.slice(0, 20).forEach((s) => console.log(`  ${s.bc} · ERP="${s.erpName}" · DB="${s.sbName}"`));
console.log(`\nName conflict sample (same Barcode · different name · first 20):`);
nameConflictSamples.slice(0, 20).forEach((s) => console.log(`  ${s.bc} · ERP="${s.erpName}" · DB="${s.sbName}"`));

// ── ERP products with EMPTY Barcode (수동 매핑 대상) ─────────────────────────
const erpNoBarcode = plRows.filter((r) => !String(r.BarCode ?? "").trim());
console.log(`\n===== ERP products with EMPTY BarCode =====`);
console.log(`Count: ${erpNoBarcode.length}`);
if (erpNoBarcode.length > 0) {
  console.log(`Sample (first 15):`);
  erpNoBarcode.slice(0, 15).forEach((r) => console.log(`  PCode=${r.PCode} · "${r.ProductName}" · SaleStatus=${r.SaleStatusName} · CCorp=${r.CorpNameView}`));
}

// ERP Barcode 전수 저장 (분석 용도)
console.log(`\n===== BarCode field 분석 완료 =====`);
