// 판매추이 API 3개 endpoint E2E 테스트
//   1. /api/sales-trend/overview     — 전체 기간별 총합
//   2. /api/sales-trend/product      — 상품 하나의 시계열
//   3. /api/sales-trend/supplier     — 공급사 하나의 기간별 합계
// + 데이터 aggregation 정확성 검증 (client 계산 vs API 응답)
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);
const BASE = "http://localhost:3000";

let pass = 0, fail = 0;
const step = (label: string, ok: boolean, detail?: any) => {
  const mark = ok ? "✅" : "❌";
  console.log(`  ${mark}  ${label}${detail !== undefined ? `  ${JSON.stringify(detail).slice(0, 200)}` : ""}`);
  ok ? pass++ : fail++;
};

async function main() {
  console.log("──────── 판매추이 API E2E 테스트 ────────\n");

  // (1) /api/sales-trend/overview
  console.log("① /api/sales-trend/overview");
  {
    const res = await fetch(`${BASE}/api/sales-trend/overview`);
    step("200 응답", res.ok);
    const j = await res.json();
    const rows = j.rows as any[];
    step("rows 배열 반환", Array.isArray(rows), { rowCount: rows?.length });
    step("최소 5개 기간", (rows?.length ?? 0) >= 5, { rowCount: rows?.length });
    // 스키마 검증
    if (rows.length > 0) {
      const r0 = rows[0];
      const required = ["period_start_date", "snapshot_date", "period_type", "product_count", "purchase_qty", "sale_qty", "closing_stock", "supply_amount", "total_amount"];
      const missing = required.filter(k => !(k in r0));
      step("필수 필드 모두 존재", missing.length === 0, { missing });
      // 오름차순 정렬 확인
      const dates = rows.map((r: any) => r.period_start_date);
      const sorted = [...dates].sort();
      step("period_start_date 오름차순 정렬", JSON.stringify(dates) === JSON.stringify(sorted));
    }
    // 서버 aggregation 검증: 직접 supabase에서 fetch하여 비교
    const bySnap = new Map<string, { sale: number; purchase: number; count: number }>();
    let from = 0;
    const PAGE = 1000;
    while (true) {
      const { data } = await s.from("stock_history").select("period_start_date, sale_qty, purchase_qty").range(from, from + PAGE - 1);
      if (!data || data.length === 0) break;
      for (const r of data) {
        const k = String((r as any).period_start_date);
        if (!bySnap.has(k)) bySnap.set(k, { sale: 0, purchase: 0, count: 0 });
        const agg = bySnap.get(k)!;
        agg.sale += Number((r as any).sale_qty ?? 0);
        agg.purchase += Number((r as any).purchase_qty ?? 0);
        agg.count++;
      }
      if (data.length < PAGE) break;
      from += PAGE;
    }
    // 첫 3개 기간의 판매·매입 합 비교
    for (const r of rows.slice(0, 3)) {
      const expected = bySnap.get(r.period_start_date);
      if (!expected) continue;
      const okSale = Math.abs(expected.sale - Number(r.sale_qty)) < 0.01;
      const okPurchase = Math.abs(expected.purchase - Number(r.purchase_qty)) < 0.01;
      const okCount = expected.count === Number(r.product_count);
      step(`${r.period_start_date} · 판매/매입/상품수 일치`, okSale && okPurchase && okCount,
        { period: r.period_start_date, exp_sale: expected.sale, api_sale: r.sale_qty, exp_purchase: expected.purchase, api_purchase: r.purchase_qty, exp_count: expected.count, api_count: r.product_count });
    }
  }

  // (2) /api/sales-trend/product — 여러 스냅샷에 걸쳐 존재하는 상품 하나 선택
  console.log("\n② /api/sales-trend/product");
  {
    // 스냅샷 다수에 걸친 상품 찾기
    const { data: productCounts } = await s.from("stock_history").select("product_code").limit(20000);
    const codeMap = new Map<string, number>();
    for (const r of productCounts ?? []) {
      const c = String((r as any).product_code);
      codeMap.set(c, (codeMap.get(c) ?? 0) + 1);
    }
    const multiSnapshotCode = Array.from(codeMap.entries()).sort(([, a], [, b]) => b - a)[0]?.[0];
    if (!multiSnapshotCode) {
      step("스냅샷 다수에 걸친 상품 검색", false);
      return;
    }
    console.log(`  대상 상품: #${multiSnapshotCode} · ${codeMap.get(multiSnapshotCode)}개 스냅샷`);

    const res = await fetch(`${BASE}/api/sales-trend/product?code=${encodeURIComponent(multiSnapshotCode)}`);
    step("200 응답", res.ok);
    const j = await res.json();
    step("code 응답 필드", j.code === multiSnapshotCode);
    step(`rows.length=${codeMap.get(multiSnapshotCode)} 일치`, (j.rows?.length ?? 0) === codeMap.get(multiSnapshotCode));

    if (j.rows?.length > 0) {
      const r0 = j.rows[0];
      const required = ["period_start_date", "snapshot_date", "period_type", "supplier_name", "product_name", "opening_stock", "purchase_qty", "sale_qty", "closing_stock", "total_amount"];
      const missing = required.filter(k => !(k in r0));
      step("상품별 필수 필드 존재", missing.length === 0, { missing });
      // 오름차순 정렬
      const dates = j.rows.map((r: any) => r.period_start_date);
      const sorted = [...dates].sort();
      step("period_start_date 오름차순", JSON.stringify(dates) === JSON.stringify(sorted));
    }
  }

  // (3) /api/sales-trend/supplier — 공급사 하나 선택
  console.log("\n③ /api/sales-trend/supplier");
  {
    const { data: supplierRows } = await s.from("stock_history").select("supplier_name").limit(5000);
    const supMap = new Map<string, number>();
    for (const r of supplierRows ?? []) {
      const n = String((r as any).supplier_name ?? "").trim();
      if (!n) continue;
      supMap.set(n, (supMap.get(n) ?? 0) + 1);
    }
    const topSupplier = Array.from(supMap.entries()).sort(([, a], [, b]) => b - a)[0]?.[0];
    if (!topSupplier) {
      step("공급사 검색", false);
      return;
    }
    console.log(`  대상 공급사: ${topSupplier} · ${supMap.get(topSupplier)}행`);

    const res = await fetch(`${BASE}/api/sales-trend/supplier?name=${encodeURIComponent(topSupplier)}`);
    step("200 응답", res.ok);
    const j = await res.json();
    step("supplier 응답 필드", j.supplier === topSupplier);
    step("rows 반환", Array.isArray(j.rows) && j.rows.length > 0, { rowCount: j.rows?.length });

    if (j.rows?.length > 0) {
      const r0 = j.rows[0];
      const required = ["period_start_date", "product_count", "purchase_qty", "sale_qty", "closing_stock", "total_amount"];
      const missing = required.filter(k => !(k in r0));
      step("공급사별 필수 필드 존재", missing.length === 0, { missing });

      // aggregation 검증: 하나의 기간의 sale_qty 합산이 맞는지
      const targetPeriod = r0.period_start_date;
      const { data: raw } = await s.from("stock_history")
        .select("sale_qty, purchase_qty")
        .eq("supplier_name", topSupplier)
        .eq("period_start_date", targetPeriod);
      const expSale = (raw ?? []).reduce((n, r) => n + Number((r as any).sale_qty ?? 0), 0);
      const expPurchase = (raw ?? []).reduce((n, r) => n + Number((r as any).purchase_qty ?? 0), 0);
      const okSale = Math.abs(expSale - Number(r0.sale_qty)) < 0.01;
      const okPurchase = Math.abs(expPurchase - Number(r0.purchase_qty)) < 0.01;
      step(`${targetPeriod} · 판매/매입 aggregation 정확`, okSale && okPurchase,
        { exp_sale: expSale, api_sale: r0.sale_qty, exp_purchase: expPurchase, api_purchase: r0.purchase_qty });
    }
  }

  // (4) 에러 응답 검증
  console.log("\n④ 에러 응답 검증");
  {
    const r1 = await fetch(`${BASE}/api/sales-trend/product`);
    step("code 없이 요청 시 400", r1.status === 400);
    const r2 = await fetch(`${BASE}/api/sales-trend/supplier`);
    step("name 없이 요청 시 400", r2.status === 400);
    const r3 = await fetch(`${BASE}/api/sales-trend/product?code=NONEXISTENT_CODE_XYZ`);
    const j3 = await r3.json();
    step("존재하지 않는 code · 빈 rows 반환", r3.status === 200 && Array.isArray(j3.rows) && j3.rows.length === 0);
  }

  console.log("\n──────────────────────────────────────");
  console.log(`  합계: PASS ${pass} · FAIL ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
