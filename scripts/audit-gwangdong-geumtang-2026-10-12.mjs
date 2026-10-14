// scripts/audit-gwangdong-geumtang-2026-10-12.mjs
// 2026-10-12 · 사용자 리포트 "광동금탕10병 매입 16건 · 같은 날 11건 다른 단가 · 이상해"
//   · product_code 8806418001313 (ERP PCode 18806418001313) 전체 매입 조회
//   · bm_code / row_num / unit_price / amount / total / vat 분석
//   · 중복 패턴 vs 정상 데이터 판정

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const CODE_CANDIDATES = ["8806418001313", "18806418001313"];

console.log("━".repeat(80));
console.log("  광동금탕10병 매입이력 조사 · 2026-10-12");
console.log("━".repeat(80));
console.log();

for (const code of CODE_CANDIDATES) {
  const { data, error } = await supabase
    .from("purchase_details")
    .select("id, bm_code, row_num, purchase_date, product_code, product_name, supplier_name, quantity, unit_price, amount, vat, total")
    .eq("product_code", code)
    .order("purchase_date", { ascending: false })
    .order("id", { ascending: true });
  if (error) { console.error("❌", error.message); continue; }
  const rows = data ?? [];
  console.log(`▸ product_code = "${code}" · ${rows.length}건`);
  if (rows.length === 0) continue;

  // 날짜별 그룹
  const byDate = new Map();
  for (const r of rows) {
    if (!byDate.has(r.purchase_date)) byDate.set(r.purchase_date, []);
    byDate.get(r.purchase_date).push(r);
  }

  for (const [date, arr] of byDate) {
    console.log(`\n  ━ ${date} · ${arr.length}건`);
    console.log(`    ${"id".padEnd(7)} ${"bm_code".padEnd(16)} ${"rn".padStart(3)} ${"qty".padStart(5)} ${"unit".padStart(10)} ${"amount".padStart(12)} ${"vat".padStart(10)} ${"total".padStart(12)}`);
    for (const r of arr) {
      const unit = (r.unit_price ?? 0).toLocaleString();
      const amt = (r.amount ?? 0).toLocaleString();
      const vat = (r.vat ?? 0).toLocaleString();
      const tot = (r.total ?? 0).toLocaleString();
      console.log(`    ${String(r.id).padEnd(7)} ${String(r.bm_code ?? "-").padEnd(16)} ${String(r.row_num ?? "-").padStart(3)} ${String(r.quantity ?? 0).padStart(5)} ${unit.padStart(10)} ${amt.padStart(12)} ${vat.padStart(10)} ${tot.padStart(12)}`);
    }

    // business_key 중복 판정
    const bkMap = new Map();
    for (const r of arr) {
      const bk = `${r.purchase_date}|${r.product_code}|${r.quantity}|${r.unit_price}|${r.amount}`;
      if (!bkMap.has(bk)) bkMap.set(bk, []);
      bkMap.get(bk).push(r.id);
    }
    const dupBks = [...bkMap.entries()].filter(([_, ids]) => ids.length > 1);
    if (dupBks.length > 0) {
      console.log(`\n    ⚠ business_key 중복 ${dupBks.length}개:`);
      for (const [bk, ids] of dupBks) {
        console.log(`      · ${bk} · ids=${ids.join(",")}`);
      }
    } else {
      console.log(`\n    ✓ business_key 전부 unique (중복 X)`);
    }

    // bm_code 중복 판정
    const bmSet = new Map();
    for (const r of arr) {
      const k = `${r.bm_code}#${r.row_num}`;
      if (!bmSet.has(k)) bmSet.set(k, 0);
      bmSet.set(k, bmSet.get(k) + 1);
    }
    const dupBms = [...bmSet.entries()].filter(([_, c]) => c > 1);
    if (dupBms.length > 0) {
      console.log(`    ⚠ (bm_code, row_num) 중복 ${dupBms.length}개: ${dupBms.map(([k, c]) => `${k}×${c}`).join(", ")}`);
    }

    // 금액 / 수량 비율 검증
    console.log(`\n    [비율 검증]`);
    for (const r of arr) {
      const q = Number(r.quantity ?? 0);
      const up = Number(r.unit_price ?? 0);
      const am = Number(r.amount ?? 0);
      if (q <= 0 || up <= 0) continue;
      const qxup = q * up;
      const vatRatio = qxup > 0 ? (am / qxup).toFixed(4) : "0";
      const perUnit = q > 0 ? (am / q).toFixed(2) : "0";
      console.log(`      id=${r.id} · qty×unit=${qxup.toLocaleString()} · amount=${am.toLocaleString()} · am/qty=${perUnit} · ratio=${vatRatio}`);
    }
  }
}

console.log();
console.log("━".repeat(80));
console.log("해석:");
console.log("  · ratio ≈ 0.9091 → VAT 10% 역산 패턴 (unit_price=VAT포함 · amount=VAT제외) · 정상");
console.log("  · ratio ≈ 1.0 → unit_price 와 amount/qty 일치 · 정상");
console.log("  · ratio 들쭉날쭉 → ERP 입력 이상 또는 중복 데이터");
console.log("  · (bm_code, row_num) 중복 or business_key 중복 → 중복 쌓인 상태");
console.log("━".repeat(80));
