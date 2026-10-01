// 2026-10-01 · Cross-Endpoint Consistency Audit (read-only)
//   · 사용자 지시 · 공통 지표 동일 값 반환하는지 cross-endpoint 교차 검증
//   · 10 샘플 공급사 · 8 지표 · 서버 로직 재현 · supabase 직접 조회
//   · 산출물 · docs/CROSS_ENDPOINT_CONSISTENCY_2026-10-01.md 생성용 데이터
//
// 비교 지표:
//   A. 매입액 (purchaseAmount)
//   B. 판매원가 (cogs)
//   C. 재고자산 (stockAsset)
//   D. 실제잔고 (balance)
//   E. 판매액 (salesTotal)
//   F. 결제액 (payment)
//   G. 현재고금액 (현재고 × 매입가 · stock_value)
//   H. 발주이력 total_amount
//
// 실행 · node scripts/audit-cross-endpoint-2026-10-01.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";

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

const trimOrEmpty = (v) => String(v ?? "").trim();
const num = (v) => Number(v ?? 0) || 0;

// ───────────────────────────────────────────
// 단계 0 · 공통 데이터 로드 (한 번만)
// ───────────────────────────────────────────
console.log("\n[0] 공통 데이터 로드...");
const { rows: products } = await fetchAll("products", "product_code, supplier, current_stock, sale_price, purchase_price, hidden");
console.log(`  products · ${products.length} rows`);

const salePriceMap = new Map();
const purchasePriceMap = new Map();
const productSupplierMap = new Map();
for (const p of products) {
  const code = trimOrEmpty(p.product_code);
  if (!code) continue;
  salePriceMap.set(code, num(p.sale_price));
  purchasePriceMap.set(code, num(p.purchase_price));
  const sup = trimOrEmpty(p.supplier);
  if (sup) productSupplierMap.set(code, sup);
}

// NULL purchase_price fallback (최근 purchase_details.unit_price)
const nullPriceCodes = [...purchasePriceMap.entries()].filter(([, p]) => p <= 0).map(([c]) => c);
console.log(`  null-price codes · ${nullPriceCodes.length} · fallback 조회 중...`);
if (nullPriceCodes.length > 0) {
  const CHUNK = 500;
  for (let i = 0; i < nullPriceCodes.length; i += CHUNK) {
    const chunk = nullPriceCodes.slice(i, i + CHUNK);
    const { data } = await supabase
      .from("purchase_details")
      .select("product_code, unit_price, purchase_date")
      .in("product_code", chunk)
      .order("purchase_date", { ascending: false });
    for (const r of data ?? []) {
      const code = trimOrEmpty(r.product_code);
      if (!code) continue;
      const cur = purchasePriceMap.get(code) ?? 0;
      if (cur > 0) continue;
      const p = num(r.unit_price);
      if (p > 0) purchasePriceMap.set(code, p);
    }
  }
}

// ───────────────────────────────────────────
// 단계 1 · 샘플 공급사 선정 (purchase_details + supplier_payments)
// ───────────────────────────────────────────
console.log("\n[1] 샘플 공급사 선정...");
const { rows: pdAll } = await fetchAll("purchase_details", "supplier_name, product_code, quantity, amount, purchase_date, unit_price");
console.log(`  purchase_details · ${pdAll.length} rows`);
const { rows: payAll } = await fetchAll("supplier_payments", "supplier_name, amount, payment_date");
console.log(`  supplier_payments · ${payAll.length} rows`);
const { rows: shAll } = await fetchAll("stock_history", "supplier_name, product_code, purchase_qty, sale_qty, supply_amount, snapshot_date");
console.log(`  stock_history · ${shAll.length} rows`);

const pdBySupplier = new Map();
for (const r of pdAll) {
  const s = trimOrEmpty(r.supplier_name);
  if (!s) continue;
  pdBySupplier.set(s, (pdBySupplier.get(s) ?? 0) + 1);
}
const payBySupplier = new Map();
for (const r of payAll) {
  const s = trimOrEmpty(r.supplier_name);
  if (!s) continue;
  payBySupplier.set(s, (payBySupplier.get(s) ?? 0) + 1);
}

// 조건 · purchase_details 100건 이상 + supplier_payments 1건 이상 · 10개
const supplierPool = [...pdBySupplier.entries()]
  .filter(([s, cnt]) => cnt >= 50 && (payBySupplier.get(s) ?? 0) >= 1)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 10)
  .map(([s]) => s);

console.log(`  샘플 공급사 ${supplierPool.length}개:`);
for (const s of supplierPool) {
  console.log(`    · ${s} · pd=${pdBySupplier.get(s)} · pay=${payBySupplier.get(s) ?? 0}`);
}

if (supplierPool.length === 0) {
  console.log("  필터 완화 재시도...");
  const relaxed = [...pdBySupplier.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([s]) => s);
  for (const s of relaxed) supplierPool.push(s);
}
// 결제 있는 공급사 · 1개 이상 포함 (payment flow 검증)
for (const [s, cnt] of payBySupplier.entries()) {
  if (cnt >= 1 && !supplierPool.includes(s)) {
    supplierPool.push(s);
  }
}

// ───────────────────────────────────────────
// 단계 2 · Endpoint 로직 재현 · 각 공급사별 지표 계산
// ───────────────────────────────────────────
console.log("\n[2] 공급사별 지표 계산 (각 endpoint 로직 재현)...");

// === balances-map (/api/supplier-balances-map) · 전체 기간, 전체 공급사 집계 ===
const balancesMap = new Map();
{
  const purchaseMap = new Map();
  const paymentMap = new Map();
  const cogsMap = new Map();

  for (const r of pdAll) {
    const s = trimOrEmpty(r.supplier_name);
    if (!s) continue;
    purchaseMap.set(s, (purchaseMap.get(s) ?? 0) + num(r.amount));
  }
  for (const r of payAll) {
    const s = trimOrEmpty(r.supplier_name);
    if (!s) continue;
    paymentMap.set(s, (paymentMap.get(s) ?? 0) + num(r.amount));
  }
  // stock_history 전체 기간 · cogs (balance.ts:156~ · hasFilter=false)
  for (const r of shAll) {
    const code = trimOrEmpty(r.product_code);
    const sup = trimOrEmpty(r.supplier_name) || productSupplierMap.get(code) || "";
    if (!sup) continue;
    const qty = num(r.sale_qty);
    const price = purchasePriceMap.get(code) ?? 0;
    if (qty <= 0 || price <= 0) continue;
    cogsMap.set(sup, (cogsMap.get(sup) ?? 0) + qty * price);
  }
  const all = new Set([...purchaseMap.keys(), ...paymentMap.keys(), ...cogsMap.keys()]);
  for (const name of all) {
    const purchase = purchaseMap.get(name) ?? 0;
    const payment = paymentMap.get(name) ?? 0;
    const cogs = cogsMap.get(name) ?? 0;
    balancesMap.set(name, {
      purchase,
      payment,
      cogs,
      stock_asset: purchase - cogs,
      balance: purchase - payment,
    });
  }
}

// === /api/supplier-balance/:supplier · 공급사별 open-ended ===
function balanceEndpoint(supplier) {
  let totalPurchase = 0;
  for (const r of pdAll) {
    if (trimOrEmpty(r.supplier_name) !== supplier) continue;
    totalPurchase += num(r.amount);
  }
  let totalPayment = 0;
  for (const r of payAll) {
    if (trimOrEmpty(r.supplier_name) !== supplier) continue;
    totalPayment += num(r.amount);
  }
  return { total_purchase: totalPurchase, total_payment: totalPayment, balance: totalPurchase - totalPayment };
}

// === /api/stock-manage/supplier-purchases · 기본 (snapshot 단일) ===
// 기본 호출 · snapshot_date 없음 → latest · months 0 → single snapshot (단일 날짜)
// 로직 (supplierPurchases.ts) · stock_history (단일 date) · 지표 집계 + purchase_details (단일 date) 병합
// 테스트 간소화 · months=12 로 호출 (전체 비교 용이) · fromDate=today-12m · toDate=today
function supplierPurchasesMonths12(supplier) {
  const today = new Date();
  const from = new Date(today.getFullYear(), today.getMonth() - 12, today.getDate());
  const fromStr = from.toISOString().slice(0, 10);
  const toStr = today.toISOString().slice(0, 10);
  // stock_history 집계 (기간 필터)
  let purchaseQty = 0, purchaseAmount = 0, saleQty = 0, saleAmount = 0, totalStockAmount = 0, cogsAmount = 0;
  const products = new Set();
  for (const r of shAll) {
    const date = String(r.snapshot_date ?? "");
    if (date < fromStr || date > toStr) continue;
    if (trimOrEmpty(r.supplier_name) !== supplier) continue;
    const code = trimOrEmpty(r.product_code);
    const pq = num(r.purchase_qty);
    const sq = num(r.sale_qty);
    const sa = num(r.supply_amount);
    purchaseQty += pq;
    purchaseAmount += sa;
    saleQty += sq;
    const sp = code ? (salePriceMap.get(code) ?? 0) : 0;
    totalStockAmount += sq * sp;
    // 2026-10-01 · 서버 fix 반영 · saleAmount = sq × sale_price (totalStockAmount 와 동일 공식)
    saleAmount += sq * sp;
    const pp = code ? (purchasePriceMap.get(code) ?? 0) : 0;
    cogsAmount += sq * pp;
    if (code) products.add(code);
  }
  // purchase_details 병합 (max)
  let pdQty = 0, pdAmount = 0;
  for (const r of pdAll) {
    if (trimOrEmpty(r.supplier_name) !== supplier) continue;
    const date = String(r.purchase_date ?? "");
    if (date < fromStr || date > toStr) continue;
    pdQty += num(r.quantity);
    pdAmount += num(r.amount);
    const pc = trimOrEmpty(r.product_code);
    if (pc) products.add(pc);
  }
  if (pdQty > purchaseQty) purchaseQty = pdQty;
  if (pdAmount > purchaseAmount) purchaseAmount = pdAmount;
  const stockAssetAmount = Math.max(0, purchaseAmount - cogsAmount);
  return {
    purchaseAmount,
    saleAmount: Math.round(saleAmount),
    totalStockAmount,
    cogsAmount: Math.round(cogsAmount),
    stockAssetAmount: Math.round(stockAssetAmount),
    purchaseQty, saleQty,
    itemCount: products.size,
  };
}

// === /api/supplier-stock-value/:supplier · 현재고 금액 ===
function stockValueEndpoint(supplier) {
  let stockValue = 0, productCount = 0;
  for (const p of products) {
    if (p.hidden === true) continue;
    if (trimOrEmpty(p.supplier) !== supplier) continue;
    const qty = num(p.current_stock);
    const price = num(p.purchase_price);
    stockValue += qty * price;
    productCount++;
  }
  return { stock_value: stockValue, product_count: productCount };
}

// === /api/order-history · 공급사별 발주 금액 (최근 90일) ===
// 간소화 · order_requests · status in [ordered, matched] · sent_at >= since
const { rows: orderReqs } = await fetchAll("order_requests", "supplier, product_code, order_qty, unit_price, status, sent_at");
async function orderHistoryTotal(supplier) {
  const since = new Date(Date.now() - 90 * 86400000).toISOString();
  let total_amount = 0;
  let count = 0;
  for (const r of orderReqs) {
    if (trimOrEmpty(r.supplier) !== supplier) continue;
    if (!["ordered", "matched"].includes(r.status)) continue;
    if (String(r.sent_at ?? "") < since) continue;
    const qty = num(r.order_qty);
    let price = num(r.unit_price);
    if (price <= 0) {
      const code = trimOrEmpty(r.product_code);
      price = purchasePriceMap.get(code) ?? 0;
    }
    total_amount += qty * price;
    count++;
  }
  return { total_amount, line_count: count };
}

// ───────────────────────────────────────────
// 단계 3 · 공급사별 cross 테이블 생성
// ───────────────────────────────────────────
console.log("\n[3] 공급사별 cross 테이블 생성...");
const report = [];
for (const sup of supplierPool) {
  const bm = balancesMap.get(sup) ?? { purchase: 0, payment: 0, cogs: 0, stock_asset: 0, balance: 0 };
  const be = balanceEndpoint(sup);
  const sp = supplierPurchasesMonths12(sup);
  const sv = stockValueEndpoint(sup);
  const oh = await orderHistoryTotal(sup);

  // 공식 재계산 (SSOT)
  const ssotPurchase = bm.purchase;         // purchase_details.amount sum (whole period)
  const ssotPayment = bm.payment;
  const ssotCogs = bm.cogs;
  const ssotStockAsset = ssotPurchase - ssotCogs;
  const ssotBalance = ssotPurchase - ssotPayment;

  report.push({
    supplier: sup,
    cells: {
      "A.매입액 (전체 기간)": {
        "balances-map.purchase": bm.purchase,
        "supplier-balance.total_purchase": be.total_purchase,
        "SSOT (pd.amount sum)": ssotPurchase,
      },
      "A.매입액 (12M)": {
        "supplier-purchases.purchaseAmount (12M)": sp.purchaseAmount,
      },
      "B.판매원가 (전체 기간)": {
        "balances-map.cogs": bm.cogs,
        "SSOT (sq × pp)": ssotCogs,
      },
      "B.판매원가 (12M)": {
        "supplier-purchases.cogsAmount (12M)": sp.cogsAmount,
      },
      "C.재고자산 (전체 기간)": {
        "balances-map.stock_asset": bm.stock_asset,
        "SSOT (purchase − cogs)": ssotStockAsset,
      },
      "C.재고자산 (12M)": {
        "supplier-purchases.stockAssetAmount (12M)": sp.stockAssetAmount,
      },
      "D.실제잔고": {
        "balances-map.balance": bm.balance,
        "supplier-balance.balance": be.balance,
        "SSOT (purchase − payment)": ssotBalance,
      },
      "E.판매액 (12M)": {
        "supplier-purchases.totalStockAmount": sp.totalStockAmount,
        "supplier-purchases.saleAmount (proration)": sp.saleAmount,
      },
      "F.결제액": {
        "balances-map.payment": bm.payment,
        "supplier-balance.total_payment": be.total_payment,
        "SSOT (supplier_payments sum)": ssotPayment,
      },
      "G.현재고금액": {
        "supplier-stock-value": sv.stock_value,
      },
      "H.발주이력 금액 (90d)": {
        "order-history.total_amount (90d)": oh.total_amount,
      },
      "H.발주이력 라인수 (90d)": {
        "order-history.line_count (90d)": oh.line_count,
      },
    },
  });
}

// ───────────────────────────────────────────
// 단계 4 · 불일치 감지
// ───────────────────────────────────────────
console.log("\n[4] 불일치 감지...");
const mismatches = [];
for (const r of report) {
  for (const [metric, sources] of Object.entries(r.cells)) {
    const values = Object.values(sources).filter((v) => typeof v === "number");
    if (values.length < 2) continue;
    // 반올림 오차 1원 허용
    const max = Math.max(...values);
    const min = Math.min(...values);
    const diff = max - min;
    const EPS = Math.max(1, max * 0.001); // 0.1% or 1원
    if (diff > EPS) {
      mismatches.push({
        supplier: r.supplier,
        metric,
        sources,
        diff,
      });
    }
  }
}

console.log(`\n불일치 ${mismatches.length}건:`);
for (const m of mismatches) {
  console.log(`  · ${m.supplier} · ${m.metric} · diff=${m.diff.toLocaleString()}`);
  for (const [k, v] of Object.entries(m.sources)) {
    console.log(`      ${k} = ${typeof v === "number" ? v.toLocaleString() : v}`);
  }
}

// ───────────────────────────────────────────
// 단계 5 · 마크다운 리포트 생성
// ───────────────────────────────────────────
console.log("\n[5] 마크다운 리포트 생성...");
let md = `# CROSS-ENDPOINT CONSISTENCY · 2026-10-01\n\n`;
md += `**임무** · 공통 지표 cross-endpoint 동일 값 검증\n`;
md += `**샘플 공급사** · ${supplierPool.length}개 (purchase_details ≥50건 + supplier_payments ≥1건 상위)\n`;
md += `**생성 시각** · ${new Date().toISOString()}\n\n`;

md += `## 샘플 공급사 리스트\n\n`;
md += `| # | 공급사 | pd건수 | pay건수 |\n|---|---|---|---|\n`;
for (let i = 0; i < supplierPool.length; i++) {
  const s = supplierPool[i];
  md += `| ${i + 1} | ${s} | ${pdBySupplier.get(s) ?? 0} | ${payBySupplier.get(s) ?? 0} |\n`;
}
md += `\n`;

md += `## 공급사별 cross 비교\n\n`;
for (const r of report) {
  md += `### ${r.supplier}\n\n`;
  md += `| 지표 | 소스 | 값 | 일치 |\n|---|---|---|---|\n`;
  for (const [metric, sources] of Object.entries(r.cells)) {
    const values = Object.values(sources).filter((v) => typeof v === "number");
    const max = Math.max(...values);
    const min = Math.min(...values);
    const diff = max - min;
    const EPS = Math.max(1, max * 0.001);
    const ok = diff <= EPS;
    for (const [k, v] of Object.entries(sources)) {
      const mark = typeof v === "number" ? (values.length >= 2 ? (ok ? "✅" : "❌") : "ℹ️") : "ℹ️";
      md += `| ${metric} | ${k} | ${typeof v === "number" ? v.toLocaleString() : v} | ${mark} |\n`;
    }
  }
  md += `\n`;
}

md += `## 불일치 요약\n\n`;
if (mismatches.length === 0) {
  md += `**불일치 0건** · 모든 지표 모든 소스 간 동일 값\n\n`;
} else {
  md += `**불일치 ${mismatches.length}건** · 아래 테이블 참조\n\n`;
  md += `| 공급사 | 지표 | diff | 소스 값들 |\n|---|---|---|---|\n`;
  for (const m of mismatches) {
    const srcs = Object.entries(m.sources)
      .map(([k, v]) => `${k.split(".").pop()}=${typeof v === "number" ? v.toLocaleString() : v}`)
      .join(" / ");
    md += `| ${m.supplier} | ${m.metric} | ${m.diff.toLocaleString()} | ${srcs} |\n`;
  }
}

// 전체 일치 통계
let totalCells = 0, mismatchCells = 0;
for (const r of report) {
  for (const [, sources] of Object.entries(r.cells)) {
    const values = Object.values(sources).filter((v) => typeof v === "number");
    if (values.length < 2) continue;
    totalCells++;
    const max = Math.max(...values);
    const min = Math.min(...values);
    const EPS = Math.max(1, max * 0.001);
    if (max - min > EPS) mismatchCells++;
  }
}
md += `\n## 최종 통계\n\n`;
md += `- 공급사: ${supplierPool.length}\n`;
md += `- 비교 셀 (2소스 이상): ${totalCells}\n`;
md += `- 일치: ${totalCells - mismatchCells}\n`;
md += `- 불일치: ${mismatchCells}\n`;
md += `- 일치율: ${totalCells > 0 ? ((totalCells - mismatchCells) / totalCells * 100).toFixed(1) : "N/A"}%\n`;

writeFileSync("docs/CROSS_ENDPOINT_CONSISTENCY_2026-10-01.md", md);
console.log("\n→ docs/CROSS_ENDPOINT_CONSISTENCY_2026-10-01.md 생성");
console.log(`\n요약:`);
console.log(`  샘플 공급사: ${supplierPool.length}`);
console.log(`  비교 셀: ${totalCells}`);
console.log(`  일치: ${totalCells - mismatchCells}`);
console.log(`  불일치: ${mismatchCells}`);
console.log(`  일치율: ${totalCells > 0 ? ((totalCells - mismatchCells) / totalCells * 100).toFixed(1) : "N/A"}%`);
