// scripts/fill-pcode-from-product-list-2026-10-04.mjs
// 2026-10-04 · 사용자 승인 Option B · products.pcode 초기 채우기
//
// 흐름:
//   Product_List snapshot 로드
//   → BarCode → products.product_code 매칭
//   → 매칭된 상품에 PCode → products.pcode UPDATE
//
// 안전:
//   · DRY-RUN first (default) · WRITE_FLAG=1 로만 실제 UPDATE
//   · DELETE / INSERT 절대 금지 · UPDATE 만
//   · 기존 products.product_code / purchase_details.product_code / stock_history.product_code
//     의미나 값 변경하지 않음 · pcode 는 추가 identity
//   · PCode conflict (DB.pcode 이미 다른 값) 는 skip + 보고
//
// 검증 결과 반드시 출력:
//   Product_List rows / BarCode match / unmatched / duplicate PCode (ERP) /
//   duplicate BarCode (ERP) / PCode conflict (DB) / UPDATE 예정 rows

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { config } from "dotenv";

config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_KEY;
const WRITE_FLAG = process.env.WRITE_FLAG === "1";
const SNAPSHOT_PATH = process.env.SNAPSHOT_PATH ?? "data/snapshots/product-list-2026-10-03.json";

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("ERROR · SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY) env 가 설정되어 있지 않습니다.");
  process.exit(1);
}
if (!existsSync(SNAPSHOT_PATH)) {
  console.error(`ERROR · snapshot 파일 없음: ${SNAPSHOT_PATH}`);
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

async function main() {
  console.log("===== PCode 초기 채우기 · " + new Date().toISOString() + " =====");
  console.log(`SNAPSHOT: ${SNAPSHOT_PATH}`);
  console.log(`MODE: ${WRITE_FLAG ? "WRITE (실제 UPDATE)" : "DRY-RUN (쿼리만 · UPDATE 없음)"}`);
  console.log("");

  // 1. Product_List snapshot 로드
  const snapshotRaw = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8"));
  const rows = Array.isArray(snapshotRaw) ? snapshotRaw : snapshotRaw.rows ?? [];
  console.log(`Product_List rows: ${rows.length.toLocaleString()}`);

  // 2. ERP 안 duplicate 체크
  const erpByBarcode = new Map();
  const erpByPcode = new Map();
  const dupBarcodes = new Set();
  const dupPcodes = new Set();
  const missingBarcode = [];
  const missingPcode = [];

  for (const r of rows) {
    const bc = String(r.BarCode ?? "").trim();
    const pc = String(r.PCode ?? "").trim();
    if (!bc) { missingBarcode.push(pc); continue; }
    if (!pc) { missingPcode.push(bc); continue; }
    if (erpByBarcode.has(bc)) dupBarcodes.add(bc);
    else erpByBarcode.set(bc, pc);
    if (erpByPcode.has(pc)) dupPcodes.add(pc);
    else erpByPcode.set(pc, bc);
  }

  console.log(`ERP · BarCode 비어있음: ${missingBarcode.length}`);
  console.log(`ERP · PCode 비어있음: ${missingPcode.length}`);
  console.log(`ERP · duplicate BarCode: ${dupBarcodes.size}`);
  console.log(`ERP · duplicate PCode: ${dupPcodes.size}`);
  if (dupBarcodes.size > 0) console.log(`   예시: ${Array.from(dupBarcodes).slice(0, 5).join(", ")}`);
  if (dupPcodes.size > 0) console.log(`   예시: ${Array.from(dupPcodes).slice(0, 5).join(", ")}`);
  console.log("");

  // 3. Supabase products 전수 조회 (product_code · 현재 pcode)
  console.log("Supabase products 조회 중...");
  const dbRows = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("products")
      .select("product_code, pcode")
      .range(from, from + PAGE - 1);
    if (error) {
      console.error("products 조회 실패:", error.message);
      process.exit(1);
    }
    if (!data || data.length === 0) break;
    dbRows.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  console.log(`DB products rows: ${dbRows.length.toLocaleString()}`);

  const dbByCode = new Map();
  for (const d of dbRows) {
    const bc = String(d.product_code ?? "").trim();
    if (bc) dbByCode.set(bc, d);
  }

  // 4. 매칭 분석
  let matched = 0;
  let unmatched = 0;
  let alreadySame = 0;
  let willUpdate = 0;
  let conflictWithOther = 0;
  const unmatchedSample = [];
  const conflictSample = [];
  const willUpdateSample = [];

  for (const [bc, pc] of erpByBarcode.entries()) {
    const db = dbByCode.get(bc);
    if (!db) {
      unmatched++;
      if (unmatchedSample.length < 5) unmatchedSample.push({ BarCode: bc, PCode: pc });
      continue;
    }
    matched++;
    const existing = String(db.pcode ?? "").trim();
    if (!existing) {
      // 비어있음 · UPDATE 대상
      willUpdate++;
      if (willUpdateSample.length < 5) willUpdateSample.push({ BarCode: bc, PCode: pc });
    } else if (existing === pc) {
      alreadySame++;
    } else {
      // DB 에 이미 다른 pcode 저장되어 있음 · 사용자 승인 없이 overwrite 금지
      conflictWithOther++;
      if (conflictSample.length < 5) conflictSample.push({ BarCode: bc, DB_pcode: existing, ERP_PCode: pc });
    }
  }

  console.log("");
  console.log("===== 매칭 결과 =====");
  console.log(`BarCode match (ERP ∩ DB.product_code): ${matched.toLocaleString()}`);
  console.log(`BarCode unmatched (ERP only): ${unmatched.toLocaleString()}`);
  if (unmatchedSample.length > 0) {
    console.log(`   예시 (최대 5):`);
    for (const s of unmatchedSample) console.log(`     ${s.BarCode} (PCode ${s.PCode})`);
  }
  console.log(`PCode 이미 동일 (SKIP): ${alreadySame.toLocaleString()}`);
  console.log(`PCode conflict (DB 에 다른 값 있음 · SKIP): ${conflictWithOther.toLocaleString()}`);
  if (conflictSample.length > 0) {
    console.log(`   예시:`);
    for (const s of conflictSample) console.log(`     ${s.BarCode}: DB=${s.DB_pcode} ↔ ERP=${s.ERP_PCode}`);
  }
  console.log(`UPDATE 예정 rows (DB.pcode NULL → ERP PCode): ${willUpdate.toLocaleString()}`);
  if (willUpdateSample.length > 0) {
    console.log(`   예시:`);
    for (const s of willUpdateSample) console.log(`     ${s.BarCode} → ${s.PCode}`);
  }
  console.log("");

  // 5. UPDATE
  if (!WRITE_FLAG) {
    console.log("===== DRY-RUN · UPDATE 실행 안 함 =====");
    console.log("실제 적용하려면 WRITE_FLAG=1 로 재실행");
    console.log("");
    console.log("예: WRITE_FLAG=1 node scripts/fill-pcode-from-product-list-2026-10-04.mjs");
    return;
  }

  console.log("===== WRITE MODE · UPDATE 실행 =====");
  console.log(`${willUpdate.toLocaleString()} rows UPDATE 시작...`);

  // 안전: dup PCode 는 UPDATE 하지 않음 (unique constraint 위반 가능)
  //       conflict row 는 이미 skip
  //       unmatched row 는 skip (products 에 없음 · INSERT 금지 원칙)
  let updated = 0;
  let failed = 0;
  const errors = [];
  const BATCH = 100;
  const targets = [];
  for (const [bc, pc] of erpByBarcode.entries()) {
    if (dupPcodes.has(pc)) continue;      // ERP 안 PCode 중복 → skip
    if (dupBarcodes.has(bc)) continue;    // ERP 안 BarCode 중복 → skip
    const db = dbByCode.get(bc);
    if (!db) continue;                    // unmatched
    const existing = String(db.pcode ?? "").trim();
    if (existing) continue;               // 이미 값 있음 (SAME 또는 CONFLICT) · 둘 다 skip
    targets.push({ product_code: bc, pcode: pc });
  }
  console.log(`실제 UPDATE 대상 (dup/conflict 제외): ${targets.length.toLocaleString()}`);

  for (let i = 0; i < targets.length; i += BATCH) {
    const chunk = targets.slice(i, i + BATCH);
    // 각 row 는 WHERE product_code = X · SET pcode = Y
    //   Supabase JS SDK · update().eq() 를 각 row 마다 호출 (batch update endpoint 없음)
    //   병렬 10개 묶어서 Promise.all
    const PAR = 10;
    for (let j = 0; j < chunk.length; j += PAR) {
      const batch = chunk.slice(j, j + PAR);
      const results = await Promise.all(batch.map(async (t) => {
        const { error, data, count } = await supabase
          .from("products")
          .update({ pcode: t.pcode })
          .eq("product_code", t.product_code)
          .is("pcode", null)
          .select("product_code, pcode");
        if (error) return { ok: false, err: error.message, target: t };
        if (!data || data.length === 0) return { ok: false, err: "no-op (pcode 이미 설정됨)", target: t };
        return { ok: true, target: t };
      }));
      for (const r of results) {
        if (r.ok) updated++;
        else {
          failed++;
          if (errors.length < 10) errors.push({ product_code: r.target.product_code, pcode: r.target.pcode, err: r.err });
        }
      }
    }
    if ((i + BATCH) % 500 === 0 || i + BATCH >= targets.length) {
      console.log(`  ${Math.min(i + BATCH, targets.length).toLocaleString()} / ${targets.length.toLocaleString()} ...`);
    }
  }

  console.log("");
  console.log("===== WRITE 완료 =====");
  console.log(`UPDATED: ${updated.toLocaleString()}`);
  console.log(`FAILED: ${failed.toLocaleString()}`);
  if (errors.length > 0) {
    console.log(`에러 샘플 (최대 10):`);
    for (const e of errors) console.log(`  ${e.product_code} → ${e.pcode}: ${e.err}`);
  }

  // Read-back 확인
  console.log("");
  console.log("===== Read-back =====");
  const { count: filledCount, error: countErr } = await supabase
    .from("products")
    .select("product_code", { count: "exact", head: true })
    .not("pcode", "is", null);
  if (countErr) console.log("read-back 실패:", countErr.message);
  else console.log(`현재 products.pcode 가 채워진 row 수: ${filledCount?.toLocaleString() ?? "?"}`);
}

main().catch((err) => {
  console.error("FATAL:", err.message);
  process.exit(1);
});
