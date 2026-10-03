// 2026-10-03 저녁 · READ ONLY · Barcode 기준 Location 비교 재실행
//   · ProductName 매칭 폐기 · ERP BarCode ↔ Supabase product_code 로 join
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import * as dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const pl = JSON.parse(readFileSync("data/snapshots/product-list-2026-10-03.json", "utf8"));
const plRows = pl.rows;

const W1 = new Set(["24", "25", "26", "27", "7B", "8A"]);
function wClass(code) {
  if (!code) return "none";
  const c = String(code).trim().toUpperCase();
  if (W1.has(c)) return "w1";
  if (c.length > 4) return "none";
  const n = parseInt(c, 10);
  if (!isNaN(n) && String(n) === c) return (n >= 1 && n <= 99) ? "w2" : "none";
  if (/^[0-9A-Z]{2,4}$/.test(c)) return "w2";
  return "none";
}

function deriveDisplayLocation(loc) {
  if (!loc) return { ok: false, reason: "empty", derived: null, major: null, middle: null };
  const parts = String(loc).split(">").map((p) => p.trim());
  if (parts.length < 2) return { ok: false, reason: "no_middle", derived: null, major: null, middle: null };
  const major = parts[0];
  const rawMiddle = parts[1] || "";
  const normMiddle = rawMiddle
    .replace(/Ａ/g, "A").replace(/Ｂ/g, "B").replace(/Ｃ/g, "C").replace(/Ｄ/g, "D");
  if (!rawMiddle) return { ok: false, reason: "empty_middle", derived: null, major, middle: rawMiddle };
  if (major === "벽") return { ok: true, reason: "벽", derived: normMiddle, major, middle: rawMiddle };
  const m = major.match(/^([0-9]+)매대$/);
  if (m) return { ok: true, reason: "매대", derived: m[1] + normMiddle, major, middle: rawMiddle };
  return { ok: false, reason: "unspec:" + major, derived: null, major, middle: rawMiddle };
}

// Supabase products (전수)
const sb = [];
let from = 0;
while (true) {
  const { data } = await supabase.from("products").select("product_code, product_name, location, display_location, category_code").range(from, from + 999);
  if (!data || !data.length) break;
  for (const r of data) sb.push(r);
  if (data.length < 1000) break;
  from += 1000;
}
const sbByCode = new Map(sb.map((r) => [String(r.product_code ?? "").trim(), r]));

// Barcode matched ERP rows
const erpByBarcode = new Map();
for (const r of plRows) {
  const bc = String(r.BarCode ?? "").trim();
  if (!bc) continue;
  erpByBarcode.set(bc, r);
}

// ── Transform 통계 (Product_List 전체) ────────────────────────────────────────
const transformStats = { ok: 0, empty: 0, unspec: 0, no_middle: 0, empty_middle: 0 };
const unspecCounts = new Map();
const derivedHist = new Map();
const majorMiddleHist = new Map();
for (const r of plRows) {
  const d = deriveDisplayLocation(r.LocationName);
  if (d.ok) { transformStats.ok++; derivedHist.set(d.derived, (derivedHist.get(d.derived) || 0) + 1); }
  else {
    if (d.reason === "empty") transformStats.empty++;
    else if (d.reason === "no_middle") transformStats.no_middle++;
    else if (d.reason === "empty_middle") transformStats.empty_middle++;
    else { transformStats.unspec++; unspecCounts.set(d.major, (unspecCounts.get(d.major) || 0) + 1); }
  }
  if (d.major && d.middle) {
    const key = d.major + " | " + d.middle;
    majorMiddleHist.set(key, (majorMiddleHist.get(key) || 0) + 1);
  }
}
console.log(`===== Product_List Location Transform (4,007 rows) =====`);
console.log(`Transformable: ${transformStats.ok} (${((transformStats.ok / plRows.length) * 100).toFixed(1)}%)`);
console.log(`Empty: ${transformStats.empty} (${((transformStats.empty / plRows.length) * 100).toFixed(1)}%)`);
console.log(`Unspec Major: ${transformStats.unspec} (${((transformStats.unspec / plRows.length) * 100).toFixed(1)}%)`);
console.log(`No middle: ${transformStats.no_middle}`);
console.log(`Empty middle: ${transformStats.empty_middle}`);
console.log(`\nUnspec major 분포:`);
[...unspecCounts.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k} : ${v}`));

console.log(`\n===== 대분류+중분류 조합 (top 30) =====`);
[...majorMiddleHist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).forEach(([k, v]) => console.log(`  ${k} : ${v}`));

// ── Barcode 기준 ERP ↔ Supabase display_location 비교 ────────────────────────
const diffStats = { bothEmpty: 0, exactSame: 0, different: 0, dbEmpty_erpHas: 0, erpEmpty_dbHas: 0, erpUnspec_dbHas: 0, erpUnspec_dbEmpty: 0 };
const diffSamples = [];
const changeSummary = new Map();
const warehouseFlip = { stayW2: 0, stayW1: 0, w1_to_w2: 0, w2_to_w1: 0, becomeNone: 0, fromNone: 0, bothNone: 0 };
const warehouseFlipSamples = [];
const invalidZoneErp = []; // ERP-derived 가 isValidZoneCode 통과 못함

for (const [bc, erp] of erpByBarcode) {
  const sbp = sbByCode.get(bc);
  if (!sbp) continue;
  const d = deriveDisplayLocation(erp.LocationName);
  const sbLoc = (sbp.display_location || "").trim();
  const erpLoc = d.derived;
  const erpLocFull = erp.LocationName ? String(erp.LocationName).trim() : "";

  // 비교
  if (!sbLoc && !erpLoc && !erpLocFull) { diffStats.bothEmpty++; continue; }
  if (!sbLoc && !erpLoc && erpLocFull) { diffStats.erpUnspec_dbEmpty++; continue; }
  if (sbLoc && !erpLoc && erpLocFull) { diffStats.erpUnspec_dbHas++; continue; }
  if (sbLoc && !erpLoc && !erpLocFull) { diffStats.erpEmpty_dbHas++; continue; }
  if (!sbLoc && erpLoc) { diffStats.dbEmpty_erpHas++; }
  else if (sbLoc && erpLoc) {
    if (sbLoc === erpLoc) { diffStats.exactSame++; continue; }
    diffStats.different++;
    if (diffSamples.length < 50) diffSamples.push({ bc, name: (erp.ProductName || "").slice(0, 25), erpFull: erpLocFull, erpDerived: erpLoc, sbLoc });
    const key = sbLoc + " → " + erpLoc;
    changeSummary.set(key, (changeSummary.get(key) || 0) + 1);
  }
  // warehouse class flip (DB → ERP-derived)
  const sbC = wClass(sbLoc);
  const erpC = wClass(erpLoc);
  if (sbC === "w1" && erpC === "w2") { warehouseFlip.w1_to_w2++; if (warehouseFlipSamples.length < 20) warehouseFlipSamples.push({ bc, name: (erp.ProductName || "").slice(0, 25), from: sbLoc, to: erpLoc, flip: "w1→w2" }); }
  else if (sbC === "w2" && erpC === "w1") { warehouseFlip.w2_to_w1++; if (warehouseFlipSamples.length < 20) warehouseFlipSamples.push({ bc, name: (erp.ProductName || "").slice(0, 25), from: sbLoc, to: erpLoc, flip: "w2→w1" }); }
  else if (sbC === "w1" && erpC === "w1") warehouseFlip.stayW1++;
  else if (sbC === "w2" && erpC === "w2") warehouseFlip.stayW2++;
  else if (sbC !== "none" && erpC === "none") { warehouseFlip.becomeNone++; invalidZoneErp.push({ bc, name: (erp.ProductName || "").slice(0, 25), from: sbLoc, to: erpLoc, erpFull: erpLocFull }); }
  else if (sbC === "none" && erpC !== "none") warehouseFlip.fromNone++;
  else warehouseFlip.bothNone++;
}

console.log(`\n===== Barcode 기준 ERP ↔ Supabase display_location =====`);
console.log(`Barcode matched (ERP ∩ DB): ${[...erpByBarcode.keys()].filter((bc) => sbByCode.has(bc)).length}`);
Object.entries(diffStats).forEach(([k, v]) => console.log(`  ${k} : ${v}`));

console.log(`\n===== Warehouse class flip (shelf_positions 영향) =====`);
Object.entries(warehouseFlip).forEach(([k, v]) => console.log(`  ${k} : ${v}`));

console.log(`\n===== 변경 Top 30 =====`);
[...changeSummary.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).forEach(([k, v]) => console.log(`  ${k} : ${v}`));

console.log(`\n===== Different sample (first 30) =====`);
diffSamples.slice(0, 30).forEach((s) => console.log(`  ${s.bc} "${s.name}" · ERP="${s.erpFull}" → "${s.erpDerived}" · DB="${s.sbLoc}"`));

console.log(`\n===== Warehouse flip sample (first 10) =====`);
warehouseFlipSamples.slice(0, 10).forEach((s) => console.log(`  ${s.bc} "${s.name}" · ${s.from} → ${s.to} (${s.flip})`));

console.log(`\n===== ERP-derived 가 Invalid Zone (매대+뒤·앞 등) =====`);
console.log(`count: ${invalidZoneErp.length}`);
invalidZoneErp.slice(0, 15).forEach((s) => console.log(`  ${s.bc} "${s.name}" · ERP="${s.erpFull}" → "${s.to}" · DB="${s.from}"`));

// 뷰티/냉장고/앞뒤 세부 분석
console.log(`\n===== 뷰티 상품 분석 =====`);
const beauties = plRows.filter((r) => deriveDisplayLocation(r.LocationName).major === "뷰티");
console.log(`Count: ${beauties.length}`);
const beautyMiddleHist = new Map();
for (const r of beauties) {
  const d = deriveDisplayLocation(r.LocationName);
  beautyMiddleHist.set(d.middle, (beautyMiddleHist.get(d.middle) || 0) + 1);
}
console.log(`뷰티 중분류:`);
[...beautyMiddleHist.entries()].forEach(([k, v]) => console.log(`  ${k} : ${v}`));
console.log(`뷰티 상품 현재 DB display_location 분포 (Barcode matched):`);
const beautyDbDist = new Map();
for (const r of beauties) {
  const bc = String(r.BarCode ?? "").trim();
  const sbp = sbByCode.get(bc);
  if (!sbp) continue;
  const sbLoc = (sbp.display_location || "").trim() || "(empty)";
  beautyDbDist.set(sbLoc, (beautyDbDist.get(sbLoc) || 0) + 1);
}
[...beautyDbDist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([k, v]) => console.log(`  ${k} : ${v}`));

console.log(`\n===== 냉장고 상품 분석 =====`);
const fridges = plRows.filter((r) => deriveDisplayLocation(r.LocationName).major === "냉장고");
console.log(`Count: ${fridges.length}`);
const fridgeDbDist = new Map();
for (const r of fridges) {
  const bc = String(r.BarCode ?? "").trim();
  const sbp = sbByCode.get(bc);
  if (!sbp) continue;
  const sbLoc = (sbp.display_location || "").trim() || "(empty)";
  fridgeDbDist.set(sbLoc, (fridgeDbDist.get(sbLoc) || 0) + 1);
}
console.log(`냉장고 상품 DB display_location 분포:`);
[...fridgeDbDist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15).forEach(([k, v]) => console.log(`  ${k} : ${v}`));

console.log(`\n===== N매대+뒤/앞 상품 분석 =====`);
const 뒤앞Rows = plRows.filter((r) => {
  const d = deriveDisplayLocation(r.LocationName);
  return d.ok && (d.middle === "뒤" || d.middle === "앞");
});
console.log(`Count: ${뒤앞Rows.length}`);
뒤앞Rows.forEach((r) => {
  const bc = String(r.BarCode ?? "").trim();
  const sbp = sbByCode.get(bc);
  const d = deriveDisplayLocation(r.LocationName);
  console.log(`  ${bc} "${(r.ProductName||"").slice(0,25)}" · ERP="${r.LocationName}" → "${d.derived}" · DB="${sbp?.display_location || "(empty)"}"`);
});
