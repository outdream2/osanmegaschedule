// READ ONLY · Does location_assigned_at column actually exist?
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

for (const t of ["products", "inventory_checks", "stock_history", "purchase_details"]) {
  const { data, error } = await supabase.from(t).select("*").limit(1);
  if (error) { console.log(t + ": error " + error.message); continue; }
  const cols = Object.keys(data[0] || {});
  const locCols = cols.filter((c) => /loc/i.test(c));
  console.log(`${t} loc cols:`, locCols.length ? locCols : "(none)");
}

// Also check products.location coverage specifically
const { count: locCount } = await supabase.from("products").select("*", { count: "exact", head: true }).not("location", "is", null);
const { count: dispCount } = await supabase.from("products").select("*", { count: "exact", head: true }).not("display_location", "is", null);
console.log("\nproducts.location non-null:", locCount);
console.log("products.display_location non-null:", dispCount);
