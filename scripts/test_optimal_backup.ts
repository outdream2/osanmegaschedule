// 적정재고 백업/복원 flow 검증
//   1. 상품 하나 선택 → PATCH optimal_stock=999
//   2. products 테이블에서 optimal_stock, optimal_stock_backup 모두 999인지 확인 (PATCH가 backup 동기화)
//   3. optimal_stock 을 수동으로 null 로 wipe (ERP 임포트 시뮬)
//   4. RPC restore_optimal_stock_from_backup() 호출 → optimal_stock 이 999 로 복원되는지 확인
//   5. 원복 (원래 값으로 되돌림)
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
  console.log("──────── 적정재고 백업·복원 검증 ────────");

  const { data: sample } = await supabase
    .from("products")
    .select("product_code, product_name, optimal_stock, optimal_stock_backup")
    .not("optimal_stock", "is", null)
    .limit(1);
  if (!sample || sample.length === 0) { console.error("샘플 없음"); process.exit(1); }
  const target = sample[0];
  const code = String(target.product_code);
  const originalOpt = target.optimal_stock;
  const originalBackup = target.optimal_stock_backup;
  console.log(`  대상 · code=${code} · 원본 optimal=${originalOpt} · backup=${originalBackup}`);

  const TEST_VAL = "9998";

  // (1) PATCH → 999
  {
    const res = await fetch(`${BASE}/api/products/${encodeURIComponent(code)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ optimal_stock: TEST_VAL }),
    });
    step("PATCH optimal_stock=9998", res.ok);
  }

  // (2) 두 컬럼 모두 9998 인지 확인
  {
    const { data } = await supabase.from("products").select("optimal_stock, optimal_stock_backup").eq("product_code", code).maybeSingle();
    const ok = String(data?.optimal_stock) === TEST_VAL && String(data?.optimal_stock_backup) === TEST_VAL;
    step("optimal_stock + backup 동시 저장", ok, data);
  }

  // (3) optimal_stock 을 강제로 null 처리 (ERP 임포트 시뮬)
  await supabase.from("products").update({ optimal_stock: null }).eq("product_code", code);
  step("optimal_stock=null 강제 wipe", true);

  // (4) RPC 호출 → 복원 확인
  {
    const { data: rpcData, error: rpcErr } = await supabase.rpc("restore_optimal_stock_from_backup");
    step("RPC restore 호출", !rpcErr, { restored: rpcData });
  }
  {
    const { data } = await supabase.from("products").select("optimal_stock, optimal_stock_backup").eq("product_code", code).maybeSingle();
    step("복원 후 optimal_stock 이 9998", String(data?.optimal_stock) === TEST_VAL, data);
  }

  // (원복)
  await supabase.from("products")
    .update({ optimal_stock: originalOpt, optimal_stock_backup: originalBackup })
    .eq("product_code", code);
  step("원본 값 원복", true);

  console.log("──────────────────────────────────────");
  console.log(`  합계: PASS ${pass} · FAIL ${fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(e => { console.error(e); process.exit(1); });
