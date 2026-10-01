// 2026-10-01 · 전수 데이터 정합성 감사 (read-only)
//   · 10영역 조사 · 사용자 대원칙 1~12 매핑
//   · 실행 · node scripts/audit-data-integrity-2026-10-01.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnv() {
  const raw = readFileSync(".env", "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = /^([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const env = loadEnv();
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

async function fetchAll(table, select, filterFn = null, PAGE = 1000) {
  const all = [];
  let from = 0;
  while (true) {
    let q = supabase.from(table).select(select).range(from, from + PAGE - 1);
    if (filterFn) q = filterFn(q);
    const { data, error } = await q;
    if (error) {
      if (/relation .* does not exist/i.test(error.message)) return { rows: [], tableMissing: true };
      throw error;
    }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return { rows: all, tableMissing: false };
}

async function tableCount(table) {
  try {
    const { count, error } = await supabase.from(table).select("*", { count: "exact", head: true });
    if (error) return { count: null, error: error.message };
    return { count: count ?? 0, error: null };
  } catch (e) {
    return { count: null, error: e.message };
  }
}

async function checkColumn(table, column) {
  try {
    const { data, error } = await supabase.from(table).select(column).limit(1);
    if (error) {
      if (/does not exist/i.test(error.message)) return { exists: false };
      return { exists: false, error: error.message };
    }
    return { exists: true };
  } catch (e) {
    return { exists: false, error: e.message };
  }
}

const report = {
  generated_at: new Date().toISOString(),
  areas: {},
  tables: {},
  backup_tables: [],
  summary: {},
};

// ──────────────────────────────────────────
// 영역 4 · 백업 테이블 리스트업
// ──────────────────────────────────────────
console.log("\n[영역 4] 백업 테이블 리스트업...");
const BACKUP_TABLES = [
  "products_backup_20260925",
  "purchase_details_backup_20260925",
  "stock_history_backup_20260925",
  "supplier_payments_backup_20260925",
];
for (const t of BACKUP_TABLES) {
  const c = await tableCount(t);
  if (c.count !== null) {
    report.backup_tables.push({ table: t, rows: c.count });
    console.log(`  [BACKUP] ${t}: ${c.count} rows (잔존)`);
  }
}

// ──────────────────────────────────────────
// 영역 7 · optimal_stock SSOT · 컬럼 존재 확인
// ──────────────────────────────────────────
console.log("\n[영역 7] optimal_stock SSOT 컬럼 조사...");
const ic_optimal = await checkColumn("inventory_checks", "optimal_stock");
const or_optimal = await checkColumn("order_requests", "optimal_stock");
report.areas.optimal_stock_ssot = {
  "products.optimal_stock": (await checkColumn("products", "optimal_stock")).exists,
  "products.optimal_stock_backup": (await checkColumn("products", "optimal_stock_backup")).exists,
  "inventory_checks.optimal_stock": ic_optimal.exists,
  "order_requests.optimal_stock": or_optimal.exists,
};
console.log("  products.optimal_stock:", report.areas.optimal_stock_ssot["products.optimal_stock"]);
console.log("  products.optimal_stock_backup:", report.areas.optimal_stock_ssot["products.optimal_stock_backup"]);
console.log("  inventory_checks.optimal_stock:", ic_optimal.exists, ic_optimal.exists ? "(SSOT 위반 가능)" : "(OK)");
console.log("  order_requests.optimal_stock:", or_optimal.exists, or_optimal.exists ? "(SSOT 위반 가능)" : "(OK)");

// ──────────────────────────────────────────
// 테이블 레코드 수 (스냅샷)
// ──────────────────────────────────────────
console.log("\n[스냅샷] 주요 테이블 레코드 수 조회...");
const CORE_TABLES = [
  "products", "vendors", "stock_history", "purchase_details",
  "supplier_payments", "order_requests", "inventory_checks",
  "ocr_confirmed_items", "display_requests", "stock_arrivals",
  "credit_cards", "notifications", "push_tokens", "employees",
  "borrowings", "return_requests",
];
for (const t of CORE_TABLES) {
  const c = await tableCount(t);
  report.tables[t] = c.count;
  console.log(`  ${t}: ${c.count === null ? "ERR: " + c.error : c.count}`);
}

// ──────────────────────────────────────────
// 영역 5 · 공급사 이중화 조사
// ──────────────────────────────────────────
console.log("\n[영역 5] 공급사 이중화 조사...");
const supplierDup = {};

async function fetchDistinctSupplier(table, col) {
  const PAGE = 1000;
  const set = new Set();
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from(table).select(col).range(from, from + PAGE - 1);
    if (error) {
      if (/does not exist/i.test(error.message)) return null;
      throw error;
    }
    if (!data || data.length === 0) break;
    for (const r of data) {
      const v = String(r[col] ?? "").trim();
      if (v) set.add(v);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return Array.from(set).sort();
}

const prodSuppliers = await fetchDistinctSupplier("products", "supplier");
const pdSuppliers = await fetchDistinctSupplier("purchase_details", "supplier_name");
const shSuppliers = await fetchDistinctSupplier("stock_history", "supplier_name");
const spSuppliers = await fetchDistinctSupplier("supplier_payments", "supplier_name");
const vendorNames = await fetchDistinctSupplier("vendors", "company_name");

supplierDup.counts = {
  "products.supplier": prodSuppliers?.length ?? 0,
  "purchase_details.supplier_name": pdSuppliers?.length ?? 0,
  "stock_history.supplier_name": shSuppliers?.length ?? 0,
  "supplier_payments.supplier_name": spSuppliers?.length ?? 0,
  "vendors.company_name": vendorNames?.length ?? 0,
};

// vendors 에 없는 supplier (orphan)
const vendorSet = new Set(vendorNames ?? []);
supplierDup.orphans = {
  "products.supplier not in vendors": (prodSuppliers ?? []).filter(s => !vendorSet.has(s)),
  "purchase_details.supplier_name not in vendors": (pdSuppliers ?? []).filter(s => !vendorSet.has(s)),
  "stock_history.supplier_name not in vendors": (shSuppliers ?? []).filter(s => !vendorSet.has(s)),
  "supplier_payments.supplier_name not in vendors": (spSuppliers ?? []).filter(s => !vendorSet.has(s)),
};
report.areas.supplier_dup = supplierDup;
console.log("  distinct 수:", JSON.stringify(supplierDup.counts, null, 2));
console.log("  orphan 상세:");
for (const [k, v] of Object.entries(supplierDup.orphans)) {
  console.log(`    ${k}: ${v.length} (${v.slice(0, 10).join(", ")}${v.length > 10 ? ", …" : ""})`);
}

// ──────────────────────────────────────────
// 영역 10 · FK · 참조 무결성
// ──────────────────────────────────────────
console.log("\n[영역 10] FK 참조 무결성 조사...");
const refIssues = {};

// products.product_code 집합
const { rows: productRows } = await fetchAll("products", "product_code");
const productCodeSet = new Set(productRows.map(r => String(r.product_code ?? "").trim()).filter(Boolean));
console.log(`  products.product_code · 유효 코드 수: ${productCodeSet.size}`);

// order_requests · product_code orphan
const { rows: orRows } = await fetchAll("order_requests", "id, product_code");
const orOrphans = orRows.filter(r => {
  const c = String(r.product_code ?? "").trim();
  return c && !productCodeSet.has(c);
});
refIssues.order_requests_orphan = { total: orRows.length, orphan: orOrphans.length, samples: orOrphans.slice(0, 10) };
console.log(`  order_requests · orphan: ${orOrphans.length}/${orRows.length}`);

// purchase_details · product_code orphan
const { rows: pdRows } = await fetchAll("purchase_details", "id, product_code");
const pdOrphans = pdRows.filter(r => {
  const c = String(r.product_code ?? "").trim();
  return c && !productCodeSet.has(c);
});
refIssues.purchase_details_orphan = { total: pdRows.length, orphan: pdOrphans.length, samples: pdOrphans.slice(0, 10) };
console.log(`  purchase_details · orphan: ${pdOrphans.length}/${pdRows.length}`);

// inventory_checks · product_code orphan
const { rows: icRows } = await fetchAll("inventory_checks", "id, product_code");
const icOrphans = icRows.filter(r => {
  const c = String(r.product_code ?? "").trim();
  return c && !productCodeSet.has(c);
});
refIssues.inventory_checks_orphan = { total: icRows.length, orphan: icOrphans.length, samples: icOrphans.slice(0, 10) };
console.log(`  inventory_checks · orphan: ${icOrphans.length}/${icRows.length}`);

// stock_history · product_code orphan
const { rows: shRows } = await fetchAll("stock_history", "product_code");
const shCodeSet = new Set(shRows.map(r => String(r.product_code ?? "").trim()).filter(Boolean));
const shOrphans = Array.from(shCodeSet).filter(c => !productCodeSet.has(c));
refIssues.stock_history_orphan = { total: shCodeSet.size, orphan: shOrphans.length, samples: shOrphans.slice(0, 10) };
console.log(`  stock_history · orphan distinct codes: ${shOrphans.length}/${shCodeSet.size}`);

report.areas.ref_integrity = refIssues;

// ──────────────────────────────────────────
// 영역 3 · 공식 등식 샘플 검증
// ──────────────────────────────────────────
console.log("\n[영역 3] 공식 등식 샘플 검증...");

const topVendors = (prodSuppliers ?? []).slice(0, 10);
// 상위 10 공급사 · 매입액·판매원가·결제액 계산
const prodByCode = new Map();
{
  const { rows } = await fetchAll("products", "product_code, supplier, purchase_price, current_stock, sale_price");
  for (const p of rows) {
    const code = String(p.product_code ?? "").trim();
    if (code) prodByCode.set(code, p);
  }
}

const purchByVendor = new Map();
{
  const { rows } = await fetchAll("purchase_details", "supplier_name, amount");
  for (const r of rows) {
    const v = String(r.supplier_name ?? "").trim();
    if (!v) continue;
    purchByVendor.set(v, (purchByVendor.get(v) ?? 0) + (Number(r.amount) || 0));
  }
}

const payByVendor = new Map();
{
  const { rows } = await fetchAll("supplier_payments", "supplier_name, amount");
  for (const r of rows) {
    const v = String(r.supplier_name ?? "").trim();
    if (!v) continue;
    payByVendor.set(v, (payByVendor.get(v) ?? 0) + (Number(r.amount) || 0));
  }
}

const cogsByVendor = new Map();
{
  const { rows } = await fetchAll("stock_history", "product_code, supplier_name, sale_qty");
  for (const r of rows) {
    const code = String(r.product_code ?? "").trim();
    const vRaw = String(r.supplier_name ?? "").trim();
    const prod = prodByCode.get(code);
    const v = vRaw || (prod?.supplier ?? "");
    if (!v) continue;
    const qty = Number(r.sale_qty ?? 0) || 0;
    const price = Number(prod?.purchase_price ?? 0) || 0;
    if (qty <= 0 || price <= 0) continue;
    cogsByVendor.set(v, (cogsByVendor.get(v) ?? 0) + qty * price);
  }
}

const vendorSample = [];
for (const v of topVendors) {
  const purchase = purchByVendor.get(v) ?? 0;
  const payment = payByVendor.get(v) ?? 0;
  const cogs = cogsByVendor.get(v) ?? 0;
  vendorSample.push({
    vendor: v,
    매입액: Math.round(purchase),
    결제액: Math.round(payment),
    판매원가_COGS: Math.round(cogs),
    "재고자산(매입-COGS)": Math.round(purchase - cogs),
    "실제잔고(매입-결제)": Math.round(purchase - payment),
  });
}
report.areas.formula_sample = vendorSample;
console.log("  샘플 10 공급사:");
for (const v of vendorSample) {
  console.log(`    ${v.vendor} · 매입=${v.매입액} · 결제=${v.결제액} · COGS=${v.판매원가_COGS} · 재고자산=${v["재고자산(매입-COGS)"]} · 잔고=${v["실제잔고(매입-결제)"]}`);
}

// ──────────────────────────────────────────
// 영역 6 · 유통기한 3소스
// ──────────────────────────────────────────
console.log("\n[영역 6] 유통기한 3소스 UNION 조사...");
const expiry = {
  "products.expiry_date exists": (await checkColumn("products", "expiry_date")).exists,
  "inventory_checks.expiry_date exists": (await checkColumn("inventory_checks", "expiry_date")).exists,
  "inventory_checks.expiry_input_date exists": (await checkColumn("inventory_checks", "expiry_input_date")).exists,
  "purchase_details.expiry_date exists": (await checkColumn("purchase_details", "expiry_date")).exists,
};
report.areas.expiry_sources = expiry;
console.log(" ", expiry);

// ──────────────────────────────────────────
// 영역 8 · 문자열에 날짜 저장 (products.memo, note 등)
// ──────────────────────────────────────────
console.log("\n[영역 8] 문자열에 날짜 저장 조사...");
const DATE_REGEX = /\d{4}[-./]\d{1,2}[-./]\d{1,2}/;
const EXP_REGEX = /유통\s*기한[:\s]*\d{4}/;

const stringDateIssues = { products_memo: 0, products_memo_samples: [], ic_note: 0, ic_note_samples: [], or_note: 0, or_note_samples: [] };

const prodNotes = (await fetchAll("products", "product_code, memo")).rows;
for (const p of prodNotes) {
  const m = String(p.memo ?? "");
  if (!m) continue;
  if (EXP_REGEX.test(m) || DATE_REGEX.test(m)) {
    stringDateIssues.products_memo++;
    if (stringDateIssues.products_memo_samples.length < 5) stringDateIssues.products_memo_samples.push({ code: p.product_code, memo: m.slice(0, 80) });
  }
}

const icNotes = (await fetchAll("inventory_checks", "id, note")).rows;
for (const r of icNotes) {
  const m = String(r.note ?? "");
  if (!m) continue;
  if (EXP_REGEX.test(m) || DATE_REGEX.test(m)) {
    stringDateIssues.ic_note++;
    if (stringDateIssues.ic_note_samples.length < 5) stringDateIssues.ic_note_samples.push({ id: r.id, note: m.slice(0, 80) });
  }
}

const orNotes = (await fetchAll("order_requests", "id, note")).rows;
for (const r of orNotes) {
  const m = String(r.note ?? "");
  if (!m) continue;
  if (EXP_REGEX.test(m) || DATE_REGEX.test(m)) {
    stringDateIssues.or_note++;
    if (stringDateIssues.or_note_samples.length < 5) stringDateIssues.or_note_samples.push({ id: r.id, note: m.slice(0, 80) });
  }
}
report.areas.string_dates = stringDateIssues;
console.log("  products.memo 날짜/유통기한 포함:", stringDateIssues.products_memo);
console.log("  inventory_checks.note 날짜 포함:", stringDateIssues.ic_note);
console.log("  order_requests.note 날짜 포함:", stringDateIssues.or_note);

// ──────────────────────────────────────────
// 영역 1 · optimal_stock 분포 (snapshot vs master)
// ──────────────────────────────────────────
console.log("\n[영역 1] optimal_stock SSOT 분포 조사...");
if (or_optimal.exists) {
  // order_requests.optimal_stock 분포
  const { rows } = await fetchAll("order_requests", "product_code, optimal_stock");
  const dup = { nonNull: 0, differsFromMaster: 0, samples: [] };
  for (const r of rows) {
    if (r.optimal_stock !== null && r.optimal_stock !== undefined) {
      dup.nonNull++;
      // 마스터 조회 (prodByCode는 purchase_price 등만 있음 · optimal_stock은 별도)
    }
  }
  // 마스터 optimal_stock 비교
  const { rows: pm } = await fetchAll("products", "product_code, optimal_stock");
  const masterOpt = new Map();
  for (const p of pm) {
    masterOpt.set(String(p.product_code ?? "").trim(), Number(p.optimal_stock ?? 0) || 0);
  }
  for (const r of rows) {
    const code = String(r.product_code ?? "").trim();
    const snap = Number(r.optimal_stock ?? NaN);
    if (!Number.isFinite(snap)) continue;
    const master = masterOpt.get(code);
    if (master !== undefined && master !== snap) {
      dup.differsFromMaster++;
      if (dup.samples.length < 10) dup.samples.push({ code, snap, master });
    }
  }
  report.areas.optimal_stock_snapshot = dup;
  console.log(`  order_requests.optimal_stock · nonNull: ${dup.nonNull} · master와 다름: ${dup.differsFromMaster}`);
} else {
  report.areas.optimal_stock_snapshot = { note: "order_requests.optimal_stock 컬럼 없음 (OK · SSOT 유지)" };
  console.log("  order_requests.optimal_stock 컬럼 없음 (OK)");
}

if (ic_optimal.exists) {
  const { rows: icRows2 } = await fetchAll("inventory_checks", "product_code, optimal_stock");
  const dup = { nonNull: 0, differsFromMaster: 0, samples: [] };
  const { rows: pm } = await fetchAll("products", "product_code, optimal_stock");
  const masterOpt = new Map();
  for (const p of pm) {
    masterOpt.set(String(p.product_code ?? "").trim(), Number(p.optimal_stock ?? 0) || 0);
  }
  for (const r of icRows2) {
    if (r.optimal_stock !== null && r.optimal_stock !== undefined) {
      dup.nonNull++;
      const code = String(r.product_code ?? "").trim();
      const snap = Number(r.optimal_stock ?? NaN);
      const master = masterOpt.get(code);
      if (master !== undefined && master !== snap) {
        dup.differsFromMaster++;
        if (dup.samples.length < 10) dup.samples.push({ code, snap, master });
      }
    }
  }
  report.areas.optimal_stock_snapshot_ic = dup;
  console.log(`  inventory_checks.optimal_stock · nonNull: ${dup.nonNull} · master와 다름: ${dup.differsFromMaster}`);
}

// ──────────────────────────────────────────
// 영역 2 · 파생 컬럼 조사 (stock_history.total_amount)
// ──────────────────────────────────────────
console.log("\n[영역 2] 파생 컬럼 조사 (stock_history.total_amount)...");
{
  const { rows } = await fetchAll("stock_history", "snapshot_date, product_code, sale_qty, total_amount", null, 1000);
  // sample first 10000 records
  const sample = rows.slice(0, 5000);
  const prodSalePrice = new Map();
  {
    const { rows: pp } = await fetchAll("products", "product_code, sale_price");
    for (const p of pp) {
      prodSalePrice.set(String(p.product_code ?? "").trim(), Number(p.sale_price ?? 0) || 0);
    }
  }
  let matchExpected = 0;
  let differ = 0;
  const samples = [];
  for (const r of sample) {
    const code = String(r.product_code ?? "").trim();
    const sale_qty = Number(r.sale_qty ?? 0) || 0;
    const total = Number(r.total_amount ?? 0) || 0;
    const price = prodSalePrice.get(code) ?? 0;
    const expected = sale_qty * price;
    if (sale_qty > 0 && total > 0) {
      if (Math.abs(total - expected) < 1) matchExpected++;
      else {
        differ++;
        if (samples.length < 10) samples.push({ code, sale_qty, total, expected, delta: total - expected });
      }
    }
  }
  report.areas.derived_total_amount = { sampled: sample.length, matchExpected, differ, samples };
  console.log(`  stock_history.total_amount vs sale_qty×sale_price · 샘플 ${sample.length} 중 match=${matchExpected}, differ=${differ}`);
}

// ──────────────────────────────────────────
// 리포트 JSON 저장
// ──────────────────────────────────────────
const outPath = "docs/_audit-raw-2026-10-01.json";
import { writeFileSync } from "node:fs";
writeFileSync(outPath, JSON.stringify(report, null, 2), "utf8");
console.log(`\n[완료] 원본 JSON 저장: ${outPath}`);
console.log("리포트 생성 중...");
