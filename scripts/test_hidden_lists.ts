// 숨김 처리된 상품이 각 리스트에서 제외되는지 확인
//   1. low-stock (적정재고 이하)
//   2. top-sales (재고흐름)
//   3. zone-mismatches (구역 mismatch)
//   4. stock-check (barcode 스캔)
//   5. products-search (일반 검색)
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
  console.log("──────── 숨김 상품 리스트 제외 확인 ────────");

  // 적정재고 이하 리스트에서 실제 존재하는 상품 하나 선택 (그것을 숨겨서 다시 조회 시 사라지는지 확인)
  const lowRes = await fetch(`${BASE}/api/stock-manage/low-stock`).then(r => r.json());
  const lowList: any[] = Array.isArray(lowRes) ? lowRes : [];
  if (lowList.length === 0) {
    console.error("적정재고 이하 리스트가 비어있어 테스트 대상 없음");
    process.exit(1);
  }
  const target = lowList[0];
  const code = String(target.product_code);
  const name = String(target.product_name);
  console.log(`  대상 · code=${code} · name="${name}"`);
  console.log(`  숨기기 전 low-stock 총 ${lowList.length}건`);

  // 상품명 앞 3자로 stock-check + products-search 확인
  const searchKey = name.slice(0, Math.min(3, name.length));

  // (1) 숨김 처리 (직접 DB 조작 · Supabase RLS 우회)
  await supabase.from("products").update({ hidden: true }).eq("product_code", code);
  step("hidden=true 세팅", true);

  // (2) low-stock 재조회 → 이 상품이 없어야 함
  {
    const list = await fetch(`${BASE}/api/stock-manage/low-stock`).then(r => r.json());
    const included = Array.isArray(list) && list.some((p: any) => String(p.product_code) === code);
    step("low-stock 에서 제외", !included, { count: Array.isArray(list) ? list.length : -1 });
  }

  // (3) top-sales 재조회 → 이 상품이 없어야 함 (있었다면)
  {
    const res = await fetch(`${BASE}/api/stock-manage/top-sales?limit=500`).then(r => r.json());
    const list: any[] = Array.isArray(res.rows) ? res.rows : [];
    const included = list.some((p: any) => String(p.product_code) === code);
    step("top-sales(재고흐름) 에서 제외", !included, { rows: list.length });
  }

  // (4) zone-mismatches → 이 상품이 없어야 함 (있었다면)
  {
    const list = await fetch(`${BASE}/api/zone-mismatches`).then(r => r.json());
    const included = Array.isArray(list) && list.some((p: any) => String(p.product_code) === code);
    step("zone-mismatches 에서 제외", !included);
  }

  // (5) stock-check (바코드 스캔 화면 검색) → 이 상품이 없어야 함
  {
    const list = await fetch(`${BASE}/api/stock-check?q=${encodeURIComponent(searchKey)}`).then(r => r.json());
    const included = Array.isArray(list) && list.some((p: any) => String(p.product_name) === name);
    step("stock-check 검색에서 제외", !included, { hits: Array.isArray(list) ? list.length : -1 });
  }

  // (6) products-search → 제외
  {
    const list = await fetch(`${BASE}/api/products-search?q=${encodeURIComponent(searchKey)}`).then(r => r.json());
    const included = Array.isArray(list) && list.some((p: any) => String(p.product_code) === code);
    step("products-search 에서 제외", !included, { hits: Array.isArray(list) ? list.length : -1 });
  }

  // (원복) 숨김 해제
  await supabase.from("products").update({ hidden: false }).eq("product_code", code);
  step("hidden=false 원복", true);

  // (7) 원복 후 low-stock 재포함
  {
    const list = await fetch(`${BASE}/api/stock-manage/low-stock`).then(r => r.json());
    const included = Array.isArray(list) && list.some((p: any) => String(p.product_code) === code);
    step("원복 후 low-stock 에 재포함", included, { count: Array.isArray(list) ? list.length : -1 });
  }

  console.log("──────────────────────────────────────");
  console.log(`  합계: PASS ${pass} · FAIL ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
