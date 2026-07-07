// 숨김 관리 기능 end-to-end 테스트
//   1. 실제 상품 하나 선택
//   2. PATCH hidden=true → /api/products/hidden 리스트 포함, 검색 결과 제외 확인
//   3. include_hidden=1 로 검색 시 다시 포함
//   4. PATCH hidden=false → 원상복구, 검색 결과 재포함 확인
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const BASE = "http://localhost:3000";
const url = process.env.SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY!;
const supabase = createClient(url, key);

let pass = 0, fail = 0;
const step = (label: string, ok: boolean, detail?: any) => {
  const mark = ok ? "✅" : "❌";
  console.log(`  ${mark}  ${label}${detail !== undefined ? `  ${JSON.stringify(detail)}` : ""}`);
  ok ? pass++ : fail++;
};

async function main() {
  console.log("──────── 숨김 관리 flow 테스트 ────────");

  // (0) 검색 가능한 실제 상품 하나 선택 (한글 상품명 · hidden=false)
  const { data: sample, error: sampleErr } = await supabase
    .from("products")
    .select("product_code, product_name, hidden")
    .eq("hidden", false)
    .not("product_name", "is", null)
    .limit(1);
  if (sampleErr || !sample || sample.length === 0) {
    console.error("샘플 상품을 찾지 못했습니다:", sampleErr);
    process.exit(1);
  }
  const target = sample[0];
  const code = String(target.product_code);
  const name = String(target.product_name);
  // 검색 키워드: 상품명의 앞 3글자 (한글 대응)
  const searchKey = name.slice(0, Math.min(3, name.length));
  console.log(`  대상 상품 · code=${code} · name="${name}" · 검색어="${searchKey}"`);

  // 초기 hidden 리스트 카운트
  const initialHiddenCount = await fetch(`${BASE}/api/products/hidden`).then(r => r.json()).then(l => (Array.isArray(l) ? l.length : -1));
  console.log(`  초기 숨김 상품 수: ${initialHiddenCount}`);

  // (1) PATCH hidden=true
  {
    const res = await fetch(`${BASE}/api/products/${encodeURIComponent(code)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hidden: true }),
    });
    const body = await res.json().catch(() => ({}));
    step("PATCH hidden=true", res.ok, { status: res.status, body });
  }

  // (2) /api/products/hidden 에 포함되어야 함
  {
    const list = await fetch(`${BASE}/api/products/hidden`).then(r => r.json());
    const included = Array.isArray(list) && list.some((p: any) => String(p.product_code) === code);
    step("숨김 리스트에 포함", included, { count: Array.isArray(list) ? list.length : -1 });
  }

  // (3) /api/products-search 에서 제외되어야 함
  {
    const list = await fetch(`${BASE}/api/products-search?q=${encodeURIComponent(searchKey)}`).then(r => r.json());
    const included = Array.isArray(list) && list.some((p: any) => String(p.product_code) === code);
    step("일반 검색에서 제외", !included, { hits: Array.isArray(list) ? list.length : -1 });
  }

  // (4) include_hidden=1 검색에서는 포함되어야 함
  {
    const list = await fetch(`${BASE}/api/products-search?q=${encodeURIComponent(searchKey)}&include_hidden=1`).then(r => r.json());
    const included = Array.isArray(list) && list.some((p: any) => String(p.product_code) === code);
    step("include_hidden=1 검색에서 포함", included, { hits: Array.isArray(list) ? list.length : -1 });
  }

  // (5) PATCH hidden=false (원상복구)
  {
    const res = await fetch(`${BASE}/api/products/${encodeURIComponent(code)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hidden: false }),
    });
    step("PATCH hidden=false (원상복구)", res.ok, { status: res.status });
  }

  // (6) 숨김 리스트에서 제외
  {
    const list = await fetch(`${BASE}/api/products/hidden`).then(r => r.json());
    const included = Array.isArray(list) && list.some((p: any) => String(p.product_code) === code);
    step("원상복구 후 숨김 리스트에서 제외", !included, { count: Array.isArray(list) ? list.length : -1 });
  }

  // (7) 검색 결과 재포함
  {
    const list = await fetch(`${BASE}/api/products-search?q=${encodeURIComponent(searchKey)}`).then(r => r.json());
    const included = Array.isArray(list) && list.some((p: any) => String(p.product_code) === code);
    step("원상복구 후 일반 검색에서 재포함", included, { hits: Array.isArray(list) ? list.length : -1 });
  }

  console.log("──────────────────────────────────────");
  console.log(`  합계: PASS ${pass} · FAIL ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
