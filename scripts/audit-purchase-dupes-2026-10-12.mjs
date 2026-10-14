// scripts/audit-purchase-dupes-2026-10-12.mjs
// 2026-10-12 · 사용자 리포트 "그날엔더블유연질캡슐 12C 10월 1건인데 UI 에 여러 번 · 말이 안돼"
//   · purchase_details 중복 row 조사 · 특정 상품 또는 전체
//
// 실행:
//   node scripts/audit-purchase-dupes-2026-10-12.mjs
//   node scripts/audit-purchase-dupes-2026-10-12.mjs "그날엔"       # 상품명 LIKE 검색
//   node scripts/audit-purchase-dupes-2026-10-12.mjs --code=XXXX    # product_code 완전 일치

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const codeArg = process.argv.find(a => a.startsWith("--code="))?.slice(7) ?? null;
const nameArg = process.argv.find(a => !a.startsWith("--") && a !== "node" && !a.endsWith(".mjs")) ?? null;

console.log("━".repeat(70));
console.log("  purchase_details 중복 조사 · 2026-10-12");
console.log("━".repeat(70));
console.log();

let q = supabase
  .from("purchase_details")
  .select("id, purchase_date, product_code, product_name, supplier_name, quantity, unit_price, amount, total")
  .order("purchase_date", { ascending: false });

if (codeArg) {
  q = q.eq("product_code", codeArg);
  console.log(`필터: product_code = "${codeArg}"\n`);
} else if (nameArg) {
  q = q.ilike("product_name", `%${nameArg}%`);
  console.log(`필터: product_name LIKE "%${nameArg}%"\n`);
} else {
  console.log("[전체 조사 · 최근 500건 중 중복 패턴]\n");
  q = q.limit(500);
}

const { data, error } = await q;
if (error) { console.error("❌ 조회 실패:", error.message); process.exit(1); }

const rows = data ?? [];
console.log(`총 row: ${rows.length}건\n`);

if (rows.length === 0) { console.log("매칭 데이터 없음"); process.exit(0); }

// 상품별 group (product_code)
const byCode = new Map();
for (const r of rows) {
  const k = String(r.product_code ?? "");
  if (!byCode.has(k)) byCode.set(k, []);
  byCode.get(k).push(r);
}

console.log(`[상품별 그룹]`);
for (const [code, arr] of byCode) {
  const name = arr[0].product_name ?? "-";
  console.log(`\n▸ ${code} · ${name} · ${arr.length}건`);
  // 중복 key = purchase_date + quantity + unit_price + amount
  const dupMap = new Map();
  for (const r of arr) {
    const dk = `${r.purchase_date}|${r.quantity}|${r.unit_price}|${r.amount}`;
    if (!dupMap.has(dk)) dupMap.set(dk, []);
    dupMap.get(dk).push(r);
  }
  for (const [dk, group] of dupMap) {
    if (group.length > 1) {
      console.log(`   ⚠ 중복 ${group.length}건 · ${dk}`);
      for (const r of group) {
        console.log(`     · id=${r.id} · ${r.purchase_date} · qty=${r.quantity} · unit=${r.unit_price} · amt=${r.amount}`);
      }
    } else if (codeArg || nameArg) {
      const r = group[0];
      console.log(`   · id=${r.id} · ${r.purchase_date} · qty=${r.quantity} · unit=${r.unit_price} · amt=${r.amount}`);
    }
  }
}

// 중복 요약
let totalDup = 0;
for (const arr of byCode.values()) {
  const dupMap = new Map();
  for (const r of arr) {
    const dk = `${r.purchase_date}|${r.quantity}|${r.unit_price}|${r.amount}`;
    dupMap.set(dk, (dupMap.get(dk) ?? 0) + 1);
  }
  for (const c of dupMap.values()) if (c > 1) totalDup += c - 1;
}
console.log();
console.log(`[중복 요약] · 삭제 가능 row 수: ${totalDup}건`);
console.log();
console.log("되돌리기: 중복 fix 후 '/api/purchase-details' 재조회로 확인");
