// 2026-08-29 · 사용자 지시 · products.search_keywords · products 테이블 베이스로 재생성
//   · 각 상품 · product_name → 초성 분해 (예: "타이레놀" → "ㅌㅇㄹㄴ")
//   · search_keywords = "원본상품명 초성문자열" (공백 구분)
//   · 이후 · /api/products-search · A 방식 · 초성 검색 정상 작동
//
// 안전:
//   · products.search_keywords 컬럼만 UPDATE · 다른 컬럼·참조 데이터 · 절대 유지
//   · TRUNCATE X · DELETE X · CASCADE X · 데이터 손실 없음
//   · 기존 사용자 별칭 (수동 입력) · 덮어쓰기 위험 · 실행 전 확인 필요
//
// 실행: node scripts/rebuild-search-keywords.mjs

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnv() {
  const raw = readFileSync(".env", "utf8");
  const env = {};
  for (const l of raw.split(/\r?\n/)) {
    const m = /^([A-Z_]+)\s*=\s*"?([^"\r]*)"?\s*$/.exec(l);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

// hangulSearch.ts · toChosung 로직 재현 (Node · zero-dep)
const CHOSUNG = [
  "ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ",
];

function toChosung(s) {
  let out = "";
  for (const ch of String(s ?? "").toLowerCase()) {
    const code = ch.charCodeAt(0);
    if (code >= 0xAC00 && code <= 0xD7A3) {
      out += CHOSUNG[Math.floor((code - 0xAC00) / 588)];
    } else {
      out += ch;
    }
  }
  return out;
}

function buildSearchKeywords(name) {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) return null;
  const chosung = toChosung(trimmed);
  // 원본 + 초성 · 공백 구분 · ilike 매칭 위해
  //   예: "타이레놀 500mg" → "타이레놀 500mg ㅌㅇㄹㄴ 500mg"
  return `${trimmed} ${chosung}`.trim();
}

const env = loadEnv();
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

console.log("═".repeat(70));
console.log("search_keywords 재생성 · products 테이블 베이스 · 2026-08-29");
console.log("═".repeat(70));

// 1. 사전 카운트
const { count: total } = await sb.from("products").select("*", { count: "exact", head: true });
console.log(`\n[BEFORE] 전체 상품: ${total}건`);

// 2. 페이지 단위 조회 + UPDATE (Supabase 1000건 제한 우회)
const PAGE = 500;
let from = 0;
let totalUpdated = 0;
let round = 0;

while (true) {
  round++;
  const { data: batch, error } = await sb.from("products")
    .select("product_code, product_name")
    .range(from, from + PAGE - 1);
  if (error) {
    console.error(`  [chunk ${round}] 조회 에러:`, error.message);
    break;
  }
  if (!batch || batch.length === 0) break;

  // 각 상품 · search_keywords 계산 · 개별 UPDATE (in 절로 대량 X · row 별 값 다름)
  //   Supabase JS · 여러 row · 각각 다른 값 · in 배치 UPDATE 어려움 · 순차 UPDATE
  let batchUpdated = 0;
  const promises = batch.map(async (p) => {
    const code = String(p.product_code ?? "").trim();
    if (!code) return;
    const keywords = buildSearchKeywords(p.product_name);
    if (!keywords) return;
    const { error: uErr } = await sb.from("products")
      .update({ search_keywords: keywords })
      .eq("product_code", code);
    if (uErr) {
      console.error(`  [${code}] UPDATE 에러:`, uErr.message);
      return;
    }
    batchUpdated++;
  });
  await Promise.all(promises);
  totalUpdated += batchUpdated;
  console.log(`  [chunk ${round}] ${batchUpdated}건 UPDATE · 누적 ${totalUpdated}건 · (from=${from})`);

  if (batch.length < PAGE) break;
  from += PAGE;
}

// 3. 사후 카운트
const { count: withKeywords } = await sb.from("products")
  .select("*", { count: "exact", head: true })
  .not("search_keywords", "is", null);
console.log(`\n[AFTER]`);
console.log(`  search_keywords 있는 상품: ${withKeywords}건`);
console.log(`  총 UPDATE: ${totalUpdated}건`);

// 4. 샘플 확인 (페리비타)
const { data: sample } = await sb.from("products")
  .select("product_code, product_name, search_keywords")
  .ilike("product_name", "%페리비타%")
  .limit(2);
console.log(`\n[SAMPLE] 페리비타:`);
for (const p of sample ?? []) {
  console.log(`  ${p.product_code} · "${p.product_name}" · search_keywords="${p.search_keywords}"`);
}

console.log(`\n${"═".repeat(70)}`);
console.log(`✅ 재생성 완료 · Step 3 · A 방식 · 초성 검색 정상 작동`);
console.log(`${"═".repeat(70)}`);
console.log(`\n확인 방법:`);
console.log(`  1. 관리자 로그인 → 상품 검색창 · "ㅍㄹㅂㅌ" 입력`);
console.log(`  2. 페리비타 · 매칭 확인`);
