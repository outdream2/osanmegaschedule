/**
 * scripts/check-confirmed-sync.mjs
 *
 * ocr_confirmed_items → purchase_details 백필 스크립트.
 *
 * 사용법:
 *   node scripts/check-confirmed-sync.mjs          # dry-run (실제 insert 없음)
 *   node scripts/check-confirmed-sync.mjs --write  # 실제 insert
 *
 * 필요 env: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
 *   (또는 SUPABASE_URL / SUPABASE_ANON_KEY)
 */

import { createClient } from "@supabase/supabase-js";

const url  = process.env.VITE_SUPABASE_URL  ?? process.env.SUPABASE_URL;
const key  = process.env.VITE_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY;
const WRITE = process.argv.includes("--write");

if (!url || !key) {
  console.error("VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY 환경변수가 필요합니다.");
  process.exit(1);
}

const supabase = createClient(url, key);

async function main() {
  console.log(`모드: ${WRITE ? "WRITE (실제 insert)" : "DRY-RUN (확인만)"}\n`);

  // 1) ocr_confirmed_items 전체 조회
  const { data: confirmed, error: fetchErr } = await supabase
    .from("ocr_confirmed_items")
    .select("id, saved_at, supplier, product_code, product_name, quantity, unit_price, amount")
    .order("id", { ascending: true });

  if (fetchErr) {
    console.error("ocr_confirmed_items 조회 실패:", fetchErr.message);
    process.exit(1);
  }

  console.log(`ocr_confirmed_items 총 ${confirmed.length}건`);

  let inserted = 0;
  let skipped  = 0;
  let noCode   = 0;

  for (const item of confirmed) {
    if (!item.product_code) {
      console.log(`  [SKIP · no code] id=${item.id} ${item.product_name}`);
      noCode++;
      continue;
    }

    const purchaseDate = item.saved_at;
    const supplierName = item.supplier;
    const productCode  = item.product_code;
    const qty  = Number(item.quantity  ?? 0);
    const amt  = Number(item.amount    ?? 0);

    // 중복 확인
    const { count } = await supabase
      .from("purchase_details")
      .select("id", { count: "exact", head: true })
      .eq("purchase_date", purchaseDate)
      .eq("product_code",  productCode)
      .eq("supplier_name", supplierName)
      .eq("quantity",      qty)
      .eq("amount",        amt);

    if ((count ?? 0) > 0) {
      console.log(`  [DUP · skip] id=${item.id} ${productCode} ${purchaseDate}`);
      skipped++;
      continue;
    }

    if (!WRITE) {
      console.log(`  [WOULD INSERT] id=${item.id} ${productCode} / ${supplierName} / ${purchaseDate} qty=${qty} amt=${amt}`);
      inserted++;
      continue;
    }

    const { error: insErr } = await supabase.from("purchase_details").insert({
      purchase_date:     purchaseDate,
      supplier_name:     supplierName,
      product_code:      productCode,
      product_name:      item.product_name,
      quantity:          qty,
      unit_price:        Number(item.unit_price ?? 0),
      amount:            amt,
      total:             amt,
      vat:               0,
      period_start_date: null,
      period_type:       null,
    });

    if (insErr) {
      console.error(`  [ERROR] id=${item.id} ${productCode}: ${insErr.message}`);
    } else {
      console.log(`  [INSERTED] id=${item.id} ${productCode} / ${supplierName} / ${purchaseDate}`);
      inserted++;
    }
  }

  console.log(`\n완료 — inserted=${inserted} skipped(dup)=${skipped} noCode=${noCode}`);
  if (!WRITE && inserted > 0) {
    console.log("실제 insert 하려면 --write 플래그를 추가하세요.");
  }
}

main().catch(e => { console.error(e); process.exit(1); });
