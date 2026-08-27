// 상품명 → nedrug.mfds.go.kr 크롤링 → EAN-13 barcode 추출
// 사용자 지시 (2026-08-27) · 옵션 1 · 인증 없이 웹 크롤링
//
// 프로세스:
//   1. 상품명 검색 · https://nedrug.mfds.go.kr/searchDrug?itemName=[상품명]
//   2. 결과 HTML 에서 itemSeq (품목기준코드) 추출
//   3. 상세 페이지 · https://nedrug.mfds.go.kr/pbp/CCBBB01/getItemDetail?itemSeq=[코드]
//   4. HTML 에서 EAN-13 barcode (88.. 시작) 추출
//
// 실행:
//   node scripts/lookup-drug-crawl.mjs --phase=B --limit=10       // dry-run 10건
//   node scripts/lookup-drug-crawl.mjs --phase=B --limit=100      // 100건
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

function loadEnv() {
  const raw = readFileSync(".env", "utf8"); const env = {};
  for (const l of raw.split(/\r?\n/)) { const m = /^([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(l); if (m) env[m[1]] = m[2]; }
  return env;
}
const env = loadEnv();
const sb = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

const arg = (name, def = null) => {
  const found = process.argv.find(a => a.startsWith(`--${name}=`));
  return found ? found.split("=")[1] : def;
};
const phase = arg("phase", "B");
const LIMIT = Number(arg("limit", 0)) || Infinity;
console.log(`Phase ${phase} · limit=${LIMIT === Infinity ? "무제한" : LIMIT}`);
console.log("─".repeat(72));

// 상품명 정제 · 특수문자·괄호·용량 제거 → 검색 hit 율 상승
function cleanName(name) {
  if (!name) return "";
  return String(name)
    .replace(/^[\-\+\*]+/, "")              // 앞 · - + * 제거
    .replace(/\([^)]*\)/g, "")               // 괄호 내용 제거
    .replace(/\[[^\]]*\]/g, "")              // 대괄호 내용 제거
    .replace(/[\d]+\s*(mg|ml|g|정|캅셀|캡슐|병|포|매|팩)/gi, "") // 용량 제거
    .replace(/\s+/g, " ")
    .trim();
}

async function searchNedrug(name) {
  const cleaned = cleanName(name);
  if (!cleaned || cleaned.length < 2) return { ok: false, reason: "이름 짧음" };
  const url = `https://nedrug.mfds.go.kr/searchDrug?itemName=${encodeURIComponent(cleaned)}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return { ok: false, reason: `search HTTP ${res.status}` };
    const html = await res.text();
    // 총 건수 파싱 · "총 <span>N</span>건" · N=0 이면 결과 없음
    const cntMatch = html.match(/총\s*<[^>]*>?\s*([\d,]+)\s*<[^>]*>?\s*건/);
    const totalCount = cntMatch ? Number(cntMatch[1].replace(/,/g, "")) : -1;
    if (totalCount === 0) return { ok: false, reason: "총 0건" };
    const seqMatches = [...html.matchAll(/itemSeq=(\d+)/g)];
    const uniqueSeqs = [...new Set(seqMatches.map(m => m[1]))];
    if (uniqueSeqs.length === 0) return { ok: false, reason: "itemSeq 없음" };
    return { ok: true, itemSeq: uniqueSeqs[0], resultCount: totalCount > 0 ? totalCount : uniqueSeqs.length };
  } catch (e) {
    return { ok: false, reason: `search 오류: ${e.message}` };
  }
}

async function fetchBarcodes(itemSeq) {
  const url = `https://nedrug.mfds.go.kr/pbp/CCBBB01/getItemDetail?itemSeq=${itemSeq}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) return { ok: false, reason: `detail HTTP ${res.status}` };
    const html = await res.text();
    // EAN-13 88.. 코드 추출
    const barcodes = [...new Set((html.match(/8[80][0-9]{11}/g) ?? []))];
    // 제품명 (title 태그 또는 첫 h1 h2)
    const nameMatch = html.match(/<title>([^<]+)<\/title>/);
    const productName = nameMatch ? nameMatch[1].replace(/의약품통합정보시스템|-\s*식품의약품안전처/g, "").trim() : null;
    return { ok: true, barcodes, productName };
  } catch (e) {
    return { ok: false, reason: `detail 오류: ${e.message}` };
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// 대상 로드
const analysisFiles = readdirSync("docs").filter(f => /^barcode_analysis_\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse();
if (analysisFiles.length === 0) { console.error("❌ docs/barcode_analysis_*.json 없음"); process.exit(1); }
const analysis = JSON.parse(readFileSync(`docs/${analysisFiles[0]}`, "utf8"));

let targets = [];
if (phase === "B") {
  targets = analysis.needs_search.map(x => ({ code: x.code, name: x.name }));
} else if (phase === "C") {
  targets = analysis.invalid13.map(x => ({ code: x.code, name: x.name }));
} else if (phase === "A") {
  targets = analysis.auto_fixable.map(x => ({ code: x.fixed, orig: x.orig, name: x.name }));
} else {
  console.error("phase A/B/C only"); process.exit(1);
}

const total = Math.min(targets.length, LIMIT);
console.log(`대상: ${total} / ${targets.length}건`);
console.log("");

// 이름 유사도 검증 · 원본 이름의 핵심 토큰 (한글 3자 이상) 이 결과 이름에 포함되는지
function nameMatches(origName, resultName) {
  if (!origName || !resultName) return false;
  const clean = cleanName(origName).replace(/\s+/g, "");
  const result = String(resultName).replace(/\s+/g, "");
  if (clean.length < 3) return false;
  // 3자 이상 슬라이딩 윈도우 · 원본의 3-4자 토큰이 결과에 하나라도 포함되면 OK
  const tokens = [];
  for (let i = 0; i <= clean.length - 4; i++) tokens.push(clean.slice(i, i + 4));
  for (let i = 0; i <= clean.length - 3; i++) tokens.push(clean.slice(i, i + 3));
  return tokens.some(tok => result.includes(tok));
}

const found = [], suspicious = [], notFound = [], errors = [];
for (let i = 0; i < total; i++) {
  const t = targets[i];
  const search = await searchNedrug(t.name);
  if (!search.ok) { notFound.push({ ...t, phase: "search", reason: search.reason }); continue; }
  await sleep(300);
  const detail = await fetchBarcodes(search.itemSeq);
  if (!detail.ok) { errors.push({ ...t, itemSeq: search.itemSeq, reason: detail.reason }); continue; }
  if (detail.barcodes.length === 0) {
    notFound.push({ ...t, itemSeq: search.itemSeq, reason: "barcode 없음", nedrug_name: detail.productName });
  } else {
    const nedrugName = detail.productName?.replace(/식품의약품안전처.*상세보기-/, "").trim() ?? "";
    const trust = nameMatches(t.name, nedrugName);
    const record = {
      orig_code: t.code,
      orig_name: t.name,
      nedrug_itemSeq: search.itemSeq,
      nedrug_name: nedrugName,
      resultCount: search.resultCount,
      barcodes: detail.barcodes,
      trusted: trust,
    };
    if (trust) found.push(record);
    else suspicious.push(record);
  }
  if ((i + 1) % 10 === 0) console.log(`... ${i + 1}/${total} · trust=${found.length} · suspect=${suspicious.length} · notFound=${notFound.length} · err=${errors.length}`);
  await sleep(500);
}

const today = new Date().toISOString().slice(0, 10);
const outPath = `docs/nedrug_crawl_${phase}_${today}.json`;
writeFileSync(outPath, JSON.stringify({
  generated_at: new Date().toISOString(),
  phase, total,
  trusted_count: found.length,
  suspicious_count: suspicious.length,
  notFound_count: notFound.length,
  errors_count: errors.length,
  trusted: found,
  suspicious,
  notFound: notFound.slice(0, 200),
  errors: errors.slice(0, 50),
}, null, 2), "utf8");

console.log("");
console.log("═".repeat(72));
console.log(`Phase ${phase} 크롤링 결과:`);
console.log(`  · 🟢 신뢰 매칭 (이름 유사) · ${found.length}건 (${((found.length / total) * 100).toFixed(1)}%)`);
console.log(`  · 🟡 의심 매칭 (이름 불일치) · ${suspicious.length}건`);
console.log(`  · 미확보 · ${notFound.length}건`);
console.log(`  · 오류 · ${errors.length}건`);
console.log(`📄 ${outPath}`);
console.log("");
console.log("샘플 · 신뢰 매칭 5건:");
for (const f of found.slice(0, 5)) {
  console.log(`  ✅ "${f.orig_name?.slice(0, 30)}" → ${f.nedrug_name?.slice(0, 30)} · barcode=${f.barcodes.slice(0, 3).join(",")}`);
}
if (suspicious.length > 0) {
  console.log("\n의심 매칭 (사용자 확인 필요):");
  for (const s of suspicious.slice(0, 5)) {
    console.log(`  ⚠ "${s.orig_name?.slice(0, 30)}" → ${s.nedrug_name?.slice(0, 30)}`);
  }
}
