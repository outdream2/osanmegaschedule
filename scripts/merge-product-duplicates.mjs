// 상품 중복 자동 병합 · production Supabase · v2
// 사용자 지시 (2026-08-27):
//   · 정답 코드 = 88..로 시작하는 순수 barcode (010/10 prefix 제거)
//   · 중복도 물리 DELETE (hidden 아님)
//
// 입력: docs/product_duplicates_YYYY-MM-DD.json
// 대상: auto 리스트 128건
//
// 처리 케이스:
//   Case A · normalize(88..) 코드가 DB에 없음 (115건)
//     1. drops (010..) · 참조 재매핑 (order_requests·inventory_checks) · DELETE
//     2. keeper (10..) · 참조 재매핑 후 · product_code = 88.. 로 UPDATE (rename)
//   Case B · normalize(88..) 코드가 이미 DB에 존재 (13건)
//     1. keeper + drops · 참조 재매핑 → 88.. keeper 로 통일
//     2. keeper + drops · 모두 DELETE
//
// 안전 원칙:
//   · dry-run 기본 · --commit 명시해야 실행
//   · docs/merge_backup_YYYY-MM-DD.json · 전체 스냅샷 자동 저장
//   · 실패 리포트 · docs/merge_failed_YYYY-MM-DD.json
//   · 각 단계 상세 로그
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

const COMMIT = process.argv.includes("--commit");
console.log(COMMIT ? "🔴 COMMIT · 실제 DB 변경 실행" : "🟢 DRY-RUN · 실제 변경 없음");
console.log("─".repeat(72));

function loadEnv() {
  const raw = readFileSync(".env", "utf8"); const env = {};
  for (const l of raw.split(/\r?\n/)) { const m = /^([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(l); if (m) env[m[1]] = m[2]; }
  return env;
}
const env = loadEnv();
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

// 010 / 10 prefix 제거 · 88..로 시작하는 순수 barcode
function normalize(code) {
  let c = String(code ?? "").trim();
  if (c.startsWith("010")) c = c.slice(3);
  else if (c.startsWith("10")) c = c.slice(2);
  return c;
}

const jsonFiles = readdirSync("docs").filter(f => /^product_duplicates_\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse();
if (jsonFiles.length === 0) { console.error("❌ docs/product_duplicates_*.json 없음"); process.exit(1); }
const jsonPath = `docs/${jsonFiles[0]}`;
console.log(`📂 입력 · ${jsonPath}`);
const dup = JSON.parse(readFileSync(jsonPath, "utf8"));
console.log(`   auto=${dup.auto.length}건`);

// backup
const allCodes = [...new Set(dup.auto.flatMap(a => [a.keeper, ...a.drops]))];
const allNorms = [...new Set(dup.auto.map(a => normalize(a.keeper)))];

const { data: allProducts, error: eA } = await sb.from("products").select("*").in("product_code", [...allCodes, ...allNorms]);
if (eA) { console.error("[backup]", eA.message); process.exit(1); }
const { data: orderRefs, error: eO } = await sb.from("order_requests").select("*").in("product_code", allCodes);
if (eO) { console.error("[order refs]", eO.message); process.exit(1); }
const { data: invRefs, error: eI } = await sb.from("inventory_checks").select("*").in("product_code", allCodes);
if (eI) { console.error("[inv refs]", eI.message); process.exit(1); }

const today = new Date().toISOString().slice(0, 10);
const backupPath = `docs/merge_backup_${today}.json`;
writeFileSync(backupPath, JSON.stringify({
  generated_at: new Date().toISOString(),
  commit: COMMIT,
  products_snapshot: allProducts ?? [],
  order_requests_snapshot: orderRefs ?? [],
  inventory_checks_snapshot: invRefs ?? [],
}, null, 2), "utf8");
console.log(`💾 백업 · ${backupPath} (products=${allProducts?.length ?? 0} order=${orderRefs?.length ?? 0} inv=${invRefs?.length ?? 0})`);
console.log("");

// 정규화된 88.. 코드가 이미 존재하는지 map
const productByCode = new Map((allProducts ?? []).map(p => [p.product_code, p]));

let caseA = 0, caseB = 0;
let renamed = 0, deleted = 0;
let refUpdated_order = 0, refUpdated_inv = 0;
let failed = [];

for (const item of dup.auto) {
  const keeperCode = item.keeper;                   // 예: "108806435065186"
  const dropCodes = item.drops;                      // 예: ["0108806435065186"]
  const normCode = normalize(keeperCode);            // 예: "8806435065186"
  const normExists = productByCode.has(normCode);
  const name = item.name?.slice(0, 30) ?? "?";

  if (normExists) {
    caseB++;
    console.log(`[B] "${name}" · norm ${normCode} 이미 존재 · [${keeperCode}, ${dropCodes.join(", ")}] 모두 DELETE`);
    const targets = [keeperCode, ...dropCodes];
    for (const code of targets) {
      // 참조 재매핑 → normCode
      const oRefs = (orderRefs ?? []).filter(o => o.product_code === code);
      const iRefs = (invRefs ?? []).filter(i => i.product_code === code);
      if (oRefs.length > 0) {
        console.log(`   ↻ order_requests · ${code} → ${normCode} · ${oRefs.length}건`);
        if (COMMIT) {
          const { error } = await sb.from("order_requests").update({ product_code: normCode }).eq("product_code", code);
          if (error) { failed.push({ code, step: "order-remap-B", err: error.message }); console.error("     ❌", error.message); continue; }
        }
        refUpdated_order += oRefs.length;
      }
      if (iRefs.length > 0) {
        console.log(`   ↻ inventory_checks · ${code} → ${normCode} · ${iRefs.length}건`);
        if (COMMIT) {
          const { error } = await sb.from("inventory_checks").update({ product_code: normCode }).eq("product_code", code);
          if (error) { failed.push({ code, step: "inv-remap-B", err: error.message }); console.error("     ❌", error.message); continue; }
        }
        refUpdated_inv += iRefs.length;
      }
      // DELETE
      console.log(`   ✂ DELETE products · ${code}`);
      if (COMMIT) {
        const { error } = await sb.from("products").delete().eq("product_code", code);
        if (error) { failed.push({ code, step: "delete-B", err: error.message }); console.error("     ❌", error.message); continue; }
      }
      deleted++;
    }
  } else {
    caseA++;
    console.log(`[A] "${name}" · drops ${dropCodes.length}개 DELETE · keeper ${keeperCode} → rename ${normCode}`);
    // 1. drops · 참조 재매핑 → keeperCode (rename 전이므로 keeperCode 를 사용)
    for (const dropCode of dropCodes) {
      const oRefs = (orderRefs ?? []).filter(o => o.product_code === dropCode);
      const iRefs = (invRefs ?? []).filter(i => i.product_code === dropCode);
      if (oRefs.length > 0) {
        console.log(`   ↻ order_requests · ${dropCode} → ${keeperCode} · ${oRefs.length}건`);
        if (COMMIT) {
          const { error } = await sb.from("order_requests").update({ product_code: keeperCode }).eq("product_code", dropCode);
          if (error) { failed.push({ dropCode, step: "order-remap-A", err: error.message }); console.error("     ❌", error.message); continue; }
        }
        refUpdated_order += oRefs.length;
      }
      if (iRefs.length > 0) {
        console.log(`   ↻ inventory_checks · ${dropCode} → ${keeperCode} · ${iRefs.length}건`);
        if (COMMIT) {
          const { error } = await sb.from("inventory_checks").update({ product_code: keeperCode }).eq("product_code", dropCode);
          if (error) { failed.push({ dropCode, step: "inv-remap-A", err: error.message }); console.error("     ❌", error.message); continue; }
        }
        refUpdated_inv += iRefs.length;
      }
      console.log(`   ✂ DELETE products · ${dropCode}`);
      if (COMMIT) {
        const { error } = await sb.from("products").delete().eq("product_code", dropCode);
        if (error) { failed.push({ dropCode, step: "delete-A", err: error.message }); console.error("     ❌", error.message); continue; }
      }
      deleted++;
    }
    // 2. keeper · 참조 재매핑 → normCode · 그 후 product_code rename
    const kOrder = (orderRefs ?? []).filter(o => o.product_code === keeperCode).length;
    const kInv = (invRefs ?? []).filter(i => i.product_code === keeperCode).length;
    if (kOrder > 0) {
      console.log(`   ↻ order_requests · ${keeperCode} → ${normCode} · ${kOrder}건`);
      if (COMMIT) {
        const { error } = await sb.from("order_requests").update({ product_code: normCode }).eq("product_code", keeperCode);
        if (error) { failed.push({ keeperCode, step: "order-remap-A2", err: error.message }); console.error("     ❌", error.message); continue; }
      }
      refUpdated_order += kOrder;
    }
    if (kInv > 0) {
      console.log(`   ↻ inventory_checks · ${keeperCode} → ${normCode} · ${kInv}건`);
      if (COMMIT) {
        const { error } = await sb.from("inventory_checks").update({ product_code: normCode }).eq("product_code", keeperCode);
        if (error) { failed.push({ keeperCode, step: "inv-remap-A2", err: error.message }); console.error("     ❌", error.message); continue; }
      }
      refUpdated_inv += kInv;
    }
    console.log(`   ✎ RENAME product_code · ${keeperCode} → ${normCode}`);
    if (COMMIT) {
      const { error } = await sb.from("products").update({ product_code: normCode }).eq("product_code", keeperCode);
      if (error) { failed.push({ keeperCode, step: "rename-A", err: error.message }); console.error("     ❌", error.message); continue; }
    }
    renamed++;
  }
}

console.log("");
console.log("═".repeat(72));
console.log(`실행 요약 (${COMMIT ? "COMMIT" : "DRY-RUN"}):`);
console.log(`  · Case A (88.. 신규 rename)      ${caseA}건`);
console.log(`  · Case B (88.. 이미 존재 · 전부 DELETE) ${caseB}건`);
console.log(`  · rename (product_code UPDATE)   ${renamed}건`);
console.log(`  · DELETE products                ${deleted}건`);
console.log(`  · order_requests 재매핑           ${refUpdated_order}건`);
console.log(`  · inventory_checks 재매핑         ${refUpdated_inv}건`);
console.log(`  · 실패                            ${failed.length}건`);
if (failed.length > 0) {
  writeFileSync(`docs/merge_failed_${today}.json`, JSON.stringify(failed, null, 2), "utf8");
  console.log(`  📄 실패 리포트 · docs/merge_failed_${today}.json`);
}
if (!COMMIT) {
  console.log("");
  console.log("💡 실제 실행: node scripts/merge-product-duplicates.mjs --commit");
}
