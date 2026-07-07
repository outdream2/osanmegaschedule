// 재고흐름 range aggregation 검증
//  1. 기본(months 없음): 오늘 dd 기준 현재 기간(초/중/하순) 스냅샷 반환하는지
//  2. months=3: 최근 3개월 aggregation 시 상품별 SUM 정확한지 (raw DB 계산과 비교)
//  3. 모든 sort key (name, opening, sale, purchase, closing, current, amount, loss) → 서버가 지원 안하는 것도 200 반환
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
  console.log("──────── 재고흐름 range 검증 ────────\n");

  // (1) 기본 요청 (months 없음): 오늘 기준 현재 period_type 스냅샷 반환
  console.log("① 기본 요청 (오늘 dd 기준 현재 기간 스냅샷)");
  {
    const today = new Date();
    const dd = today.getDate();
    const currentPeriod = dd <= 10 ? "early" : dd <= 20 ? "mid" : "late";
    console.log(`  오늘 = dd${dd} · 현재 period = ${currentPeriod}`);

    const r = await fetch(`${BASE}/api/stock-manage/top-sales?limit=10`);
    step("200 응답", r.ok);
    const j = await r.json();
    step("snapshot_date 반환", !!j.snapshot_date, { snapshot: j.snapshot_date });
    step(`period_type=${currentPeriod} 반환 (오늘 기간 매칭)`, j.period_type === currentPeriod, { returned: j.period_type });
  }

  // (2) months=3 aggregation 검증
  console.log("\n② months=3 aggregation");
  {
    const r = await fetch(`${BASE}/api/stock-manage/top-sales?months=3&sort=sale&dir=desc&limit=5`);
    step("200 응답", r.ok);
    const j = await r.json();
    step("months=3 응답 필드", j.months === 3, { months: j.months });
    step("cutoff 있음", !!j.cutoff);
    step("dates 배열 (여러 스냅샷 포함)", Array.isArray(j.dates) && j.dates.length >= 2, { count: j.dates?.length });

    if (j.rows?.length > 0) {
      const target = j.rows[0];
      const code = target.product_code;
      console.log(`  검증 대상 상품: #${code} · ${target.product_name}`);
      console.log(`  API 응답: 매입=${target.purchase_qty}, 판매=${target.sale_qty}, 시작=${target.opening_stock}, 종료=${target.closing_stock}`);

      // Raw DB 로 직접 aggregation 계산해 비교
      const cutoffDate = new Date(j.cutoff);
      const { data: raw } = await s
        .from("stock_history")
        .select("snapshot_date, opening_stock, purchase_qty, sale_qty, closing_stock")
        .eq("product_code", code)
        .gte("snapshot_date", j.cutoff)
        .order("snapshot_date", { ascending: true });

      const expected = {
        purchase_qty: (raw ?? []).reduce((n, r) => n + Number((r as any).purchase_qty ?? 0), 0),
        sale_qty:     (raw ?? []).reduce((n, r) => n + Number((r as any).sale_qty ?? 0), 0),
        opening_stock: Number((raw?.[0] as any)?.opening_stock ?? 0),
        closing_stock: Number((raw?.[raw.length - 1] as any)?.closing_stock ?? 0),
      };
      console.log(`  DB 계산 : 매입=${expected.purchase_qty}, 판매=${expected.sale_qty}, 시작=${expected.opening_stock}, 종료=${expected.closing_stock}`);

      step("매입 aggregation 일치", Math.abs(expected.purchase_qty - Number(target.purchase_qty)) < 0.01);
      step("판매 aggregation 일치", Math.abs(expected.sale_qty - Number(target.sale_qty)) < 0.01);
      step("opening_stock = 첫 스냅샷 값", expected.opening_stock === Number(target.opening_stock));
      step("closing_stock = 마지막 스냅샷 값", expected.closing_stock === Number(target.closing_stock));
    }
  }

  // (3) 다양한 sort 옵션
  console.log("\n③ sort 옵션 (지원되지 않는 sort도 정상 응답)");
  {
    for (const sort of ["sale", "purchase", "amount", "closing", "name", "opening", "current", "loss"]) {
      const r = await fetch(`${BASE}/api/stock-manage/top-sales?sort=${sort}&limit=3`);
      step(`sort=${sort}`, r.ok && (await r.json()).rows !== undefined);
    }
  }

  // (4) months=1/2/3/4/5/6 모두 응답
  console.log("\n④ months=1..6 정상 응답");
  {
    for (const m of [1, 2, 3, 4, 5, 6]) {
      const r = await fetch(`${BASE}/api/stock-manage/top-sales?months=${m}&limit=1`);
      const j = await r.json();
      step(`months=${m} → months 응답 필드`, r.ok && j.months === m);
    }
  }

  console.log("\n──────────────────────────────────────");
  console.log(`  합계: PASS ${pass} · FAIL ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
