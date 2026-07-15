// 3101805493 사업자번호 조회 · vendors DB · ocr_supplier_aliases · 재고 스냅샷 매칭 확인
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

const target = "3101805493";
console.log(`═══════════════════════════════════════════════════════════`);
console.log(`사업자번호 ${target} 조회`);
console.log(`═══════════════════════════════════════════════════════════`);

// 1. vendors 테이블
console.log(`\n[1] vendors 테이블`);
const { data: vendors, error: ve } = await sb
  .from("vendors")
  .select("id, company_name, business_number, contact_name, phone, category, created_at")
  .or(`business_number.eq.${target},business_number.eq.310-18-05493,business_number.eq.310-1805493`);
if (ve) console.error("  error:", ve.message);
else if (!vendors || vendors.length === 0) console.log(`  ⚠ 미등록`);
else vendors.forEach(v => console.log(`  · id=${v.id} · ${v.company_name} · biz=${v.business_number} · 담당=${v.contact_name} · ${v.phone}`));

// 2. ocr_supplier_aliases (별칭 매핑) · 컬럼 이름 모름 → 통째로 조회
console.log(`\n[2] ocr_supplier_aliases 별칭 매핑 (통째 조회)`);
try {
  const { data: aliases, error } = await sb.from("ocr_supplier_aliases").select("*").limit(1000);
  if (error) console.log(`  (테이블 없음: ${error.message})`);
  else {
    const hit = (aliases ?? []).filter(a => JSON.stringify(a).includes(target) || JSON.stringify(a).includes("종옥"));
    if (hit.length === 0) console.log(`  ⚠ 3101805493 or 종옥 관련 별칭 없음 (총 ${aliases?.length ?? 0}건 스캔)`);
    else hit.forEach(a => console.log(`  · ${JSON.stringify(a)}`));
  }
} catch (e) { console.log(`  (조회 실패: ${e.message})`); }

// 3. ocr_confirmed_items 에서 이 번호 관련 발주서 있는지
console.log(`\n[3] ocr_confirmed_items · supplier=종옥 검색`);
try {
  const { data: items, error } = await sb
    .from("ocr_confirmed_items")
    .select("id, supplier, product_name, quantity, amount, saved_at")
    .ilike("supplier", "%종옥%")
    .limit(20);
  if (error) console.log(`  (조회 실패: ${error.message})`);
  else if (!items || items.length === 0) console.log(`  ⚠ 종옥 관련 저장된 항목 없음`);
  else items.forEach(i => console.log(`  · id=${i.id} · sup=${i.supplier} · ${i.product_name} · ${i.saved_at}`));
} catch (e) { console.log(`  (조회 실패: ${e.message})`); }

// 4. products 에 이 supplier 나 code 있는지
console.log(`\n[4] products · supplier 이름에 "종옥" 포함`);
const { data: prods } = await sb
  .from("products")
  .select("product_code, product_name, supplier, supplier_code")
  .ilike("supplier", "%종옥%")
  .limit(10);
if (!prods || prods.length === 0) console.log(`  ⚠ 없음`);
else prods.forEach(p => console.log(`  · ${p.product_code} · ${p.product_name} · sup=${p.supplier} · code=${p.supplier_code}`));

// 5. stock_history 에 supplier "종옥" 있는지
console.log(`\n[5] stock_history · supplier 이름에 "종옥" 포함 (최근 5)`);
const { data: hist } = await sb
  .from("stock_history")
  .select("snapshot_date, supplier_code, supplier_name")
  .ilike("supplier_name", "%종옥%")
  .order("snapshot_date", { ascending: false })
  .limit(5);
if (!hist || hist.length === 0) console.log(`  ⚠ 없음`);
else hist.forEach(h => console.log(`  · ${h.snapshot_date} · sup=${h.supplier_name} · code=${h.supplier_code}`));

console.log("\n═══════════════════════════════════════════════════════════");
console.log("결론: 위 결과 확인 후 vendors 에 등록 필요/오학습 삭제 필요 판단");
