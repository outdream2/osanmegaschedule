// 2026-10-01 · 공급사 명 매칭 추가 조사
//   · displayVendorName() 적용 후 매칭 가능 여부
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";

function loadEnv() {
  const raw = readFileSync(".env", "utf8");
  const env = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = /^([A-Z_]+)\s*=\s*"?([^"]*)"?\s*$/.exec(line);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

const env = loadEnv();
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_KEY);

const CORP_PREFIX_RE = /^(?:주식회사|㈜|㈔|㈕|\(주\))\s*/;
const CORP_SUFFIX_RE = /\s*(?:주식회사|㈜|㈔|㈕|\(주\))\s*$/;
const VAT_RE = /\s*\(\s*vat\s*(포함|미포함|별도|없음)?\s*\)\s*$/i;
const display = (s) => (s ?? "").toString().replace(VAT_RE, "").replace(CORP_PREFIX_RE, "").replace(CORP_SUFFIX_RE, "").trim();

async function fetchAll(table, select) {
  const PAGE = 1000;
  const all = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase.from(table).select(select).range(from, from + PAGE - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

const vendorRows = await fetchAll("vendors", "company_name");
const vendorNames = new Set(vendorRows.map(r => (r.company_name ?? "").trim()).filter(Boolean));
const vendorDisplay = new Map();
for (const n of vendorNames) vendorDisplay.set(display(n), n);

// products.supplier orphans
const products = await fetchAll("products", "supplier");
const prodSuppliers = new Set(products.map(p => (p.supplier ?? "").trim()).filter(Boolean));

console.log("=== 공급사 orphan · displayVendorName 매칭 검증 ===\n");
const results = { matched: [], unmatched: [], groupCollision: [] };

// 각 공급사의 display 이름이 어느 vendors 레코드와 매칭되는지
const displayToSources = new Map(); // display -> [sources]
for (const s of prodSuppliers) {
  const d = display(s);
  const arr = displayToSources.get(d) ?? [];
  arr.push(s);
  displayToSources.set(d, arr);
}
// vendors 도 추가
for (const v of vendorNames) {
  const d = display(v);
  const arr = displayToSources.get(d) ?? [];
  arr.push(`[vendor] ${v}`);
  displayToSources.set(d, arr);
}

const groups = {};
for (const [d, arr] of displayToSources) {
  if (arr.length > 1) {
    groups[d] = arr;
  }
}

console.log("display 이름 기준 · 중복 그룹 (products.supplier + vendors):");
for (const [d, arr] of Object.entries(groups)) {
  console.log(`  "${d}" <- [${arr.join(" | ")}]`);
}

// orphan 중 vendors 와 display 일치하는지
const orphans = ["CMG", "HMP", "ㅇㅇㅇㄱ", "고려은단", "다원엠디", "대웅", "대원", "동국", "디딤푸드", "마더스",
                "메가타운", "메가헬스케어", "바로팜 비알피랩스", "바로팜 켄뷰", "바로팜직접주문", "보령컨슈머",
                "복산나이스", "에프앤디넷", "엠아이에이뉴트라_", "제일헬스", "주식회사 소연", "쥴릭파마",
                "지오영", "천호바이오", "컨디션", "켄뷰", "코오롱제약", "한가람약품", "한신바이오팜",
                "한신약품", "한풍제약"];

console.log("\n orphan 공급사 · displayVendorName 매칭 검증:");
for (const o of orphans) {
  const d = display(o);
  const match = vendorDisplay.get(d);
  if (match) {
    console.log(`  "${o}" -> display: "${d}" -> vendor: "${match}" (매칭 OK · 그러나 raw 데이터 미등록)`);
  } else {
    console.log(`  "${o}" -> display: "${d}" -> 매칭 vendor 없음 (완전 미등록)`);
  }
}
