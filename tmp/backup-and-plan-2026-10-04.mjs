// READ ONLY · 백업 + FK 영향 분석 + 삭제 계획 (DELETE 실행 X)
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "fs";
import { gzipSync, gunzipSync } from "zlib";

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY,
  { auth: { persistSession: false } },
);

const ts = new Date();
const stamp = ts.toISOString().replace(/[:.]/g, "-").slice(0, 19);
const BACKUP_DIR = `D:/antigravity_projects/megatown-staff-scheduler/tmp/backup-${stamp}`;
mkdirSync(BACKUP_DIR, { recursive: true });

const TABLES = [
  "products",
  "purchase_details",
  "stock_history",
  "inventory_checks",
  "order_requests",
  "vendors",
  "supplier_payments",
  "employees",
  "contracts",
  "schedules",
  "zone_assignments",
  "zone_labels",
  "borrowings",
  "notifications",
  "return_requests",
  "credit_cards",
  "loss_tracking_daily",
  "sync_log",
  "stock_import_log",
  "ocr_supplier_aliases",
  "ocr_templates",
  "ocr_synonyms",
];

const results = [];
let totalRows = 0;
let totalBytes = 0;

for (const table of TABLES) {
  const rows = [];
  let from = 0;
  let errored = false;
  while (true) {
    const { data, error } = await sb.from(table).select("*").range(from, from + 999);
    if (error) {
      if (/relation .* does not exist|not found/i.test(error.message)) {
        results.push({ table, status: "NOT_FOUND", rows: 0, bytes: 0 });
        errored = true;
        break;
      }
      results.push({ table, status: "ERROR", rows: 0, bytes: 0, error: error.message });
      errored = true;
      break;
    }
    if (!data || data.length === 0) break;
    rows.push(...data);
    if (data.length < 1000) break;
    from += 1000;
  }
  if (errored) { console.log(`${table}: skip`); continue; }
  const json = JSON.stringify(rows);
  const gz = gzipSync(Buffer.from(json, "utf8"));
  const path = `${BACKUP_DIR}/${table}.json.gz`;
  writeFileSync(path, gz);
  // 검증 · 재로드하여 count 일치 확인
  const roundtrip = JSON.parse(gunzipSync(readFileSync(path)).toString("utf8"));
  const verifyOk = roundtrip.length === rows.length;
  // 재조회 count 재확인 (export 중 변동 없는지)
  const { count: recount } = await sb.from(table).select("*", { count: "exact", head: true });
  const countStable = recount === rows.length;
  results.push({
    table,
    status: verifyOk && countStable ? "OK" : "VERIFY_FAIL",
    rows: rows.length,
    bytes: gz.length,
    verifyOk, countStable, recount,
    path,
  });
  totalRows += rows.length;
  totalBytes += gz.length;
  console.log(`${table}: ${rows.length} rows · ${(gz.length / 1024).toFixed(1)} KB · verify=${verifyOk} · stable=${countStable}`);
}

console.log("");
console.log("============== 백업 요약 ==============");
console.log("백업 위치:", BACKUP_DIR);
console.log("백업 시각:", ts.toISOString());
console.log("총 rows:", totalRows);
console.log("총 bytes:", (totalBytes / 1024 / 1024).toFixed(2), "MB");
console.log("");
for (const r of results) {
  console.log(`  ${r.table}: ${r.status} · ${r.rows} rows`);
}

// ===== FK 영향 분석 =====
console.log("");
console.log("============== FK 영향 분석 ==============");
const nullPcodeCodes = [];
{
  const { data } = await sb.from("products").select("product_code").is("pcode", null);
  for (const d of data ?? []) nullPcodeCodes.push(d.product_code);
}
console.log("pcode IS NULL products:", nullPcodeCodes.length);

const refTables = [
  { table: "purchase_details", col: "product_code" },
  { table: "stock_history", col: "product_code" },
  { table: "inventory_checks", col: "product_code" },
  { table: "order_requests", col: "product_code" },
];
const refCounts = {};
for (const { table, col } of refTables) {
  let refTotal = 0;
  const chunk = 500;
  for (let i = 0; i < nullPcodeCodes.length; i += chunk) {
    const slice = nullPcodeCodes.slice(i, i + chunk);
    const { count } = await sb.from(table).select("*", { count: "exact", head: true }).in(col, slice);
    refTotal += (count ?? 0);
  }
  refCounts[table] = refTotal;
  console.log(`  ${table}.${col}: ${refTotal} rows 참조`);
}

// 참조 상품 수 vs 미참조 상품 수 재집계
const refByCode = new Map();
for (const code of nullPcodeCodes) refByCode.set(code, 0);
for (const { table, col } of refTables) {
  const chunk = 500;
  for (let i = 0; i < nullPcodeCodes.length; i += chunk) {
    const slice = nullPcodeCodes.slice(i, i + chunk);
    const { data } = await sb.from(table).select(col).in(col, slice);
    for (const r of data ?? []) {
      const c = String(r[col] ?? "").trim();
      if (refByCode.has(c)) refByCode.set(c, refByCode.get(c) + 1);
    }
  }
}
let refProducts = 0, unrefProducts = 0;
for (const [, n] of refByCode) { if (n > 0) refProducts++; else unrefProducts++; }
console.log("");
console.log("pcode NULL 상품 중:");
console.log("  FK 참조 있는 상품:", refProducts);
console.log("  FK 참조 없는 상품 (즉시 DELETE 가능):", unrefProducts);

// ===== Product_List 상태 =====
console.log("");
console.log("============== Product_List Local 상태 ==============");
const PROD_CACHE = "C:/Users/USER/AppData/Roaming/megatown-sync-agent/erp-cache/product-list/candidate.json.gz";
if (existsSync(PROD_CACHE)) {
  const d = JSON.parse(gunzipSync(readFileSync(PROD_CACHE)).toString("utf8"));
  console.log("Local rows:", d.rows?.length ?? 0, "· fetchedAt:", d.meta?.fetchedAt);
  const ready = (d.rows?.length ?? 0) > 1000;
  console.log("상태:", ready ? "READY" : "NOT READY (재조회 필요 · 현재 비정상 상태)");
}

writeFileSync(`${BACKUP_DIR}/_summary.json`, JSON.stringify({
  backupDir: BACKUP_DIR,
  backupAt: ts.toISOString(),
  totalRows, totalBytes,
  results,
  pcodeNullCount: nullPcodeCodes.length,
  refCounts,
  refProducts, unrefProducts,
}, null, 2));
console.log("");
console.log("summary 저장:", BACKUP_DIR + "/_summary.json");
