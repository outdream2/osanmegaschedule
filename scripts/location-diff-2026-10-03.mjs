// READ ONLY · Compare ERP-derived display_location vs Supabase products.display_location
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import * as dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const inv = JSON.parse(readFileSync("tools/iregen-bridge/output/inventory-full-full.json", "utf8"));
const rows = inv.tables[0].rows;

function deriveDisplayLocation(loc) {
  if (!loc) return null;
  const parts = loc.split(">").map((p) => p.trim());
  if (parts.length < 2) return null;
  const major = parts[0];
  const middle = (parts[1] || "")
    .replace(/Ａ/g, "A").replace(/Ｂ/g, "B").replace(/Ｃ/g, "C").replace(/Ｄ/g, "D");
  if (!middle) return null;
  if (major === "벽") return middle;
  const m = major.match(/^([0-9]+)매대$/);
  if (m) return m[1] + middle;
  // 뷰티/냉장고 is unspec, return null
  return null;
}

// ERP by ProductName (since product_code != barcode)
const erpByName = new Map();
for (const r of rows) {
  const n = String(r.ProductName ?? "").trim();
  if (!n) continue;
  const d = deriveDisplayLocation(String(r.LocationName ?? "").trim());
  if (!erpByName.has(n)) erpByName.set(n, []);
  erpByName.get(n).push({ PCode: r.PCode, locationFull: r.LocationName, derived: d });
}

// Read Supabase products
const sb = [];
let from = 0;
while (true) {
  const { data } = await supabase.from("products").select("product_code, product_name, display_location").range(from, from + 999);
  if (!data || !data.length) break;
  for (const r of data) sb.push(r);
  if (data.length < 1000) break;
  from += 1000;
}
console.log("Supabase products:", sb.length);
console.log("ERP products (distinct ProductName):", erpByName.size);

const stats = { nameMatch: 0, dupName: 0, bothEmpty: 0, exactSame: 0, dbEmpty_erpHas: 0, erpEmpty_dbHas: 0, different: 0, erpUnspec_dbHas: 0, erpUnspec_dbEmpty: 0 };
const differentSamples = [];
const changeCandidates = { bulkChange: new Map(), kept: new Map() };

for (const sbp of sb) {
  const n = String(sbp.product_name ?? "").trim();
  if (!n || !erpByName.has(n)) continue;
  const erpList = erpByName.get(n);
  if (erpList.length > 1) { stats.dupName++; continue; }
  stats.nameMatch++;
  const erp = erpList[0];
  const sbLoc = (sbp.display_location || "").trim();
  const erpLoc = erp.derived;
  if (!sbLoc && !erpLoc) { stats.bothEmpty++; continue; }
  if (sbLoc && !erpLoc && erp.locationFull && erp.locationFull.trim()) {
    stats.erpUnspec_dbHas++;
    continue;
  }
  if (!sbLoc && !erpLoc) continue;
  if (!erpLoc && !erp.locationFull) {
    stats.erpEmpty_dbHas++;
    continue;
  }
  if (!sbLoc && erpLoc) { stats.dbEmpty_erpHas++; continue; }
  if (sbLoc === erpLoc) { stats.exactSame++; continue; }
  stats.different++;
  if (differentSamples.length < 50) {
    differentSamples.push({ product_code: sbp.product_code, product_name: n.slice(0, 25), erpFull: erp.locationFull, erpDerived: erpLoc, sbLoc });
  }
  const key = sbLoc + " → " + erpLoc;
  changeCandidates.bulkChange.set(key, (changeCandidates.bulkChange.get(key) || 0) + 1);
}

console.log("\n===== ProductName Match Stats =====");
Object.entries(stats).forEach(([k, v]) => console.log("  " + k + " : " + v));

console.log("\n===== Different samples (ERP ≠ DB) =====");
differentSamples.slice(0, 30).forEach((s) => {
  console.log(`  ${s.product_code} ${s.product_name} · ERP="${s.erpFull}" → "${s.erpDerived}" · DB="${s.sbLoc}"`);
});

console.log("\n===== display_location 변경 후보 (sorted by count) =====");
[...changeCandidates.bulkChange.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).forEach(([k, v]) => console.log("  " + k + " : " + v));
