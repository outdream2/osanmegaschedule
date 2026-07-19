// 매입상세 서버 로직 시뮬레이션 · supplier="경방신약" 검색
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const supplier = "경방신약";
console.log(`\n[시뮬레이션] supplier="${supplier}" 검색\n`);

// Step 1: products 에서 supplier ilike 매칭 code 조회
const { data: matchedProducts } = await sb
  .from("products")
  .select("product_code")
  .ilike("supplier", `%${supplier}%`)
  .limit(5000);
const codes = (matchedProducts ?? []).map(p => String(p.product_code ?? "")).filter(Boolean);
console.log(`Step1: products.supplier ilike '%${supplier}%' 매칭 코드 ${codes.length}개`);
console.log(`  샘플: ${codes.slice(0, 5).join(", ")}`);

// Step 2: purchase_details 에서 그 코드들로 조회
let q = sb.from("purchase_details")
  .select("id, purchase_date, supplier_name, product_code, product_name, quantity, amount")
  .order("purchase_date", { ascending: false })
  .limit(500);
if (codes.length > 0) q = q.in("product_code", codes);
const { data: rows, error } = await q;
console.log(`\nStep2: purchase_details.product_code IN [...] → ${rows?.length ?? 0}건`);
if (error) console.error("[X]", error.message);
(rows ?? []).slice(0, 15).forEach((r, i) => {
  console.log(`  ${i + 1}. [${r.purchase_date}] code=${r.product_code} · ${r.product_name} · 수량 ${r.quantity} · 금액 ${r.amount}`);
});
