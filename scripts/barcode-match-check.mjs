// 2026-10-03 · READ ONLY · ERP ↔ Supabase 매칭 가능성 전수 조사
//   · 사용자 지시 "바코드랑 연결되어있을꺼야"
//   · PPCode / col_i / individual_code / product_name 매칭 확인

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import * as dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const inv = JSON.parse(readFileSync("tools/iregen-bridge/output/inventory-full-full.json", "utf8"));

// ── 1. ERP PPCode 분석 ──
const ppRows = inv.tables[0].rows.filter((r) => r.PPCode);
console.log("===== ERP PPCode 분석 =====");
console.log(`PPCode non-null: ${ppRows.length} / ${inv.tables[0].rows.length}`);
const samePP = ppRows.filter((r) => String(r.PPCode) === String(r.PCode)).length;
const diffPP = ppRows.filter((r) => String(r.PPCode) !== String(r.PCode)).length;
console.log(`PPCode === PCode: ${samePP}`);
console.log(`PPCode !== PCode: ${diffPP}`);
if (diffPP > 0) {
  const diffSamples = ppRows.filter((r) => String(r.PPCode) !== String(r.PCode)).slice(0, 5);
  console.log("different samples:", diffSamples.map((r) => ({ PCode: r.PCode, PPCode: r.PPCode, ProductName: r.ProductName })));
}

// ── 2. Supabase col_i / individual_code 확인 ──
console.log("\n===== Supabase col_i · individual_code non-null =====");
const { count: colICount, error: cie } = await supabase
  .from("products").select("*", { count: "exact", head: true }).not("col_i", "is", null);
console.log(`col_i non-null: ${colICount ?? cie?.message}`);
const { count: indivCount } = await supabase
  .from("products").select("*", { count: "exact", head: true }).not("individual_code", "is", null);
console.log(`individual_code non-null: ${indivCount}`);
const { data: colIData } = await supabase.from("products").select("product_code, product_name, col_i, individual_code").not("col_i", "is", null).limit(5);
console.log("col_i samples:", colIData);
const { data: indivData } = await supabase.from("products").select("product_code, product_name, individual_code").not("individual_code", "is", null).limit(5);
console.log("individual_code samples:", indivData);

// ── 3. ProductName 매칭 ──
console.log("\n===== product_name 매칭 (ERP ↔ Supabase) =====");
// ERP ProductName set
const erpByName = new Map();
for (const r of inv.tables[0].rows) {
  const name = String(r.ProductName ?? "").trim();
  if (name) {
    if (!erpByName.has(name)) erpByName.set(name, []);
    erpByName.get(name).push(r);
  }
}
console.log(`ERP distinct ProductName: ${erpByName.size}`);

// Supabase product_name 조회 (바코드 상품만 · 13자리 5,860 중 샘플)
const sbNames = [];
let from = 0;
const PAGE = 1000;
while (true) {
  const { data } = await supabase.from("products").select("product_code, product_name").range(from, from + PAGE - 1);
  if (!data || data.length === 0) break;
  for (const r of data) if (r.product_name) sbNames.push({ code: r.product_code, name: String(r.product_name).trim() });
  if (data.length < PAGE) break;
  from += PAGE;
}
console.log(`Supabase total product_name: ${sbNames.length}`);

let exactMatch = 0;
let noMatch = 0;
const matchedSamples = [];
const noMatchSamples = [];
for (const sb of sbNames) {
  if (erpByName.has(sb.name)) {
    exactMatch++;
    if (matchedSamples.length < 5) {
      const erp = erpByName.get(sb.name)[0];
      matchedSamples.push({ SB_code: sb.code, ERP_PCode: erp.PCode, name: sb.name });
    }
  } else {
    noMatch++;
    if (noMatchSamples.length < 5) noMatchSamples.push({ SB_code: sb.code, name: sb.name });
  }
}
console.log(`\nExact ProductName match: ${exactMatch}`);
console.log(`No match: ${noMatch}`);
console.log("Matched samples:", matchedSamples);
console.log("No-match samples:", noMatchSamples);

// ── 4. Supabase 바코드 체계 중 ERP PCode 와 겹치는지 ──
console.log("\n===== Supabase product_code 중 ERP PCode 와 완전 일치 =====");
const erpCodes = new Set(inv.tables[0].rows.map((r) => String(r.PCode ?? "").trim()).filter(Boolean));
let codeMatch = 0;
const codeMatchSamples = [];
for (const sb of sbNames) {
  if (erpCodes.has(sb.code)) {
    codeMatch++;
    if (codeMatchSamples.length < 5) codeMatchSamples.push(sb);
  }
}
console.log(`product_code 완전 일치: ${codeMatch}`);
console.log("samples:", codeMatchSamples);

console.log("\n===== 완료 (READ ONLY) =====");
