import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const lens = {};
let from = 0;
const PAGE = 1000;
while (true) {
  const { data } = await supabase.from("products").select("product_code").range(from, from + PAGE - 1);
  if (!data || data.length === 0) break;
  for (const r of data) {
    const c = String(r.product_code ?? "").trim();
    lens[c.length] = (lens[c.length] || 0) + 1;
  }
  if (data.length < PAGE) break;
  from += PAGE;
}
console.log("Supabase product_code length distribution:", lens);
const { data: five } = await supabase.from("products").select("product_code, product_name").filter("product_code", "like", "_____").limit(5);
console.log("Supabase 5자리 codes (sample):", five);
