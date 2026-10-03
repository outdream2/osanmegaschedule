// scripts/update-test-single-product-2026-10-03.ts
// 2026-10-03 저녁 · Phase 2 · 1건 Product UPDATE 테스트 (ERP_MATCHED)
//
// 사용자 지시:
//   · ERP Barcode = DB product_code 정확히 매칭
//   · Barcode conflict 없음
//   · current_stock (ERP NowStock vs DB) 다름
//   · Location REVIEW 아님
//   · 가능하면 current_stock 외 변경 field 적은 상품 우선
//   · onlyProductCodes allowlist 로 1건만 처리
//   · preflight: Target=1 INSERT=0 UPDATE=1 DELETE=0
//
// 실행: npx tsx scripts/update-test-single-product-2026-10-03.ts

import { createClient } from "@supabase/supabase-js";
import { readFileSync, readdirSync } from "fs";
import { join, resolve, dirname } from "path";
import { fileURLToPath } from "url";
import * as dotenv from "dotenv";

import { syncProducts } from "../server/services/erpSync/productSyncRunner";
import { buildErpProductPayload, type ErpProductRow, type DbProductRow } from "../src/shared/erp/erpProductMapper";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");
const SNAPSHOT_DIR = join(projectRoot, "data/snapshots");

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

function pickLatest(prefix: string): string {
  const files = readdirSync(SNAPSHOT_DIR).filter((f) => f.startsWith(prefix) && f.endsWith(".json")).sort();
  if (!files.length) throw new Error(`${prefix}* snapshot 없음`);
  return join(SNAPSHOT_DIR, files[files.length - 1]);
}

// ─── 1. snapshot 로드 ─────────────────────────────────────────────────────
const plPath = pickLatest("product-list-");
const pl = JSON.parse(readFileSync(plPath, "utf8")) as { rows: ErpProductRow[] };
console.log(`[step1] snapshot: ${plPath} · ERP rows=${pl.rows.length}`);

// ─── 2. Supabase products 전수 로드 ───────────────────────────────────────
async function loadAllProducts(): Promise<DbProductRow[]> {
  const out: DbProductRow[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("products")
      .select(
        "product_code, product_name, supplier, supplier_code, unit, sale_status, brand, manufacturer, " +
        "last_purchase_date, last_sale_date, current_stock, display_location, location, " +
        "optimal_stock, memo, hidden, stock_note, imported_at",
      )
      .range(from, from + 999);
    if (error) throw new Error(`products 조회 실패 · ${error.message}`);
    if (!data || data.length === 0) break;
    out.push(...(data as unknown as DbProductRow[]));
    if (data.length < 1000) break;
    from += 1000;
  }
  return out;
}
const dbRows = await loadAllProducts();
const dbByCode = new Map(dbRows.map((p) => [String(p.product_code).trim(), p]));
console.log(`[step2] DB products: ${dbRows.length}`);

// ─── 3. ERP Barcode 중복 체크 ─────────────────────────────────────────────
const erpBarcodeCount = new Map<string, number>();
for (const r of pl.rows) {
  const bc = String(r.BarCode ?? "").trim();
  if (!bc) continue;
  erpBarcodeCount.set(bc, (erpBarcodeCount.get(bc) ?? 0) + 1);
}

// ─── 4. UPDATE 후보 선정 (조건 전부 만족) ─────────────────────────────────
//   · ERP Barcode exists in DB
//   · ERP 안 Barcode 중복 아님
//   · current_stock 변경 필요
//   · Location REVIEW 아님
//   · changedCount 적은 순

interface Candidate {
  row: ErpProductRow;
  bc: string;
  dbRow: DbProductRow;
  changedCount: number;
  changedFields: string[];
  erpStock: number;
  dbStock: number | null;
  erpLoc: string;
  dbLoc: string | null;
  derivedLoc: string | null;
}

const candidates: Candidate[] = [];
for (const r of pl.rows) {
  const bc = String(r.BarCode ?? "").trim();
  if (!bc) continue;
  if ((erpBarcodeCount.get(bc) ?? 0) > 1) continue;
  const dbRow = dbByCode.get(bc);
  if (!dbRow) continue; // ERP_NEW 는 제외
  try {
    const result = buildErpProductPayload(r, dbRow);
    if (result.action !== "UPDATE") continue;
    if (result.locationDecision === "review") continue;
    if (!("current_stock" in result.payload)) continue; // current_stock 변경 없는 상품 제외
    // changedCount = payload keys 수
    const keys = Object.keys(result.payload);
    candidates.push({
      row: r,
      bc,
      dbRow,
      changedCount: keys.length,
      changedFields: keys,
      erpStock: Number(r.NowStock),
      dbStock: dbRow.current_stock ?? null,
      erpLoc: String(r.LocationName ?? ""),
      dbLoc: dbRow.display_location ?? dbRow.location ?? null,
      derivedLoc: result.locationResult.derived,
    });
  } catch {
    continue;
  }
}
candidates.sort((a, b) => a.changedCount - b.changedCount);
console.log(`[step3] UPDATE 후보 ${candidates.length}건 (변경 field 적은 순 정렬)`);

if (candidates.length === 0) {
  console.error("조건 만족 UPDATE 후보 없음 · 중단");
  process.exit(2);
}

const chosen = candidates[0];

// ─── 5. 선정 상품 보고 ────────────────────────────────────────────────────
console.log("\n===== 선정 상품 =====");
console.log(`PCode:             ${String(chosen.row.PCode ?? "")}`);
console.log(`Barcode:           ${chosen.bc}`);
console.log(`ProductName:       ${String(chosen.row.ProductName ?? "")}`);
console.log(``);
console.log(`ERP NowStock:      ${chosen.erpStock}`);
console.log(`DB current_stock:  ${chosen.dbStock}`);
console.log(``);
console.log(`ERP LocationName:  ${chosen.erpLoc || "(empty)"}`);
console.log(`DB location:       ${chosen.dbLoc ?? "(null)"}`);
console.log(`변환 후 location:  ${chosen.derivedLoc ?? "(none)"}`);
console.log(``);
console.log(`변경 예정 필드 (${chosen.changedCount}):`);
for (const f of chosen.changedFields) {
  const dbVal = (chosen.dbRow as any)[f];
  console.log(`  ${f.padEnd(22)} DB="${dbVal ?? ""}"`);
}

// ─── 6. 비교 상품 선정 (사후 미변경 확인용) ──────────────────────────────
const compareBarcode = dbRows.find((p) => String(p.product_code).trim() !== chosen.bc)!.product_code;
const { data: compareBefore } = await supabase
  .from("products")
  .select("product_code, product_name, current_stock, display_location, location, supplier, sale_status, optimal_stock, memo, hidden, stock_note")
  .eq("product_code", compareBarcode)
  .maybeSingle();
console.log(`\n[step6] 비교 대상 상품 · ${compareBarcode}`);

// ─── 7. BEFORE 상태 snapshot (대상 상품) ─────────────────────────────────
const { data: targetBefore, error: tbErr } = await supabase
  .from("products")
  .select("*")
  .eq("product_code", chosen.bc)
  .maybeSingle();
if (tbErr || !targetBefore) {
  console.error("대상 상품 BEFORE 조회 실패");
  process.exit(3);
}

// ─── 8. 다른 테이블 row count snapshot ────────────────────────────────────
async function countTable(name: string): Promise<number> {
  const { count, error } = await supabase.from(name).select("*", { count: "exact", head: true });
  if (error) throw new Error(`${name} count 실패 · ${error.message}`);
  return count ?? -1;
}
const beforeCounts = {
  products: await countTable("products"),
  purchase_details: await countTable("purchase_details"),
  stock_history: await countTable("stock_history"),
  inventory_checks: await countTable("inventory_checks"),
  vendors: await countTable("vendors"),
};
console.log(`\n[step8] 전 테이블 row count 기록`);

// ─── 9. DRY_RUN pre-flight ────────────────────────────────────────────────
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
console.log(`actualWrite:   ${dry.actualWriteExecuted}`);

if (dry.matched !== 1 || dry.wouldUpdate !== 1 || dry.wouldInsert !== 0 || dry.newInsert !== 0) {
  console.error("pre-flight 조건 불일치 · 중단");
  console.error(`  요구: matched=1 · wouldUpdate=1 · wouldInsert=0 · newInsert=0`);
  console.error(`  실제: matched=${dry.matched} wouldUpdate=${dry.wouldUpdate} wouldInsert=${dry.wouldInsert} newInsert=${dry.newInsert}`);
  process.exit(4);
}
console.log(`✓ pre-flight PASS · Target=1 · INSERT=0 · UPDATE=1 · DELETE=0`);

// ─── 10. WRITE 실행 ───────────────────────────────────────────────────────
console.log("\n===== WRITE 실행 =====");
process.env.ERP_SYNC_WRITE_ENABLED = "true"; // process-level gate (CLI 직접 호출엔 영향 없음 · 명시)
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
  w.sanitizedErrors.forEach((e) => console.log(`  err: ${e}`));
}

// ─── 11. 사후 검증 ────────────────────────────────────────────────────────
console.log("\n===== 사후 검증 =====");

const { data: targetAfter, error: taErr } = await supabase
  .from("products")
  .select("*")
  .eq("product_code", chosen.bc)
  .maybeSingle();
if (taErr || !targetAfter) {
  console.error("대상 상품 AFTER 조회 실패");
  process.exit(5);
}
const after: any = targetAfter;
const before: any = targetBefore;

// ERP vs DB 비교 (사용자 지시 11 필드)
const erpSnap: Record<string, unknown> = {
  product_code: chosen.bc,
  product_name: String(chosen.row.ProductName ?? "").trim(),
  current_stock: Number(chosen.row.NowStock),
  display_location: chosen.derivedLoc,
  location: chosen.derivedLoc,
  supplier: String(chosen.row.CorpNameView ?? "").trim(),
  supplier_code: String(chosen.row.CtCode ?? "").trim(),
  unit: String(chosen.row.UnitCode ?? "").trim(),
  sale_status: String(chosen.row.SaleStatusName ?? "").trim(),
  last_purchase_date: String(chosen.row.LastBuyDate ?? "").trim(),
  last_sale_date: String(chosen.row.LastSaleDate ?? "").trim(),
};

const fieldMatch: Record<string, { ok: boolean; erp: unknown; db: unknown }> = {};
for (const [k, v] of Object.entries(erpSnap)) {
  const dbVal = after[k];
  // empty string ↔ null 동일 취급
  const normV = v === "" ? null : v;
  const normDb = dbVal === "" ? null : dbVal;
  const ok = String(normV ?? "") === String(normDb ?? "");
  fieldMatch[k] = { ok, erp: v, db: dbVal };
}

// PROTECTED 필드 변경 여부
const protectedFields = ["optimal_stock", "optimal_stock_backup", "memo", "hidden", "stock_note", "imported_at"];
const protectedModified: string[] = [];
for (const f of protectedFields) {
  const b = before[f];
  const a = after[f];
  if (JSON.stringify(b) !== JSON.stringify(a)) {
    protectedModified.push(`${f}: ${JSON.stringify(b)} → ${JSON.stringify(a)}`);
  }
}

// 비교 상품 변경 여부
const { data: compareAfter } = await supabase
  .from("products")
  .select("product_code, product_name, current_stock, display_location, location, supplier, sale_status, optimal_stock, memo, hidden, stock_note")
  .eq("product_code", compareBarcode)
  .maybeSingle();
const otherProductModified: string[] = [];
if (compareBefore && compareAfter) {
  for (const k of Object.keys(compareBefore)) {
    const b = (compareBefore as any)[k];
    const a = (compareAfter as any)[k];
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      otherProductModified.push(`${k}: ${JSON.stringify(b)} → ${JSON.stringify(a)}`);
    }
  }
}

// 다른 테이블 변경 여부
const afterCounts = {
  products: await countTable("products"),
  purchase_details: await countTable("purchase_details"),
  stock_history: await countTable("stock_history"),
  inventory_checks: await countTable("inventory_checks"),
  vendors: await countTable("vendors"),
};
const otherTablesModified: string[] = [];
for (const t of ["products", "purchase_details", "stock_history", "inventory_checks", "vendors"] as const) {
  if (beforeCounts[t] !== afterCounts[t]) {
    otherTablesModified.push(`${t}: ${beforeCounts[t]} → ${afterCounts[t]}`);
  }
}

// 변경 대상 BEFORE 값 (사용자 지시 "BEFORE: 변경 대상 필드와 기존 값")
const beforeValues: Record<string, unknown> = {};
for (const f of chosen.changedFields) {
  beforeValues[f] = before[f];
}

// ─── 12. 최종 보고 ────────────────────────────────────────────────────────
const allFieldsMatch = Object.values(fieldMatch).every((f) => f.ok);
const pass =
  w.actualWriteExecuted === true &&
  w.inserted === 0 &&
  w.updated === 1 &&
  w.failed === 0 &&
  allFieldsMatch &&
  protectedModified.length === 0 &&
  otherProductModified.length === 0 &&
  otherTablesModified.length === 0 &&
  beforeCounts.products === afterCounts.products; // UPDATE 는 row count 불변

console.log("\n═══════════════════════════════════════");
console.log("최종 보고");
console.log("═══════════════════════════════════════");
console.log(`Selected Product:`);
console.log(`  Barcode:        ${chosen.bc}`);
console.log(`  ProductName:    ${String(chosen.row.ProductName ?? "")}`);
console.log(``);
console.log(`BEFORE · 변경 대상 필드와 기존 값:`);
for (const f of chosen.changedFields) {
  console.log(`  ${f.padEnd(22)} ${JSON.stringify(beforeValues[f])}`);
}
console.log(``);
console.log(`WRITE:`);
console.log(`  Inserted:       ${w.inserted}`);
console.log(`  Updated:        ${w.updated}`);
console.log(`  Deleted:        0 (Runner 는 DELETE 안 함)`);
console.log(``);
console.log(`AFTER · ERP vs Supabase 각 필드 일치 여부:`);
for (const [k, v] of Object.entries(fieldMatch)) {
  console.log(`  ${k.padEnd(22)} ${v.ok ? "✓" : "✗"} erp=${JSON.stringify(v.erp)} db=${JSON.stringify(v.db)}`);
}
console.log(``);
console.log(`Protected Fields Modified: ${protectedModified.length === 0 ? "0 ✓" : protectedModified.length}`);
protectedModified.forEach((m) => console.log(`  · ${m}`));
console.log(`Other Products Modified:   ${otherProductModified.length === 0 ? "0 ✓" : otherProductModified.length}`);
otherProductModified.forEach((m) => console.log(`  · ${m}`));
console.log(`Other Tables Modified:     ${otherTablesModified.length === 0 ? "0 ✓" : otherTablesModified.length}`);
otherTablesModified.forEach((m) => console.log(`  · ${m}`));
console.log(``);
console.log(`Row count: products ${beforeCounts.products} → ${afterCounts.products} (UPDATE 이므로 변화 없어야 함)`);
console.log(``);
console.log(`RESULT: ${pass ? "PASS" : "FAIL"}`);
console.log("═══════════════════════════════════════");

if (!pass) process.exit(10);
