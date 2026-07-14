// scripts/test-xlsx-parse.mjs
// 새 xlsx.ts (헤더 기반) 파싱이 실제 상품리스트 xlsx 에 대해 올바른 값을 뽑아내는지 확인
import XLSX from "xlsx";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(__dirname, "..", "src");
const files = fs.readdirSync(srcDir).filter(f => f.startsWith("상품리스트") && f.endsWith(".xlsx"));
if (files.length === 0) { console.log("상품리스트 xlsx 없음"); process.exit(0); }
const target = path.join(srcDir, files[0]);
const buf = fs.readFileSync(target);

// ── xlsx.ts 의 새 로직을 여기에 인라인 (변경 없이 복붙) ──
const COL_KEYS = [
  "product_code","product_name","col_i","product_type","origin","spec",
  "purchase_price","sale_price","profit_rate","delivery_price","delivery_profit_rate",
  "sale_status","app_registered","image_registered","preset_registered","preset_group",
  "promotion_name","promotion_priority","promotion_purchase_price","promotion_sale_price",
  "promotion_profit_rate","promotion_discount_rate","wholesale_price1","supplier_code",
  "supplier","supplier_type","expiry_date","display_location","management_group","unit_type",
  "current_stock","stock_amount","optimal_stock","last_purchase_date","last_sale_date",
  "category_code","category","operator","last_modified_at","registered_at",
  "min_order","point_rate","sales_commission","delivery_margin_rate","search_keywords",
  "unit","total_volume","unit_volume","unit_price","connection_type","individual_code","individual_quantity",
];
const HEADER_MATCHERS = [
  { key: "product_code",             patterns: [/^상품\s*코드$/, /^코드$/, /^product[_ ]?code$/i] },
  { key: "product_name",             patterns: [/^상품\s*명$/, /^명$/, /^product[_ ]?name$/i] },
  { key: "col_i",                    patterns: [/^i$/i] },
  { key: "product_type",             patterns: [/^상품\s*유형$/] },
  { key: "origin",                   patterns: [/^원산지$/] },
  { key: "spec",                     patterns: [/^규격$/, /^spec$/i] },
  { key: "purchase_price",           patterns: [/^매입\s*단가$/, /^매입가$/] },
  { key: "sale_price",               patterns: [/^판매\s*단가$/, /^판매가$/] },
  { key: "profit_rate",              patterns: [/^이익률$/, /^마진율$/] },
  { key: "delivery_price",           patterns: [/^출고\s*단가$/, /^배송\s*단가$/] },
  { key: "delivery_profit_rate",     patterns: [/^출고\s*이익률$/, /^배송\s*이익률$/, /^배송\s*마진율$/] },
  { key: "sale_status",              patterns: [/^판매\s*상태$/] },
  { key: "app_registered",           patterns: [/^APP\s*등록\s*상품$/i, /^APP\s*등록$/i, /^앱\s*등록$/] },
  { key: "image_registered",         patterns: [/^이미지\s*등록\s*여부$/, /^이미지\s*등록$/] },
  { key: "preset_registered",        patterns: [/^프리셋\s*등록\s*상품$/, /^프리셋\s*등록$/] },
  { key: "preset_group",             patterns: [/^프리셋\s*그룹$/] },
  { key: "supplier_code",            patterns: [/^공급사\s*코드$/, /^supplier[_ ]?code$/i] },
  { key: "supplier",                 patterns: [/^공급사$/, /^공급사명$/, /^supplier$/i] },
  { key: "supplier_type",            patterns: [/^공급사\s*구분$/, /^공급사\s*유형$/] },
  { key: "expiry_date",              patterns: [/^유통기한$/, /^유효기간$/] },
  { key: "display_location",         patterns: [/^진열\s*위치$/, /^진열\s*구역$/] },
  { key: "management_group",         patterns: [/^관리\s*그룹$/, /^관리군$/] },
  { key: "current_stock",            patterns: [/^현재고$/, /^재고$/, /^수량$/] },
  { key: "stock_amount",             patterns: [/^재고\s*금액$/] },
  { key: "optimal_stock",            patterns: [/^적정\s*재고$/] },
  { key: "last_purchase_date",       patterns: [/^최근\s*매입일$/] },
  { key: "last_sale_date",           patterns: [/^최근\s*매출일$/, /^최근\s*판매일$/] },
  { key: "category_code",            patterns: [/^분류\s*코드$/] },
  { key: "category",                 patterns: [/^분류$/] },
  { key: "operator",                 patterns: [/^작업자$/] },
];
const NUMERIC_KEYS = new Set(["current_stock", "stock_amount", "optimal_stock", "sale_price", "purchase_price", "profit_rate"]);
function normalizeNumber(v) {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (s === "" || s === "-") return null;
  const n = Number(s.replace(/[,\s₩원]/g, ""));
  return Number.isFinite(n) ? n : null;
}
function normalizeHeader(v) { return String(v ?? "").replace(/\r?\n/g, " ").trim(); }
function buildHeaderIndex(headerRow) {
  const idx = {};
  for (let c = 0; c < headerRow.length; c++) {
    const h = normalizeHeader(headerRow[c]);
    if (!h) continue;
    for (const { key, patterns } of HEADER_MATCHERS) {
      if (idx[key] !== undefined) continue;
      if (patterns.some(p => p.test(h))) { idx[key] = c; break; }
    }
  }
  return idx;
}

// ── 실제 파싱 ──
const wb = XLSX.read(buf, { type: "buffer", cellDates: true });
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });
const headerIdx = buildHeaderIndex(rows[0]);
console.log("── 헤더 매핑 결과 (엑셀 컬럼 인덱스) ──");
for (const [k, v] of Object.entries(headerIdx).sort((a,b)=>a[1]-b[1])) {
  const hdr = rows[0][v];
  console.log(`  ${k.padEnd(24)} → col ${String(v).padStart(2,"0")} ("${hdr}")`);
}

// 첫 5개 데이터 행에서 주요 필드 값 확인
console.log("\n── 첫 5개 데이터 행의 파싱 결과 ──");
for (let i = 1; i <= 5; i++) {
  const row = rows[i];
  if (!row) break;
  const code = String(row[headerIdx.product_code] ?? "").trim();
  const name = String(row[headerIdx.product_name] ?? "").trim();
  const currentStock = normalizeNumber(row[headerIdx.current_stock]);
  const optimalStock = normalizeNumber(row[headerIdx.optimal_stock]);
  const salePrice = normalizeNumber(row[headerIdx.sale_price]);
  const supplier = row[headerIdx.supplier];
  const supplierType = row[headerIdx.supplier_type];
  const spec = row[headerIdx.spec];
  const realMap = row[headerIdx.display_location];
  console.log(`  [${code}] ${name.slice(0, 20)}`);
  console.log(`    현재고=${currentStock} | 적정재고=${optimalStock} | 판매가=${salePrice}`);
  console.log(`    공급사="${supplier}" | 공급사구분="${supplierType}" | 규격="${spec}" | 진열위치="${realMap}"`);
}
