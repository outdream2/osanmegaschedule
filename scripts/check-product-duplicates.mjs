// 상품 중복 데이터 검사 · production Supabase
// - product_code · barcode · product_name+brand+spec 3중 검사
// - 자동 병합 후보 vs 수동 확인 후보 분리
// - docs/PRODUCT_DUPLICATES_YYYY-MM-DD.md 리포트 파일 생성
// 실행: node scripts/check-product-duplicates.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

function loadEnv() {
  const raw = readFileSync(".env", "utf8"); const env = {};
  for (const l of raw.split(/\r?\n/)) { const m = /^([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(l); if (m) env[m[1]] = m[2]; }
  return env;
}
const env = loadEnv();
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

const PAGE = 1000;
let from = 0;
const rows = [];
while (true) {
  const { data, error } = await sb
    .from("products")
    .select("product_code, barcode, product_name, brand, spec, hidden, sale_status, registered_at, last_modified_at, current_stock, last_purchase_date, last_sale_date")
    .range(from, from + PAGE - 1);
  if (error) { console.error("[fetch]", error.message); process.exit(1); }
  if (!data || data.length === 0) break;
  rows.push(...data);
  if (data.length < PAGE) break;
  from += PAGE;
}
console.log(`총 상품: ${rows.length}건`);
console.log("─".repeat(72));

// 1) product_code / barcode 중복 (PK 정합 검사)
const byCode = new Map();
for (const r of rows) {
  const k = String(r.product_code ?? "").trim();
  if (!k) continue;
  if (!byCode.has(k)) byCode.set(k, []);
  byCode.get(k).push(r);
}
const dupCode = [...byCode.entries()].filter(([, v]) => v.length > 1);
console.log(`\n[1] product_code 중복: ${dupCode.length}건`);

const byBarcode = new Map();
for (const r of rows) {
  const k = String(r.barcode ?? "").trim();
  if (!k) continue;
  if (!byBarcode.has(k)) byBarcode.set(k, []);
  byBarcode.get(k).push(r);
}
const dupBarcode = [...byBarcode.entries()].filter(([, v]) => v.length > 1);
console.log(`[2] barcode 중복: ${dupBarcode.length}건`);

// 3) product_name + brand + spec 3중 중복
const byName = new Map();
for (const r of rows) {
  const name = String(r.product_name ?? "").trim();
  const brand = String(r.brand ?? "").trim();
  const spec = String(r.spec ?? "").trim();
  if (!name) continue;
  const k = `${name}|${brand}|${spec}`;
  if (!byName.has(k)) byName.set(k, []);
  byName.get(k).push(r);
}
const dupName = [...byName.entries()].filter(([, v]) => v.length > 1);
console.log(`[3] name+brand+spec 3중 중복: ${dupName.length}건`);

// 4) 자동 병합 후보 vs 수동 후보 분리
//   - 자동 후보 · 코드가 앞 "0" padding 차이만 (normalize == 동일)
//     예: "0108806435065186" vs "108806435065186" → 앞 0 제거 시 동일
//   - 수동 후보 · 코드 자체가 완전히 다름
function normalizeCode(c) {
  return String(c ?? "").trim().replace(/^0+/, "");
}
const autoCandidates = [];  // { keeper, drops[] }
const manualCandidates = [];  // { keeper, others[] } · 사용자 판단 필요

for (const [key, arr] of dupName) {
  const normSet = new Set(arr.map(r => normalizeCode(r.product_code)));
  if (normSet.size === 1) {
    // 모두 앞 0 padding 차이 · 자동 병합 가능
    // keeper = 최신 last_modified_at · 없으면 last_purchase_date · 없으면 registered_at
    const sorted = [...arr].sort((a, b) => {
      const ta = a.last_modified_at ?? a.last_purchase_date ?? a.registered_at ?? "";
      const tb = b.last_modified_at ?? b.last_purchase_date ?? b.registered_at ?? "";
      return tb.localeCompare(ta);  // 최신 우선
    });
    const [keeper, ...drops] = sorted;
    autoCandidates.push({ key, keeper, drops });
  } else {
    manualCandidates.push({ key, rows: arr });
  }
}

console.log(`\n[4] 자동 병합 후보 (앞 0 padding 차이): ${autoCandidates.length}건 (제거 대상 ${autoCandidates.reduce((s, x) => s + x.drops.length, 0)}건)`);
console.log(`[5] 수동 확인 후보 (실제 다른 코드): ${manualCandidates.length}건`);

// ─────────────────────────────────────────────
// 리포트 파일 생성
const today = new Date().toISOString().slice(0, 10);
const reportPath = `docs/PRODUCT_DUPLICATES_${today}.md`;
try { mkdirSync(dirname(reportPath), { recursive: true }); } catch { /* ignore */ }

const lines = [];
lines.push(`# 상품 중복 데이터 조사 · ${today}`);
lines.push("");
lines.push(`전체 상품: **${rows.length}건**`);
lines.push("");
lines.push("## 요약");
lines.push("");
lines.push("| 검사 유형 | 그룹 | 초과 row |");
lines.push("|-----------|-----:|---------:|");
lines.push(`| product_code 중복 | ${dupCode.length} | ${dupCode.reduce((s, [, v]) => s + v.length - 1, 0)} |`);
lines.push(`| barcode 중복 | ${dupBarcode.length} | ${dupBarcode.reduce((s, [, v]) => s + v.length - 1, 0)} |`);
lines.push(`| name+brand+spec 3중 중복 | ${dupName.length} | ${dupName.reduce((s, [, v]) => s + v.length - 1, 0)} |`);
lines.push(`| **자동 병합 후보 (0 padding)** | **${autoCandidates.length}** | **${autoCandidates.reduce((s, x) => s + x.drops.length, 0)}** |`);
lines.push(`| **수동 확인 후보** | **${manualCandidates.length}** | - |`);
lines.push("");
lines.push("## [A] 자동 병합 후보 · 앞 0 padding 차이만 (안전 대상)");
lines.push("");
lines.push("keeper = 최신 last_modified_at / last_purchase_date / registered_at 우선");
lines.push("");
lines.push("| # | 상품명 | keeper 코드 | 제거 대상 코드 |");
lines.push("|--:|--------|-------------|----------------|");
autoCandidates.forEach((c, i) => {
  const name = c.key.split("|")[0];
  lines.push(`| ${i + 1} | ${name} | \`${c.keeper.product_code}\` | ${c.drops.map(d => `\`${d.product_code}\``).join(", ")} |`);
});
lines.push("");
lines.push("## [B] 수동 확인 후보 · 실제 다른 코드 (사용자 판단 필요)");
lines.push("");
lines.push("리뉴얼·리패키지·재고코드 변경 등 · 자동 병합 위험");
lines.push("");
lines.push("| # | 상품명 | 코드들 |");
lines.push("|--:|--------|--------|");
manualCandidates.forEach((c, i) => {
  const name = c.key.split("|")[0];
  lines.push(`| ${i + 1} | ${name} | ${c.rows.map(r => `\`${r.product_code}\` (재고=${r.current_stock ?? 0}, ${r.sale_status || "-"})`).join(" · ")} |`);
});
lines.push("");
lines.push("---");
lines.push("");
lines.push("## 병합 규칙 · 자동 후보 [A]");
lines.push("");
lines.push("1. keeper 상품에 · 각 drop 의 current_stock 합산 (선택 · 사용자 승인 후)");
lines.push("2. 매입이력 · 반품이력 · 발주요청 등 · drop 코드 → keeper 코드로 재매핑");
lines.push("3. drop 상품 · hidden=true 처리 (물리 삭제 X · 이력 보존)");
lines.push("");
lines.push("**실행 스크립트**: `node scripts/merge-product-duplicates.mjs` (dry-run 기본)");
lines.push("");
writeFileSync(reportPath, lines.join("\n"), "utf8");
console.log(`\n📄 리포트 저장: ${reportPath}`);

// JSON 데이터도 저장 · merge 스크립트가 재사용
const jsonPath = `docs/product_duplicates_${today}.json`;
writeFileSync(jsonPath, JSON.stringify({
  generated_at: new Date().toISOString(),
  auto: autoCandidates.map(c => ({
    name: c.key.split("|")[0],
    keeper: c.keeper.product_code,
    drops: c.drops.map(d => d.product_code),
  })),
  manual: manualCandidates.map(c => ({
    name: c.key.split("|")[0],
    codes: c.rows.map(r => ({
      code: r.product_code,
      current_stock: r.current_stock ?? 0,
      sale_status: r.sale_status,
      last_sale_date: r.last_sale_date,
    })),
  })),
}, null, 2), "utf8");
console.log(`📄 JSON 저장: ${jsonPath}`);
