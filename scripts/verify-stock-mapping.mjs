// 시작일재고 · 종료일재고 · 현재고 컬럼이 DB 로 제대로 매핑되는지 확인
import XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

const parseNum = (v) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (v == null || v === "") return 0;
  const n = parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

// ══════════════════════════════════════════════════════════
// 1. 재고현황 xlsx : 시작일재고 → opening_stock · 종료일재고 → closing_stock
// ══════════════════════════════════════════════════════════
console.log("═══════════════════════════════════════════════════════════");
console.log("① 재고현황 xlsx → stock_history 매핑 검증");
console.log("═══════════════════════════════════════════════════════════");

const stockWB = XLSX.readFile("src/재고현황_2026-0711_0715.xlsx");
const stockWS = stockWB.Sheets[stockWB.SheetNames[0]];
const stockArr = XLSX.utils.sheet_to_json(stockWS, { header: 1, defval: "" });
const stockHeaders = stockArr[1].map(h => String(h ?? "").trim());
const stockData = stockArr.slice(2);

const findCol = (headers, pats) => {
  for (const p of pats) {
    const i = headers.findIndex((h) => p.test(h));
    if (i >= 0) return i;
  }
  return -1;
};

const codeI = findCol(stockHeaders, [/^코드$/i, /상품\s*코드/i]);
const openI = findCol(stockHeaders, [/시작일\s*재고/i, /기초\s*재고/i, /시작\s*재고/i]);
const stockI = findCol(stockHeaders, [/종료일\s*재고/i, /기말\s*재고/i, /^현재고$/i]);
const purchI = findCol(stockHeaders, [/입고\s*계/i, /^입고$/i]);
const saleI = findCol(stockHeaders, [/판매\s*출고\s*계/i, /^판매$/i]);

console.log(`\n[매핑 결과]`);
console.log(`  코드         : xlsx col [${codeI}] "${stockHeaders[codeI]}"     → DB product_code`);
console.log(`  시작일 재고  : xlsx col [${openI}] "${stockHeaders[openI]}"   → DB opening_stock`);
console.log(`  종료일 재고  : xlsx col [${stockI}] "${stockHeaders[stockI]}"  → DB closing_stock`);
console.log(`  입고계       : xlsx col [${purchI}] "${stockHeaders[purchI]}"       → DB purchase_qty`);
console.log(`  판매출고계   : xlsx col [${saleI}] "${stockHeaders[saleI]}"   → DB sale_qty`);

// 판매가 있는 상품 5개 골라서 xlsx 값 vs DB 저장될 값 비교 시뮬레이션
console.log(`\n[임포트 시뮬레이션 · 판매>0 상품 5개]`);
console.log(`  xlsx 원본 값 → 임포트하면 DB 에 이렇게 저장됨:`);
let shown = 0;
for (const r of stockData) {
  if (!Array.isArray(r)) continue;
  const code = String(r[codeI] ?? "").trim();
  if (!code) continue;
  const sale = parseNum(r[saleI]);
  if (sale <= 0) continue;
  const open = parseNum(r[openI]);
  const purch = parseNum(r[purchI]);
  const close = parseNum(r[stockI]);
  const flowOk = open + purch - sale === close;
  console.log(`  code=${code}`);
  console.log(`    xlsx  → 시작(${open}) + 입고(${purch}) - 판매(${sale}) = 이론(${open + purch - sale})   vs   xlsx 종료(${close})   ${flowOk ? "✅ 일치" : "❌ 차이=" + (open + purch - sale - close) + " (손실)"}`);
  console.log(`    DB로  → opening_stock=${open}, purchase_qty=${purch}, sale_qty=${sale}, closing_stock=${close}`);
  shown++;
  if (shown >= 5) break;
}

// ══════════════════════════════════════════════════════════
// 2. 상품리스트 xlsx : 현재고 → products.current_stock
// ══════════════════════════════════════════════════════════
console.log("\n\n═══════════════════════════════════════════════════════════");
console.log("② 상품리스트 xlsx → products.current_stock 매핑 검증");
console.log("═══════════════════════════════════════════════════════════");

const prodWB = XLSX.readFile("src/상품리스트_2026-07-15 11_07.xlsx");
const prodWS = prodWB.Sheets[prodWB.SheetNames[0]];
const prodArr = XLSX.utils.sheet_to_json(prodWS, { header: 1, defval: "" });
const prodHeaders = prodArr[0].map(h => String(h ?? "").trim().replace(/\n/g, " "));
const prodData = prodArr.slice(1);

const pCodeI = prodHeaders.findIndex(h => /상품\s*코드/i.test(h) || h === "코드");
const pStockI = prodHeaders.findIndex(h => /^현재고$/.test(h));
const pNameI = prodHeaders.findIndex(h => /^상품명$/.test(h));

console.log(`\n[매핑 결과]`);
console.log(`  상품코드 : xlsx col [${pCodeI}] "${prodHeaders[pCodeI]}"  → DB product_code`);
console.log(`  현재고   : xlsx col [${pStockI}] "${prodHeaders[pStockI]}"      → DB products.current_stock`);
console.log(`  상품명   : xlsx col [${pNameI}] "${prodHeaders[pNameI]}"      → DB products.product_name`);

// 처음 5개 상품 골라서 xlsx 현재고 vs DB current_stock 비교
console.log(`\n[실제 DB 값 비교 · 상품리스트 xlsx 앞 8개]`);
const samples = [];
for (const r of prodData) {
  if (!Array.isArray(r)) continue;
  const code = String(r[pCodeI] ?? "").trim();
  if (!code) continue;
  samples.push({ code, name: String(r[pNameI] ?? ""), xlsxStock: parseNum(r[pStockI]) });
  if (samples.length >= 8) break;
}
const codes = samples.map(s => s.code);
const { data: dbRows, error } = await sb
  .from("products")
  .select("product_code, product_name, current_stock")
  .in("product_code", codes);
if (error) console.error(error);
const dbMap = new Map((dbRows ?? []).map(r => [r.product_code, r]));

console.log(`  ${"code".padEnd(15)} ${"이름".padEnd(30)} ${"xlsx 현재고".padStart(12)} ${"DB current_stock".padStart(18)} ${"일치?"}`);
for (const s of samples) {
  const db = dbMap.get(s.code);
  const dbVal = db ? Number(db.current_stock ?? 0) : "(없음)";
  const match = db && Number(db.current_stock ?? 0) === s.xlsxStock ? "✅" : "❌";
  console.log(`  ${s.code.padEnd(15)} ${(s.name.slice(0, 30)).padEnd(30)} ${String(s.xlsxStock).padStart(12)} ${String(dbVal).padStart(18)} ${match}`);
}

// ══════════════════════════════════════════════════════════
// 3. DB stock_history 값 vs xlsx 종료일 재고 비교 (같은 상품 코드가 xlsx 에도 있으면)
// ══════════════════════════════════════════════════════════
console.log("\n\n═══════════════════════════════════════════════════════════");
console.log("③ DB stock_history.closing_stock vs 상품리스트 xlsx 현재고 상관관계");
console.log("═══════════════════════════════════════════════════════════");

const { data: hist } = await sb
  .from("stock_history")
  .select("product_code, opening_stock, closing_stock, sale_qty, purchase_qty")
  .eq("period_start_date", "2026-07-10");
const histMap = new Map((hist ?? []).map(r => [r.product_code, r]));

// 상품리스트 xlsx 상품 중 stock_history 에도 있는 것 5개
console.log(`\n[DB 값 삼중 비교 · products.current_stock vs stock_history.closing_stock vs 상품리스트 xlsx 현재고]`);
console.log(`  ${"code".padEnd(15)} ${"xlsx현재고".padStart(11)} ${"DB current_stock".padStart(18)} ${"DB closing_stock".padStart(18)}`);
let matched = 0;
for (const s of samples) {
  const db = dbMap.get(s.code);
  const h = histMap.get(s.code);
  if (!db || !h) continue;
  console.log(`  ${s.code.padEnd(15)} ${String(s.xlsxStock).padStart(11)} ${String(db.current_stock).padStart(18)} ${String(h.closing_stock).padStart(18)}`);
  matched++;
  if (matched >= 5) break;
}
