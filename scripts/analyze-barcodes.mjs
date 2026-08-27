// 상품 barcode 분석 · Check Digit (Modulo 10) + GS1 국가코드 + 자동 정규화
// 사용자 방법론 (2026-08-27):
//   1. GS1 국가코드 (880=한국, 490~499=일본, 690~695=중국, 700~709=노르웨이, UPC=북미)
//   2. Check Digit (Modulo 10) · EAN-13 검증
//   3. 14자리 → 13자리 오타 교정 (앞 자리 padding 제거)
//   4. 국내 유통(880) 여부 판정
//
// 출력:
//   docs/BARCODE_ANALYSIS_YYYY-MM-DD.md · 분석 리포트
//   docs/barcode_analysis_YYYY-MM-DD.json · 자동 정정 후보 · 웹검색 대상
import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync } from "node:fs";

function loadEnv() {
  const raw = readFileSync(".env", "utf8"); const env = {};
  for (const l of raw.split(/\r?\n/)) { const m = /^([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(l); if (m) env[m[1]] = m[2]; }
  return env;
}
const env = loadEnv();
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

// EAN-13 Check Digit (Modulo 10) 계산 · 12자리 → check digit
function ean13Check(code12) {
  if (code12.length !== 12) return null;
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const d = Number(code12[i]);
    if (Number.isNaN(d)) return null;
    sum += d * (i % 2 === 0 ? 1 : 3);
  }
  return (10 - (sum % 10)) % 10;
}
function isValidEan13(code) {
  if (code.length !== 13) return false;
  const expected = ean13Check(code.slice(0, 12));
  return expected !== null && expected === Number(code[12]);
}

// GS1 국가코드 매핑
function gs1Country(prefix3) {
  const p = Number(prefix3);
  if (Number.isNaN(p)) return "unknown";
  if (p >= 0 && p <= 139) return "북미 (UPC/US·CA)";
  if (p >= 300 && p <= 379) return "프랑스";
  if (p >= 380 && p <= 380) return "불가리아";
  if (p >= 400 && p <= 440) return "독일";
  if (p >= 450 && p <= 459) return "일본";
  if (p >= 460 && p <= 469) return "러시아";
  if (p >= 471 && p <= 471) return "대만";
  if (p >= 480 && p <= 480) return "필리핀";
  if (p >= 489 && p <= 489) return "홍콩";
  if (p >= 490 && p <= 499) return "일본";
  if (p >= 500 && p <= 509) return "영국";
  if (p >= 520 && p <= 521) return "그리스";
  if (p >= 690 && p <= 699) return "중국";
  if (p >= 700 && p <= 709) return "노르웨이";
  if (p >= 730 && p <= 739) return "스웨덴";
  if (p >= 880 && p <= 880) return "🇰🇷 대한민국";
  if (p >= 899 && p <= 899) return "인도네시아";
  if (p >= 900 && p <= 919) return "오스트리아";
  return `기타 (${p})`;
}

// 14자리 GTIN → 13자리 EAN-13 오타 교정 시도
// 앞 자리 padding 제거 · Check Digit 검증
function tryReduceTo13(code) {
  if (code.length < 13) return null;
  // 방법 1: 앞자리 하나씩 제거 시도
  const candidates = [];
  // 14자리 → 13자리 (앞자리 1개 제거)
  if (code.length === 14) {
    candidates.push(code.slice(1));  // 앞 1자리 제거
  }
  // 15자리 → 13자리 (앞 2자리 제거)
  if (code.length === 15) {
    candidates.push(code.slice(2));
  }
  // 16자리 → 13자리 (앞 3자리 제거)
  if (code.length === 16) {
    candidates.push(code.slice(3));
  }
  // 17자리 → 13자리 (앞 4자리 제거)
  if (code.length === 17) {
    candidates.push(code.slice(4));
  }
  for (const cand of candidates) {
    if (cand.length === 13 && isValidEan13(cand)) return cand;
  }
  return null;
}

// ─────────────────────────────────────────────
const PAGE = 1000; let from = 0; const rows = [];
while (true) {
  const { data, error } = await sb.from("products").select("product_code,product_name,brand,supplier").range(from, from + PAGE - 1);
  if (error) { console.error(error.message); process.exit(1); }
  if (!data || data.length === 0) break;
  rows.push(...data);
  if (data.length < PAGE) break;
  from += PAGE;
}
console.log(`총 ${rows.length}건 분석 시작`);
console.log("─".repeat(72));

const result = {
  valid13_kr: [],       // 13자리 · Check Digit 유효 · 880 (한국)
  valid13_foreign: [],  // 13자리 · Check Digit 유효 · 해외
  invalid13: [],        // 13자리이지만 · Check Digit 실패 (오타 의심)
  auto_fixable: [],     // 14~17자리 · 앞자리 제거로 13자리 EAN-13 복원 가능
  needs_search: [],     // 자동 정규화 불가 · 웹검색 필요 (내부코드 등)
};

for (const r of rows) {
  const code = String(r.product_code ?? "").trim();
  if (!code) continue;
  const len = code.length;
  const first3 = code.slice(0, 3);
  const country = gs1Country(first3);
  const item = { code, name: r.product_name?.slice(0, 40), brand: r.brand, supplier: r.supplier };

  if (len === 13 && isValidEan13(code)) {
    if (code.startsWith("880")) result.valid13_kr.push(item);
    else result.valid13_foreign.push({ ...item, country });
    continue;
  }

  if (len === 13) {
    // 13자리이지만 check digit 실패 · 오타 가능성
    result.invalid13.push({ ...item, country });
    continue;
  }

  // 14~17자리 · 오타 교정 시도
  if (len >= 14 && len <= 17) {
    const fixed = tryReduceTo13(code);
    if (fixed) {
      const fixedCountry = gs1Country(fixed.slice(0, 3));
      result.auto_fixable.push({ ...item, orig: code, fixed, fixed_country: fixedCountry });
      continue;
    }
  }

  // 자동 정규화 불가
  result.needs_search.push({ ...item, len, country });
}

console.log("[분석 결과]");
console.log(`  · 13자리 · 유효 · 대한민국(880) · ${result.valid13_kr.length}건`);
console.log(`  · 13자리 · 유효 · 해외 · ${result.valid13_foreign.length}건`);
console.log(`  · 13자리 · Check Digit 실패 (오타 의심) · ${result.invalid13.length}건`);
console.log(`  · 자동 오타 교정 가능 (앞 padding 제거) · ${result.auto_fixable.length}건`);
console.log(`  · 웹검색 필요 (내부코드 등) · ${result.needs_search.length}건`);

// 해외 국가별 분포
console.log("\n[해외 상품 국가별 분포]");
const countryDist = new Map();
for (const r of result.valid13_foreign) {
  countryDist.set(r.country, (countryDist.get(r.country) ?? 0) + 1);
}
for (const [c, n] of [...countryDist.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  · ${c} · ${n}건`);
}

// 자동 교정 앞자리 패턴
console.log("\n[자동 교정 · 원본 앞자리 패턴]");
const fixDist = new Map();
for (const r of result.auto_fixable) {
  const prefix = r.orig.slice(0, r.orig.length - 13);
  const kind = `${prefix} + ${r.fixed.slice(0, 3)}... (${r.fixed_country})`;
  fixDist.set(kind, (fixDist.get(kind) ?? 0) + 1);
}
for (const [k, n] of [...fixDist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)) {
  console.log(`  · ${k} · ${n}건`);
}

// 웹검색 필요 · 길이 분포
console.log("\n[웹검색 필요 · 길이 분포]");
const lenDist = new Map();
for (const r of result.needs_search) {
  lenDist.set(r.len, (lenDist.get(r.len) ?? 0) + 1);
}
for (const [k, n] of [...lenDist.entries()].sort((a, b) => a[0] - b[0])) {
  console.log(`  · ${k}자리 · ${n}건`);
}
console.log("\n샘플 웹검색 대상:");
for (const r of result.needs_search.slice(0, 20)) {
  console.log(`  · ${r.code.padEnd(18)} (${r.len}자리) · ${r.name}`);
}

// 저장
const today = new Date().toISOString().slice(0, 10);
writeFileSync(`docs/barcode_analysis_${today}.json`, JSON.stringify(result, null, 2), "utf8");
console.log(`\n📄 저장 · docs/barcode_analysis_${today}.json`);
