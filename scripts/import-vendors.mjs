#!/usr/bin/env node
// scripts/import-vendors.mjs
// 2026-08-23 · #178 Phase E · xlsx 마스터 시트 → vendors 테이블 임포트 (일회성)
//   · 첫 시트만 · 시트 2~57 (공급사별 상품) 무시
//   · 매칭 키 · company_name (부분 일치 · fuzzy) → phone fallback
//   · 매칭 O · UPDATE (5 신규 컬럼) · 매칭 X · INSERT (신규 vendor)
//   · DELETE 없음 (안전) · 기존 vendors 유지
//
// 실행:
//   node scripts/import-vendors.mjs
//   node scripts/import-vendors.mjs --dry-run    # DB 변경 없음 · 리포트만
//   node scripts/import-vendors.mjs --file=src/sample/메가타운약국공급사관리정보.xlsx
//
// 환경변수:
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (또는 SUPABASE_ANON_KEY · service role 권장)
//   VENDOR_PW_SUFFIX (기본 "00" · 로그인 비번 규칙 · 이 스크립트에서 저장 안 함 · 서버 파생용)

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import xlsx from "xlsx";
import { createClient } from "@supabase/supabase-js";

// ─── 설정 파싱 ──────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const fileArg = args.find(a => a.startsWith("--file="))?.slice("--file=".length);
const filePath = resolve(process.cwd(), fileArg ?? "src/sample/메가타운약국공급사관리정보.xlsx");

if (!existsSync(filePath)) {
  console.error(`[import-vendors] ✖ 파일 없음: ${filePath}`);
  process.exit(1);
}

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;

if (!dryRun && (!SUPABASE_URL || !SUPABASE_KEY)) {
  console.error("[import-vendors] ✖ SUPABASE_URL · SUPABASE_SERVICE_ROLE_KEY (또는 SUPABASE_ANON_KEY) 필요");
  console.error("  export SUPABASE_URL=https://xxx.supabase.co");
  console.error("  export SUPABASE_SERVICE_ROLE_KEY=eyJ...");
  process.exit(1);
}

console.log(`[import-vendors] 파일 · ${filePath}`);
console.log(`[import-vendors] 모드 · ${dryRun ? "DRY RUN (DB 변경 없음)" : "실제 실행"}`);

// ─── xlsx 파싱 · 첫 시트만 ───────────────────────────────
const wb = xlsx.readFile(filePath);
const firstSheetName = wb.SheetNames[0];
if (!firstSheetName) {
  console.error("[import-vendors] ✖ 시트 없음");
  process.exit(1);
}
console.log(`[import-vendors] 첫 시트 · ${firstSheetName}`);

const ws = wb.Sheets[firstSheetName];
const rows = xlsx.utils.sheet_to_json(ws, { defval: null, raw: false });
console.log(`[import-vendors] 총 ${rows.length}개 행 파싱`);

// ─── 컬럼 매핑 (xlsx 헤더 → vendors 컬럼) ──────────────────
// xlsx 컬럼명 · 다양한 표현 대응 (제약사/거래처/공급사 · 담당/담당자 등)
function pick(row, keys) {
  for (const k of keys) {
    if (row[k] != null && String(row[k]).trim() !== "") return String(row[k]).trim();
  }
  return null;
}

function mapRow(row) {
  const company_name = pick(row, ["제약사", "회사명", "거래처", "공급사", "업체명"]);
  if (!company_name) return null; // 회사명 없으면 skip
  return {
    company_name,
    contact_name:   pick(row, ["담당자", "담당", "담당자명", "연락담당자"]),
    phone:          pick(row, ["연락처", "전화", "전화번호", "핸드폰", "휴대폰"]),
    order_method:   pick(row, ["주문방식", "주문 방식", "주문사이트", "사이트"]),
    region:         pick(row, ["지역", "위치"]),
    invoice_method: pick(row, ["거래명세서", "명세서방식", "거래명세서 방식"]),
    order_status:   pick(row, ["주문현황", "주문 현황", "상태"]),
    special_notes:  pick(row, ["특이사항", "비고 특이", "메모"]),
    note:           pick(row, ["비고", "기타"]),
    category:       pick(row, ["분류", "카테고리", "결제조건"]),
  };
}

const parsed = rows.map(mapRow).filter(Boolean);
console.log(`[import-vendors] 유효 행 · ${parsed.length}개 (회사명 있음)`);

// ─── DRY RUN · 리포트만 ──────────────────────────────────
if (dryRun) {
  console.log("\n[DRY RUN] 파싱된 vendors (첫 5개):");
  console.log(JSON.stringify(parsed.slice(0, 5), null, 2));
  console.log(`\n[DRY RUN] 총 ${parsed.length}개 파싱 · DB 변경 없음`);
  process.exit(0);
}

// ─── DB 연결 · 실행 ─────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function run() {
  // 기존 vendors 로딩 (매칭용)
  const { data: existing, error: fetchErr } = await supabase
    .from("vendors")
    .select("id, company_name, phone");
  if (fetchErr) {
    console.error("[import-vendors] ✖ 기존 vendors 조회 실패:", fetchErr.message);
    process.exit(1);
  }
  console.log(`[import-vendors] 기존 vendors · ${existing.length}개`);

  // 매칭 인덱스 · company_name (정확) + phone (fallback)
  const byName = new Map(existing.map(v => [String(v.company_name ?? "").trim(), v.id]));
  const byPhone = new Map(existing.filter(v => v.phone).map(v => [String(v.phone).trim(), v.id]));

  let matched = 0, inserted = 0, errors = 0;

  for (const row of parsed) {
    try {
      const existingId = byName.get(row.company_name) ?? (row.phone ? byPhone.get(row.phone) : null);
      if (existingId) {
        // UPDATE · 신규 컬럼만 (기존 값 덮어쓰기 · null 제외)
        const updates = {};
        for (const [k, v] of Object.entries(row)) {
          if (v != null && v !== "" && k !== "company_name") updates[k] = v;
        }
        if (Object.keys(updates).length === 0) continue;
        const { error } = await supabase.from("vendors").update(updates).eq("id", existingId);
        if (error) throw error;
        matched++;
      } else {
        // INSERT · 신규 vendor
        const { error } = await supabase.from("vendors").insert({
          ...row,
          approval_status: "approved", // 기존 vendor 로 취급 (임포트 데이터는 신뢰)
        });
        if (error) throw error;
        inserted++;
      }
    } catch (e) {
      console.error(`[import-vendors] ✖ ${row.company_name} · ${e.message}`);
      errors++;
    }
  }

  console.log(`\n[import-vendors] ✓ 완료 · matched: ${matched} · inserted: ${inserted} · errors: ${errors}`);
}

run().catch(e => {
  console.error("[import-vendors] ✖ 예상치 못한 오류:", e);
  process.exit(1);
});
