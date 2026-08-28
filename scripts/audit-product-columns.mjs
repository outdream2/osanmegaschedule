// products 컬럼 사용도 감사 · src + server 전체 · 사용 빈도 파악
// 실제 UI/API/로직 참조 카운트 → 안 쓰는 dead 컬럼 식별
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const COLS = [
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
  "real_map","brand","manufacturer","barcode","memo","hidden","location","stock_note","imported_at",
  "optimal_stock_backup",
];

// 재귀 파일 수집 · .ts .tsx .cjs .mjs 만
const EXTS = new Set([".ts", ".tsx", ".cjs", ".mjs"]);
const EXCLUDE = /node_modules|dist|build|\.next|coverage|\.git/;
function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (EXCLUDE.test(full)) continue;
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) walk(full, files);
    else if (st.isFile()) {
      const dot = name.lastIndexOf(".");
      if (dot >= 0 && EXTS.has(name.slice(dot))) files.push(full);
    }
  }
  return files;
}

const roots = ["src", "server", "scripts"];
const allFiles = roots.flatMap(r => { try { return walk(r); } catch { return []; } });
console.log(`스캔 파일: ${allFiles.length}`);

const results = [];
for (const col of COLS) {
  // 단어 경계 · 정확 매칭 (word boundary + 특수 case)
  // 예: `r.supplier` · `p.spec` · `"supplier"` · `supplier:` · `.supplier` 등 매칭
  const rx = new RegExp(`\\b${col}\\b`, "g");
  let fileCount = 0, lineCount = 0;
  const usedIn = { src: 0, server: 0, script: 0 };
  for (const f of allFiles) {
    let content = "";
    try { content = readFileSync(f, "utf8"); } catch { continue; }
    const matches = content.match(rx);
    if (!matches) continue;
    fileCount++;
    lineCount += matches.length;
    if (f.startsWith("src")) usedIn.src++;
    else if (f.startsWith("server")) usedIn.server++;
    else usedIn.script++;
  }
  results.push({ col, files: fileCount, lines: lineCount, ...usedIn });
}

// 정렬 · files desc
results.sort((a, b) => b.files - a.files);

console.log("");
console.log("컬럼".padEnd(28) + "총파일".padStart(6) + " " + "src".padStart(4) + " " + "server".padStart(6) + " " + "총참조".padStart(6));
console.log("─".repeat(60));
for (const r of results) {
  console.log(r.col.padEnd(28) + String(r.files).padStart(6) + " " + String(r.src).padStart(4) + " " + String(r.server).padStart(6) + " " + String(r.lines).padStart(6));
}

// 분류
console.log("\n" + "═".repeat(60));
console.log("[A] 필수 (5+ files)");
for (const r of results.filter(r => r.files >= 5)) console.log(`  ✅ ${r.col} · ${r.files}파일`);
console.log("\n[B] 보통 (2-4 files)");
for (const r of results.filter(r => r.files >= 2 && r.files < 5)) console.log(`  📦 ${r.col} · ${r.files}파일`);
console.log("\n[C] 거의 안 씀 (0-1 files · 대부분 xlsx.ts 파싱만)");
for (const r of results.filter(r => r.files < 2)) console.log(`  🗑️  ${r.col} · ${r.files}파일`);
