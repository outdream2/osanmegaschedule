// READ ONLY · purchase_details 날짜 분포 + 사용처 분석
import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const PAGE = 1000;

const monthHist = new Map();
const supplierSet = new Set();
let total = 0, verifiedRows = 0, hasExpiry = 0;
let minDate = null, maxDate = null;
let totalAmount = 0, totalQty = 0;
let from = 0;
while (true) {
  const { data, error } = await supabase.from("purchase_details")
    .select("purchase_date, supplier_code, supplier_name, quantity, total, amount, verified_by, verify_status, expiry_date")
    .range(from, from + PAGE - 1);
  if (error) { console.error(error); break; }
  if (!data || !data.length) break;
  for (const r of data) {
    total++;
    const m = (r.purchase_date || "").slice(0, 7);
    monthHist.set(m, (monthHist.get(m) || 0) + 1);
    if (!minDate || r.purchase_date < minDate) minDate = r.purchase_date;
    if (!maxDate || r.purchase_date > maxDate) maxDate = r.purchase_date;
    if (r.verified_by) verifiedRows++;
    if (r.expiry_date) hasExpiry++;
    if (r.supplier_name) supplierSet.add(r.supplier_name);
    totalAmount += Number(r.total ?? r.amount ?? 0);
    totalQty += Number(r.quantity ?? 0);
  }
  if (data.length < PAGE) break;
  from += PAGE;
}
console.log(`purchase_details total: ${total}`);
console.log(`date range: ${minDate} ~ ${maxDate}`);
console.log(`verified_by non-empty: ${verifiedRows}`);
console.log(`expiry_date non-empty: ${hasExpiry}`);
console.log(`unique suppliers: ${supplierSet.size}`);
console.log(`total qty: ${totalQty.toLocaleString()}`);
console.log(`total amount: ${totalAmount.toLocaleString()}`);
console.log(`\n월별 row count + 월별 amount:`);
const monthAmt = new Map();
from = 0;
while (true) {
  const { data } = await supabase.from("purchase_details").select("purchase_date, total, amount, quantity").range(from, from + PAGE - 1);
  if (!data || !data.length) break;
  for (const r of data) {
    const m = (r.purchase_date || "").slice(0, 7);
    const a = Number(r.total ?? r.amount ?? 0);
    monthAmt.set(m, (monthAmt.get(m) || 0) + a);
  }
  if (data.length < PAGE) break;
  from += PAGE;
}
[...monthHist.entries()].sort().forEach(([k, v]) => console.log(`  ${k} : rows=${v.toString().padStart(5)} · amount=${(monthAmt.get(k) || 0).toLocaleString()}`));
