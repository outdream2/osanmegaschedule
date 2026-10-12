import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const r1 = await sb.from("products").select("product_code,pcode,last_modified_at,registered_at").not("last_modified_at","is",null).limit(5);
console.log("last_modified_at samples:");
for (const r of r1.data || []) console.log(" ", r);
console.log("typeof last_modified_at[0]:", typeof r1.data?.[0]?.last_modified_at, "val:", r1.data?.[0]?.last_modified_at);

const r2 = await sb.from("products").select("product_code,pcode,individual_code,connection_type").not("individual_code","is",null).limit(5);
console.log("\nindividual_code samples:");
for (const r of r2.data || []) console.log(" ", r);

const r3 = await sb.from("products").select("product_code,pcode,supplier,supplier_type").not("supplier_type","is",null).limit(10);
console.log("\nsupplier_type vs supplier:");
for (const r of r3.data || []) console.log(" ", r);

// hidden counts (for sanity)
const { count: hiddenTrue } = await sb.from("products").select("*", { count: "exact", head: true }).eq("hidden", true);
console.log("\nhidden=true count:", hiddenTrue);
