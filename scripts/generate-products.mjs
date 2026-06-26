// Build-time script: converts src/listfile/list.xlsx → public/products.json
// Run: node scripts/generate-products.mjs
import XLSX from "xlsx";
import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const xlsxPath = join(__dirname, "..", "src", "listfile", "list.xlsx");
const outDir  = join(__dirname, "..", "public");
const outPath = join(outDir, "products.json");

mkdirSync(outDir, { recursive: true });

const wb   = XLSX.readFile(xlsxPath);
const ws   = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });

// Build flat map: code → { code, name, spec }
// Also index stripped leading-zero variant
const map = {};
for (let i = 1; i < rows.length; i++) {
  const row  = rows[i];
  const code = String(row[0] ?? "").trim();
  const name = String(row[1] ?? "").trim();
  const spec = String(row[5] ?? "").trim();
  if (!code) continue;
  map[code] = { code, name, spec };
  const stripped = code.replace(/^0+/, "");
  if (stripped && stripped !== code && !map[stripped]) {
    map[stripped] = { code, name, spec };
  }
}

writeFileSync(outPath, JSON.stringify(map));
console.log(`✓ products.json — ${Object.keys(map).length} entries → ${outPath}`);
