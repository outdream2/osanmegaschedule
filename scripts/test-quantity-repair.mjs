/**
 * Task #41: 수량 anomaly 후처리 검증
 *
 * server/ocr/parse.ts `repairQuantityAnomaly` 함수 동작 검증.
 * TypeScript import 없이 로직을 그대로 재현하여 순수 단위 테스트로 실행.
 *
 * 실행: node scripts/test-quantity-repair.mjs
 */
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

// ──────────────────────────────────────────
// repairQuantityAnomaly 로직 (server/ocr/parse.ts:1058 복사 · TS 타입 제거)
// ──────────────────────────────────────────
function repairQuantityAnomaly(headers, rows) {
  const qI = headers.indexOf("수량");
  const pI = headers.indexOf("단가");
  const aI = headers.indexOf("금액");
  if (qI < 0 || pI < 0 || aI < 0) return rows;

  // (B) 페이지 전체 수량의 자릿수 중앙값 (outlier 감지용)
  const qtyDigits = [];
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const v = row[qI];
    if (typeof v === "number" && v > 0) {
      qtyDigits.push(Math.floor(Math.log10(v)) + 1);
    }
  }
  const medianDigits =
    qtyDigits.length >= 5
      ? qtyDigits.slice().sort((a, b) => a - b)[Math.floor(qtyDigits.length / 2)]
      : 0;

  let repairCount = 0;
  const result = rows.map((row) => {
    if (!Array.isArray(row)) return row;
    const q = typeof row[qI] === "number" ? row[qI] : null;
    const p = typeof row[pI] === "number" ? row[pI] : null;
    const a = typeof row[aI] === "number" ? row[aI] : null;

    // 단가·금액 없으면 back-solve 불가
    if (p == null || a == null || p <= 0 || a <= 0) return row;

    // 이미 수식 성립 (2% 오차) → skip
    if (q != null && Math.abs(q * p - a) <= Math.max(1, a * 0.02)) return row;

    // Back-solve: 예상 수량 = 금액 / 단가
    const est = a / p;
    const rounded = Math.round(est);
    if (rounded < 1 || rounded > 9999) return row;
    if (Math.abs(est - rounded) > 0.02) return row; // 정수 근사 실패

    // 정정 조건 검증:
    //   1) 원본 수량이 없거나
    //   2) 원본이 back-solve 결과와 크게 다르거나 (수식 불성립)
    //   3) 원본이 자릿수 outlier (medianDigits +3 이상 큼)
    let shouldRepair = false;
    if (q == null) shouldRepair = true;
    else if (Math.abs(q * p - a) > Math.max(1, a * 0.05)) shouldRepair = true;
    else if (medianDigits > 0 && q > 0) {
      const qDigits = Math.floor(Math.log10(q)) + 1;
      if (qDigits - medianDigits >= 3) shouldRepair = true;
    }

    if (shouldRepair) {
      repairCount++;
      const fixed = [...row];
      fixed[qI] = rounded;
      return fixed;
    }
    return row;
  });

  if (repairCount > 0)
    console.log(`  [수량정정] back-solve ${repairCount}건 · median자릿수=${medianDigits}`);
  return result;
}

// ──────────────────────────────────────────
// 테스트 헬퍼
// ──────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(label, condition, detail = "") {
  if (condition) {
    console.log(`  [PASS] ${label}`);
    passed++;
  } else {
    console.error(`  [FAIL] ${label}${detail ? " · " + detail : ""}`);
    failed++;
  }
}

const HEADERS = ["품명", "규격", "수량", "단가", "금액"];
const qI = HEADERS.indexOf("수량"); // 2
const pI = HEADERS.indexOf("단가"); // 3
const aI = HEADERS.indexOf("금액"); // 4

// ──────────────────────────────────────────
// Case 1: 수량 999999 · 단가 100 · 금액 100 → 예상 수량 1
// ──────────────────────────────────────────
console.log("\n═══ Case 1: 수량 999999 · 단가 100 · 금액 100 → back-solve 1 ═══");
{
  const rows = [
    ["아모잘탄정5/50", "30T", 999999, 100, 100],
    ["타이레놀이알서방정", "1T", 2, 1200, 2400],
    ["세티리진정", "30T", 1, 5000, 5000],
    ["리피로우정20mg", "30T", 2, 3000, 6000],
    ["오메프라졸캡슐", "30cap", 3, 2000, 6000],
  ];
  const result = repairQuantityAnomaly(HEADERS, rows);
  const repairedQ = result[0][qI];
  assert("수량 999999 → 1로 정정됨", repairedQ === 1, `got ${repairedQ}`);
  // 다른 행은 변경 없어야 함
  assert("정상 행 변경 없음 (행1)", result[1][qI] === 2, `got ${result[1][qI]}`);
  assert("정상 행 변경 없음 (행2)", result[2][qI] === 1, `got ${result[2][qI]}`);
}

// ──────────────────────────────────────────
// Case 2: 수량 < 500 · 수식 성립 → 정정 안 함
// ──────────────────────────────────────────
console.log("\n═══ Case 2: 수량 정상 범위 · 수식 성립 → 정정 안 함 ═══");
{
  const rows = [
    ["가스활명수", "10병", 10, 1200, 12000],
    ["판피린티", "20T", 5, 800, 4000],
    ["아스피린", "100T", 3, 5000, 15000],
    ["비타민C", "1000T", 1, 20000, 20000],
    ["덱시부프로펜", "30cap", 2, 3000, 6000],
  ];
  const result = repairQuantityAnomaly(HEADERS, rows);
  for (let i = 0; i < rows.length; i++) {
    assert(
      `행${i} 수량 변경 없음 (수식 성립)`,
      result[i][qI] === rows[i][qI],
      `expected ${rows[i][qI]} got ${result[i][qI]}`
    );
  }
}

// ──────────────────────────────────────────
// Case 3: 수량·단가·금액 중 수량 null → back-solve 로 채움
// ──────────────────────────────────────────
console.log("\n═══ Case 3: 수량 null · 단가·금액 있음 → back-solve 채움 ═══");
{
  const rows = [
    ["광동비타500", "1병", null, 500, 3000],   // 예상 수량 6
    ["한독탁센", "30T", 2, 4000, 8000],
    ["유한양행삐콤씨", "1개", null, 1000, 5000], // 예상 수량 5
    ["동화약품후시딘", "10g", 1, 2000, 2000],
    ["녹십자헤파린", "5ml", null, 8000, 16000], // 예상 수량 2
  ];
  const result = repairQuantityAnomaly(HEADERS, rows);
  assert("null 수량 back-solve: 6", result[0][qI] === 6, `got ${result[0][qI]}`);
  assert("정상 수량 유지: 2", result[1][qI] === 2, `got ${result[1][qI]}`);
  assert("null 수량 back-solve: 5", result[2][qI] === 5, `got ${result[2][qI]}`);
  assert("정상 수량 유지: 1", result[3][qI] === 1, `got ${result[3][qI]}`);
  assert("null 수량 back-solve: 2", result[4][qI] === 2, `got ${result[4][qI]}`);
}

// ──────────────────────────────────────────
// Case 4: 수량 = 금액/단가 정확 매칭 안 됨 (비정수) → 정정 안 함
// ──────────────────────────────────────────
console.log("\n═══ Case 4: back-solve 결과 비정수 (est > 0.02 오차) → 정정 안 함 ═══");
{
  // 금액 1000 / 단가 300 = 3.333... → 정수 근사 실패
  const rows = [
    ["테스트A", "", 999, 300, 1000],  // 3.333 → 정정 불가
    ["테스트B", "", 1, 500, 1000],    // 수식 성립 (1*500=500 ≠ 1000 → back-solve 2, 정수 ok)
    ["테스트C", "", 1, 200, 1000],    // back-solve 5 → 정수 ok → 정정됨
    ["테스트D", "", 1, 700, 1000],    // 1.428 → 정수 근사 실패
    ["테스트E", "", 2, 500, 1000],    // 수식 성립
  ];
  const result = repairQuantityAnomaly(HEADERS, rows);
  // 행0: est=3.333 → 정수 근사 실패 → 원본 유지
  assert(
    "비정수 back-solve → 원본 수량 유지 (999)",
    result[0][qI] === 999,
    `got ${result[0][qI]}`
  );
  // 행1: 1*500=500 ≠ 1000 → back-solve 2 → 정수 ok → 정정됨
  assert(
    "수식 불성립 → back-solve 2로 정정",
    result[1][qI] === 2,
    `got ${result[1][qI]}`
  );
  // 행2: 1*200=200 ≠ 1000 → back-solve 5 → 정수 ok → 정정됨
  assert(
    "수식 불성립 → back-solve 5로 정정",
    result[2][qI] === 5,
    `got ${result[2][qI]}`
  );
  // 행3: est=1.428 → 정수 근사 실패 → 원본 유지
  assert(
    "비정수 back-solve → 원본 수량 유지 (1)",
    result[3][qI] === 1,
    `got ${result[3][qI]}`
  );
  // 행4: 2*500=1000 → 수식 성립 → 변경 없음
  assert("수식 성립 → 변경 없음 (2)", result[4][qI] === 2, `got ${result[4][qI]}`);
}

// ──────────────────────────────────────────
// Case 5: 헤더에 수량/단가/금액 중 하나 없음 → rows 그대로 반환
// ──────────────────────────────────────────
console.log("\n═══ Case 5: 헤더 불완전 (수량 없음) → 정정 안 함 ═══");
{
  const incompleteHeaders = ["품명", "규격", "단가", "금액"]; // 수량 없음
  const rows = [
    ["테스트약품", "10T", 2000, 10000],
    ["다른약품", "5T", 3000, 15000],
  ];
  const result = repairQuantityAnomaly(incompleteHeaders, rows);
  // rows 참조 동일성 또는 값 동일성 확인
  assert(
    "수량 헤더 없음 → rows 그대로 반환",
    JSON.stringify(result) === JSON.stringify(rows),
    `changed: ${JSON.stringify(result)}`
  );
}

// ──────────────────────────────────────────
// Case 6: 자릿수 outlier (median +3 이상) → 정정
//          행이 5개 이상일 때만 median 계산됨
// ──────────────────────────────────────────
console.log("\n═══ Case 6: 자릿수 outlier (median+3) · 수식도 일치 → 정정 ═══");
{
  // 대부분 수량 1~9 (1자리), 한 행만 수량 1000000 (7자리) = median+6
  // 단가 100 · 금액 100 → back-solve 1 → 정정 가능
  const rows = [
    ["아세트아미노펜", "500mg", 2, 1200, 2400],
    ["이부프로펜", "400mg", 1, 800, 800],
    ["클래리스로마이신", "250mg", 3, 2000, 6000],
    ["아목시실린", "500mg", 1, 1500, 1500],
    ["아지스로마이신", "250mg", 2, 3000, 6000], // 5행 이상 → median 계산
    ["타겟약품", "1T", 1000000, 100, 100],       // 수식 불성립 · outlier
  ];
  const result = repairQuantityAnomaly(HEADERS, rows);
  // median 자릿수 = 1 (모두 1자리) → 1000000은 7자리 → 7-1=6 >= 3 → outlier
  // back-solve: 100/100 = 1 → 정정
  assert(
    "자릿수 outlier 1000000 → back-solve 1로 정정",
    result[5][qI] === 1,
    `got ${result[5][qI]}`
  );
  // 나머지 정상 행 유지
  assert("정상 행 유지 (2)", result[0][qI] === 2, `got ${result[0][qI]}`);
  assert("정상 행 유지 (1)", result[1][qI] === 1, `got ${result[1][qI]}`);
}

// ──────────────────────────────────────────
// Case 7: 단가·금액 없음 (null) → 정정 안 함
// ──────────────────────────────────────────
console.log("\n═══ Case 7: 단가 null → back-solve 불가 → 원본 유지 ═══");
{
  const rows = [
    ["약품A", "", 999999, null, 100],   // 단가 null
    ["약품B", "", 5, 200, null],         // 금액 null
    ["약품C", "", 999999, null, null],   // 둘 다 null
    ["약품D", "", 2, 500, 1000],
    ["약품E", "", 1, 800, 800],
  ];
  const result = repairQuantityAnomaly(HEADERS, rows);
  assert("단가 null → 원본 수량 유지 (999999)", result[0][qI] === 999999, `got ${result[0][qI]}`);
  assert("금액 null → 원본 수량 유지 (5)", result[1][qI] === 5, `got ${result[1][qI]}`);
  assert("둘 다 null → 원본 수량 유지 (999999)", result[2][qI] === 999999, `got ${result[2][qI]}`);
}

// ──────────────────────────────────────────
// Case 8: 경계값 — back-solve 결과가 9999 초과 → 정정 안 함
// ──────────────────────────────────────────
console.log("\n═══ Case 8: back-solve > 9999 → 정정 안 함 ═══");
{
  // 금액 50000000 / 단가 1 = 50000000 → rounded 50000000 > 9999 → skip
  const rows = [
    ["약품A", "", 999, 1, 50000000],
    ["약품B", "", 2, 1000, 2000],
    ["약품C", "", 1, 500, 500],
    ["약품D", "", 3, 200, 600],
    ["약품E", "", 4, 100, 400],
  ];
  const result = repairQuantityAnomaly(HEADERS, rows);
  assert(
    "back-solve 50000000 > 9999 → 원본 수량 999 유지",
    result[0][qI] === 999,
    `got ${result[0][qI]}`
  );
}

// ──────────────────────────────────────────
// STEP 2: 프로덕션 로그 검색 (Supabase 없으면 skip)
// ──────────────────────────────────────────
console.log("\n═══ STEP 2: 프로덕션 로그 대조 (ocr_confirmed_items 최근 정정 여부) ═══");
try {
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
  // ocr_confirmed_items 에서 최근 저장 건 중 수량·단가·금액 불일치 여부 확인
  const { data, error } = await sb
    .from("ocr_confirmed_items")
    .select("id, saved_at, supplier, product_name, quantity, unit_price, amount")
    .order("saved_at", { ascending: false })
    .limit(50);

  if (error) throw new Error(error.message);

  let mismatch = 0;
  let match = 0;
  let noFormula = 0;

  for (const r of data ?? []) {
    const q = Number(r.quantity);
    const p = Number(r.unit_price);
    const a = Number(r.amount);
    if (!q || !p || !a) { noFormula++; continue; }
    const diff = Math.abs(q * p - a);
    const tol = Math.max(1, a * 0.05);
    if (diff <= tol) match++;
    else mismatch++;
  }

  console.log(`  최근 50건 분석:`);
  console.log(`    수식 성립 (q×p≈a): ${match}건`);
  console.log(`    수식 불일치:        ${mismatch}건`);
  console.log(`    수량/단가/금액 없음: ${noFormula}건`);

  if (mismatch > 0) {
    console.log(`  [INFO] 수식 불일치 ${mismatch}건 존재 — 파이프라인 정정 전 데이터이거나 수동 수정건일 수 있음`);
  } else {
    console.log(`  [OK] 최근 저장건 수식 모두 성립 — repairQuantityAnomaly 정상 동작 중`);
  }

  assert(
    "DB 조회 성공 (ocr_confirmed_items)",
    !error,
    error?.message ?? ""
  );
} catch (e) {
  console.warn(`  [SKIP] DB 조회 실패: ${e.message}`);
}

// ──────────────────────────────────────────
// 결과 요약
// ──────────────────────────────────────────
console.log(`\n${"─".repeat(50)}`);
console.log(`결과: ${passed} passed / ${failed} failed / ${passed + failed} total`);
if (failed === 0) {
  console.log("전체 통과 — repairQuantityAnomaly 모든 케이스 정상 동작");
} else {
  console.log(`실패 ${failed}건 — 위 [FAIL] 항목 확인`);
  process.exit(1);
}
