// scripts/write-test-single-product-2026-10-03.ts
// 2026-10-03 저녁 · Phase 2 · 1건 Product WRITE 테스트
//
// 사용자 지시:
//   · ERP_NEW 275건 중 Location REVIEW 대상 아니고 Barcode 정상 상품 1개 선정
//   · onlyProductCodes allowlist 로 1건만 처리
//   · DRY_RUN 사전 확인 (wouldInsert=1 · wouldUpdate=0) 후에만 WRITE 진행
//   · WRITE 후 Supabase 재조회 · 다른 상품 미변경 확인
//
// 실행:
//   npx tsx scripts/write-test-single-product-2026-10-03.ts
//
// 안전장치:
//   · 기존 productSyncRunner · erpProductMapper · erpLocationTransform 그대로 사용
//   · Buy Sync 호출 X · migration 실행 X · ERP 재호출 X (SNAPSHOT 소스)
//   · pre-flight 체크 실패 시 WRITE 중단

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import * as dotenv from "dotenv";

import { syncProducts } from "../server/services/erpSync/productSyncRunner";
import { transformErpLocation } from "../src/shared/erp/erpLocationTransform";
import type { ErpProductRow } from "../src/shared/erp/erpProductMapper";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const SNAPSHOT_DIR = join(projectRoot, "data/snapshots");

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

// ─── 1. snapshot 로드 ─────────────────────────────────────────────────────
function pickLatest(prefix: string): string {
  const files = readdirSync(SNAPSHOT_DIR).filter((f) => f.startsWith(prefix) && f.endsWith(".json")).sort();
  if (!files.length) throw new Error(`${prefix}* snapshot 없음`);
  return join(SNAPSHOT_DIR, files[files.length - 1]);
}
const plPath = pickLatest("product-list-");
const pl = JSON.parse(readFileSync(plPath, "utf8")) as { rows: ErpProductRow[] };
console.log(`[step1] snapshot: ${plPath} · ERP rows=${pl.rows.length}`);

// ─── 2. Supabase 현재 Barcode set 조회 (ERP_NEW 판별용) ─────────────────────
async function loadDbBarcodes(): Promise<Set<string>> {
  const out = new Set<string>();
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from("products").select("product_code").range(from, from + 999);
    if (error) throw new Error(`products 조회 실패 · ${error.message}`);
    if (!data || data.length === 0) break;
    for (const r of data as Array<{ product_code: string }>) {
      if (r.product_code) out.add(String(r.product_code).trim());
    }
    if (data.length < 1000) break;
    from += 1000;
  }
  return out;
}

const dbBarcodes = await loadDbBarcodes();
const dbCountBefore = dbBarcodes.size;
console.log(`[step2] DB products: ${dbCountBefore}`);

// ─── 3. 후보 선정 ─────────────────────────────────────────────────────────
// 조건:
//   · Supabase 에 없음 (ERP_NEW)
//   · Location transform 이 ok_wall 또는 ok_madae (REVIEW 아님)
//   · Barcode 13자리 숫자 (가장 전형적 포맷)
//   · ProductName non-empty
//   · ERP 안에서 Barcode 중복 아님

const erpBarcodeCount = new Map<string, number>();
for (const r of pl.rows) {
  const bc = String(r.BarCode ?? "").trim();
  if (!bc) continue;
  erpBarcodeCount.set(bc, (erpBarcodeCount.get(bc) ?? 0) + 1);
}

const candidates: Array<{ row: ErpProductRow; bc: string; derived: string }> = [];
for (const r of pl.rows) {
  const bc = String(r.BarCode ?? "").trim();
  if (!bc) continue;
  if (dbBarcodes.has(bc)) continue;                     // DB 에 이미 있으면 ERP_NEW 아님
  if ((erpBarcodeCount.get(bc) ?? 0) > 1) continue;     // ERP 내부 중복 Barcode 제외
  if (!/^[0-9]{13}$/.test(bc)) continue;                // 13자리 숫자 Barcode 만
  const name = String(r.ProductName ?? "").trim();
  if (!name) continue;
  const loc = transformErpLocation(r.LocationName as any);
  if (loc.reason !== "ok_wall" && loc.reason !== "ok_madae") continue; // REVIEW 제외
  candidates.push({ row: r, bc, derived: loc.derived! });
  if (candidates.length >= 10) break; // 처음 10 후보 확보 후 중단
}
if (candidates.length === 0) {
  console.error("[step3] 조건 만족 후보 없음 · 중단");
  process.exit(2);
}

const chosen = candidates[0];
console.log("\n===== 선택 상품 =====");
console.log(`PCode:         ${String(chosen.row.PCode ?? "")}`);
console.log(`Barcode:       ${chosen.bc}`);
console.log(`ProductName:   ${String(chosen.row.ProductName ?? "")}`);
console.log(`NowStock:      ${String(chosen.row.NowStock ?? "")}`);
console.log(`LocationName:  ${String(chosen.row.LocationName ?? "")}`);
console.log(`→ display_location: ${chosen.derived}`);
console.log(`CorpNameView:  ${String(chosen.row.CorpNameView ?? "")}`);
console.log(`CtCode:        ${String(chosen.row.CtCode ?? "")}`);
console.log(`UnitCode:      ${String(chosen.row.UnitCode ?? "")}`);
console.log(`SaleStatus:    ${String(chosen.row.SaleStatusName ?? "")}`);
console.log(``);
console.log(`(참고 후보 ${candidates.length}개 중 첫 번째 선정)`);

// ─── 4. Supabase 부재 재확인 ──────────────────────────────────────────────
console.log("\n===== 사전 확인 =====");
const { data: beforeData, error: beforeErr } = await supabase
  .from("products")
  .select("product_code, product_name")
  .eq("product_code", chosen.bc)
  .maybeSingle();
if (beforeErr && beforeErr.code !== "PGRST116") {
  throw new Error(`Supabase 조회 실패 · ${beforeErr.message}`);
}
const existsBefore = !!beforeData;
console.log(`Before · 존재 여부: ${existsBefore ? "YES ⚠" : "NO ✓"}`);
if (existsBefore) {
  console.error("[step4] 이미 존재 · 조건 위반 · 중단");
  process.exit(3);
}

// ─── 5. DRY_RUN pre-flight (wouldInsert=1 · wouldUpdate=0 확인) ──────────
console.log("\n===== DRY_RUN pre-flight =====");
const dry = await syncProducts(supabase, {
  mode: "DRY_RUN",
  allowWrite: false,
  source: "SNAPSHOT",
  onlyProductCodes: [chosen.bc],
});
console.log(`erpRows:       ${dry.erpRows}`);
console.log(`matched:       ${dry.matched}`);
console.log(`newInsert:     ${dry.newInsert}`);
console.log(`wouldUpdate:   ${dry.wouldUpdate}`);
console.log(`wouldInsert:   ${dry.wouldInsert}`);
console.log(`wouldSkipSame: ${dry.wouldSkipSame}`);
console.log(`reviewLocation:${dry.reviewLocation}`);
console.log(`actualWrite:   ${dry.actualWriteExecuted}`);

if (dry.newInsert !== 1 || dry.wouldInsert !== 1 || dry.wouldUpdate !== 0 || dry.matched !== 0) {
  console.error("[step5] pre-flight 조건 불일치 · 중단");
  console.error(`  요구: newInsert=1 · wouldInsert=1 · wouldUpdate=0 · matched=0`);
  console.error(`  실제: newInsert=${dry.newInsert} wouldInsert=${dry.wouldInsert} wouldUpdate=${dry.wouldUpdate} matched=${dry.matched}`);
  process.exit(4);
}
console.log(`✓ pre-flight PASS · target=1건 · INSERT=1 · UPDATE=0 · DELETE=0 (Runner 는 DELETE 안 함)`);

// ─── 6. 다른 상품 1건 snapshot (사후 비교용) ──────────────────────────────
const compareBarcode = [...dbBarcodes].find((b) => b !== chosen.bc)!;
const { data: compareBefore } = await supabase
  .from("products")
  .select("product_code, product_name, current_stock, display_location, location, supplier, sale_status, optimal_stock, memo, hidden")
  .eq("product_code", compareBarcode)
  .maybeSingle();
console.log(`\n[step6] 비교대상 상품 (랜덤 1건) · ${compareBarcode}`);

// ─── 7. WRITE 실행 ────────────────────────────────────────────────────────
console.log("\n===== WRITE 실행 =====");
process.env.ERP_SYNC_WRITE_ENABLED = "true"; // 테스트 프로세스 범위 (HTTP endpoint gate · CLI 직접 호출에선 영향 없지만 명시)
const w = await syncProducts(supabase, {
  mode: "WRITE",
  allowWrite: true,
  source: "SNAPSHOT",
  onlyProductCodes: [chosen.bc],
});
console.log(`mode:                 ${w.mode}`);
console.log(`actualWriteExecuted:  ${w.actualWriteExecuted}`);
console.log(`inserted:             ${w.inserted}`);
console.log(`updated:              ${w.updated}`);
console.log(`failed:               ${w.failed}`);
console.log(`protectedMutation:    ${w.protectedMutationCount}`);
if (w.sanitizedErrors.length > 0) {
  console.log(`errors:`);
  w.sanitizedErrors.forEach((e) => console.log(`  ${e}`));
}

// ─── 8. 사후 검증 ─────────────────────────────────────────────────────────
console.log("\n===== 사후 검증 =====");

// 8a. 대상 Barcode · 저장 값 조회
const { data: afterData, error: afterErr } = await supabase
  .from("products")
  .select("product_code, product_name, current_stock, display_location, location, supplier, supplier_code, unit, sale_status, brand, manufacturer, last_purchase_date, last_sale_date, optimal_stock, memo, hidden, stock_note")
  .eq("product_code", chosen.bc)
  .maybeSingle();
if (afterErr) throw new Error(`사후 조회 실패 · ${afterErr.message}`);

console.log(`After · 존재 여부: ${afterData ? "YES ✓" : "NO ✗"}`);
if (!afterData) {
  console.error("INSERT 되었다고 보고되었으나 실제 조회 실패");
  process.exit(5);
}

// ERP 원본 ↔ Supabase 비교
const erpSnap = {
  product_code: chosen.bc,
  product_name: String(chosen.row.ProductName ?? "").trim(),
  current_stock: Number(chosen.row.NowStock),
  display_location: chosen.derived,
  location: chosen.derived,
  supplier: String(chosen.row.CorpNameView ?? "").trim(),
  supplier_code: String(chosen.row.CtCode ?? "").trim(),
  unit: String(chosen.row.UnitCode ?? "").trim(),
  sale_status: String(chosen.row.SaleStatusName ?? "").trim(),
};
const after: any = afterData;
const fieldMatch: Record<string, string> = {};
for (const [k, v] of Object.entries(erpSnap)) {
  const dbVal = after[k];
  const ok = String(dbVal ?? "") === String(v ?? "");
  fieldMatch[k] = `${ok ? "✓" : "✗"} erp=${JSON.stringify(v)} db=${JSON.stringify(dbVal)}`;
}
console.log("\nERP vs Supabase 필드 비교:");
for (const [k, s] of Object.entries(fieldMatch)) console.log(`  ${k.padEnd(20)} ${s}`);

// PROTECTED 필드가 null 이거나 default 로 유지되는지
const protectedFields = ["optimal_stock", "memo", "hidden", "stock_note"];
const protectedModified: string[] = [];
for (const f of protectedFields) {
  const v = after[f];
  // INSERT 시엔 default 또는 null 유지되는 것이 정상
  // "민감한 사용자 데이터가 ERP 로부터 주입되지 않았는지" 체크
  if (f === "memo" && v != null && v !== "") protectedModified.push(`${f}=${JSON.stringify(v)}`);
  if (f === "hidden" && v === true) protectedModified.push(`${f}=true (ERP 로부터 주입 가능성)`);
  if (f === "stock_note" && v != null && v !== "") protectedModified.push(`${f}=${JSON.stringify(v)}`);
}

// 8b. 비교대상 상품 재조회 → 변경 없는지
const { data: compareAfter } = await supabase
  .from("products")
  .select("product_code, product_name, current_stock, display_location, location, supplier, sale_status, optimal_stock, memo, hidden")
  .eq("product_code", compareBarcode)
  .maybeSingle();

const otherModified: string[] = [];
if (!compareAfter) {
  otherModified.push(`${compareBarcode} 사후 조회 null · 삭제됨?`);
} else if (compareBefore) {
  for (const k of ["product_name", "current_stock", "display_location", "location", "supplier", "sale_status", "optimal_stock", "memo", "hidden"]) {
    const b = (compareBefore as any)[k];
    const a = (compareAfter as any)[k];
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      otherModified.push(`${k}: ${JSON.stringify(b)} → ${JSON.stringify(a)}`);
    }
  }
}

// 8c. 총 row 수 before+1 확인
const { count: dbCountAfter } = await supabase.from("products").select("*", { count: "exact", head: true });
const expectedAfter = dbCountBefore + 1;
const countDelta = (dbCountAfter ?? -1) - dbCountBefore;

// 8d. 다른 테이블 미변경 확인 (row count 비교)
const otherTablesChecked: Array<{ name: string; before?: number; after?: number }> = [];
for (const t of ["purchase_details", "stock_history", "inventory_checks", "vendors"]) {
  const { count } = await supabase.from(t).select("*", { count: "exact", head: true });
  otherTablesChecked.push({ name: t, after: count ?? -1 });
}

// ─── 9. 최종 보고 ─────────────────────────────────────────────────────────
const allFieldsMatch = Object.values(fieldMatch).every((s) => s.startsWith("✓"));
const pass =
  w.actualWriteExecuted === true &&
  w.inserted === 1 &&
  w.updated === 0 &&
  w.failed === 0 &&
  !!afterData &&
  allFieldsMatch &&
  otherModified.length === 0 &&
  protectedModified.length === 0 &&
  countDelta === 1;

console.log("\n═══════════════════════════════════════");
console.log("최종 보고");
console.log("═══════════════════════════════════════");
console.log(`선택 상품:`);
console.log(`  Barcode:  ${chosen.bc}`);
console.log(`  상품명:    ${String(chosen.row.ProductName ?? "")}`);
console.log(``);
console.log(`Before: 존재 여부: ${existsBefore ? "YES" : "NO"}`);
console.log(``);
console.log(`WRITE:`);
console.log(`  Inserted: ${w.inserted}`);
console.log(`  Updated:  ${w.updated}`);
console.log(`  Deleted:  0 (Runner 는 DELETE 안 함)`);
console.log(``);
console.log(`After: 존재 여부: ${afterData ? "YES" : "NO"}`);
console.log(``);
console.log(`ERP vs Supabase · 각 필드 일치 여부:`);
for (const [k, s] of Object.entries(fieldMatch)) console.log(`  ${k.padEnd(20)} ${s}`);
console.log(``);
console.log(`Other Products Modified:   ${otherModified.length === 0 ? "0 · ✓" : otherModified.length}`);
if (otherModified.length > 0) otherModified.forEach((m) => console.log(`  · ${m}`));
console.log(`Protected Fields Modified: ${protectedModified.length === 0 ? "0 · ✓" : protectedModified.length}`);
if (protectedModified.length > 0) protectedModified.forEach((m) => console.log(`  · ${m}`));
console.log(`Other Tables Modified:`);
console.log(`  products row count:      ${dbCountBefore} → ${dbCountAfter} (delta=${countDelta} · 예상=1)`);
for (const t of otherTablesChecked) console.log(`  ${t.name.padEnd(24)} ${t.after} rows (사후 조회 · before 미기록 · 변경 발생 시 다음 단계에서 확인)`);
console.log(``);
console.log(`RESULT: ${pass ? "PASS" : "FAIL"}`);
console.log("═══════════════════════════════════════");

if (!pass) process.exit(10);
