// scripts/audit-product-code-mixing-2026-10-12.mjs
// 2026-10-12 · 사용자 리포트 "그날엔 매입이력에 방광건강안심요1000 (단가 23,400) 섞여있음"
//   · 같은 product_code 아래 여러 product_name 저장된 row 전수 조사
//   · PCode→BarCode 매핑 오류 또는 ERP 혼선 증거

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

console.log("━".repeat(80));
console.log("  product_code 혼재 조사 · 2026-10-12");
console.log("━".repeat(80));
console.log();

// 1) 그날엔 바코드 상세
console.log("[1] 그날엔더블유연질캡슐 바코드 ('8806531701107') 매입 상세");
const { data: d1 } = await supabase
  .from("purchase_details")
  .select("id, purchase_date, product_code, product_name, supplier_name, quantity, unit_price, amount")
  .eq("product_code", "8806531701107")
  .order("purchase_date", { ascending: false });
console.log(`  · ${(d1 ?? []).length}건`);
const names1 = new Map();
for (const r of d1 ?? []) {
  const k = r.product_name ?? "(없음)";
  if (!names1.has(k)) names1.set(k, []);
  names1.get(k).push(r);
}
for (const [name, arr] of names1) {
  console.log(`\n  ▸ product_name = "${name}" · ${arr.length}건`);
  for (const r of arr) {
    console.log(`    id=${r.id} · ${r.purchase_date} · ${r.supplier_name} · q=${r.quantity} · up=${r.unit_price?.toLocaleString()} · amt=${r.amount?.toLocaleString()}`);
  }
}

// 2) 전체 범위 · product_code 당 product_name distinct 2개 이상 (최근 90일 기준 샘플)
console.log();
console.log("[2] 전체 purchase_details · 같은 product_code 에 다른 product_name 섞인 패턴");
const PAGE = 1000;
let offset = 0;
const rows = [];
while (true) {
  const { data } = await supabase
    .from("purchase_details")
    .select("product_code, product_name")
    .gte("purchase_date", "2026-09-01")
    .order("id", { ascending: true })
    .range(offset, offset + PAGE - 1);
  if (!data || data.length === 0) break;
  rows.push(...data);
  if (data.length < PAGE) break;
  offset += PAGE;
}
console.log(`  · 2026-09-01 이후 ${rows.length.toLocaleString()}건 조회`);

const codeNames = new Map();
for (const r of rows) {
  const code = String(r.product_code ?? "");
  const name = String(r.product_name ?? "");
  if (!code) continue;
  if (!codeNames.has(code)) codeNames.set(code, new Set());
  codeNames.get(code).add(name);
}

const mixed = [...codeNames.entries()].filter(([_, names]) => names.size > 1);
console.log(`  · product_code 혼재 (same code · multi name): ${mixed.length}개 code`);
if (mixed.length > 0) {
  console.log(`\n  샘플 (최대 15):`);
  for (const [code, names] of mixed.slice(0, 15)) {
    console.log(`    code=${code}`);
    for (const n of names) console.log(`      · ${n}`);
  }
}

// 3) 거꾸로 · 같은 product_name 에 다른 product_code (상품명 중복 사용)
console.log();
console.log("[3] 같은 product_name 에 다른 product_code (상품명 duplicate 사용)");
const nameCodes = new Map();
for (const r of rows) {
  const code = String(r.product_code ?? "");
  const name = String(r.product_name ?? "");
  if (!name) continue;
  if (!nameCodes.has(name)) nameCodes.set(name, new Set());
  nameCodes.get(name).add(code);
}
const sameName = [...nameCodes.entries()].filter(([_, codes]) => codes.size > 1);
console.log(`  · product_name duplicate: ${sameName.length}개 name`);
if (sameName.length > 0) {
  console.log(`\n  샘플 (최대 10):`);
  for (const [name, codes] of sameName.slice(0, 10)) {
    console.log(`    name="${name}" · codes: ${[...codes].join(", ")}`);
  }
}

console.log();
console.log("━".repeat(80));
console.log("해석:");
console.log("  · [2] product_code 혼재 → PCode→BarCode 매핑 과거 오류 or ERP 혼선 증거");
console.log("  · [3] product_name duplicate → ERP 가 같은 이름을 다른 바코드로 발송 (lot 등)");
console.log("━".repeat(80));
