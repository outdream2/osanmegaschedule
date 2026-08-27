// 상품 barcode 자동 정규화 · Check Digit 검증 기반
// analyze-barcodes.mjs 결과의 auto_fixable 645건 대상
//
// 처리:
//   - fixed 코드가 이미 DB에 존재 → 그 상품과 병합 (참조 재매핑 + orig DELETE)
//   - fixed 코드가 신규 → product_code UPDATE (rename)
//
// 실행:
//   node scripts/normalize-barcodes.mjs                → dry-run
//   node scripts/normalize-barcodes.mjs --commit       → 실제 실행
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const COMMIT = process.argv.includes("--commit");
console.log(COMMIT ? "🔴 COMMIT" : "🟢 DRY-RUN");
console.log("─".repeat(72));

function loadEnv() {
  const raw = readFileSync(".env", "utf8"); const env = {};
  for (const l of raw.split(/\r?\n/)) { const m = /^([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(l); if (m) env[m[1]] = m[2]; }
  return env;
}
const env = loadEnv();
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

const files = readdirSync("docs").filter(f => /^barcode_analysis_\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse();
if (files.length === 0) { console.error("❌ docs/barcode_analysis_*.json 없음 · analyze-barcodes.mjs 먼저 실행"); process.exit(1); }
const analysisPath = `docs/${files[0]}`;
console.log(`📂 입력 · ${analysisPath}`);
const analysis = JSON.parse(readFileSync(analysisPath, "utf8"));
const targets = analysis.auto_fixable;
console.log(`   대상 ${targets.length}건`);

// backup · 대상 + fixed 대상 상품 전체 스냅샷 (배치로 · URL 길이 제한 회피)
const allOrigCodes = targets.map(t => t.orig);
const allFixedCodes = targets.map(t => t.fixed);
const allCodes = [...new Set([...allOrigCodes, ...allFixedCodes])];

async function batchIn(table, col, values, chunkSize = 100) {
  const out = [];
  for (let i = 0; i < values.length; i += chunkSize) {
    const chunk = values.slice(i, i + chunkSize);
    const { data, error } = await sb.from(table).select("*").in(col, chunk);
    if (error) throw new Error(`${table}.${col} batch ${i}: ${error.message}`);
    if (data) out.push(...data);
  }
  return out;
}

const allProducts = await batchIn("products", "product_code", allCodes);
const productMap = new Map(allProducts.map(p => [p.product_code, p]));
const orderRefs = await batchIn("order_requests", "product_code", allOrigCodes);
const invRefs = await batchIn("inventory_checks", "product_code", allOrigCodes);

const today = new Date().toISOString().slice(0, 10);
writeFileSync(`docs/normalize_backup_${today}.json`, JSON.stringify({
  generated_at: new Date().toISOString(),
  commit: COMMIT,
  products_snapshot: allProducts ?? [],
  order_requests_snapshot: orderRefs ?? [],
  inventory_checks_snapshot: invRefs ?? [],
}, null, 2), "utf8");
console.log(`💾 백업 · docs/normalize_backup_${today}.json (products=${allProducts?.length ?? 0} order=${orderRefs?.length ?? 0} inv=${invRefs?.length ?? 0})`);
console.log("");

let caseA_rename = 0, caseB_merge = 0, deleted = 0;
let refUpdated_order = 0, refUpdated_inv = 0;
let failed = [];
let progressCount = 0;

for (const t of targets) {
  const origCode = t.orig;
  const fixedCode = t.fixed;
  progressCount++;
  if (progressCount % 100 === 0) console.log(`... ${progressCount}/${targets.length} 진행중`);

  const origProduct = productMap.get(origCode);
  if (!origProduct) {
    failed.push({ origCode, reason: "orig product 조회 실패" });
    continue;
  }
  const fixedExists = productMap.has(fixedCode);

  if (fixedExists) {
    // Case B · fixed 이미 존재 · 참조 재매핑 · orig DELETE
    caseB_merge++;
    const oRefs = (orderRefs ?? []).filter(o => o.product_code === origCode);
    const iRefs = (invRefs ?? []).filter(i => i.product_code === origCode);
    if (oRefs.length > 0) {
      if (COMMIT) {
        const { error } = await sb.from("order_requests").update({ product_code: fixedCode }).eq("product_code", origCode);
        if (error) { failed.push({ origCode, step: "order-remap", err: error.message }); continue; }
      }
      refUpdated_order += oRefs.length;
    }
    if (iRefs.length > 0) {
      if (COMMIT) {
        const { error } = await sb.from("inventory_checks").update({ product_code: fixedCode }).eq("product_code", origCode);
        if (error) { failed.push({ origCode, step: "inv-remap", err: error.message }); continue; }
      }
      refUpdated_inv += iRefs.length;
    }
    if (COMMIT) {
      const { error } = await sb.from("products").delete().eq("product_code", origCode);
      if (error) { failed.push({ origCode, step: "delete", err: error.message }); continue; }
    }
    deleted++;
  } else {
    // Case A · fixed 신규 · rename
    caseA_rename++;
    const oRefs = (orderRefs ?? []).filter(o => o.product_code === origCode);
    const iRefs = (invRefs ?? []).filter(i => i.product_code === origCode);
    if (oRefs.length > 0) {
      if (COMMIT) {
        const { error } = await sb.from("order_requests").update({ product_code: fixedCode }).eq("product_code", origCode);
        if (error) { failed.push({ origCode, step: "order-remap-A", err: error.message }); continue; }
      }
      refUpdated_order += oRefs.length;
    }
    if (iRefs.length > 0) {
      if (COMMIT) {
        const { error } = await sb.from("inventory_checks").update({ product_code: fixedCode }).eq("product_code", origCode);
        if (error) { failed.push({ origCode, step: "inv-remap-A", err: error.message }); continue; }
      }
      refUpdated_inv += iRefs.length;
    }
    if (COMMIT) {
      const { error } = await sb.from("products").update({ product_code: fixedCode }).eq("product_code", origCode);
      if (error) { failed.push({ origCode, step: "rename", err: error.message }); continue; }
    }
  }
}

console.log("");
console.log("═".repeat(72));
console.log(`실행 요약 (${COMMIT ? "COMMIT" : "DRY-RUN"}):`);
console.log(`  · Case A · rename (신규 88..)   ${caseA_rename}건`);
console.log(`  · Case B · 병합 · orig DELETE   ${caseB_merge}건 (deleted=${deleted})`);
console.log(`  · order_requests 재매핑          ${refUpdated_order}건`);
console.log(`  · inventory_checks 재매핑        ${refUpdated_inv}건`);
console.log(`  · 실패                            ${failed.length}건`);
if (failed.length > 0) {
  writeFileSync(`docs/normalize_failed_${today}.json`, JSON.stringify(failed, null, 2), "utf8");
  console.log(`  📄 실패 리포트 · docs/normalize_failed_${today}.json`);
}
if (!COMMIT) {
  console.log("");
  console.log("💡 실제 실행: node scripts/normalize-barcodes.mjs --commit");
}
