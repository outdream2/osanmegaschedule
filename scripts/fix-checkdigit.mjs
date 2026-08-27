// Check Digit 오타 12건 자동 수정
// 원본 13자리 · 앞 12자리 유지 · 마지막 자리 · Modulo 10 재계산
// - 마지막 자리 오타 (가장 흔한 유형) 자동 교정
// - 새 코드가 이미 DB 에 존재하면 · 병합 (참조 재매핑 · orig DELETE)
//
// 실행:
//   node scripts/fix-checkdigit.mjs                → dry-run
//   node scripts/fix-checkdigit.mjs --commit       → 실제 실행
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

function checkDigit(c12) {
  let s = 0;
  for (let i = 0; i < 12; i++) s += Number(c12[i]) * (i % 2 === 0 ? 1 : 3);
  return (10 - s % 10) % 10;
}

const analysisFile = readdirSync("docs").filter(f => /^barcode_analysis_\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse()[0];
if (!analysisFile) { console.error("❌ barcode_analysis_*.json 없음"); process.exit(1); }
const analysis = JSON.parse(readFileSync(`docs/${analysisFile}`, "utf8"));
const targets = analysis.invalid13.map(x => {
  const first12 = x.code.slice(0, 12);
  const cd = checkDigit(first12);
  return { orig: x.code, fixed: first12 + cd, name: x.name };
});
console.log(`대상 ${targets.length}건`);
console.log("");

const allCodes = [...new Set(targets.flatMap(t => [t.orig, t.fixed]))];
const { data: products, error } = await sb.from("products").select("*").in("product_code", allCodes);
if (error) { console.error("[fetch]", error.message); process.exit(1); }
const productMap = new Map(products.map(p => [p.product_code, p]));

const today = new Date().toISOString().slice(0, 10);
writeFileSync(`docs/fix_checkdigit_backup_${today}.json`, JSON.stringify({
  generated_at: new Date().toISOString(),
  commit: COMMIT,
  products_snapshot: products,
}, null, 2), "utf8");
console.log(`💾 백업 · docs/fix_checkdigit_backup_${today}.json`);
console.log("");

let renamed = 0, merged = 0, failed = [];
for (const t of targets) {
  const origP = productMap.get(t.orig);
  if (!origP) { failed.push({ orig: t.orig, reason: "orig 없음" }); continue; }
  const exists = productMap.has(t.fixed);

  if (exists) {
    console.log(`  [병합] ${t.orig} → ${t.fixed} (기존 존재) · ${(t.name || "").slice(0, 40)}`);
    if (COMMIT) {
      await sb.from("order_requests").update({ product_code: t.fixed }).eq("product_code", t.orig);
      await sb.from("inventory_checks").update({ product_code: t.fixed }).eq("product_code", t.orig);
      const { error } = await sb.from("products").delete().eq("product_code", t.orig);
      if (error) { failed.push({ orig: t.orig, step: "delete", err: error.message }); continue; }
    }
    merged++;
  } else {
    console.log(`  [rename] ${t.orig} → ${t.fixed} · ${(t.name || "").slice(0, 40)}`);
    if (COMMIT) {
      await sb.from("order_requests").update({ product_code: t.fixed }).eq("product_code", t.orig);
      await sb.from("inventory_checks").update({ product_code: t.fixed }).eq("product_code", t.orig);
      const { error } = await sb.from("products").update({ product_code: t.fixed }).eq("product_code", t.orig);
      if (error) { failed.push({ orig: t.orig, step: "rename", err: error.message }); continue; }
    }
    renamed++;
  }
}

console.log("");
console.log("═".repeat(72));
console.log(`Check Digit 오타 수정 (${COMMIT ? "COMMIT" : "DRY-RUN"}):`);
console.log(`  · rename ${renamed}건 · 병합 ${merged}건 · 실패 ${failed.length}건`);
if (failed.length > 0) {
  writeFileSync(`docs/fix_checkdigit_failed_${today}.json`, JSON.stringify(failed, null, 2), "utf8");
}
if (!COMMIT) console.log("\n💡 실제 실행: node scripts/fix-checkdigit.mjs --commit");
