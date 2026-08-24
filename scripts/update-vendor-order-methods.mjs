// 2026-08-24 · #178 · 공급사 order_method (주문방식/사이트) 일괄 UPDATE
//   · 사용자 제공 52 vendor 리스트 · 19개 값 · 33개 빈 문자열
//   · 매칭 키: vendors.company_name (정확 일치 · 정규화: trim + 공백 제거)
//   · fallback: company_name LIKE '%name%'
//   · dry-run 모드 · npm run update:vendor-order:dry
//   · 실제 실행 · npm run update:vendor-order
//   · 전제: sql/migrations/2026-08-23_vendors_xlsx_columns.sql 선행 실행
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const SUPABASE_URL = process.env.SUPABASE_URL?.replace(/^"|"$/g, "");
const SUPABASE_KEY = process.env.SUPABASE_KEY?.replace(/^"|"$/g, "");
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("❌ .env · SUPABASE_URL / SUPABASE_KEY 필요");
  process.exit(1);
}
const supa = createClient(SUPABASE_URL, SUPABASE_KEY);

const DRY_RUN = process.argv.includes("--dry") || process.argv.includes("--dry-run");

// ═══════════════════════════════════════════════════════════════════
// 사용자 제공 데이터 (2026-08-24)
// ═══════════════════════════════════════════════════════════════════
/** @type {Array<{name: string, order_method: string}>} */
const VENDOR_DATA = [
  { name: "KJD바이오",             order_method: "" },
  { name: "CMG제약",               order_method: "" },
  { name: "경남제약",              order_method: "" },
  { name: "경방신약",              order_method: "" },
  { name: "고려은단",              order_method: "고려은단 폐쇄몰" },
  { name: "고려제약",              order_method: "" },
  { name: "광동제약",              order_method: "광동제약 약국몰" },
  { name: "녹십자",                order_method: "녹십자 프리미온" },
  { name: "대웅제약",              order_method: "theSHOP" },
  { name: "대원제약",              order_method: "온다몰, 일부직거래" },
  { name: "동국제약",              order_method: "" },
  { name: "동성제약",              order_method: "" },
  { name: "동아오츠카",            order_method: "" },
  { name: "동아제약",              order_method: "DAPmall - 메인" },
  { name: "동화약품",              order_method: "동화eMall, 일부직거래" },
  { name: "디알에스",              order_method: "" },
  { name: "마더스팜",              order_method: "" },
  { name: "매일유업",              order_method: "" },
  { name: "박카스",                order_method: "" },
  { name: "보령컨슈머",            order_method: "팜스트리트" },
  { name: "비알피랩스(아워팜)",    order_method: "바로팜 | 홈" },
  { name: "삼일제약",              order_method: "" },
  { name: "삼진제약",              order_method: "" },
  { name: "셀로닉스",              order_method: "셀로몰" },
  { name: "신신제약",              order_method: "" },
  { name: "신일제약",              order_method: "소조몰" },
  { name: "에프앤디넷(더팜)",      order_method: "" },
  { name: "엠아이에이뉴트라",      order_method: "뉴트라몰" },
  { name: "영진약품",              order_method: "" },
  { name: "온라인팜",              order_method: "HMP몰" },
  { name: "원광제약(주)",          order_method: "" },
  { name: "유유제약",              order_method: "" },
  { name: "유한양행",              order_method: "유한팜" },
  { name: "익수제약",              order_method: "" },
  { name: "일동제약",              order_method: "새로팜" },
  { name: "일양약품",              order_method: "" },
  { name: "제이컴퍼니",            order_method: "" },
  { name: "제일헬스사이언스",      order_method: "" },
  { name: "조아제약",              order_method: "" },
  { name: "종근당",                order_method: "플랫팜" },
  { name: "중외제약",              order_method: "JW중외제약 온라인몰" },
  { name: "쥴릭파마",              order_method: "" },
  { name: "지오영",                order_method: "" },
  { name: "컨디션",                order_method: "" },
  { name: "코오롱제약",            order_method: "바로팜 | 홈" },
  { name: "태극제약",              order_method: "" },
  { name: "한가람약품",            order_method: "" },
  { name: "한국코와",              order_method: "" },
  { name: "한독",                  order_method: "" },
  { name: "한산바이오팜(주)",      order_method: "" },
  { name: "한풍제약",              order_method: "" },
  { name: "현대약품",              order_method: "현대약품몰,직거래" },
];

// 이름 정규화 · 공백/괄호 앞뒤 · 뒤 (주)/(유)/주식회사 등 접미어 제거
function normalize(s) {
  return String(s ?? "")
    .replace(/\(주\)|\(유\)|주식회사|㈜/g, "")
    .replace(/\s+/g, "")
    .toLowerCase()
    .trim();
}

async function main() {
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`공급사 order_method 일괄 UPDATE ${DRY_RUN ? "(DRY-RUN · 실제 변경 없음)" : "(REAL RUN)"}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  // 1) 컬럼 존재 확인 (SELECT LIMIT 0)
  const { error: colErr } = await supa
    .from("vendors")
    .select("id, company_name, order_method")
    .limit(1);
  if (colErr) {
    if (String(colErr.message).includes("order_method") || String(colErr.code) === "42703") {
      console.error(`❌ vendors.order_method 컬럼 없음 · 먼저 SQL 마이그레이션 실행 필요:`);
      console.error(`   sql/migrations/2026-08-23_vendors_xlsx_columns.sql`);
      console.error(`   → Supabase Dashboard > SQL Editor 에서 실행`);
      process.exit(2);
    }
    console.error(`❌ 컬럼 확인 실패: ${colErr.message}`);
    process.exit(3);
  }
  console.log(`✅ vendors.order_method 컬럼 존재 확인`);

  // 2) 전체 vendors 로드 · 이름 매칭 인덱스
  const { data: allVendors, error: listErr } = await supa
    .from("vendors")
    .select("id, company_name, order_method")
    .limit(5000);
  if (listErr) {
    console.error(`❌ vendors 리스트 로드 실패: ${listErr.message}`);
    process.exit(4);
  }
  console.log(`📋 DB · vendors ${allVendors.length}개 로드`);

  const normMap = new Map();
  for (const v of allVendors) {
    const nk = normalize(v.company_name);
    if (nk) normMap.set(nk, v);
  }

  // 3) 매칭 + UPDATE
  const results = { updated: [], skipped_same: [], not_found: [], errors: [] };
  for (const row of VENDOR_DATA) {
    const nk = normalize(row.name);
    let vendor = normMap.get(nk);
    // fallback · substring 매칭
    if (!vendor) {
      for (const v of allVendors) {
        const vn = normalize(v.company_name);
        if (vn && (vn.includes(nk) || nk.includes(vn))) { vendor = v; break; }
      }
    }
    if (!vendor) {
      results.not_found.push(row.name);
      continue;
    }
    const newValue = row.order_method || null;  // 빈 문자열 → NULL
    const currentValue = vendor.order_method ?? null;
    if (currentValue === newValue) {
      results.skipped_same.push(`${row.name} (id=${vendor.id.slice(0,8)})`);
      continue;
    }
    if (DRY_RUN) {
      results.updated.push(`${row.name} · "${currentValue ?? "(null)"}" → "${newValue ?? "(null)"}"`);
      continue;
    }
    const { error: updErr } = await supa
      .from("vendors")
      .update({ order_method: newValue })
      .eq("id", vendor.id);
    if (updErr) {
      results.errors.push(`${row.name}: ${updErr.message}`);
    } else {
      results.updated.push(`${row.name} · "${currentValue ?? "(null)"}" → "${newValue ?? "(null)"}"`);
    }
  }

  // 4) 리포트
  console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`📊 결과 리포트`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`✅ ${DRY_RUN ? "변경예정" : "UPDATE완료"} · ${results.updated.length}건`);
  for (const s of results.updated) console.log(`   · ${s}`);
  console.log(`⏭ skip(값동일) · ${results.skipped_same.length}건`);
  for (const s of results.skipped_same.slice(0, 5)) console.log(`   · ${s}`);
  if (results.skipped_same.length > 5) console.log(`   ... (${results.skipped_same.length - 5}건 생략)`);
  console.log(`⚠  DB 미존재 vendor · ${results.not_found.length}건 (신규 등록 필요할 수도)`);
  for (const s of results.not_found) console.log(`   · ${s}`);
  if (results.errors.length) {
    console.log(`❌ 에러 · ${results.errors.length}건`);
    for (const s of results.errors) console.log(`   · ${s}`);
  }
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(DRY_RUN ? `💡 실제 실행 · node scripts/update-vendor-order-methods.mjs` : `✅ 완료`);
}

main().catch(err => {
  console.error(`❌ 실행 실패:`, err);
  process.exit(1);
});
