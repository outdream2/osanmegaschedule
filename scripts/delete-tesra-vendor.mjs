// scripts/delete-tesra-vendor.mjs
// 2026-09-10 · 사용자 지시 · "테스라" 공급사 · 존재하지 않음 · 삭제
//   · vendors 테이블 · company_name LIKE 검색
//   · 연관 purchase_details / supplier_payments / order_requests 표시 (지시 대기)
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

console.log("━━━ '테스라' 공급사 · 검색·삭제 ━━━\n");

// 1. vendors 검색 · 다양한 표기 (테스라, 테슬라, Tesla)
const patterns = ["테스라", "테슬라", "Tesla", "tesla", "TESLA"];
const allMatches = [];
for (const p of patterns) {
  const { data } = await supabase
    .from("vendors")
    .select("id, company_name, contact_name, phone, is_deleted")
    .or(`company_name.ilike.%${p}%,contact_name.ilike.%${p}%`);
  if (data && data.length > 0) {
    for (const r of data) {
      if (!allMatches.find(m => m.id === r.id)) allMatches.push(r);
    }
  }
}
console.log(`[vendors] 매치 ${allMatches.length}건`);
for (const r of allMatches) {
  console.log(`  id=${r.id} · ${r.company_name} · 담당자=${r.contact_name ?? "-"} · deleted=${r.is_deleted}`);
}

if (allMatches.length === 0) {
  console.log("\n· 테스라 공급사 없음 · 매입이력 · 존재 시 · purchase_details.supplier 값 확인 필요");
  // purchase_details.supplier 확인
  const { data: pd } = await supabase
    .from("purchase_details")
    .select("supplier")
    .ilike("supplier", "%테스라%")
    .limit(20);
  console.log(`[purchase_details.supplier LIKE 테스라] ${pd?.length ?? 0}건`);
  if (pd && pd.length > 0) {
    const uniq = new Set(pd.map(r => r.supplier));
    console.log("  supplier 값:", Array.from(uniq));
  }
  process.exit(0);
}

// 2. 사용자 지시 · 삭제 실행 (soft delete · is_deleted=true 우선)
console.log("\n[삭제 시작 · soft delete · is_deleted=true]");
for (const r of allMatches) {
  const { error } = await supabase
    .from("vendors")
    .update({ is_deleted: true, deleted_at: new Date().toISOString() })
    .eq("id", r.id);
  if (error) console.log(`  id=${r.id} · 실패 · ${error.message}`);
  else console.log(`  id=${r.id} · ${r.company_name} · soft delete 완료`);
}

console.log("\n━━━ 완료 ━━━");
