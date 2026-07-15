// purchase.ts 임포트 로직 시뮬 (서버 없이 실제 xlsx → DB insert 흐름)
import XLSX from "xlsx";
import { createClient } from "@supabase/supabase-js";
import "dotenv/config";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const parseNum = v => {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  if (v == null || v === "") return 0;
  const n = parseFloat(String(v).replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};
const findCol = (headers, patterns) => {
  for (const p of patterns) {
    const i = headers.findIndex(h => p.test(h));
    if (i >= 0) return i;
  }
  return -1;
};

const wb = XLSX.readFile("src/매입상세현황_2026-0701_07-15.xlsx");
const arr = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" });

// Row 결합 헤더 (중복만 접두어)
const row0Arr = arr[0] ?? [];
const row1Arr = arr[1] ?? [];
const labelCounts = new Map();
row1Arr.forEach(h => { const l = String(h ?? "").trim(); if (l) labelCounts.set(l, (labelCounts.get(l) ?? 0) + 1); });
const headers = row1Arr.map((h, i) => {
  const label = String(h ?? "").trim();
  const cat = String(row0Arr[i] ?? "").trim();
  const isDup = (labelCounts.get(label) ?? 0) > 1;
  if (isDup && cat && cat !== label) return `${cat}_${label}`;
  return label;
});
const dataRows = arr.slice(2);

const codeI = findCol(headers, [/^상품\s*코드$/, /^코드$/]);
const nameI = findCol(headers, [/^상품\s*명$/, /^품명$/, /^명$/]);
const qtyI = findCol(headers, [/^매입합계[_ ]?수량$/, /^수량$/]);
const amountI = findCol(headers, [/^매입합계[_ ]?금액$/, /^금액$/]);
const priceI = findCol(headers, [/평균매입단가/]);
const returnQtyI = findCol(headers, [/^반품[_ ]?수량$/]);
const returnAmtI = findCol(headers, [/^반품[_ ]?금액$/]);

console.log(`매핑: code=${codeI} name=${nameI} qty=${qtyI} amount=${amountI} price=${priceI} returnQty=${returnQtyI} returnAmt=${returnAmtI}`);
console.log(`파일명 날짜: 2026-07-01 ~ 2026-07-15`);

const now = new Date().toISOString();
const parsed = [];
const inferredFrom = "2026-07-01", inferredTo = "2026-07-15";
const summaryDate = inferredTo;
const summaryPeriodStart = inferredFrom;
const dd = Number(inferredTo.slice(8, 10));
const periodType = dd <= 10 ? "early" : dd <= 20 ? "mid" : "late";

for (const r of dataRows) {
  if (!Array.isArray(r)) continue;
  const code = String(r[codeI] ?? "").trim();
  if (!code) continue;
  const qty = qtyI >= 0 ? parseNum(r[qtyI]) : 0;
  const amt = amountI >= 0 ? parseNum(r[amountI]) : 0;
  const returnQty = returnQtyI >= 0 ? parseNum(r[returnQtyI]) : 0;
  const returnAmt = returnAmtI >= 0 ? parseNum(r[returnAmtI]) : 0;
  if (qty === 0 && amt === 0) continue;
  parsed.push({
    purchase_date: summaryDate,
    period_start_date: summaryPeriodStart,
    period_type: periodType,
    supplier_code: null,
    supplier_name: null,
    product_code: code,
    product_name: nameI >= 0 ? String(r[nameI] ?? "").trim() || null : null,
    spec: null,
    quantity: qty - returnQty,
    unit_price: priceI >= 0 ? parseNum(r[priceI]) : 0,
    amount: amt - returnAmt,
    vat: 0,
    total: amt - returnAmt,
    imported_at: now,
  });
}
console.log(`\n파싱: ${parsed.length}행`);

// 첫 5행 fallback 시뮬 (period 제거 + plain insert)
const testChunk = parsed.slice(0, 3).map(({period_type, period_start_date, ...rest}) => rest);
console.log(`\n첫 3행 sample (period 제거):`);
console.log(JSON.stringify(testChunk, null, 2).slice(0, 800));

// FULL SIM: 서버 새 코드 그대로 시뮬
console.log(`\n═══ 전체 566행 임포트 시뮬 ═══`);
// 프로브
const probeRow = { ...parsed[0], product_code: `__PROBE__${Date.now()}` };
let strip = false, plain = false;
const r = await sb.from("purchase_details").upsert([probeRow], { onConflict: "purchase_date,supplier_code,product_code,quantity,amount", ignoreDuplicates: true });
if (r.error) {
  if (/period_type|period_start_date/i.test(r.error.message)) strip = true;
  if (/unique|exclusion/i.test(r.error.message)) plain = true;
  const p2 = strip ? (({period_type, period_start_date, ...rest}) => rest)(probeRow) : probeRow;
  const r2 = plain ? await sb.from("purchase_details").insert([p2]) : await sb.from("purchase_details").upsert([p2], { onConflict: "...", ignoreDuplicates: true });
  if (r2.error) {
    if (/unique|exclusion/i.test(r2.error.message)) plain = true;
    if (/period_type|period_start_date/i.test(r2.error.message)) strip = true;
  }
}
await sb.from("purchase_details").delete().like("product_code", "__PROBE__%");
console.log(`프로브 결과: strip=${strip} · plain=${plain}`);

// 기존 기간 삭제
const {count: pre} = await sb.from("purchase_details").select("*", { count:"exact", head:true }).gte("purchase_date", inferredFrom).lte("purchase_date", inferredTo);
console.log(`기존 기간 ${inferredFrom}~${inferredTo}: ${pre}행 (삭제)`);
if (pre > 0) await sb.from("purchase_details").delete().gte("purchase_date", inferredFrom).lte("purchase_date", inferredTo);

// 청크 저장
let inserted = 0;
const CHUNK = 500;
for (let i = 0; i < parsed.length; i += CHUNK) {
  const chunk = strip ? parsed.slice(i, i+CHUNK).map(({period_type, period_start_date, ...rest}) => rest) : parsed.slice(i, i+CHUNK);
  const {error} = plain
    ? await sb.from("purchase_details").insert(chunk)
    : await sb.from("purchase_details").upsert(chunk, { onConflict: "purchase_date,supplier_code,product_code,quantity,amount", ignoreDuplicates: true });
  if (error) { console.log(`chunk ${i}: ❌ ${error.message}`); }
  else { inserted += chunk.length; }
}
console.log(`\n총 저장: ${inserted}/${parsed.length}행`);

const {count: after} = await sb.from("purchase_details").select("*", {count:"exact", head:true});
console.log(`DB 총 행수: ${after}`);
