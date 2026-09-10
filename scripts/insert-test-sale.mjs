// scripts/insert-test-sale.mjs
// 2026-09-10 · 사용자 지시 · 테스트2상품1 · 오늘 날짜 · 판매량 2 반영
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_KEY;
if (!url || !key) { console.error("SUPABASE_URL / SUPABASE_KEY 미설정"); process.exit(1); }
const supabase = createClient(url, key);

const SEARCH = "테스트2상품1";
const ADD_QTY = 2;

const today = new Date();
const todayStr = today.toISOString().slice(0, 10);
const dd = today.getDate();
const period = dd <= 10 ? "early" : dd <= 20 ? "mid" : "late";

// 1. 상품 확인
const { data: prods, error: pErr } = await supabase
  .from("products")
  .select("product_code, product_name, sale_price, supplier")
  .ilike("product_name", `%${SEARCH}%`);
if (pErr) { console.error("product 조회 오류:", pErr.message); process.exit(1); }
if (!prods || prods.length === 0) { console.error(`상품 못 찾음: ${SEARCH}`); process.exit(1); }
if (prods.length > 1) console.warn(`여러 상품 매칭 (${prods.length}) · 첫 번째 사용:`, prods.map(p => p.product_name));
const prod = prods[0];
const code = prod.product_code;
const salePrice = Number(prod.sale_price ?? 0) || 0;
const addAmount = ADD_QTY * salePrice;
console.log(`대상: ${prod.product_name} (${code}) · 단가 ${salePrice.toLocaleString()}원 · 판매액 +${addAmount.toLocaleString()}원`);

// 2. 오늘 스냅샷 확인
const { data: existing, error: eErr } = await supabase
  .from("stock_history")
  .select("*")
  .eq("product_code", code)
  .eq("snapshot_date", todayStr)
  .maybeSingle();
if (eErr) { console.error("stock_history 조회 오류:", eErr.message); process.exit(1); }

if (existing) {
  const newQty = (Number(existing.sale_qty) || 0) + ADD_QTY;
  const newAmt = (Number(existing.total_amount) || 0) + addAmount;
  const { error } = await supabase
    .from("stock_history")
    .update({ sale_qty: newQty, total_amount: newAmt })
    .eq("product_code", code)
    .eq("snapshot_date", todayStr);
  if (error) { console.error("UPDATE 오류:", error.message); process.exit(1); }
  console.log(`UPDATE 완료 · sale_qty ${existing.sale_qty ?? 0} → ${newQty} · total_amount ${existing.total_amount ?? 0} → ${newAmt}`);
} else {
  const row = {
    snapshot_date: todayStr,
    period_type: period,
    product_code: code,
    product_name: prod.product_name,
    supplier_name: prod.supplier ?? null,
    opening_stock: 0,
    purchase_qty: 0,
    sale_qty: ADD_QTY,
    disposal_qty: 0,
    closing_stock: 0,
    total_amount: addAmount,
  };
  const { error } = await supabase.from("stock_history").insert(row);
  if (error) { console.error("INSERT 오류:", error.message); process.exit(1); }
  console.log(`INSERT 완료 · ${JSON.stringify(row, null, 2)}`);
}

console.log("\n✔ 완료");
