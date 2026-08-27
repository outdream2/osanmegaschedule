// nedrug 신뢰 매칭 · 사용자 선택 반영 · DB update
//
// 입력:
//   docs/nedrug_crawl_B_YYYY-MM-DD.json (신뢰 매칭 204건)
//   docs/BARCODE_CHOICE_YYYY-MM-DD.md (사용자 선택 · 각 행의 `선택` 컬럼)
//
// 처리:
//   1. Markdown 파싱 · 각 행 선택 번호 추출 (기본 `1`)
//   2. 선택된 barcode 로 product_code UPDATE
//   3. 기존 참조 (order_requests · inventory_checks) 재매핑
//   4. 새 코드가 이미 DB 존재 시 · Case B (병합 · orig DELETE)
//
// 실행:
//   node scripts/apply-nedrug-choice.mjs                 → dry-run
//   node scripts/apply-nedrug-choice.mjs --commit        → 실제 실행
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

// 최신 nedrug JSON + Markdown 선택 파일 로드
const crawlFile = readdirSync("docs").filter(f => /^nedrug_crawl_B_\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse()[0];
const choiceFile = readdirSync("docs").filter(f => /^BARCODE_CHOICE_\d{4}-\d{2}-\d{2}\.md$/.test(f)).sort().reverse()[0];
if (!crawlFile || !choiceFile) { console.error("❌ nedrug_crawl or BARCODE_CHOICE 파일 없음"); process.exit(1); }
console.log(`📂 ${crawlFile} · ${choiceFile}`);
const crawl = JSON.parse(readFileSync(`docs/${crawlFile}`, "utf8"));
const mdRaw = readFileSync(`docs/${choiceFile}`, "utf8");

// Markdown 파싱 · 표 행에서 · # · origCode · 선택 값 추출
// 표 형식: | # | `code` | name | nedrug | `선택` | barcode 리스트 |
const rowRegex = /^\|\s*(\d+)\s*\|\s*`([^`]+)`\s*\|[^|]+\|[^|]+\|\s*`([^`]+)`\s*\|/gm;
const choices = new Map();  // rowNo → choice
let m;
while ((m = rowRegex.exec(mdRaw)) !== null) {
  const rowNo = Number(m[1]);
  const origCode = m[2];
  const choice = m[3].trim();
  choices.set(rowNo, { origCode, choice });
}
console.log(`   Markdown 선택 파싱 · ${choices.size}건`);

// crawl 데이터와 매칭 (index 순서 · Markdown # 는 1-based)
const targets = [];
crawl.trusted.forEach((t, i) => {
  const chosen = choices.get(i + 1);
  if (!chosen) return;
  if (chosen.origCode !== t.orig_code) {
    console.warn(`  ⚠ row ${i + 1} origCode 불일치 · md=${chosen.origCode} vs json=${t.orig_code}`);
    return;
  }
  const c = chosen.choice.toLowerCase();
  if (c === "0" || c === "skip") return;   // skip
  const idx = Number(c);
  if (!Number.isFinite(idx) || idx < 1 || idx > t.barcodes.length) return;
  const newBarcode = t.barcodes[idx - 1];
  if (!newBarcode) return;
  targets.push({ orig: t.orig_code, name: t.orig_name, new: newBarcode, nedrug_name: t.nedrug_name });
});
console.log(`   반영 대상 · ${targets.length}건 (기본 첫 barcode)`);
console.log("");

// backup + 기존 참조 조사
async function batchIn(table, col, values, chunk = 100) {
  const out = [];
  for (let i = 0; i < values.length; i += chunk) {
    const c = values.slice(i, i + chunk);
    const { data, error } = await sb.from(table).select("*").in(col, c);
    if (error) throw new Error(`${table}.${col} ${i}: ${error.message}`);
    if (data) out.push(...data);
  }
  return out;
}

const origCodes = targets.map(t => t.orig);
const newCodes = targets.map(t => t.new);
const allCodes = [...new Set([...origCodes, ...newCodes])];
const products = await batchIn("products", "product_code", allCodes);
const productMap = new Map(products.map(p => [p.product_code, p]));
const orderRefs = await batchIn("order_requests", "product_code", origCodes);
const invRefs = await batchIn("inventory_checks", "product_code", origCodes);

const today = new Date().toISOString().slice(0, 10);
writeFileSync(`docs/apply_nedrug_backup_${today}.json`, JSON.stringify({
  generated_at: new Date().toISOString(),
  commit: COMMIT,
  products_snapshot: products,
  order_requests_snapshot: orderRefs,
  inventory_checks_snapshot: invRefs,
}, null, 2), "utf8");
console.log(`💾 백업 · docs/apply_nedrug_backup_${today}.json`);
console.log("");

let renamed = 0, merged = 0, failed = [];
let refOrder = 0, refInv = 0;
for (const t of targets) {
  const origP = productMap.get(t.orig);
  if (!origP) { failed.push({ orig: t.orig, reason: "orig 조회 실패" }); continue; }
  const exists = productMap.has(t.new);

  const oRefs = orderRefs.filter(o => o.product_code === t.orig);
  const iRefs = invRefs.filter(i => i.product_code === t.orig);

  if (exists) {
    // Case B · 병합 · 참조 → new · orig DELETE
    console.log(`  [병합] "${(t.name || "").slice(0, 25)}" · ${t.orig} → ${t.new} (기존 존재)`);
    if (oRefs.length > 0) {
      if (COMMIT) {
        const { error } = await sb.from("order_requests").update({ product_code: t.new }).eq("product_code", t.orig);
        if (error) { failed.push({ orig: t.orig, step: "order", err: error.message }); continue; }
      }
      refOrder += oRefs.length;
    }
    if (iRefs.length > 0) {
      if (COMMIT) {
        const { error } = await sb.from("inventory_checks").update({ product_code: t.new }).eq("product_code", t.orig);
        if (error) { failed.push({ orig: t.orig, step: "inv", err: error.message }); continue; }
      }
      refInv += iRefs.length;
    }
    if (COMMIT) {
      const { error } = await sb.from("products").delete().eq("product_code", t.orig);
      if (error) { failed.push({ orig: t.orig, step: "delete", err: error.message }); continue; }
    }
    merged++;
  } else {
    // Case A · rename · 참조 → new
    console.log(`  [rename] "${(t.name || "").slice(0, 25)}" · ${t.orig} → ${t.new}`);
    if (oRefs.length > 0) {
      if (COMMIT) {
        const { error } = await sb.from("order_requests").update({ product_code: t.new }).eq("product_code", t.orig);
        if (error) { failed.push({ orig: t.orig, step: "order-A", err: error.message }); continue; }
      }
      refOrder += oRefs.length;
    }
    if (iRefs.length > 0) {
      if (COMMIT) {
        const { error } = await sb.from("inventory_checks").update({ product_code: t.new }).eq("product_code", t.orig);
        if (error) { failed.push({ orig: t.orig, step: "inv-A", err: error.message }); continue; }
      }
      refInv += iRefs.length;
    }
    if (COMMIT) {
      const { error } = await sb.from("products").update({ product_code: t.new }).eq("product_code", t.orig);
      if (error) { failed.push({ orig: t.orig, step: "rename", err: error.message }); continue; }
    }
    renamed++;
  }
}

console.log("");
console.log("═".repeat(72));
console.log(`nedrug 반영 요약 (${COMMIT ? "COMMIT" : "DRY-RUN"}):`);
console.log(`  · rename (신규 barcode)   ${renamed}건`);
console.log(`  · 병합 · DELETE           ${merged}건`);
console.log(`  · order_requests 재매핑    ${refOrder}건`);
console.log(`  · inventory_checks 재매핑  ${refInv}건`);
console.log(`  · 실패                     ${failed.length}건`);
if (failed.length > 0) {
  writeFileSync(`docs/apply_nedrug_failed_${today}.json`, JSON.stringify(failed, null, 2), "utf8");
  console.log(`  📄 실패 리포트 · docs/apply_nedrug_failed_${today}.json`);
}
if (!COMMIT) {
  console.log("");
  console.log("💡 실제 실행: node scripts/apply-nedrug-choice.mjs --commit");
}
