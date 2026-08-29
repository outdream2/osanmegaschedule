// 2026-08-29 · 페리비타 · 재고확인 검색에서 2건 나오는 이유 조사
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnv() {
  const raw = readFileSync(".env", "utf8");
  const env = {};
  for (const l of raw.split(/\r?\n/)) {
    const m = /^([A-Z_]+)\s*=\s*"?([^"\r]*)"?\s*$/.exec(l);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

const env = loadEnv();
console.log("SUPABASE_URL prefix:", (env.SUPABASE_URL ?? "").slice(0, 30));
console.log("SUPABASE_KEY prefix:", (env.SUPABASE_KEY ?? "").slice(0, 20));

const sb = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

// 연결 검증
const { count, error: cErr } = await sb.from("products").select("*", { count: "exact", head: true });
console.log(`\n[연결 검증] products 전체 수: ${count} · error: ${cErr?.message ?? "none"}\n`);
if (cErr) {
  console.log("연결 실패 · env 확인 필요");
  process.exit(1);
}

// 페리비타 (완전 이름 매칭)
console.log("═".repeat(60));
console.log("페리비타 조사");
console.log("═".repeat(60));

const { data: all } = await sb.from("products")
  .select("product_code, product_name, spec, sale_status, hidden, supplier, current_stock")
  .ilike("product_name", "%페리비타%");

console.log(`\n[전체 · ilike 매칭] ${all?.length ?? 0}건\n`);
for (const p of all ?? []) {
  console.log(`  code=${p.product_code} hidden=${p.hidden} sale="${p.sale_status ?? ""}" supplier="${p.supplier ?? ""}"`);
  console.log(`    name="${p.product_name}" spec="${p.spec ?? ""}" stock=${p.current_stock}`);
  console.log("");
}

// 재고확인 결과 재현 (판매중 + hidden=false)
const { data: stockCheck } = await sb.from("products")
  .select("product_code, product_name, spec, supplier, current_stock, sale_status")
  .eq("hidden", false)
  .eq("sale_status", "판매중")
  .ilike("product_name", "%페리비타%");

console.log(`\n[재고확인 API 결과 재현] ${stockCheck?.length ?? 0}건 · hidden=false + sale_status=판매중\n`);
for (const p of stockCheck ?? []) {
  console.log(`  ✓ code=${p.product_code} name="${p.product_name}" spec="${p.spec ?? ""}" supplier="${p.supplier ?? ""}"`);
}

// 진단
console.log(`\n${"═".repeat(60)}`);
if ((all?.length ?? 0) === 0) {
  console.log("→ products 테이블에 · 페리비타 · 0건 · 다른 검색어 필요");
} else if ((stockCheck?.length ?? 0) === 2) {
  console.log("→ 재고확인 · 2건 확인 · 원인 분석:");
  const codes = new Set((stockCheck ?? []).map(p => p.product_code));
  const suppliers = new Set((stockCheck ?? []).map(p => p.supplier ?? ""));
  const names = new Set((stockCheck ?? []).map(p => p.product_name));
  console.log(`   · unique product_code · ${codes.size}개 · ${[...codes].join(", ")}`);
  console.log(`   · unique 이름 · ${names.size}개 · ${[...names].join(" | ")}`);
  console.log(`   · unique 공급사 · ${suppliers.size}개 · ${[...suppliers].join(", ")}`);
  if (names.size === 1 && codes.size === 2) {
    console.log(`   · 진단 · 같은 이름 · 다른 code · DB 중복 · 병합 필요 (scripts/merge-product-duplicates.mjs)`);
  } else if (names.size >= 2) {
    console.log(`   · 진단 · 이름 부분 매칭 (다른 상품) · 예: 페리비타 + 페리비타플러스 · 정상 · UI 상 명확 표시 필요`);
  } else {
    console.log(`   · 진단 · 원인 애매 · 상세 조사 필요`);
  }
}
