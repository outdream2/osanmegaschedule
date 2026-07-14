// scripts/import-vendors-xlsx.mjs
// 공급사관리 xlsx 파일을 Supabase vendors 테이블에 upsert
//
// 사용: node scripts/import-vendors-xlsx.mjs [파일경로]
//   경로 생략 시 src/공급사관리_*.xlsx 자동 탐색 (최신 파일)

import XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", ".env") });

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("SUPABASE_URL 또는 KEY 가 .env 에 없습니다.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// 파일 경로: 인자 없으면 자동 탐색
function findLatestXlsx() {
  const srcDir = path.join(__dirname, "..", "src");
  const files = fs.readdirSync(srcDir)
    .filter(f => f.startsWith("공급사관리") && f.endsWith(".xlsx"))
    .map(f => ({ f, mtime: fs.statSync(path.join(srcDir, f)).mtime.getTime() }))
    .sort((a, b) => b.mtime - a.mtime);
  if (files.length === 0) return null;
  return path.join(srcDir, files[0].f);
}

const filePath = process.argv[2] ?? findLatestXlsx();
if (!filePath || !fs.existsSync(filePath)) {
  console.error("파일이 없습니다:", filePath ?? "src/공급사관리_*.xlsx");
  process.exit(1);
}

console.log(`[import-vendors] 파일: ${filePath}`);

const buf = fs.readFileSync(filePath);
const wb = XLSX.read(buf);
const ws = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(ws, { defval: null });

if (rows.length === 0) {
  console.error("엑셀에 데이터가 없습니다.");
  process.exit(1);
}

console.log(`[import-vendors] 총 ${rows.length} 행 발견. 헤더:`, Object.keys(rows[0]).join(", "));

// 컬럼 자동 매핑 (한/영 헤더 모두 지원 — vendors.ts 와 동일 규칙)
// 빈 문자열/공백만도 null 취급 → ?? fall-through 정상화
const nn = (v) => {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

function normalizeRow(r) {
  return {
    company_name: nn(r.company_name ?? r["공급사명"] ?? r["공급사"] ?? r["회사명"] ?? r["업체명"]) ?? "",
    contact_name: nn(r.contact_name) ?? nn(r["담당자명"]) ?? nn(r["담당자"]) ?? nn(r["대표자"]),
    phone: nn(r.phone) ?? nn(r["담당자연락처"]) ?? nn(r["전화번호"]) ?? nn(r["전화"]) ?? nn(r["연락처"]) ?? nn(r["휴대폰"]),
    category: nn(r.category) ?? nn(r["공급사그룹"]) ?? nn(r["거래구분"]) ?? nn(r["카테고리"]) ?? nn(r["분류"]),
    note: nn(r.note) ?? nn(r["비고"]) ?? nn(r["메모"]) ?? nn(r["공급사코드"]),
  };
}

const cleaned = rows.map(normalizeRow).filter(r => r.company_name);
console.log(`[import-vendors] 유효 행: ${cleaned.length}`);

const { data: existing, error: exErr } = await supabase.from("vendors").select("id, company_name");
if (exErr) { console.error("기존 vendors 조회 실패:", exErr.message); process.exit(1); }

const existingMap = new Map();
for (const v of existing ?? []) existingMap.set(String(v.company_name).trim(), v.id);

let inserted = 0, updated = 0, failed = 0;
const errors = [];

for (const r of cleaned) {
  const cleanPhone = r.phone ? String(r.phone).replace(/[^0-9]/g, "") || null : null;
  const payload = {
    company_name: r.company_name,
    contact_name: r.contact_name || null,
    phone: cleanPhone,
    category: r.category || null,
    note: r.note || null,
  };
  const existingId = existingMap.get(r.company_name);
  if (existingId != null) {
    const { error } = await supabase.from("vendors").update(payload).eq("id", existingId);
    if (error) { failed++; errors.push(`${r.company_name}: ${error.message}`); }
    else updated++;
  } else {
    const { error } = await supabase.from("vendors").insert(payload);
    if (error) { failed++; errors.push(`${r.company_name}: ${error.message}`); }
    else inserted++;
  }
  if ((inserted + updated) % 50 === 0) console.log(`  진행: ${inserted + updated}/${cleaned.length}`);
}

console.log(`[import-vendors] 완료: 신규 ${inserted}, 업데이트 ${updated}, 실패 ${failed}`);
if (errors.length > 0) {
  console.log(`실패 예시 (최대 5개):`);
  errors.slice(0, 5).forEach(e => console.log(`  - ${e}`));
}
