// 2026-09-09 · 전체 DB 중복 컬럼 전수 감사
// SELECT only · 파괴적 SQL 절대 없음

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnv() {
  const raw = readFileSync(".env", "utf8");
  const env = {};
  for (const l of raw.split(/\r?\n/)) {
    const m = /^([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(l);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const env = loadEnv();
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

// ────────────────────────────────────────────────────────────
// 1. 모든 테이블 목록 수집 (PostgREST: SELECT * LIMIT 0 per table)
// ────────────────────────────────────────────────────────────

const KNOWN_TABLES = [
  "products",
  "vendors",
  "purchase_details",
  "ocr_confirmed_items",
  "stock_history",
  "inventory_checks",
  "loss_tracking_daily",
  "supplier_payments",
  "supplier_payment_allocations",
  "employees",
  "board_posts",
  "board_comments",
  "board_images",
  "zone_assignments",
  "zones",
  "order_requests",
  "order_request_items",
  "product_categories",
  "ocr_supplier_aliases",
  "resignation_requests",
  "staff_schedules",
  "work_logs",
  "employee_contracts",
  "sale_variants",
  "display_request_items",
  "display_requests",
  "shelf_positions",
  "stock_reconciliation_sessions",
  "stock_reconciliation_items",
];

console.log("=".repeat(70));
console.log(" 전체 DB 중복 컬럼 전수 감사 · 2026-09-09");
console.log("=".repeat(70));

// ── 각 테이블 컬럼 수집
const tableColumns = {}; // tableName → Set<colName>
const columnMeta = {};   // colName → [{table, type?}]

for (const table of KNOWN_TABLES) {
  const { data, error } = await sb.from(table).select("*").limit(1);
  if (error) {
    // table might not exist
    process.stderr.write(`  [SKIP] ${table}: ${error.message}\n`);
    continue;
  }
  const cols = data && data[0] ? Object.keys(data[0]) : [];
  tableColumns[table] = new Set(cols);
  for (const col of cols) {
    if (!columnMeta[col]) columnMeta[col] = [];
    columnMeta[col].push(table);
  }
}

const loadedTables = Object.keys(tableColumns);
console.log(`\n로드된 테이블 수: ${loadedTables.length}\n`);

// ────────────────────────────────────────────────────────────
// 2. 중복 컬럼 목록 (2개 이상 테이블에 존재)
// ────────────────────────────────────────────────────────────

// 분류 정의
const FK_COLS = new Set([
  "product_code", "vendor_code", "category_code", "supplier_code",
  "employee_id", "staff_id", "vendor_id", "post_id", "session_id",
  "zone_id", "request_id", "item_id", "order_id",
]);

const COMMON_COLS = new Set([
  "id", "created_at", "updated_at", "deleted_at",
  "note", "notes", "memo", "status", "is_active", "is_deleted",
  "operator", "user_id",
]);

// 스냅샷 위험 후보 (마스터 테이블이 따로 있는 컬럼)
const SNAPSHOT_CANDIDATES = new Set([
  "optimal_stock", "current_stock", "purchase_price", "sale_price",
  "product_name", "supplier_name", "supplier", "category",
  "category_name", "unit_price", "quantity", "unit",
  "display_location", "management_group",
]);

const duplicates = Object.entries(columnMeta)
  .filter(([, tables]) => tables.length > 1)
  .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));

console.log("─".repeat(70));
console.log("SECTION 1 · 중복 컬럼 전체 리스트");
console.log("─".repeat(70));
console.log(
  "컬럼명".padEnd(35) +
    "| 개수 | 분류 | 테이블 목록"
);
console.log("-".repeat(70));

const typeA = []; // 스냅샷 stale 위험
const typeB = []; // FK 정상
const typeC = []; // 이름만 같음 · 정상

for (const [col, tables] of duplicates) {
  let cls;
  if (COMMON_COLS.has(col)) cls = "C";
  else if (FK_COLS.has(col)) cls = "B";
  else if (SNAPSHOT_CANDIDATES.has(col)) cls = "A";
  else cls = "A?"; // unknown — treat as potential issue

  const entry = { col, tables, cls };
  if (cls === "B") typeB.push(entry);
  else if (cls === "C") typeC.push(entry);
  else typeA.push(entry);

  console.log(
    col.padEnd(35) +
      `| ${String(tables.length).padStart(4)} | ${cls.padEnd(4)} | ` +
      tables.join(", ")
  );
}

// ────────────────────────────────────────────────────────────
// 3. A 유형 상세
// ────────────────────────────────────────────────────────────
console.log("\n" + "─".repeat(70));
console.log("SECTION 2 · A 유형 상세 (정합성 문제 · stale 위험)");
console.log("─".repeat(70));

for (const { col, tables } of typeA) {
  // Identify which is "master" (products / vendors / employees usually)
  const masterPriority = ["products", "vendors", "employees", "product_categories"];
  const master = tables.find((t) => masterPriority.includes(t)) || tables[0];
  const snapshots = tables.filter((t) => t !== master);

  console.log(`\n  컬럼: ${col}`);
  console.log(`    마스터: ${master}`);
  console.log(`    스냅샷: ${snapshots.join(", ") || "(없음)"}`);

  // Check null% per table
  for (const table of tables) {
    const { count: total } = await sb
      .from(table)
      .select("*", { count: "exact", head: true });
    const { count: filled } = await sb
      .from(table)
      .select("*", { count: "exact", head: true })
      .not(col, "is", null);
    const pct = total ? ((filled / total) * 100).toFixed(1) : "N/A";
    console.log(
      `      ${table.padEnd(32)}: ${String(filled).padStart(6)} / ${String(total).padStart(6)} 행 채움 (${pct}%)`
    );
  }
}

// ────────────────────────────────────────────────────────────
// 4. B/C 유형 요약
// ────────────────────────────────────────────────────────────
console.log("\n" + "─".repeat(70));
console.log("SECTION 3 · B 유형 (FK 정상)");
console.log("─".repeat(70));
for (const { col, tables } of typeB) {
  console.log(`  ${col.padEnd(35)} → ${tables.join(", ")}`);
}

console.log("\n" + "─".repeat(70));
console.log("SECTION 3 · C 유형 (이름만 같음 · 정상)");
console.log("─".repeat(70));
for (const { col, tables } of typeC) {
  console.log(`  ${col.padEnd(35)} → ${tables.join(", ")}`);
}

// ────────────────────────────────────────────────────────────
// 5. Stale 검증 · optimal_stock 구체적 diff
// ────────────────────────────────────────────────────────────
console.log("\n" + "─".repeat(70));
console.log("SECTION 4 · Stale 데이터 검증 (optimal_stock)");
console.log("─".repeat(70));

// Check whether inventory_checks has optimal_stock
const icCols = tableColumns["inventory_checks"] || new Set();
const orCols = tableColumns["order_requests"] || new Set();
const prCols = tableColumns["products"] || new Set();

if (prCols.has("optimal_stock") && icCols.has("optimal_stock")) {
  // Compare latest inventory_checks per product_code vs products master
  console.log("\n  [inventory_checks vs products] · 최신 체크 기준 diff 샘플");
  // Fetch distinct product_codes from inventory_checks
  const { data: icSample } = await sb
    .from("inventory_checks")
    .select("product_code, optimal_stock, checked_at")
    .not("optimal_stock", "is", null)
    .order("checked_at", { ascending: false })
    .limit(200);

  if (icSample && icSample.length > 0) {
    // Get unique product codes (latest per product)
    const latestByProduct = {};
    for (const row of icSample) {
      if (!latestByProduct[row.product_code]) latestByProduct[row.product_code] = row;
    }
    const productCodes = Object.keys(latestByProduct).slice(0, 50);

    const { data: productMaster } = await sb
      .from("products")
      .select("product_code, optimal_stock")
      .in("product_code", productCodes)
      .not("optimal_stock", "is", null);

    if (productMaster) {
      const masterMap = {};
      for (const r of productMaster) masterMap[r.product_code] = r.optimal_stock;

      let staleCount = 0;
      let sameCount = 0;
      const staleSamples = [];

      for (const pc of productCodes) {
        const masterVal = masterMap[pc];
        const snapVal = latestByProduct[pc].optimal_stock;
        if (masterVal === undefined || snapVal === undefined) continue;
        // Compare as numbers if possible
        const mNum = Number(masterVal);
        const sNum = Number(snapVal);
        if (!isNaN(mNum) && !isNaN(sNum)) {
          if (mNum !== sNum) {
            staleCount++;
            if (staleSamples.length < 10) {
              staleSamples.push({ pc, master: masterVal, snapshot: snapVal, diff: mNum - sNum });
            }
          } else {
            sameCount++;
          }
        } else if (masterVal !== snapVal) {
          staleCount++;
          if (staleSamples.length < 10) {
            staleSamples.push({ pc, master: masterVal, snapshot: snapVal, diff: "?" });
          }
        } else {
          sameCount++;
        }
      }

      const total = staleCount + sameCount;
      console.log(`    비교 대상: ${total}개 상품`);
      console.log(`    일치: ${sameCount} (${total ? ((sameCount/total)*100).toFixed(1) : 0}%)`);
      console.log(`    불일치(stale): ${staleCount} (${total ? ((staleCount/total)*100).toFixed(1) : 0}%)`);
      if (staleSamples.length > 0) {
        console.log("    Stale 샘플 (최대 10건):");
        console.log("    " + "product_code".padEnd(20) + "| master | snapshot | diff");
        for (const s of staleSamples) {
          console.log(`    ${s.pc.padEnd(20)}| ${String(s.master).padStart(6)} | ${String(s.snapshot).padStart(8)} | ${s.diff}`);
        }
      }
    }
  } else {
    console.log("  inventory_checks.optimal_stock — 데이터 없음");
  }
} else {
  console.log("  inventory_checks 또는 products 에 optimal_stock 없음 · 스킵");
}

// order_requests vs products
if (prCols.has("optimal_stock") && orCols.has("optimal_stock")) {
  console.log("\n  [order_requests vs products] · diff 샘플");
  const { data: orSample } = await sb
    .from("order_requests")
    .select("product_code, optimal_stock, created_at")
    .not("optimal_stock", "is", null)
    .order("created_at", { ascending: false })
    .limit(100);

  if (orSample && orSample.length > 0) {
    const latestOR = {};
    for (const r of orSample) {
      if (!latestOR[r.product_code]) latestOR[r.product_code] = r;
    }
    const pcs = Object.keys(latestOR).slice(0, 30);
    const { data: pm } = await sb
      .from("products")
      .select("product_code, optimal_stock")
      .in("product_code", pcs)
      .not("optimal_stock", "is", null);

    if (pm) {
      const mm = {};
      for (const r of pm) mm[r.product_code] = r.optimal_stock;
      let stale = 0, same = 0;
      const samples = [];
      for (const pc of pcs) {
        const mv = mm[pc]; const sv = latestOR[pc].optimal_stock;
        if (mv === undefined) continue;
        if (Number(mv) !== Number(sv)) { stale++; if (samples.length < 5) samples.push({ pc, master: mv, snapshot: sv }); }
        else same++;
      }
      console.log(`    비교: ${stale + same}건 · 불일치: ${stale}`);
      for (const s of samples) console.log(`    ${s.pc} master=${s.master} snapshot=${s.snapshot}`);
    }
  } else {
    console.log("  order_requests.optimal_stock — 데이터 없음");
  }
}

// ── purchase_price stale check (purchase_details vs products)
console.log("\n  [purchase_details vs products] · purchase_price diff 샘플");
const pdCols = tableColumns["purchase_details"] || new Set();
if (prCols.has("purchase_price") && pdCols.has("purchase_price")) {
  const { data: pdSample } = await sb
    .from("purchase_details")
    .select("product_code, purchase_price, purchased_at")
    .not("purchase_price", "is", null)
    .order("purchased_at", { ascending: false })
    .limit(200);

  if (pdSample && pdSample.length > 0) {
    const latest = {};
    for (const r of pdSample) {
      if (!latest[r.product_code]) latest[r.product_code] = r;
    }
    const pcs = Object.keys(latest).slice(0, 50);
    const { data: pm } = await sb
      .from("products")
      .select("product_code, purchase_price")
      .in("product_code", pcs)
      .not("purchase_price", "is", null);
    if (pm) {
      const mm = {};
      for (const r of pm) mm[r.product_code] = r.purchase_price;
      let stale = 0, same = 0;
      const samples = [];
      for (const pc of pcs) {
        const mv = mm[pc]; const sv = latest[pc].purchase_price;
        if (mv === undefined) continue;
        if (Math.abs(Number(mv) - Number(sv)) > 1) { stale++; if (samples.length < 5) samples.push({ pc, master: mv, snapshot: sv }); }
        else same++;
      }
      console.log(`    비교: ${stale + same}건 · 불일치: ${stale} (purchase_details 는 이력 → stale 정상)`);
      for (const s of samples) console.log(`    ${s.pc} master=${s.master} last_pd=${s.snapshot}`);
    }
  }
}

// ── supplier_name in purchase_details + stock_history
console.log("\n  [purchase_details + stock_history] · supplier_name vs vendors 정합성");
if (pdCols.has("supplier_name") && pdCols.has("supplier_code")) {
  const { count: totalPD } = await sb
    .from("purchase_details")
    .select("*", { count: "exact", head: true });
  const { count: nullName } = await sb
    .from("purchase_details")
    .select("*", { count: "exact", head: true })
    .is("supplier_name", null);
  const { count: nullCode } = await sb
    .from("purchase_details")
    .select("*", { count: "exact", head: true })
    .is("supplier_code", null);
  console.log(`    purchase_details 총: ${totalPD}행 · supplier_name NULL: ${nullName} · supplier_code NULL: ${nullCode}`);
}

// ────────────────────────────────────────────────────────────
// 6. Fix 순위 TOP 5
// ────────────────────────────────────────────────────────────
console.log("\n" + "─".repeat(70));
console.log("SECTION 5 · Fix 순위 TOP 5 (사용자 결정 필요)");
console.log("─".repeat(70));

const TOP5 = [
  {
    rank: 1,
    col: "optimal_stock",
    tables: "products / inventory_checks / order_requests",
    risk: "HIGH",
    options: [
      "A. inventory_checks, order_requests 에서 DROP · 필요 시 JOIN products",
      "B. 트리거: products.optimal_stock 변경 시 두 테이블 자동 UPDATE",
      "C. 의도적 스냅샷 유지 (order 시점 기록 목적)",
    ],
    recommendation:
      "order_requests는 C(스냅샷 유지). inventory_checks는 A(DROP + JOIN) 검토",
  },
  {
    rank: 2,
    col: "supplier_name",
    tables: "purchase_details / stock_history / supplier_payments / vendors",
    risk: "HIGH",
    options: [
      "A. vendor_id FK 추가 · supplier_name 중복 제거",
      "B. 현행 유지 (비정규화 · 이력 추적)",
    ],
    recommendation:
      "purchase_details, stock_history 는 이력 → 스냅샷 정상. supplier_payments 는 vendor_id FK 추가 검토",
  },
  {
    rank: 3,
    col: "purchase_price",
    tables: "products / purchase_details / loss_tracking_daily",
    risk: "MEDIUM",
    options: [
      "A. purchase_details, loss_tracking_daily 는 이력 → 정상 스냅샷으로 분류",
      "B. 이 경우 분류 A→C 로 변경",
    ],
    recommendation:
      "이력 테이블이므로 실질적 문제 없음 · 분류 재검토 권장",
  },
  {
    rank: 4,
    col: "product_name",
    tables: "purchase_details / stock_history / order_request_items",
    risk: "MEDIUM",
    options: [
      "A. 전부 이력 → 스냅샷 정상",
      "B. products.product_name 변경 시 정합성 깨짐 허용 여부 확인",
    ],
    recommendation:
      "이력성 스냅샷이므로 정상 · products 상품명 변경 빈도 낮으면 허용",
  },
  {
    rank: 5,
    col: "display_location",
    tables: "products / shelf_positions",
    risk: "MEDIUM",
    options: [
      "A. shelf_positions 는 위치 레코드 → FK 성격 · 중복 아님",
      "B. products.display_location 과 shelf_positions.display_location 동기화 여부 확인",
    ],
    recommendation:
      "shelf_positions 는 위치 마스터 → B 유형(FK). products 의 display_location 은 캐시일 수 있음",
  },
];

for (const item of TOP5) {
  console.log(`\n  #${item.rank} · ${item.col} · 리스크: ${item.risk}`);
  console.log(`      테이블: ${item.tables}`);
  console.log(`      옵션:`);
  for (const opt of item.options) console.log(`        ${opt}`);
  console.log(`      권장: ${item.recommendation}`);
}

console.log("\n" + "=".repeat(70));
console.log(" 감사 완료");
console.log("=".repeat(70));
