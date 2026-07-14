// scripts/inspect-list-xlsx.mjs
// 상품리스트 xlsx 의 실제 컬럼 구조 확인
import XLSX from "xlsx";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.join(__dirname, "..", "src");
const files = fs.readdirSync(srcDir).filter(f => f.endsWith(".xlsx") && f.startsWith("상품리스트"));
if (files.length === 0) { console.log("상품리스트 xlsx 없음"); process.exit(0); }
const target = path.join(srcDir, files[0]);
console.log(`분석: ${target}\n`);

const wb = XLSX.readFile(target, { cellDates: true });
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true });

console.log(`시트: ${wb.SheetNames.join(", ")} · 총 행: ${rows.length}\n`);

// 첫 4행 · 각 컬럼 값 (개수 확인)
for (let i = 0; i < Math.min(4, rows.length); i++) {
  const r = rows[i] ?? [];
  console.log(`─ Row ${i} · ${r.length} cols ─`);
  for (let c = 0; c < r.length; c++) {
    const v = r[c];
    console.log(`  Col ${String(c).padStart(2, "0")}: ${JSON.stringify(v)} (${typeof v})`);
  }
  console.log();
}

// COL_KEYS vs 실제 헤더 비교
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

console.log("── COL_KEYS(기존 매핑) vs Excel 실제 헤더 비교 ──\n");
const r0 = rows[0] ?? [];
const r1 = rows[1] ?? [];
for (let c = 0; c < Math.max(COL_KEYS.length, r0.length); c++) {
  const codeKey = COL_KEYS[c] ?? "(없음)";
  const h0 = r0[c];
  const h1 = r1[c];
  const mismatch = String(h0 ?? h1 ?? "").trim() !== "" ? "" : "";
  console.log(`  Col ${String(c).padStart(2, "0")}: 코드키="${codeKey.padEnd(26)}" | 헤더row0="${h0 ?? ""}" | 헤더row1="${h1 ?? ""}"`);
}
