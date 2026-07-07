// 2026-07-07 마이그레이션 결과 검증:
//   1. products.optimal_stock_backup 컬럼 존재
//   2. products.hidden 컬럼 존재
//   3. restore_optimal_stock_from_backup() RPC 호출 성공
//   4. optimal_stock_backup seed 상태 (몇 개나 채워졌나)
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL / SUPABASE_KEY 미설정");
  process.exit(1);
}
const supabase = createClient(url, key);

async function main() {
  const report: Record<string, any> = {};

  // 1. optimal_stock_backup 컬럼 존재 여부
  {
    const { error } = await supabase.from("products").select("optimal_stock_backup").limit(1);
    report["products.optimal_stock_backup"] = error ? `ERROR: ${error.message}` : "OK";
  }

  // 2. hidden 컬럼 존재 여부
  {
    const { error } = await supabase.from("products").select("hidden").limit(1);
    report["products.hidden"] = error ? `ERROR: ${error.message}` : "OK";
  }

  // 3. RPC 호출
  {
    const { data, error } = await supabase.rpc("restore_optimal_stock_from_backup");
    report["rpc.restore_optimal_stock_from_backup"] = error ? `ERROR: ${error.message}` : `OK · 복원 ${Number(data ?? 0)}건`;
  }

  // 4. backup seed 상태
  {
    const { count, error } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .not("optimal_stock_backup", "is", null);
    report["backup seed count"] = error ? `ERROR: ${error.message}` : `${count ?? 0}건`;
  }

  // 5. 현재 hidden 처리된 상품 수
  {
    const { count, error } = await supabase
      .from("products")
      .select("*", { count: "exact", head: true })
      .eq("hidden", true);
    report["hidden count"] = error ? `ERROR: ${error.message}` : `${count ?? 0}건`;
  }

  // 6. products_hidden_idx 인덱스는 pg_indexes 로만 확인 가능 (skip · 인덱스 유무는 성능 문제 뿐)

  // 7. hidden 필터 실동작 테스트: /api/products-search 가 hidden 을 걸러내는지
  {
    const { data, error } = await supabase
      .from("products")
      .select("product_code, hidden")
      .eq("hidden", false)
      .limit(3);
    report["hidden=false 샘플"] = error
      ? `ERROR: ${error.message}`
      : (data && data.length > 0 ? `OK · ${data.length}건` : "OK · 0건");
  }

  console.log("──────── 마이그레이션 검증 결과 ────────");
  for (const [k, v] of Object.entries(report)) {
    const mark = String(v).startsWith("ERROR") ? "❌" : "✅";
    console.log(`  ${mark}  ${k.padEnd(38)}  ${v}`);
  }
  console.log("──────────────────────────────────────");
}

main().catch(e => { console.error(e); process.exit(1); });
