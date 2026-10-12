// READ ONLY · Scan products.display_location values and bucket by classifyProduct result.
// Goal: find top "unknown" location strings so we can extend classifyProduct rules.
//
// Mirrors src/utils/productClassify.ts classify logic.

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

function normalizeFullWidthLetters(s) {
  return s.replace(/Ａ/g, "A").replace(/Ｂ/g, "B").replace(/Ｃ/g, "C").replace(/Ｄ/g, "D");
}

function classifyProduct(location) {
  if (!location) return "unknown";
  const s = String(location).trim();
  if (!s) return "unknown";
  if (s.includes("뷰티")) return "cosmetics";
  if (s.includes("냉장고")) return "fridge";
  if (s.includes("물약")) return "liquid";
  if (s.includes("벽")) return "general";
  const madae10 = s.match(/(\d{2,})매대/);
  if (madae10) {
    const n = parseInt(madae10[1], 10);
    if (Number.isFinite(n) && n >= 10) return "general";
  }
  if (/(?:^|[^0-9])[1-9]매대/.test(s)) return "stationery";
  const normalized = normalizeFullWidthLetters(s);
  const first = normalized.split(/[\/\-_\s]/)[0]?.trim() ?? normalized;
  if (/^[1-9][A-Z]/.test(first)) return "stationery";
  if (/^\d+$/.test(first)) {
    const n = parseInt(first, 10);
    if (Number.isFinite(n)) {
      if (n >= 10) return "general";
      if (n >= 1) return "stationery";
    }
  }
  return "unknown";
}

// ">전체" 꼬리 반복을 제거해서 "본질 위치"만 추출
function stripJeonchae(s) {
  let x = String(s).trim();
  // 끝에 붙은 ">전체" 반복 제거
  while (/>\s*전체\s*$/.test(x)) x = x.replace(/>\s*전체\s*$/, "").trim();
  return x;
}

const PAGE = 1000;
let from = 0;
const buckets = { stationery: 0, general: 0, cosmetics: 0, fridge: 0, liquid: 0, unknown: 0, null_location: 0 };
const unknownRawCounts = new Map();     // 원본 전체 문자열별
const unknownBaseCounts = new Map();    // ">전체" 꼬리 제거 후 본질별
const unknownSamples = new Map();       // base → 샘플 pcode
let total = 0;

while (true) {
  const { data, error } = await supabase
    .from("products")
    .select("pcode, product_name, display_location")
    .range(from, from + PAGE - 1);
  if (error) { console.error(error.message); break; }
  if (!data || data.length === 0) break;
  for (const r of data) {
    total++;
    const loc = r.display_location;
    if (!loc) { buckets.null_location++; continue; }
    const cls = classifyProduct(loc);
    buckets[cls]++;
    if (cls === "unknown") {
      unknownRawCounts.set(loc, (unknownRawCounts.get(loc) ?? 0) + 1);
      const base = stripJeonchae(loc);
      unknownBaseCounts.set(base, (unknownBaseCounts.get(base) ?? 0) + 1);
      if (!unknownSamples.has(base)) unknownSamples.set(base, []);
      const arr = unknownSamples.get(base);
      if (arr.length < 5) arr.push({ pcode: r.pcode, name: r.product_name });
    }
  }
  if (data.length < PAGE) break;
  from += PAGE;
}

console.log("Total products:", total);
console.log("Buckets:", buckets);
console.log(`Distinct unknown · raw=${unknownRawCounts.size} · base(>전체 제거)=${unknownBaseCounts.size}`);

const sortedBase = [...unknownBaseCounts.entries()].sort((a, b) => b[1] - a[1]);
console.log("\n=== 미분류 base location (>전체 꼬리 제거) ===");
for (const [base, n] of sortedBase) {
  console.log(`\n  [${n}건]  "${base}"`);
  const samples = unknownSamples.get(base) ?? [];
  for (const s of samples) {
    console.log(`         · ${s.pcode}  ${s.name ?? "(no name)"}`);
  }
}
