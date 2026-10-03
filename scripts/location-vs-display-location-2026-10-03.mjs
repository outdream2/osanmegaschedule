// READ ONLY · products.location vs display_location coverage
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

let from = 0;
const stats = { total: 0, loc_only: 0, display_only: 0, both: 0, neither: 0, loc_eq_display: 0, loc_ne_display: 0, locHas: 0, dispHas: 0 };
const dupSamples = [];
while (true) {
  const { data } = await supabase.from("products").select("product_code, product_name, location, display_location").range(from, from + 999);
  if (!data || !data.length) break;
  for (const r of data) {
    stats.total++;
    const l = (r.location || "").trim();
    const d = (r.display_location || "").trim();
    if (l) stats.locHas++;
    if (d) stats.dispHas++;
    if (l && !d) stats.loc_only++;
    else if (!l && d) stats.display_only++;
    else if (l && d) {
      stats.both++;
      if (l === d) stats.loc_eq_display++;
      else {
        stats.loc_ne_display++;
        if (dupSamples.length < 10) dupSamples.push({ code: r.product_code, name: String(r.product_name || "").slice(0, 25), location: l, display_location: d });
      }
    } else {
      stats.neither++;
    }
  }
  if (data.length < 1000) break;
  from += 1000;
}
console.log("===== products.location vs display_location =====");
Object.entries(stats).forEach(([k, v]) => console.log("  " + k + " : " + v));
console.log("\n===== location ≠ display_location samples =====");
dupSamples.forEach((s) => console.log(`  ${s.code} ${s.name} · location="${s.location}" · display_location="${s.display_location}"`));
