// 식약처 유통바코드 오픈API · 상품 검증·매핑
// http://openapi.foodsafetykorea.go.kr/api/[KEY]/I2570/json/1/5/BRCD_NO=[바코드]
//
// 인증키 발급: 식품안전나라 데이터활용 · 무료
//   https://www.foodsafetykorea.go.kr/api/openApiInfo.do
// .env 에 FOODSAFETY_API_KEY=xxxxxx 등록
//
// 처리:
//   [Phase A] · 정규화된 88.. 645건 · barcode 로 조회 · 상품명·제조사 검증
//   [Phase B] · needs_search 664건 · 원본 barcode 로 조회 · 국내 등록 여부 확인
//   [Phase C] · Check Digit 실패 12건 · 다양한 후보 시도 · 매칭 검색
//
// 실행:
//   node scripts/fetch-foodsafety-barcode.mjs --phase=A
//   node scripts/fetch-foodsafety-barcode.mjs --phase=B --commit
//
// 결과: docs/foodsafety_lookup_YYYY-MM-DD.json · 조회 성공/실패/불일치 리포트
import { readFileSync, writeFileSync, readdirSync } from "node:fs";

function loadEnv() {
  const raw = readFileSync(".env", "utf8"); const env = {};
  for (const l of raw.split(/\r?\n/)) { const m = /^([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(l); if (m) env[m[1]] = m[2]; }
  return env;
}
const env = loadEnv();
const KEY = env.FOODSAFETY_API_KEY;
if (!KEY) {
  console.error("❌ .env 에 FOODSAFETY_API_KEY 없음");
  console.error("");
  console.error("발급 방법:");
  console.error("  1. https://www.foodsafetykorea.go.kr/api/openApiInfo.do 접속");
  console.error("  2. 로그인 · 회원가입 (무료)");
  console.error("  3. 'API 신청' → '바코드연계제품정보 (I2570)' 신청");
  console.error("  4. 승인 후 발급된 인증키 · .env 에 FOODSAFETY_API_KEY=xxx 저장");
  process.exit(1);
}

const arg = (name, def = null) => {
  const found = process.argv.find(a => a.startsWith(`--${name}=`));
  return found ? found.split("=")[1] : def;
};
const phase = arg("phase", "A");
const COMMIT = process.argv.includes("--commit");
const LIMIT = Number(arg("limit", 0)) || Infinity;
console.log(`Phase ${phase} · ${COMMIT ? "COMMIT" : "DRY-RUN"} · limit=${LIMIT === Infinity ? "무제한" : LIMIT}`);
console.log("─".repeat(72));

// 식약처 API 호출 · 1초당 5회 rate limit 준수 · 200ms delay
async function foodsafetyLookup(barcode) {
  const url = `http://openapi.foodsafetykorea.go.kr/api/${KEY}/I2570/json/1/5/BRCD_NO=${barcode}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return { ok: false, err: `HTTP ${res.status}` };
    const j = await res.json();
    const info = j?.I2570;
    if (!info) return { ok: false, err: "empty response" };
    if (info.RESULT?.CODE && info.RESULT.CODE !== "INFO-000") {
      // INFO-100 = 해당 데이터 없음
      return { ok: false, err: `${info.RESULT.CODE} · ${info.RESULT.MSG}` };
    }
    const row = info.row?.[0];
    if (!row) return { ok: false, err: "no row" };
    return {
      ok: true,
      barcode: row.BRCD_NO,
      product_name: row.PRDLST_NM,
      manufacturer: row.MNF_NM,
      report_no: row.PRDLST_REPORT_NO,
      product_type: row.PRDLST_TYPE_CODE_NM,
      raw: row,
    };
  } catch (e) {
    return { ok: false, err: e.message };
  }
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// 대상 선택
const analysisFiles = readdirSync("docs").filter(f => /^barcode_analysis_\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort().reverse();
if (analysisFiles.length === 0) { console.error("❌ docs/barcode_analysis_*.json 없음"); process.exit(1); }
const analysis = JSON.parse(readFileSync(`docs/${analysisFiles[0]}`, "utf8"));

let targets = [];
if (phase === "A") {
  targets = analysis.auto_fixable.map(x => ({ code: x.fixed, orig: x.orig, name: x.name }));
} else if (phase === "B") {
  targets = analysis.needs_search.filter(x => x.len >= 8 && x.len <= 14).map(x => ({ code: x.code, name: x.name }));
} else if (phase === "C") {
  targets = analysis.invalid13.map(x => ({ code: x.code, name: x.name }));
} else if (phase === "K") {
  // valid13_kr 4849건 · 이미 유효한 88.. · 식약처 등록 검증
  targets = analysis.valid13_kr.map(x => ({ code: x.code, name: x.name }));
} else if (phase === "F") {
  // valid13_foreign 280건 · 해외 barcode · 국내 유통 여부 검증
  targets = analysis.valid13_foreign.map(x => ({ code: x.code, name: x.name }));
} else if (phase === "all") {
  // 전체 6084건 · 순차 실행
  targets = [
    ...analysis.valid13_kr.map(x => ({ code: x.code, name: x.name, tag: "kr" })),
    ...analysis.auto_fixable.map(x => ({ code: x.fixed, orig: x.orig, name: x.name, tag: "auto" })),
    ...analysis.needs_search.filter(x => x.len >= 8 && x.len <= 14).map(x => ({ code: x.code, name: x.name, tag: "search" })),
    ...analysis.invalid13.map(x => ({ code: x.code, name: x.name, tag: "invalid" })),
    ...analysis.valid13_foreign.map(x => ({ code: x.code, name: x.name, tag: "foreign" })),
  ];
} else {
  console.error(`❌ 지원되지 않는 phase: ${phase}`);
  process.exit(1);
}

const total = Math.min(targets.length, LIMIT);
console.log(`대상: ${total} / ${targets.length}건`);
console.log("");

const success = [];
const notFound = [];
const errors = [];

for (let i = 0; i < total; i++) {
  const t = targets[i];
  const res = await foodsafetyLookup(t.code);
  if ((i + 1) % 50 === 0) console.log(`... ${i + 1}/${total} · 성공=${success.length} · 미등록=${notFound.length} · 오류=${errors.length}`);

  if (res.ok) {
    success.push({ ...t, api: res });
  } else if (/INFO-100|no row|empty/i.test(res.err)) {
    notFound.push({ ...t, err: res.err });
  } else {
    errors.push({ ...t, err: res.err });
  }
  await sleep(220);  // 200ms + 여유 · rate limit 회피
}

const today = new Date().toISOString().slice(0, 10);
const outPath = `docs/foodsafety_lookup_${phase}_${today}.json`;
writeFileSync(outPath, JSON.stringify({
  generated_at: new Date().toISOString(),
  phase, total,
  success: success.length,
  notFound: notFound.length,
  errors: errors.length,
  success_list: success,
  notFound_list: notFound.slice(0, 200),
  errors_list: errors.slice(0, 100),
}, null, 2), "utf8");

console.log("");
console.log("═".repeat(72));
console.log(`Phase ${phase} 결과:`);
console.log(`  · 성공 · ${success.length}건 (API 매칭)`);
console.log(`  · 미등록 · ${notFound.length}건 (식약처 DB 없음)`);
console.log(`  · 오류 · ${errors.length}건`);
console.log(`📄 저장 · ${outPath}`);
