// READ ONLY · impact of ERP-derived display_location change on linked data
// Specifically: inventory_checks.shelf_positions, products.location, stock_history
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import * as dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const inv = JSON.parse(readFileSync("tools/iregen-bridge/output/inventory-full-full.json", "utf8"));
const rows = inv.tables[0].rows;

// WAREHOUSE_1_CODES
const W1 = new Set(["24", "25", "26", "27", "7B", "8A"]);
function wClass(code) {
  if (!code) return "none";
  const c = String(code).trim().toUpperCase();
  if (W1.has(c)) return "w1";
  // isValidZoneCode: 1~4 chars, pure numeric 1-99 or alphanum 2-4 chars
  if (c.length > 4) return "none";
  const n = parseInt(c, 10);
  if (!isNaN(n) && String(n) === c) return (n >= 1 && n <= 99) ? "w2" : "none";
  if (/^[0-9A-Z]{2,4}$/.test(c)) return "w2";
  return "none";
}

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
  return null;
}

const erpByName = new Map();
for (const r of rows) {
  const n = String(r.ProductName ?? "").trim();
  if (!n) continue;
  const d = deriveDisplayLocation(String(r.LocationName ?? "").trim());
  if (!erpByName.has(n)) erpByName.set(n, []);
  erpByName.get(n).push({ PCode: r.PCode, locationFull: r.LocationName, derived: d });
}

// Supabase products
const sb = [];
let from = 0;
while (true) {
  const { data } = await supabase.from("products").select("product_code, product_name, location, display_location, category_code").range(from, from + 999);
  if (!data || !data.length) break;
  for (const r of data) sb.push(r);
  if (data.length < 1000) break;
  from += 1000;
}

const warehouseChange = { stayW2: 0, stayW1: 0, w1_to_w2: 0, w2_to_w1: 0, becomeNone: 0, fromNone: 0, bothNone: 0 };
const codesWithWarehouseFlip = [];
for (const sbp of sb) {
  const n = String(sbp.product_name ?? "").trim();
  if (!n || !erpByName.has(n)) continue;
  const erpList = erpByName.get(n);
  if (erpList.length > 1) continue;
  const erp = erpList[0];
  const sbLoc = (sbp.location || sbp.display_location || "").trim();
  const erpLoc = erp.derived;
  if (!sbLoc && !erpLoc) continue;
  if (sbLoc === erpLoc) continue;
  const sbC = wClass(sbLoc);
  const erpC = wClass(erpLoc);
  const key = sbC + "->" + erpC;
  if (sbC === "w1" && erpC === "w2") { warehouseChange.w1_to_w2++; codesWithWarehouseFlip.push({ code: sbp.product_code, name: n.slice(0, 25), from: sbLoc, to: erpLoc, flip: "w1→w2" }); }
  else if (sbC === "w2" && erpC === "w1") { warehouseChange.w2_to_w1++; codesWithWarehouseFlip.push({ code: sbp.product_code, name: n.slice(0, 25), from: sbLoc, to: erpLoc, flip: "w2→w1" }); }
  else if (sbC === "w1" && erpC === "w1") warehouseChange.stayW1++;
  else if (sbC === "w2" && erpC === "w2") warehouseChange.stayW2++;
  else if (sbC !== "none" && erpC === "none") warehouseChange.becomeNone++;
  else if (sbC === "none" && erpC !== "none") warehouseChange.fromNone++;
  else warehouseChange.bothNone++;
}
console.log("===== Warehouse class change (shelf_positions impact) =====");
Object.entries(warehouseChange).forEach(([k, v]) => console.log("  " + k + " : " + v));
console.log("\n===== Products with warehouse flip (sensitive data impact) =====");
codesWithWarehouseFlip.slice(0, 20).forEach((e) => console.log(`  ${e.code} ${e.name} · ${e.from} → ${e.to} (${e.flip})`));

// Check inventory_checks shelf_positions actual coverage
const { count: icCount } = await supabase.from("inventory_checks").select("*", { count: "exact", head: true });
const { count: icWithShelf } = await supabase.from("inventory_checks").select("*", { count: "exact", head: true }).not("shelf_positions", "is", null);
console.log("\n===== inventory_checks shelf_positions coverage =====");
console.log("Total inventory_checks:", icCount);
console.log("With shelf_positions:", icWithShelf);

// stock_history location reference
const { count: shCount } = await supabase.from("stock_history").select("*", { count: "exact", head: true });
console.log("\nstock_history total:", shCount);
// does stock_history have location-related cols?
const { data: shSample } = await supabase.from("stock_history").select("*").limit(1);
if (shSample && shSample[0]) {
  const cols = Object.keys(shSample[0]);
  const locRelated = cols.filter((c) => /loc|zone|shelf|position/i.test(c));
  console.log("stock_history cols with location-related name:", locRelated.length ? locRelated : "(none)");
}

// location_assigned_at - what table?
const tables = ["products", "inventory_checks", "stock_history"];
for (const t of tables) {
  const { data: s } = await supabase.from(t).select("*").limit(1);
  if (s && s[0]) {
    const cols = Object.keys(s[0]);
    const locAt = cols.filter((c) => /location_assigned|assigned_at/i.test(c));
    if (locAt.length) console.log(`${t} location_assigned cols:`, locAt);
  }
}
