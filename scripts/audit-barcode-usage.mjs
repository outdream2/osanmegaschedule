// 2026-09-08 · products.barcode 컬럼 실제 사용 현황 조사
//   · barcode 값 있음/없음 카운트
//   · category_code 값 있음/없음
//   · 겹침 분석 · 표본 데이터 · length 분포

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnv() {
  const raw = readFileSync(".env", "utf8"); const env = {};
  for (const l of raw.split(/\r?\n/)) { const m = /^([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(l); if (m) env[m[1]] = m[2]; }
  return env;
}
const env = loadEnv();
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

const { count: total } = await sb.from("products").select("*", { count: "exact", head: true });
console.log(`\n[audit] products 총 ${total}건`);

// barcode 값 있음
const { count: hasBarcode } = await sb.from("products").select("*", { count: "exact", head: true }).not("barcode", "is", null);
console.log(`  · barcode 값 있음 · ${hasBarcode}건 (${(hasBarcode / total * 100).toFixed(1)}%)`);
console.log(`  · barcode NULL · ${total - hasBarcode}건`);

// category_code 값 있음
const { count: hasCategoryCode } = await sb.from("products").select("*", { count: "exact", head: true }).not("category_code", "is", null);
console.log(`  · category_code 값 있음 · ${hasCategoryCode}건 (${(hasCategoryCode / total * 100).toFixed(1)}%)`);

// product_code 값 있음 (기본 · 대조군)
const { count: hasProductCode } = await sb.from("products").select("*", { count: "exact", head: true }).not("product_code", "is", null);
console.log(`  · product_code 값 있음 · ${hasProductCode}건 (${(hasProductCode / total * 100).toFixed(1)}%)`);

// barcode 표본 (앞 10개)
console.log(`\n[표본] barcode 값 있는 상품 (앞 10건)`);
const { data: samples } = await sb.from("products")
  .select("product_code, product_name, barcode, category_code, category")
  .not("barcode", "is", null)
  .limit(10);
for (const p of samples ?? []) {
  console.log(`  · code=${p.product_code} · barcode=${p.barcode} · cat_code=${p.category_code} · name=${p.product_name?.slice(0, 30)}`);
}

// barcode 길이 분포 (실제 바코드 · 8·12·13·14 자리 EAN/UPC 여부)
console.log(`\n[분포] barcode 문자열 길이`);
const { data: barcodes } = await sb.from("products").select("barcode").not("barcode", "is", null).limit(5000);
const lenMap = new Map();
for (const b of barcodes ?? []) {
  const len = String(b.barcode ?? "").length;
  lenMap.set(len, (lenMap.get(len) ?? 0) + 1);
}
for (const [len, cnt] of [...lenMap.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`  · ${len}자리 · ${cnt}건`);
}

// barcode == product_code 인 경우
const { data: allBarcode } = await sb.from("products").select("product_code, barcode").not("barcode", "is", null).limit(5000);
let sameAsCode = 0, differentFromCode = 0;
for (const p of allBarcode ?? []) {
  if (String(p.barcode).trim() === String(p.product_code).trim()) sameAsCode++;
  else differentFromCode++;
}
console.log(`\n[분석] barcode 값의 성격`);
console.log(`  · barcode == product_code · ${sameAsCode}건 (같은 값)`);
console.log(`  · barcode ≠ product_code · ${differentFromCode}건 (실제 다른 값)`);

// category_code 표본 · 바코드로 쓰이는지 확인
console.log(`\n[표본] category_code 값 (앞 10건)`);
const { data: catSamples } = await sb.from("products")
  .select("product_code, category_code, category, product_name")
  .not("category_code", "is", null)
  .limit(10);
for (const p of catSamples ?? []) {
  console.log(`  · code=${p.product_code} · cat_code=${p.category_code} · cat=${p.category} · name=${p.product_name?.slice(0, 30)}`);
}

// category_code 길이 분포
console.log(`\n[분포] category_code 문자열 길이`);
const { data: catCodes } = await sb.from("products").select("category_code").not("category_code", "is", null).limit(5000);
const catLenMap = new Map();
for (const c of catCodes ?? []) {
  const len = String(c.category_code ?? "").length;
  catLenMap.set(len, (catLenMap.get(len) ?? 0) + 1);
}
for (const [len, cnt] of [...catLenMap.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`  · ${len}자리 · ${cnt}건`);
}
