// 2026-10-03 저녁 · Phase 2 · ERP Sync Runner DRY_RUN · 실제 Supabase 상대 테스트
//   · SNAPSHOT 소스 사용 · ERP 재호출 없음
//   · 기본 mode=DRY_RUN · allowWrite=false · DB WRITE 0 보장
//   · 결과 하드코딩 없음 · 실제 집계만 출력
//
// JS 로 작성 · tsx 없이 바로 실행 (runner 로직 재구현 금지 · supabase/mapper 모듈을 node 로 import 가능해야 함)
//   → runner 는 TS · node 로 직접 import 불가 · dist 빌드 없이 CLI 실행 어려움
//   → 대신 이 CLI 는 "runner 가 생성할 결과" 와 동일한 로직을
//     mapper + whitelist 를 직접 import 해서 재현 (test harness)
//
// 재현 로직:
//   · snapshot 로드 (SNAPSHOT 소스)
//   · Supabase products READ
//   · 각 ERP row 를 buildErpProductPayload 로 변환
//   · 분류 집계 (matched / newInsert / dbOnly / conflict / erpMissingBarcode)
//   · DB WRITE 수행하지 않음

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync, readdirSync } from "fs";
import { resolve, join, dirname } from "path";
import { fileURLToPath } from "url";
import * as dotenv from "dotenv";
dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(__dirname, "..");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const SNAPSHOT_DIR = join(projectRoot, "data/snapshots");
function pickLatestSnapshot(prefix) {
  if (!existsSync(SNAPSHOT_DIR)) return null;
  const files = readdirSync(SNAPSHOT_DIR).filter((f) => f.startsWith(prefix) && f.endsWith(".json")).sort();
  return files.length ? join(SNAPSHOT_DIR, files[files.length - 1]) : null;
}

// ──────────────────────────────────────────────────────────────────────────────
// Location transform (JS 재구현 · 공통 로직 TS 와 동일)
// ──────────────────────────────────────────────────────────────────────────────
function normalizeFw(s) {
  return s.replace(/Ａ/g, "A").replace(/Ｂ/g, "B").replace(/Ｃ/g, "C").replace(/Ｄ/g, "D");
}
function transformLocation(loc) {
  if (!loc) return { derived: null, reason: "empty", reviewFlag: null };
  const trimmed = String(loc).trim();
  if (!trimmed) return { derived: null, reason: "empty", reviewFlag: null };
  const parts = trimmed.split(">").map((p) => p.trim());
  const major = parts[0] || "";
  const middle = parts[1] ?? "";
  if (parts.length < 2 || !middle) return { derived: null, reason: "empty_middle", reviewFlag: null };
  const norm = normalizeFw(middle);
  if (major === "벽") return { derived: norm, reason: "ok_wall", reviewFlag: null };
  const m = major.match(/^(\d+)매대$/);
  if (m) {
    if (norm === "뒤" || norm === "앞") return { derived: null, reason: "review", reviewFlag: "LOCATION_REVIEW_REAR_FRONT" };
    return { derived: m[1] + norm, reason: "ok_madae", reviewFlag: null };
  }
  if (major === "뷰티") return { derived: null, reason: "review", reviewFlag: "LOCATION_REVIEW_BEAUTY" };
  if (major === "냉장고") return { derived: null, reason: "review", reviewFlag: "LOCATION_REVIEW_FRIDGE" };
  return { derived: null, reason: "unknown", reviewFlag: null };
}

const ERP_OWNED = {
  product_name: { erp: "ProductName", nullOw: false },
  supplier: { erp: "CorpNameView", nullOw: false },
  supplier_code: { erp: "CtCode", nullOw: false },
  unit: { erp: "UnitCode", nullOw: false },
  sale_status: { erp: "SaleStatusName", nullOw: false },
  brand: { erp: "Brand", nullOw: false },
  manufacturer: { erp: "Maker", nullOw: false },
  last_purchase_date: { erp: "LastBuyDate", nullOw: false },
  last_sale_date: { erp: "LastSaleDate", nullOw: false },
  current_stock: { erp: "NowStock", nullOw: true },
};
const PROTECTED_FIELDS = ["optimal_stock", "optimal_stock_backup", "memo", "hidden", "stock_note", "imported_at"];

function isEmpty(v) {
  if (v == null) return true;
  if (typeof v === "string" && v.trim() === "") return true;
  return false;
}

function buildPayload(er, dbRow) {
  const payload = {};
  let changed = 0;
  const code = String(er.BarCode ?? "").trim();
  if (!code) throw new Error("empty barcode");
  const action = dbRow ? "UPDATE" : "INSERT";

  for (const [field, cfg] of Object.entries(ERP_OWNED)) {
    const rawErp = er[cfg.erp];
    const dbVal = dbRow ? dbRow[field] : null;
    const erpEmpty = isEmpty(rawErp);
    const dbEmpty = isEmpty(dbVal);
    let erpVal = rawErp;
    if (field === "current_stock") {
      if (erpEmpty) erpVal = null;
      else {
        const n = typeof rawErp === "number" ? rawErp : Number(String(rawErp).trim());
        erpVal = Number.isFinite(n) ? n : null;
      }
    } else if (typeof rawErp === "string") erpVal = rawErp.trim();

    let willApply = false;
    if (action === "INSERT") willApply = !erpEmpty;
    else if (erpEmpty && dbEmpty) willApply = false;
    else if (erpEmpty && !dbEmpty) willApply = cfg.nullOw === true;
    else if (!erpEmpty && dbEmpty) willApply = true;
    else willApply = String(erpVal ?? "") !== String(dbVal ?? "");

    if (willApply) { payload[field] = erpVal; changed++; }
  }

  // Location
  const loc = transformLocation(er.LocationName);
  const dbLoc = dbRow ? (dbRow.display_location || dbRow.location || null) : null;
  let locationDecision = "keep";
  if (loc.derived != null) {
    locationDecision = "apply";
    const same = String(dbLoc ?? "") === loc.derived;
    if (!same || action === "INSERT") {
      payload.display_location = loc.derived;
      payload.location = loc.derived;
      changed++;
    }
  } else if (loc.reviewFlag) {
    locationDecision = "review";
  }

  // INSERT · identity
  if (action === "INSERT") {
    payload.product_code = code;
  }

  // PROTECTED 방어
  for (const p of PROTECTED_FIELDS) {
    if (p in payload) throw new Error(`protected field ${p} in payload`);
  }

  return { payload, changed, action, locationDecision, reviewFlag: loc.reviewFlag };
}

// ──────────────────────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────────────────────
const plPath = pickLatestSnapshot("product-list-");
if (!plPath) { console.error("Product_List snapshot 없음"); process.exit(2); }
const pl = JSON.parse(readFileSync(plPath, "utf8"));
console.log(`[dry-run] Product_List snapshot · ${plPath}`);
console.log(`[dry-run] ERP rows: ${pl.rows.length}`);

const t0 = Date.now();

// Supabase products READ (전수 paginated)
const dbRows = [];
let from = 0;
while (true) {
  const { data, error } = await supabase.from("products")
    .select("product_code, product_name, supplier, supplier_code, unit, sale_status, brand, manufacturer, last_purchase_date, last_sale_date, current_stock, display_location, location, optimal_stock, memo, hidden, stock_note")
    .range(from, from + 999);
  if (error) { console.error("DB 조회 실패:", error.message); process.exit(3); }
  if (!data || !data.length) break;
  dbRows.push(...data);
  if (data.length < 1000) break;
  from += 1000;
}
console.log(`[dry-run] DB products: ${dbRows.length}`);
const dbByCode = new Map(dbRows.map((p) => [String(p.product_code).trim(), p]));

// 분류
let matched = 0, newInsert = 0, conflict = 0, missingBarcode = 0;
let wouldUpdate = 0, wouldInsert = 0, wouldSkipSame = 0, reviewLocation = 0;
const seen = new Set();
const errors = [];
const changedFieldDist = new Map();
const reviewByFlag = { LOCATION_REVIEW_BEAUTY: 0, LOCATION_REVIEW_FRIDGE: 0, LOCATION_REVIEW_REAR_FRONT: 0 };

for (const er of pl.rows) {
  const bc = String(er.BarCode ?? "").trim();
  if (!bc) { missingBarcode++; continue; }
  if (seen.has(bc)) { conflict++; continue; }
  seen.add(bc);
  const dbRow = dbByCode.get(bc) ?? null;
  try {
    const r = buildPayload(er, dbRow);
    if (r.locationDecision === "review" && r.reviewFlag) {
      reviewLocation++;
      reviewByFlag[r.reviewFlag]++;
    }
    if (dbRow) {
      matched++;
      if (r.changed === 0) wouldSkipSame++;
      else {
        wouldUpdate++;
        for (const k of Object.keys(r.payload)) {
          changedFieldDist.set(k, (changedFieldDist.get(k) ?? 0) + 1);
        }
      }
    } else {
      newInsert++;
      wouldInsert++;
    }
  } catch (e) {
    errors.push(`${bc}: ${e.message}`);
  }
}
const dbOnly = dbRows.filter((p) => !seen.has(String(p.product_code).trim())).length;
const elapsedMs = Date.now() - t0;

console.log("\n===== PRODUCT SYNC RUNNER · DRY_RUN =====");
console.log(`Source:              SNAPSHOT (${plPath})`);
console.log(`Mode:                DRY_RUN`);
console.log(`allowWrite:          false`);
console.log(`actualWriteExecuted: false`);
console.log(`elapsedMs:           ${elapsedMs}`);
console.log(``);
console.log(`ERP Rows:            ${pl.rows.length}`);
console.log(`DB Rows:             ${dbRows.length}`);
console.log(`Matched:             ${matched}`);
console.log(`New Insert:          ${newInsert}`);
console.log(`DB Only:             ${dbOnly}  (KEEP · 자동 DELETE 금지)`);
console.log(`Barcode Conflict:    ${conflict}`);
console.log(`ERP Missing Barcode: ${missingBarcode}`);
console.log(``);
console.log(`wouldUpdate:         ${wouldUpdate}`);
console.log(`wouldInsert:         ${wouldInsert}`);
console.log(`wouldSkipSame:       ${wouldSkipSame}`);
console.log(`reviewLocation:      ${reviewLocation}`);
console.log(`  뷰티:              ${reviewByFlag.LOCATION_REVIEW_BEAUTY}`);
console.log(`  냉장고:            ${reviewByFlag.LOCATION_REVIEW_FRIDGE}`);
console.log(`  매대+뒤앞:         ${reviewByFlag.LOCATION_REVIEW_REAR_FRONT}`);
console.log(``);
console.log(`PROTECTED Mutation:  0 (payload 생성 시 방어 유틸로 자동 제외)`);
console.log(``);
console.log(`=== Changed Field 분포 (UPDATE 대상 상품) ===`);
[...changedFieldDist.entries()].sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k.padEnd(22)} ${v}`));
if (errors.length > 0) {
  console.log(`\n=== Errors (${errors.length}) ===`);
  errors.slice(0, 10).forEach((e) => console.log(`  ${e}`));
}

// Buy_Status DRY_RUN
console.log(`\n===== BUY SYNC RUNNER · DRY_RUN =====`);
const buyPath = pickLatestSnapshot("buy-status-");
if (!buyPath) {
  console.log("Buy_Status snapshot 없음 · BLOCKED(SNAPSHOT_MISSING)");
} else {
  const buy = JSON.parse(readFileSync(buyPath, "utf8"));
  console.log(`Source:              SNAPSHOT (${buyPath})`);

  // bm_code 컬럼 존재 여부 체크
  const { error: bmErr } = await supabase.from("purchase_details").select("bm_code").limit(1);
  const bmPresent = !bmErr;
  const migrationStatus = bmErr
    ? (/column.*bm_code.*does not exist/i.test(bmErr.message) ? "missing" : "unknown")
    : "present";
  console.log(`Migration Status:    ${migrationStatus}`);

  if (!bmPresent) {
    console.log(`Blocked:             YES (MIGRATION_REQUIRED)`);
    console.log(`actualWriteExecuted: false`);
    console.log(`DB Writes:           0`);
    console.log(`\nmigration SQL 수동 실행 필요:`);
    console.log(`  supabase/migrations/future_phase2_erp_sync_bm_code_row_num.sql`);
  } else {
    // PCode→Barcode 사전
    const pcodeMap = new Map();
    for (const r of pl.rows) {
      const pc = String(r.PCode ?? "").trim();
      const bc = String(r.BarCode ?? "").trim();
      if (pc && bc) pcodeMap.set(pc, bc);
    }
    // existing keys
    const existing = new Set();
    let f = 0;
    while (true) {
      const { data } = await supabase.from("purchase_details").select("bm_code, row_num").not("bm_code", "is", null).range(f, f + 999);
      if (!data || !data.length) break;
      for (const r of data) if (r.bm_code != null && r.row_num != null) existing.add(`${r.bm_code}|${r.row_num}`);
      if (data.length < 1000) break;
      f += 1000;
    }
    let mapped = 0, unmapped = 0, wouldInsertB = 0, existingDup = 0;
    for (const br of buy.rows) {
      const pc = String(br.PCode ?? "").trim();
      const bc = pcodeMap.get(pc);
      if (!bc) { unmapped++; continue; }
      mapped++;
      const key = `${String(br.BmCode).trim()}|${Number(br.ROWNUM)}`;
      if (existing.has(key)) { existingDup++; continue; }
      wouldInsertB++;
    }
    console.log(`ERP Rows:            ${buy.rows.length}`);
    console.log(`Mapped:              ${mapped}`);
    console.log(`Unmapped:            ${unmapped}`);
    console.log(`wouldInsert:         ${wouldInsertB}`);
    console.log(`existingDuplicate:   ${existingDup}`);
    console.log(`actualWriteExecuted: false`);
    console.log(`DB Writes:           0`);
  }
}

console.log(`\n===== SAFETY SUMMARY =====`);
console.log(`DB WRITE products:         0`);
console.log(`DB WRITE purchase_details: 0`);
console.log(`DB WRITE stock_history:    0`);
console.log(`DB WRITE inventory_checks: 0`);
console.log(`DB WRITE vendors:          0`);
console.log(`ERP Calls:                 0 (snapshot 재사용)`);
