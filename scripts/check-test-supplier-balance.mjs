// scripts/check-test-supplier-balance.mjs
// 2026-09-11 · #128 · "테스트" 공급사 · 매입액·결제액·잔고 · 실제 DB 값 확인
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const supplier = "테스트";
console.log(`━━━ "${supplier}" 공급사 · 매입·결제·잔고 조사 ━━━\n`);

// 1. purchase_details · 이 공급사 · 매입 합계
const { data: pd } = await supabase
  .from("purchase_details")
  .select("purchase_date, product_name, quantity, unit_price, amount, supplier_name, supplier")
  .or(`supplier.eq.${supplier},supplier_name.eq.${supplier}`);
console.log(`[A] purchase_details · ${pd?.length ?? 0}건`);
let totalPurchase = 0;
for (const r of pd ?? []) {
  const amt = Number(r.amount ?? 0) || (Number(r.quantity ?? 0) * Number(r.unit_price ?? 0));
  totalPurchase += amt;
  console.log(`  ${r.purchase_date} · ${r.product_name} · ${r.quantity}개 × ${r.unit_price} = ${amt}원`);
}
console.log(`  합계 · ${totalPurchase.toLocaleString()}원\n`);

// 2. supplier_payments · 결제 합계
const { data: sp } = await supabase
  .from("supplier_payments")
  .select("payment_date, amount, supplier, method")
  .eq("supplier", supplier);
console.log(`[B] supplier_payments · ${sp?.length ?? 0}건`);
let totalPayment = 0;
for (const r of sp ?? []) {
  const amt = Number(r.amount ?? 0);
  totalPayment += amt;
  console.log(`  ${r.payment_date} · ${amt}원 · ${r.method}`);
}
console.log(`  합계 · ${totalPayment.toLocaleString()}원\n`);

// 3. 계산된 잔고
const calcBalance = totalPurchase - totalPayment;
console.log(`[C] 계산된 잔고 · 매입 ${totalPurchase.toLocaleString()} − 결제 ${totalPayment.toLocaleString()} = ${calcBalance.toLocaleString()}원`);
console.log(`    ${calcBalance > 0 ? "미지급 (amber)" : calcBalance < 0 ? "선지급 (sky)" : "완납"}\n`);

// 4. supplier_balances 테이블 (legacy · 저장된 값)
const { data: sb } = await supabase
  .from("supplier_balances")
  .select("supplier, balance, updated_at")
  .eq("supplier", supplier)
  .limit(5);
console.log(`[D] supplier_balances (legacy) · ${sb?.length ?? 0}건`);
for (const r of sb ?? []) {
  console.log(`  ${r.supplier} · balance=${Number(r.balance).toLocaleString()}원 · ${r.updated_at}`);
}
console.log("\n━━━ 완료 ━━━");
