// 2026-10-04 · READ-ONLY · 각 column 의 Web Service 사용처 전수 grep
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const PRODUCTS_COLUMNS = [
  "product_code","product_name","col_i","product_type","origin","spec","purchase_price","sale_price",
  "profit_rate","delivery_price","delivery_profit_rate","sale_status","app_registered","image_registered",
  "preset_registered","preset_group","promotion_name","promotion_priority","promotion_purchase_price",
  "promotion_sale_price","promotion_profit_rate","promotion_discount_rate","wholesale_price1","supplier_code",
  "supplier","supplier_type","expiry_date","display_location","management_group","unit_type","current_stock",
  "stock_amount","optimal_stock","last_purchase_date","last_sale_date","category_code","category","operator",
  "last_modified_at","registered_at","min_order","point_rate","sales_commission","delivery_margin_rate",
  "search_keywords","unit","total_volume","unit_volume","unit_price","connection_type","individual_code",
  "individual_quantity","imported_at","brand","manufacturer","memo","hidden","optimal_stock_backup","location",
  "stock_note"
];

// src/ + server/ 전수 스캔
function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (["node_modules","dist","coverage",".git","logs","build","release"].includes(e)) continue;
      walk(p, out);
    } else if (/\.(tsx?|cjs|mjs)$/.test(e) && !/\.test\.(ts|tsx)$/.test(e) && !/\.d\.ts$/.test(e)) {
      out.push(p);
    }
  }
  return out;
}

const roots = ["src", "server"];
const files = [];
for (const r of roots) walk(r, files);

// column → files/count
const usage = {};
for (const col of PRODUCTS_COLUMNS) usage[col] = { total: 0, files: new Set(), writeHits: 0, readHits: 0 };

// 간단 heuristic:
//   · "col_name" or '.col_name' or `col_name:` or `col_name:` 다양 패턴
//   · WRITE 패턴: upsert/update/insert/set 안에 등장
//   · READ 패턴: select 안에 등장
//   · UPDATE/INSERT context 는 line 전후 100 chars 안 `.update(` `.insert(` `.upsert(` 유무로 추정
for (const f of files) {
  let text;
  try { text = readFileSync(f, "utf8"); } catch { continue; }
  for (const col of PRODUCTS_COLUMNS) {
    // boundary: 영숫자/underscore 가 아닌 경계
    const re = new RegExp(`(^|[^A-Za-z0-9_])${col}([^A-Za-z0-9_]|$)`, "g");
    const matches = text.match(re);
    if (!matches || matches.length === 0) continue;
    usage[col].total += matches.length;
    usage[col].files.add(f);
    // WRITE heuristic: 파일 안에 col 과 .update( / .insert( / .upsert( 가 동시에 있으면 WRITE 가능
    if (/\.(update|insert|upsert|delete|set)\s*\(/.test(text)) usage[col].writeHits++;
    if (/\.(select|from)\s*\(/.test(text)) usage[col].readHits++;
  }
}

console.log(`===== Scanned ${files.length} files =====\n`);
console.log(`| # | Column | Hits | Files | WRITE context | READ context |`);
console.log(`|---|---|---:|---:|---:|---:|`);
PRODUCTS_COLUMNS.forEach((col, i) => {
  const u = usage[col];
  console.log(`| ${String(i+1).padStart(2," ")} | ${col} | ${u.total} | ${u.files.size} | ${u.writeHits} | ${u.readHits} |`);
});

// Dead cols (hits < 5)
console.log(`\n===== Low usage (hits < 5) =====`);
PRODUCTS_COLUMNS.filter((c) => usage[c].total < 5).forEach((c) => console.log(`  ${c} · ${usage[c].total} hits`));
