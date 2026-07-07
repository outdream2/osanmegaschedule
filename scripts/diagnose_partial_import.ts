import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
const s = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_KEY!);

(async () => {
  // 2026-05-20 과 2026-05-31 어떤 특성 상품 위주로 저장됐는지 확인
  for (const date of ["2026-05-20", "2026-05-31"]) {
    const { data } = await s
      .from("stock_history")
      .select("product_code, product_name, supplier_name, opening_stock, purchase_qty, sale_qty, closing_stock")
      .eq("snapshot_date", date)
      .limit(100);
    console.log(`\n─── ${date} 저장된 ${data?.length ?? 0}행 샘플 ───`);
    if (data && data.length > 0) {
      const bySupplier = new Map<string, number>();
      for (const r of data) {
        const k = String((r as any).supplier_name ?? "(no supplier)");
        bySupplier.set(k, (bySupplier.get(k) ?? 0) + 1);
      }
      console.log("공급사별 분포:");
      for (const [sup, n] of Array.from(bySupplier.entries()).sort((a, b) => b[1] - a[1]).slice(0, 15)) {
        console.log(`  ${sup.padEnd(30)}  ${n}행`);
      }
      console.log("\n첫 3행 상세:");
      for (const r of data.slice(0, 3)) {
        console.log(`  ${(r as any).product_code} · ${(r as any).product_name} · ${(r as any).supplier_name} · 시작=${(r as any).opening_stock} 매입=${(r as any).purchase_qty} 판매=${(r as any).sale_qty} 종료=${(r as any).closing_stock}`);
      }
    }
  }

  // 정상 임포트된 2026-06-30 과 비교
  const { count: c0630 } = await s.from("stock_history").select("*", { count: "exact", head: true }).eq("snapshot_date", "2026-06-30");
  const { count: c0620 } = await s.from("stock_history").select("*", { count: "exact", head: true }).eq("snapshot_date", "2026-06-20");
  console.log(`\n비교: 2026-06-30 · ${c0630}행 · 2026-06-20 · ${c0620}행`);
})();
