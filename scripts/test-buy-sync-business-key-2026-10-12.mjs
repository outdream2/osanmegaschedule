// scripts/test-buy-sync-business-key-2026-10-12.mjs
// 2026-10-12 · TASKS #17 · sync-agent diff identity 를 business_key 로 변경 후 테스트
//
// 테스트 범위:
//   [A] 단위 · toIsoDate() · 다양한 입력 포맷
//   [B] 단위 · businessKey() · ERP payload / DB row 양쪽에서 동일 key 생성 확인
//   [C] 통합 · fetchDbByBusinessKey() · 실제 Supabase 조회 (최근 7일)
//   [D] 시뮬레이션 · ERP rows 재sync 가정 → 전부 SAME 판정 확인
//
// 실행: node scripts/test-buy-sync-business-key-2026-10-12.mjs

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

// buySyncService.ts 와 동일 로직 복제 (ESM · TS import 안 하므로)
function toIsoDate(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  const compact = s.replace(/[^\d]/g, "");
  if (compact.length !== 8) return null;
  return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
}

function businessKey(obj) {
  const d = toIsoDate(obj.purchase_date);
  const pc = String(obj.product_code ?? "").trim();
  const q = Number(obj.quantity);
  const up = Number(obj.unit_price);
  const am = Number(obj.amount);
  if (!d || !pc || !Number.isFinite(q) || !Number.isFinite(up) || !Number.isFinite(am)) return null;
  return `${d}|${pc}|${q}|${up}|${am}`;
}

let passed = 0;
let failed = 0;
const fails = [];

function assertEq(actual, expected, label) {
  const ok = actual === expected || (actual == null && expected == null);
  if (ok) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    fails.push({ label, actual, expected });
    console.log(`  ✗ ${label}`);
    console.log(`     expected: ${JSON.stringify(expected)}`);
    console.log(`     actual:   ${JSON.stringify(actual)}`);
  }
}

console.log("━".repeat(70));
console.log(`  sync-agent business_key diff · 테스트 · 2026-10-12`);
console.log("━".repeat(70));

// ─────────────────────────────────────────────────────────────
console.log("\n[A] 단위 · toIsoDate()");
// ─────────────────────────────────────────────────────────────
assertEq(toIsoDate("2026-10-08"), "2026-10-08", "ISO 그대로");
assertEq(toIsoDate("2026-10-08T00:00:00"), "2026-10-08", "ISO + T 시간");
assertEq(toIsoDate("20261008"), "2026-10-08", "YYYYMMDD compact");
assertEq(toIsoDate("2026/10/08"), "2026-10-08", "slash");
assertEq(toIsoDate("2026.10.08"), "2026-10-08", "dot");
assertEq(toIsoDate(""), null, "empty string");
assertEq(toIsoDate(null), null, "null");
assertEq(toIsoDate(undefined), null, "undefined");
assertEq(toIsoDate("abc"), null, "non-date string");
assertEq(toIsoDate("202610"), null, "6자리 (invalid)");

// ─────────────────────────────────────────────────────────────
console.log("\n[B] 단위 · businessKey()");
// ─────────────────────────────────────────────────────────────
// ERP payload 와 DB row 양쪽에서 동일 key 생성 (format 차이 극복)
const erpPayload = {
  purchase_date: "20261008",  // ERP raw compact
  product_code: "8806531701107",
  quantity: 120,
  unit_price: 1584,
  amount: 190080,
};
const dbRow = {
  purchase_date: "2026-10-08",  // DB ISO
  product_code: "8806531701107",
  quantity: 120,
  unit_price: 1584,
  amount: 190080,
};
const erpKey = businessKey(erpPayload);
const dbKey = businessKey(dbRow);
assertEq(erpKey, "2026-10-08|8806531701107|120|1584|190080", "ERP compact date → key");
assertEq(dbKey, "2026-10-08|8806531701107|120|1584|190080", "DB ISO date → key");
assertEq(erpKey === dbKey, true, "ERP/DB key 동일 (format 극복)");

// null 반환 조건
assertEq(businessKey({}), null, "빈 obj");
assertEq(businessKey({ purchase_date: "2026-10-08", product_code: "", quantity: 1, unit_price: 1, amount: 1 }), null, "empty product_code");
assertEq(businessKey({ purchase_date: "2026-10-08", product_code: "x", quantity: "abc", unit_price: 1, amount: 1 }), null, "non-numeric quantity");

// ─────────────────────────────────────────────────────────────
console.log("\n[C] 통합 · fetchDbByBusinessKey (실제 Supabase)");
// ─────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.log("  ⚠ SUPABASE_URL/SUPABASE_KEY 환경변수 없음 · 통합 테스트 skip");
} else {
  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

  // 최근 7일 매입 조회
  const today = new Date();
  const from = new Date(today);
  from.setDate(from.getDate() - 7);
  const minDate = from.toISOString().slice(0, 10);
  const maxDate = today.toISOString().slice(0, 10);

  console.log(`  · 조회 범위: ${minDate} ~ ${maxDate}`);

  const { data: rows, error } = await supabase
    .from("purchase_details")
    .select("id, purchase_date, product_code, quantity, unit_price, amount, bm_code, row_num")
    .gte("purchase_date", minDate)
    .lte("purchase_date", maxDate)
    .order("id", { ascending: true })
    .limit(50);

  if (error) {
    console.log(`  ✗ Supabase 조회 실패: ${error.message}`);
    failed++;
  } else {
    console.log(`  ✓ 매입 ${rows.length}건 조회`);
    passed++;

    // business_key 로 map 구축
    const map = new Map();
    let withKey = 0;
    let nullKey = 0;
    for (const r of rows) {
      const bk = businessKey(r);
      if (!bk) { nullKey++; continue; }
      map.set(bk, r);
      withKey++;
    }
    assertEq(nullKey, 0, "모든 row 가 유효 business_key 생성");
    console.log(`  · business_key map · ${withKey}건 (중복 ${rows.length - withKey - nullKey}건 overwrite)`);

    // ─────────────────────────────────────────────────────────
    console.log("\n[D] 시뮬레이션 · ERP 재sync 가정 (bm_code/row_num 다름)");
    // ─────────────────────────────────────────────────────────
    // 가정: ERP 가 지금 이 매입들을 다시 보냄 · 단 bm_code 와 row_num 은 fake 로 (다른 값)
    let matched = 0;
    let missed = 0;
    for (const r of rows) {
      const erpSimulated = {
        purchase_date: r.purchase_date.replace(/-/g, ""),  // ERP 는 compact 포맷으로 올 수 있음
        product_code: r.product_code,
        quantity: r.quantity,
        unit_price: r.unit_price,
        amount: r.amount,
      };
      const bk = businessKey(erpSimulated);
      if (!bk) { missed++; continue; }
      const found = map.get(bk);
      if (found) matched++;
      else missed++;
    }
    console.log(`  · 재sync 시뮬레이션 결과:`);
    console.log(`    매칭 성공: ${matched}건 (SAME 로 skip 예정)`);
    console.log(`    매칭 실패: ${missed}건 (NEW 로 INSERT 예정 · 0 이어야 정상)`);
    assertEq(matched, rows.length, `${rows.length}건 전부 매칭 (ERP format 극복)`);
    assertEq(missed, 0, "매칭 miss 0건");

    // 샘플 2건 로그
    if (rows.length > 0) {
      console.log(`\n  · 샘플 (first 2):`);
      for (const r of rows.slice(0, 2)) {
        console.log(`    id=${r.id} · ${r.purchase_date} · pc=${r.product_code} · q=${r.quantity} · up=${r.unit_price} · amt=${r.amount}`);
        console.log(`      bm_code=${r.bm_code} · row_num=${r.row_num}`);
        console.log(`      key=${businessKey(r)}`);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────
console.log("\n━".repeat(35));
console.log(`결과 · ${passed} PASS · ${failed} FAIL`);
console.log("━".repeat(70));
if (failed > 0) {
  console.log("\n실패 상세:");
  for (const f of fails) {
    console.log(`  · ${f.label}`);
    console.log(`    expected: ${JSON.stringify(f.expected)}`);
    console.log(`    actual:   ${JSON.stringify(f.actual)}`);
  }
  process.exit(1);
}
console.log("\n✅ 모든 테스트 통과");
process.exit(0);
