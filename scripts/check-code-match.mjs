import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// 진경안 상품 코드가 뭔지 확인
const { data: pdRow } = await sb.from("purchase_details")
  .select("product_code, product_name, supplier_name, purchase_date")
  .ilike("product_name", "%진경안%")
  .limit(3);
console.log("\npurchase_details 진경안:");
(pdRow ?? []).forEach(r => console.log(`  code="${r.product_code}" name="${r.product_name}" supplier="${r.supplier_name}"`));

// products 에서 같은 code 로 조회
if (pdRow && pdRow[0]) {
  const code = pdRow[0].product_code;
  const { data: prod } = await sb.from("products")
    .select("product_code, product_name, supplier, supplier_code")
    .eq("product_code", code);
  console.log(`\nproducts 에서 code="${code}" 정확 매칭: ${prod?.length ?? 0}건`);
  prod?.forEach(p => console.log(`  code="${p.product_code}" name="${p.product_name}" supplier="${p.supplier}"`));
}

// products 에서 상품명으로 조회
const { data: prodByName } = await sb.from("products")
  .select("product_code, product_name, supplier")
  .ilike("product_name", "%진경안%")
  .limit(5);
console.log(`\nproducts 상품명 "진경안" 매칭: ${prodByName?.length ?? 0}건`);
prodByName?.forEach(p => console.log(`  code="${p.product_code}" name="${p.product_name}" supplier="${p.supplier}"`));
