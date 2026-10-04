// scripts/update-test-single-product-2026-10-04.ts
// 2026-10-04 · Single Product UPDATE 실전 검증 (ERP → Supabase)
//
// 목적:
//   기존 syncProducts (productSyncRunner) + onlyProductCodes allowlist 재사용으로
//   정확히 1건 기존 상품의 UPDATE 파이프라인 검증.
//
// 범위:
//   · Mapping · Local Diff · Supabase Final Diff · WRITE · Read-back · Protected check · Other-table check
//
// 제외 field (Audit 결과 UNRESOLVED):
//   purchase_price · sale_price · category · category_code · unit_price · origin · spec · expiry_date
//   (이들은 whitelist 에서 자연스럽게 제외됨 · erpSyncWhitelist.ts 참조)
//
// 안전:
//   · DRY_RUN preflight · UPDATE=1 · INSERT=0 확인 후에만 WRITE
//   · onlyProductCodes allowlist 로 다른 상품 영향 차단
//   · Last-Synced 승격 안 함
//   · 전체 WRITE 금지

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

const PROTECTED_FIELDS = [
  "optimal_stock", "optimal_stock_backup", "memo", "hidden", "stock_note",
  "imported_at", "min_order", "search_keywords", "expiry_date",
] as const;

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
      .select("*")
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

// ─── 3. Barcode / PCode 중복 집계 (conflict 상품 제외) ────────────────────
const bcCount = new Map<string, number>();
const pcCount = new Map<string, number>();
for (const r of pl.rows) {
  const bc = String(r.BarCode ?? "").trim();
  const pc = String(r.PCode ?? "").trim();
  if (bc) bcCount.set(bc, (bcCount.get(bc) ?? 0) + 1);
  if (pc) pcCount.set(pc, (pcCount.get(pc) ?? 0) + 1);
}

// ─── 4. 후보 선정 ─────────────────────────────────────────────────────────
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
  const pc = String(r.PCode ?? "").trim();
  if (!bc || !pc) continue;
  // 중복 Barcode / PCode 제외
  if ((bcCount.get(bc) ?? 0) > 1) continue;
  if ((pcCount.get(pc) ?? 0) > 1) continue;
  // DB 에 존재해야 함 (UPDATE 대상)
  const dbRow = dbByCode.get(bc);
  if (!dbRow) continue;
  // 13자리 numeric Barcode (가장 전형)
  if (!/^\d{13}$/.test(bc)) continue;
  // ProductName ≠ Barcode (realistic product name)
  const name = String(r.ProductName ?? "").trim();
  if (!name || name === bc) continue;
  if (name.length < 3) continue;
  try {
    const result = buildErpProductPayload(r, dbRow);
    if (result.action !== "UPDATE") continue;
    if (result.locationDecision === "review") continue;
    // current_stock 변경 필수
    if (!("current_stock" in result.payload)) continue;
    const keys = Object.keys(result.payload);
    candidates.push({
      row: r,
      bc,
      dbRow,
      changedCount: keys.length,
      changedFields: keys,
      erpStock: Number(r.NowStock),
      dbStock: dbRow.current_stock == null ? null : Number(dbRow.current_stock),
      erpLoc: String(r.LocationName ?? ""),
      dbLoc: dbRow.display_location ?? dbRow.location ?? null,
      derivedLoc: result.locationResult.derived,
    });
  } catch {
    continue;
  }
}
candidates.sort((a, b) => a.changedCount - b.changedCount);
console.log(`[step4] UPDATE 후보 ${candidates.length}건 (변경 field 적은 순)`);

if (candidates.length === 0) {
  console.error("조건 만족 UPDATE 후보 없음 · 중단");
  process.exit(2);
}
const chosen = candidates[0];

// ─── 5. ERP CANDIDATE 출력 ────────────────────────────────────────────────
console.log("\n===== SINGLE PRODUCT UPDATE TEST =====");
console.log(`\nProduct:`);
console.log(`  PCode:         ${String(chosen.row.PCode ?? "")}`);
console.log(`  Barcode:       ${chosen.bc}`);
console.log(`  Product Name:  ${String(chosen.row.ProductName ?? "")}`);

// ─── 6. BEFORE 상태 재조회 (전체 column) ──────────────────────────────────
const { data: beforeRow } = await supabase.from("products").select("*").eq("product_code", chosen.bc).maybeSingle();
if (!beforeRow) {
  console.error("BEFORE 상태 조회 실패");
  process.exit(3);
}
const before: any = beforeRow;

console.log(`\n===== BEFORE =====`);
console.log(`  current_stock:       ${before.current_stock}`);
console.log(`  display_location:    ${before.display_location}`);
console.log(`  location:            ${before.location}`);
console.log(`  supplier:            ${before.supplier}`);
console.log(`  supplier_code:       ${before.supplier_code}`);
console.log(`  unit:                ${before.unit}`);
console.log(`  sale_status:         ${before.sale_status}`);
console.log(`  brand:               ${before.brand}`);
console.log(`  manufacturer:        ${before.manufacturer}`);
console.log(`  last_purchase_date:  ${before.last_purchase_date}`);
console.log(`  last_sale_date:      ${before.last_sale_date}`);

console.log(`\n===== ERP CANDIDATE =====`);
console.log(`  NowStock:            ${chosen.row.NowStock}`);
console.log(`  LocationName:        ${chosen.row.LocationName}`);
console.log(`  → derived location:  ${chosen.derivedLoc}`);
console.log(`  CorpNameView:        ${chosen.row.CorpNameView}`);
console.log(`  CtCode:              ${chosen.row.CtCode}`);
console.log(`  UnitCode:            ${chosen.row.UnitCode}`);
console.log(`  SaleStatusName:      ${chosen.row.SaleStatusName}`);
console.log(`  Brand:               ${chosen.row.Brand}`);
console.log(`  Maker:               ${chosen.row.Maker}`);
console.log(`  LastBuyDate:         ${chosen.row.LastBuyDate}`);
console.log(`  LastSaleDate:        ${chosen.row.LastSaleDate}`);

// ─── 7. FINAL DIFF ───────────────────────────────────────────────────────
const payloadResult = buildErpProductPayload(chosen.row, chosen.dbRow);
console.log(`\n===== FINAL DIFF (Mapping payload) =====`);
console.log(`Changed Fields (${payloadResult.changedCount}):`);
for (const field of chosen.changedFields) {
  const dbVal = (chosen.dbRow as any)[field];
  const erpVal = (payloadResult.payload as any)[field];
  console.log(`  ${field.padEnd(22)} DB="${dbVal ?? ""}" → ERP="${erpVal ?? ""}"`);
}

// PROTECTED 가 payload 에 섞여있지 않은지 pre-check
const protectedInPayload = PROTECTED_FIELDS.filter((f) => f in payloadResult.payload);
if (protectedInPayload.length > 0) {
  console.error(`\n✗ PROTECTED field 가 payload 에 포함됨: ${protectedInPayload.join(", ")}`);
  console.error("Mapper 결함 · STOP");
  process.exit(4);
}
console.log(`\n✓ PROTECTED field payload 제외 확인`);

// ─── 8. 다른 상품 1건 BEFORE 기록 (사후 미변경 확인용) ───────────────────
const compareBarcode = dbRows.find((p) => String(p.product_code).trim() !== chosen.bc)!.product_code;
const { data: compareBefore } = await supabase.from("products").select("*").eq("product_code", compareBarcode).maybeSingle();

// ─── 9. 다른 테이블 row count 기록 ────────────────────────────────────────
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

// ─── 10. DRY_RUN preflight ────────────────────────────────────────────────
console.log(`\n===== DRY_RUN preflight =====`);
const dry = await syncProducts(supabase, {
  mode: "DRY_RUN",
  allowWrite: false,
  source: "SNAPSHOT",
  onlyProductCodes: [chosen.bc],
});
console.log(`matched=${dry.matched} newInsert=${dry.newInsert} wouldUpdate=${dry.wouldUpdate} wouldInsert=${dry.wouldInsert} wouldSkipSame=${dry.wouldSkipSame}`);
if (dry.matched !== 1 || dry.wouldUpdate !== 1 || dry.wouldInsert !== 0 || dry.newInsert !== 0) {
  console.error("preflight 조건 불일치 · STOP");
  console.error(`  요구: matched=1 · wouldUpdate=1 · wouldInsert=0 · newInsert=0`);
  process.exit(5);
}
console.log(`✓ preflight PASS · Target=1 · INSERT=0 · UPDATE=1 · DELETE=0`);

// ─── 11. 실제 WRITE ──────────────────────────────────────────────────────
console.log(`\n===== WRITE 실행 =====`);
process.env.ERP_SYNC_WRITE_ENABLED = "true"; // CLI 직접 호출엔 영향 없지만 명시
const w = await syncProducts(supabase, {
  mode: "WRITE",
  allowWrite: true,
  source: "SNAPSHOT",
  onlyProductCodes: [chosen.bc],
});
console.log(`actualWriteExecuted: ${w.actualWriteExecuted}`);
console.log(`inserted: ${w.inserted} updated: ${w.updated} failed: ${w.failed}`);
console.log(`protectedMutation: ${w.protectedMutationCount}`);
if (w.sanitizedErrors.length > 0) w.sanitizedErrors.forEach((e) => console.log(`  err: ${e}`));

// ─── 12. READ-BACK 즉시 재조회 ────────────────────────────────────────────
const { data: afterRow } = await supabase.from("products").select("*").eq("product_code", chosen.bc).maybeSingle();
if (!afterRow) {
  console.error("AFTER 조회 실패");
  process.exit(6);
}
const after: any = afterRow;

// ─── 13. ERP MAPPED FIELDS Expected vs Actual ─────────────────────────────
console.log(`\n===== READ-BACK · Mapped Fields =====`);
const expectedMap: Record<string, unknown> = {
  current_stock: Number(chosen.row.NowStock),
  display_location: chosen.derivedLoc,
  location: chosen.derivedLoc,
  supplier: String(chosen.row.CorpNameView ?? "").trim(),
  supplier_code: String(chosen.row.CtCode ?? "").trim(),
  unit: String(chosen.row.UnitCode ?? "").trim(),
  sale_status: String(chosen.row.SaleStatusName ?? "").trim(),
  brand: String(chosen.row.Brand ?? "").trim(),
  manufacturer: String(chosen.row.Maker ?? "").trim(),
  last_purchase_date: String(chosen.row.LastBuyDate ?? "").trim(),
  last_sale_date: String(chosen.row.LastSaleDate ?? "").trim(),
};

const mappedMatch: Record<string, { match: boolean; expected: unknown; actual: unknown; note?: string }> = {};
for (const [k, exp] of Object.entries(expectedMap)) {
  const act = after[k];
  // ERP 가 empty 로 보냈을 때 (예: last_sale_date="") → NULL overwrite 금지 설계 ·
  //   payload 에 포함되지 않았음 → DB 가 변경되지 않음 (before 값 유지)
  const payloadHas = k in payloadResult.payload;
  const beforeVal = before[k];
  if (!payloadHas) {
    // payload 에 없는 field · DB 는 before 값 그대로 유지되어야 함
    const match = JSON.stringify(beforeVal) === JSON.stringify(act);
    mappedMatch[k] = { match, expected: beforeVal, actual: act, note: "KEEP (ERP empty, payload exclude)" };
  } else {
    // payload 에 포함된 field · DB 가 ERP 값과 일치해야 함
    const normExp = exp == null || (typeof exp === "string" && exp.trim() === "") ? null : exp;
    const normAct = act == null || (typeof act === "string" && act.trim() === "") ? null : act;
    let match: boolean;
    if (typeof normExp === "number" || typeof normAct === "number") {
      const ne = typeof normExp === "number" ? normExp : Number(String(normExp));
      const na = typeof normAct === "number" ? normAct : Number(String(normAct));
      match = Number.isFinite(ne) && Number.isFinite(na) && Math.abs(ne - na) < 0.0001;
    } else {
      match = String(normExp ?? "") === String(normAct ?? "");
    }
    mappedMatch[k] = { match, expected: exp, actual: act };
  }
}
let allMapsMatch = true;
for (const [k, v] of Object.entries(mappedMatch)) {
  if (!v.match) allMapsMatch = false;
  const marker = v.match ? "✓" : "✗";
  const noteStr = v.note ? ` [${v.note}]` : "";
  console.log(`  ${marker} ${k.padEnd(22)} expected=${JSON.stringify(v.expected)} actual=${JSON.stringify(v.actual)}${noteStr}`);
}

// ─── 14. PROTECTED 미변경 검증 ───────────────────────────────────────────
console.log(`\n===== PROTECTED FIELDS 변경 여부 =====`);
const protectedModified: string[] = [];
for (const f of PROTECTED_FIELDS) {
  const b = (before as any)[f];
  const a = (after as any)[f];
  const same = JSON.stringify(b) === JSON.stringify(a);
  console.log(`  ${same ? "✓" : "✗"} ${f.padEnd(22)} before=${JSON.stringify(b)} after=${JSON.stringify(a)}`);
  if (!same) protectedModified.push(f);
}

// ─── 15. 다른 상품 미변경 검증 ───────────────────────────────────────────
const { data: compareAfter } = await supabase.from("products").select("*").eq("product_code", compareBarcode).maybeSingle();
const otherProductMods: string[] = [];
if (compareBefore && compareAfter) {
  for (const k of Object.keys(compareBefore)) {
    const b = (compareBefore as any)[k];
    const a = (compareAfter as any)[k];
    if (JSON.stringify(b) !== JSON.stringify(a)) {
      otherProductMods.push(`${k}: ${JSON.stringify(b)} → ${JSON.stringify(a)}`);
    }
  }
}

// ─── 16. 다른 테이블 row count 재확인 ────────────────────────────────────
const afterCounts = {
  products: await countTable("products"),
  purchase_details: await countTable("purchase_details"),
  stock_history: await countTable("stock_history"),
  inventory_checks: await countTable("inventory_checks"),
  vendors: await countTable("vendors"),
};
const tableMods: string[] = [];
for (const t of ["products", "purchase_details", "stock_history", "inventory_checks", "vendors"] as const) {
  if (beforeCounts[t] !== afterCounts[t]) tableMods.push(`${t}: ${beforeCounts[t]} → ${afterCounts[t]}`);
}
// products 는 UPDATE 이므로 row count 변화 X 가 정상

// ─── 17. PASS/FAIL 판정 ──────────────────────────────────────────────────
const pass =
  w.actualWriteExecuted === true &&
  w.inserted === 0 &&
  w.updated === 1 &&
  w.failed === 0 &&
  allMapsMatch &&
  protectedModified.length === 0 &&
  otherProductMods.length === 0 &&
  tableMods.length === 0 &&
  beforeCounts.products === afterCounts.products;

console.log(`\n═══════════════════════════════════════`);
console.log(`최종 보고`);
console.log(`═══════════════════════════════════════`);
console.log(`\nProduct:`);
console.log(`  PCode:         ${String(chosen.row.PCode ?? "")}`);
console.log(`  Barcode:       ${chosen.bc}`);
console.log(`  Product Name:  ${String(chosen.row.ProductName ?? "")}`);
console.log(`\n===== WRITE =====`);
console.log(`  Target Products: 1`);
console.log(`  Inserted:        ${w.inserted}`);
console.log(`  Updated:         ${w.updated}`);
console.log(`  Deleted:         0`);
console.log(`\n===== READ-BACK · Mapped Fields Match =====`);
console.log(`  ${allMapsMatch ? "✓ ALL MATCH" : "✗ MISMATCH 발견"}`);
console.log(`\n===== PROTECTED FIELDS =====`);
console.log(`  Protected Mutation: ${protectedModified.length === 0 ? "0 ✓" : protectedModified.length}`);
protectedModified.forEach((m) => console.log(`  · ${m}`));
console.log(`\n===== SIDE EFFECT =====`);
console.log(`  Other Products Modified:   ${otherProductMods.length === 0 ? "0 ✓" : otherProductMods.length}`);
otherProductMods.forEach((m) => console.log(`  · ${m}`));
console.log(`  purchase_details Modified: ${beforeCounts.purchase_details === afterCounts.purchase_details ? "0 ✓" : `${beforeCounts.purchase_details} → ${afterCounts.purchase_details}`}`);
console.log(`  stock_history Modified:    ${beforeCounts.stock_history === afterCounts.stock_history ? "0 ✓" : `${beforeCounts.stock_history} → ${afterCounts.stock_history}`}`);
console.log(`  inventory_checks Modified: ${beforeCounts.inventory_checks === afterCounts.inventory_checks ? "0 ✓" : `${beforeCounts.inventory_checks} → ${afterCounts.inventory_checks}`}`);
console.log(`  vendors Modified:          ${beforeCounts.vendors === afterCounts.vendors ? "0 ✓" : `${beforeCounts.vendors} → ${afterCounts.vendors}`}`);
console.log(`  Deletes:                   0 ✓`);
console.log(`\n===== SNAPSHOT =====`);
console.log(`  Candidate Modified:     NO (이 스크립트는 snapshot 파일을 변경하지 않음)`);
console.log(`  Last-Synced Promoted:   NO (단일 UPDATE 테스트는 전체 Promotion 금지)`);
console.log(`\n===== RESULT =====`);
console.log(`  ${pass ? "✓ PASS" : "✗ FAIL"}`);

if (!pass) {
  console.log(`\n(FAIL · 원인 분석 필요 · STOP · 다른 상품 자동 재시도 금지)`);
  process.exit(10);
}

console.log(`\n═══════════════════════════════════════`);
console.log(`NEXT STEP (실행하지 않음 · 사용자 승인 대기):`);
console.log(`  "5~10개 Mixed Product Batch Sync Test" 를 다음 단계로 제안.`);
console.log(`═══════════════════════════════════════`);
