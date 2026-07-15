// 오학습 vendors 4개 삭제 (사업자번호 3101805493 = 코스트팜 수신처 · 공급처가 아님)
// id 152 (S)코스트팔약국 · 153 주문번호 · 155 (S)코스트팜약국 성 영 · 156 종옥의약품
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const sb = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
);

const targetIds = [152, 153, 155, 156];
const targetBiz = "3101805493";

console.log(`═══════════════════════════════════════════════════════════`);
console.log(`오학습 vendors 삭제 대상 (사업자번호 ${targetBiz})`);
console.log(`═══════════════════════════════════════════════════════════\n`);

// 1) 삭제 전 대상 확인
const { data: before } = await sb
  .from("vendors")
  .select("id, company_name, business_number, contact_name")
  .in("id", targetIds);
console.log("[삭제 전 확인]");
(before ?? []).forEach(v => console.log(`  id=${v.id} · ${v.company_name} · biz=${v.business_number}`));

// 2) 참조 확인 (다른 테이블에서 이 vendor 를 참조하고 있으면 FK 오류)
console.log("\n[참조 확인]");
const refTables = [
  { table: "supplier_balance_records", col: "supplier_name" },
  { table: "supplier_balance_configs", col: "supplier_name" },
  { table: "ocr_confirmed_items", col: "supplier" },
];
const suspects = (before ?? []).map(v => v.company_name);
for (const { table, col } of refTables) {
  try {
    const { count } = await sb.from(table).select("*", { count: "exact", head: true }).in(col, suspects);
    console.log(`  ${table}.${col} in [${suspects.length}개 이름] → ${count ?? 0}건`);
  } catch (e) {
    console.log(`  ${table}: (조회 실패 · 무시)`);
  }
}

// 3) 실제 삭제
console.log("\n[삭제 실행]");
const { data: deleted, error } = await sb
  .from("vendors")
  .delete()
  .in("id", targetIds)
  .select();
if (error) {
  console.error(`  ❌ 실패: ${error.message}`);
  process.exit(1);
}
console.log(`  ✅ ${deleted?.length ?? 0}건 삭제 완료`);
(deleted ?? []).forEach(v => console.log(`    id=${v.id} · ${v.company_name}`));

// 4) 사후 확인
console.log("\n[사후 확인]");
const { data: remaining } = await sb
  .from("vendors")
  .select("id, company_name, business_number")
  .eq("business_number", targetBiz);
if (!remaining || remaining.length === 0) console.log("  ✅ 사업자번호 3101805493 로 남은 vendors 없음");
else {
  console.log(`  ⚠ 아직 ${remaining.length}건 남음:`);
  remaining.forEach(v => console.log(`    id=${v.id} · ${v.company_name}`));
}

console.log("\n═══════════════════════════════════════════════════════════");
console.log("다음: 파이프라인에 3101805493 blacklist 추가 (재발 방지)");
