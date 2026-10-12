// tools/vendor-duplicate-audit-2026-10-07.mjs
// 2026-10-07 · 사용자 지시 · VENDOR DUPLICATE AUDIT (READ ONLY)
//
// 조사 범위:
//   1. vendors 테이블 내부 duplicate (ct_code · supplier_code · business_number · normalized name)
//   2. 매칭 분류 (TRUE_DUPLICATE · MULTI_CTCODE_SAME_SUPPLIER · NAME_COLLISION · DATA_QUALITY)
//   3. relation 정합성 체크:
//      · purchase_details.supplier_code → vendors.ct_code (UNMAPPED · NULL)
//      · products.supplier_code → vendors.ct_code
//      · order_requests.supplier_code → vendors.ct_code
//
// 결과:
//   output/vendor-duplicate-audit-2026-10-07.md
//
// 금지: WRITE · UPDATE · DELETE · INSERT

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class { constructor() { throw new Error("REST only"); } };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = resolve(__dirname, "..");

function parseEnv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("="); if (eq < 0) continue;
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[t.slice(0, eq).trim()] = v;
  }
  return out;
}
const env = parseEnv(resolve(projectRoot, ".env"));
const SUPABASE_URL = process.env.SUPABASE_URL || env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("ENV 미설정 · SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 필요");
  process.exit(1);
}
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

// ── helpers ──────────────────────────────────────────────────────────
function normalizeBizno(bz) {
  if (bz == null) return null;
  const d = String(bz).replace(/\D/g, "");
  if (!d) return null;
  if (/^0+$/.test(d)) return null;
  if (d.length < 10) return null;
  return d;
}
function normalizeName(name) {
  if (name == null) return null;
  let s = String(name).toLowerCase().trim();
  if (!s) return null;
  s = s.replace(/\(주\)/g, "").replace(/㈜/g, "").replace(/주식회사/g, "")
       .replace(/\(유\)/g, "").replace(/유한회사/g, "")
       .replace(/\(사\)/g, "").replace(/사단법인/g, "");
  s = s.replace(/\s+/g, "").replace(/[.,·\-_()\[\]{}'"!?@#$%^&*+=:;\\/]/g, "");
  return s || null;
}

async function fetchAll(table, cols) {
  const out = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await sb.from(table).select(cols).range(from, from + PAGE - 1);
    if (error) {
      // 컬럼 없는 테이블 (예: order_requests 가 아직 supplier_code 없으면) · 축소 재시도
      if (/column .* does not exist/i.test(error.message)) {
        return { rows: null, err: error.message };
      }
      if (/relation .* does not exist/i.test(error.message)) {
        return { rows: null, err: error.message };
      }
      throw new Error(`${table} fetch · ${error.message}`);
    }
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return { rows: out, err: null };
}

// ── collect ─────────────────────────────────────────────────────────
console.log("[audit] vendors fetching...");
let vendors;
{
  const trySelects = [
    "id, company_name, ct_code, supplier_code, business_number, phone, contact_name, category, note, created_at",
    "id, company_name, ct_code, business_number, phone, contact_name, category, note, created_at",
    "id, company_name, business_number, phone, contact_name, category, note, created_at",
  ];
  let last;
  for (const cols of trySelects) {
    const r = await fetchAll("vendors", cols);
    if (r.rows) { vendors = r.rows; last = null; break; }
    last = r.err;
  }
  if (!vendors) { console.error("vendors fetch fail · " + last); process.exit(1); }
}
console.log(`[audit] vendors: ${vendors.length} rows`);

console.log("[audit] purchase_details.supplier_code distinct fetching...");
const pdSupplierCount = new Map(); // code → row count
let pdNullCount = 0;
let pdTotal = 0;
{
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await sb.from("purchase_details").select("supplier_code").range(from, from + PAGE - 1);
    if (error) {
      console.error("purchase_details fetch · " + error.message);
      break;
    }
    if (!data || data.length === 0) break;
    for (const r of data) {
      pdTotal++;
      const c = r.supplier_code == null ? null : String(r.supplier_code).trim();
      if (!c) { pdNullCount++; continue; }
      pdSupplierCount.set(c, (pdSupplierCount.get(c) ?? 0) + 1);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
}
console.log(`[audit] purchase_details: ${pdTotal} rows · supplier_code NULL: ${pdNullCount} · distinct codes: ${pdSupplierCount.size}`);

console.log("[audit] products.supplier_code distinct fetching...");
const prodSupplierCount = new Map();
let prodNullCount = 0;
let prodTotal = 0;
{
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await sb.from("products").select("supplier_code").range(from, from + PAGE - 1);
    if (error) {
      console.error("products.supplier_code fetch · " + error.message);
      break;
    }
    if (!data || data.length === 0) break;
    for (const r of data) {
      prodTotal++;
      const c = r.supplier_code == null ? null : String(r.supplier_code).trim();
      if (!c) { prodNullCount++; continue; }
      prodSupplierCount.set(c, (prodSupplierCount.get(c) ?? 0) + 1);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
}
console.log(`[audit] products: ${prodTotal} rows · supplier_code NULL: ${prodNullCount} · distinct codes: ${prodSupplierCount.size}`);

console.log("[audit] order_requests.supplier_code distinct fetching...");
const orSupplierCount = new Map();
let orNullCount = 0;
let orTotal = 0;
let orErr = null;
{
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await sb.from("order_requests").select("supplier_code").range(from, from + PAGE - 1);
    if (error) {
      orErr = error.message;
      break;
    }
    if (!data || data.length === 0) break;
    for (const r of data) {
      orTotal++;
      const c = r.supplier_code == null ? null : String(r.supplier_code).trim();
      if (!c) { orNullCount++; continue; }
      orSupplierCount.set(c, (orSupplierCount.get(c) ?? 0) + 1);
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
}
if (orErr) console.log(`[audit] order_requests warning · ${orErr}`);
else console.log(`[audit] order_requests: ${orTotal} rows · supplier_code NULL: ${orNullCount} · distinct codes: ${orSupplierCount.size}`);

// ── duplicate 분석 ──────────────────────────────────────────────────
// A. ct_code 중복 (같은 code 가 vendors 에 여러 row)
const byCtCode = new Map(); // ct → [vendor]
for (const v of vendors) {
  const ct = v.ct_code == null ? null : String(v.ct_code).trim();
  if (!ct) continue;
  (byCtCode.get(ct) ?? byCtCode.set(ct, []).get(ct)).push(v);
}
const ctDup = [...byCtCode.entries()].filter(([, arr]) => arr.length > 1);

// B. supplier_code 중복 (vendors.supplier_code 컬럼이 ct_code 와 다를 수 있음)
const bySupplierCode = new Map();
let hasSupplierCodeCol = false;
for (const v of vendors) {
  if (v.supplier_code === undefined) continue;
  hasSupplierCodeCol = true;
  const sc = v.supplier_code == null ? null : String(v.supplier_code).trim();
  if (!sc) continue;
  (bySupplierCode.get(sc) ?? bySupplierCode.set(sc, []).get(sc)).push(v);
}
const scDup = [...bySupplierCode.entries()].filter(([, arr]) => arr.length > 1);

// C. business_number 중복
const byBizno = new Map();
let biznoNull = 0;
for (const v of vendors) {
  const bz = normalizeBizno(v.business_number);
  if (!bz) { biznoNull++; continue; }
  (byBizno.get(bz) ?? byBizno.set(bz, []).get(bz)).push(v);
}
const biznoDup = [...byBizno.entries()].filter(([, arr]) => arr.length > 1);

// D. normalized name 중복
const byNormName = new Map();
for (const v of vendors) {
  const nm = normalizeName(v.company_name);
  if (!nm) continue;
  (byNormName.get(nm) ?? byNormName.set(nm, []).get(nm)).push(v);
}
const nameDup = [...byNormName.entries()].filter(([, arr]) => arr.length > 1);

// E. 분류 (name collision vs same supplier)
//    - 같은 normalized name 안에서 같은 bizno 있으면 TRUE_DUPLICATE
//    - 같은 normalized name 안에서 bizno 다르면 NAME_COLLISION
//    - 같은 bizno 인데 ct_code 다르면 MULTI_CTCODE_SAME_SUPPLIER
const trueDup = []; // 같은 bizno · 같은 norm name · 2+ row
const multiCt = []; // 같은 bizno · 2+ ct_code
const nameCol = []; // 같은 norm name · 다른 bizno (별개 공급사 추정)

for (const [bz, arr] of biznoDup) {
  const normNames = new Set(arr.map(v => normalizeName(v.company_name)));
  const cts = new Set(arr.map(v => (v.ct_code == null ? null : String(v.ct_code).trim())).filter(Boolean));
  if (cts.size > 1) multiCt.push({ bizno: bz, vendors: arr, ct_codes: [...cts] });
  if (normNames.size === 1 && arr.length > 1) trueDup.push({ bizno: bz, vendors: arr, norm_name: [...normNames][0] });
}
for (const [norm, arr] of nameDup) {
  const biznos = new Set(arr.map(v => normalizeBizno(v.business_number)).filter(Boolean));
  if (biznos.size > 1) nameCol.push({ norm_name: norm, vendors: arr, biznos: [...biznos] });
}

// F. relation 정합성 (purchase · products · order_requests → vendors.ct_code)
const ctSet = new Set(vendors.map(v => v.ct_code == null ? null : String(v.ct_code).trim()).filter(Boolean));
if (hasSupplierCodeCol) {
  for (const v of vendors) {
    const sc = v.supplier_code == null ? null : String(v.supplier_code).trim();
    if (sc) ctSet.add(sc);
  }
}
function unmappedCodes(countMap) {
  const unmapped = [];
  for (const [code, cnt] of countMap.entries()) {
    if (!ctSet.has(code)) unmapped.push({ code, count: cnt });
  }
  unmapped.sort((a, b) => b.count - a.count);
  return unmapped;
}
const pdUnmapped = unmappedCodes(pdSupplierCount);
const prodUnmapped = unmappedCodes(prodSupplierCount);
const orUnmapped = unmappedCodes(orSupplierCount);

// ── report ──────────────────────────────────────────────────────────
function block(title) { return `\n## ${title}\n\n`; }
function num(n) { return (n ?? 0).toLocaleString(); }

let md = `# Vendor Duplicate Audit · 2026-10-07\n\n`;
md += `**READ ONLY · 데이터 수정 없음 · duplicate 분류만.**\n\n`;
md += `## Summary\n\n`;
md += `| 지표 | 값 |\n|---|---|\n`;
md += `| vendors total | ${num(vendors.length)} |\n`;
md += `| ct_code 보유 | ${num([...byCtCode.values()].reduce((a, b) => a + b.length, 0))} rows (unique ct: ${num(byCtCode.size)}) |\n`;
md += `| supplier_code 컬럼 존재 | ${hasSupplierCodeCol ? "YES" : "NO"} |\n`;
md += `| business_number NULL (또는 비정상) | ${num(biznoNull)} |\n`;
md += `| ct_code duplicate | ${num(ctDup.length)} 그룹 (심각) |\n`;
md += `| supplier_code (vendors) duplicate | ${num(scDup.length)} 그룹 |\n`;
md += `| bizno duplicate | ${num(biznoDup.length)} 그룹 |\n`;
md += `| normalized name duplicate | ${num(nameDup.length)} 그룹 |\n`;
md += `| TRUE_DUPLICATE (same bizno + same name) | ${num(trueDup.length)} |\n`;
md += `| MULTI_CTCODE_SAME_SUPPLIER (same bizno · ≥2 ct) | ${num(multiCt.length)} |\n`;
md += `| NAME_COLLISION (same name · 다른 bizno) | ${num(nameCol.length)} |\n`;
md += `| purchase_details total | ${num(pdTotal)} |\n`;
md += `| purchase_details.supplier_code NULL | ${num(pdNullCount)} |\n`;
md += `| purchase_details distinct supplier_code | ${num(pdSupplierCount.size)} |\n`;
md += `| purchase_details UNMAPPED (vendors 매칭 안됨) | ${num(pdUnmapped.length)} codes · ${num(pdUnmapped.reduce((a,b)=>a+b.count,0))} rows |\n`;
md += `| products total | ${num(prodTotal)} |\n`;
md += `| products.supplier_code NULL | ${num(prodNullCount)} |\n`;
md += `| products distinct supplier_code | ${num(prodSupplierCount.size)} |\n`;
md += `| products UNMAPPED | ${num(prodUnmapped.length)} codes · ${num(prodUnmapped.reduce((a,b)=>a+b.count,0))} rows |\n`;
md += `| order_requests total | ${orErr ? "fetch 실패 · " + orErr : num(orTotal)} |\n`;
if (!orErr) {
  md += `| order_requests.supplier_code NULL | ${num(orNullCount)} |\n`;
  md += `| order_requests distinct supplier_code | ${num(orSupplierCount.size)} |\n`;
  md += `| order_requests UNMAPPED | ${num(orUnmapped.length)} codes · ${num(orUnmapped.reduce((a,b)=>a+b.count,0))} rows |\n`;
}

md += block("A. ct_code DUPLICATE · 심각 (같은 code · 2+ vendor row)");
if (ctDup.length === 0) md += `_없음_\n`;
else {
  md += `| ct_code | row count | company_names | ids |\n|---|---|---|---|\n`;
  for (const [ct, arr] of ctDup) {
    md += `| ${ct} | ${arr.length} | ${arr.map(v => v.company_name).join(" / ")} | ${arr.map(v => v.id).join(",")} |\n`;
  }
}

if (hasSupplierCodeCol) {
  md += block("B. supplier_code (vendors.supplier_code 컬럼) DUPLICATE");
  if (scDup.length === 0) md += `_없음_\n`;
  else {
    md += `| supplier_code | row count | company_names | ids |\n|---|---|---|---|\n`;
    for (const [sc, arr] of scDup) {
      md += `| ${sc} | ${arr.length} | ${arr.map(v => v.company_name).join(" / ")} | ${arr.map(v => v.id).join(",")} |\n`;
    }
  }
}

md += block("C. TRUE_DUPLICATE · 같은 사업자번호 + 같은 normalized name (통합 후보)");
if (trueDup.length === 0) md += `_없음_\n`;
else {
  md += `| bizno | norm_name | row count | companies | ct_codes | ids |\n|---|---|---|---|---|---|\n`;
  for (const d of trueDup) {
    md += `| ${d.bizno} | ${d.norm_name} | ${d.vendors.length} | ${d.vendors.map(v => v.company_name).join(" / ")} | ${d.vendors.map(v => v.ct_code ?? "-").join(",")} | ${d.vendors.map(v => v.id).join(",")} |\n`;
  }
}

md += block("D. MULTI_CTCODE_SAME_SUPPLIER · 같은 사업자번호 · 2+ CtCode (사용자 결정 필요)");
if (multiCt.length === 0) md += `_없음_\n`;
else {
  md += `| bizno | ct_codes | companies | ids |\n|---|---|---|---|\n`;
  for (const d of multiCt) {
    md += `| ${d.bizno} | ${d.ct_codes.join(",")} | ${d.vendors.map(v => v.company_name).join(" / ")} | ${d.vendors.map(v => v.id).join(",")} |\n`;
  }
}

md += block("E. NAME_COLLISION · 같은 normalized name · 다른 사업자번호 (별개 공급사 추정)");
if (nameCol.length === 0) md += `_없음_\n`;
else {
  md += `| norm_name | biznos | companies | ids |\n|---|---|---|---|\n`;
  for (const d of nameCol) {
    md += `| ${d.norm_name} | ${d.biznos.join(",")} | ${d.vendors.map(v => v.company_name).join(" / ")} | ${d.vendors.map(v => v.id).join(",")} |\n`;
  }
}

md += block("F. RELATION 정합성 · purchase_details.supplier_code → vendors.ct_code UNMAPPED");
if (pdUnmapped.length === 0) md += `_모두 매칭 성공_\n`;
else {
  md += `| supplier_code | row count |\n|---|---|\n`;
  for (const u of pdUnmapped.slice(0, 30)) md += `| ${u.code} | ${u.count} |\n`;
  if (pdUnmapped.length > 30) md += `\n_... ${pdUnmapped.length - 30} more codes_\n`;
}

md += block("G. RELATION 정합성 · products.supplier_code → vendors.ct_code UNMAPPED");
if (prodUnmapped.length === 0) md += `_모두 매칭 성공_\n`;
else {
  md += `| supplier_code | product count |\n|---|---|\n`;
  for (const u of prodUnmapped.slice(0, 30)) md += `| ${u.code} | ${u.count} |\n`;
  if (prodUnmapped.length > 30) md += `\n_... ${prodUnmapped.length - 30} more codes_\n`;
}

if (!orErr) {
  md += block("H. RELATION 정합성 · order_requests.supplier_code → vendors.ct_code UNMAPPED");
  if (orUnmapped.length === 0) md += `_모두 매칭 성공_\n`;
  else {
    md += `| supplier_code | order count |\n|---|---|\n`;
    for (const u of orUnmapped.slice(0, 30)) md += `| ${u.code} | ${u.count} |\n`;
    if (orUnmapped.length > 30) md += `\n_... ${orUnmapped.length - 30} more codes_\n`;
  }
}

md += block("I. DATA QUALITY");
md += `- business_number NULL (또는 비정상 · 10자리 미만 · 0만 등): **${num(biznoNull)}** / ${num(vendors.length)}\n`;
md += `- 사업자번호 없이 등록된 vendor 는 bizno-level dedup 불가 · 수동 검토 필요\n`;

md += block("J. 권장 조치 (사용자 결정 필요)");
md += `1. **TRUE_DUPLICATE (${trueDup.length})** · 중복 vendor row 통합 · 유지할 canonical row 선택 (가장 오래된/완전한 데이터) · 다른 row 참조 reassign\n`;
md += `2. **MULTI_CTCODE_SAME_SUPPLIER (${multiCt.length})** · ERP 가 하나 공급사에 여러 CtCode 발급한 case · 다음 결정 필요:\n`;
md += `   - 그대로 유지 (ERP 원본 보존) · UI 에서는 bizno 기반 집계\n`;
md += `   - 하나의 primary CtCode 로 통합 · 다른 ct_code 는 alias 로 매핑 테이블 작성\n`;
md += `3. **NAME_COLLISION (${nameCol.length})** · 같은 이름 다른 공급사 · 사용자가 vendor 선택 UI 에서 혼동 가능 · 식별자 (bizno · 지역 · 주소) 를 라벨에 노출 권장\n`;
md += `4. **UNMAPPED relation 데이터** · purchase_details ${pdUnmapped.length} codes / products ${prodUnmapped.length} codes · vendors 에 없는 code · 원인 조사 필요 (DB 수정 금지):\n`;
md += `   - ERP 에서 삭제된 vendor · 과거 거래 기록 보존\n`;
md += `   - vendors 가 ERP 와 sync 되지 않아 아직 import 안됨 (#119 VENDOR 자동임포트 pending)\n`;
md += `   - 레거시 수기 입력 code\n`;
md += `5. **supplier_code NULL** · 통합 작업 전 ERP CtCode backfill 필요 · 수동 매칭 작업\n`;
md += `6. **ct_code duplicate (${ctDup.length})** 있으면 즉시 수정 필요 · ct_code 는 unique 여야 함\n`;

md += `\n---\n`;
md += `\n_Generated by \`tools/vendor-duplicate-audit-2026-10-07.mjs\` · ${new Date().toISOString()}_\n`;

const outDir = resolve(projectRoot, "output");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, "vendor-duplicate-audit-2026-10-07.md");
writeFileSync(outPath, md, "utf8");
console.log(`\n[audit] report written: ${outPath}`);
console.log(`[audit] vendors: ${vendors.length}`);
console.log(`[audit] ct_code dup: ${ctDup.length}`);
console.log(`[audit] bizno dup: ${biznoDup.length}`);
console.log(`[audit] TRUE_DUP: ${trueDup.length} · MULTI_CT: ${multiCt.length} · NAME_COLLISION: ${nameCol.length}`);
console.log(`[audit] purchase_details UNMAPPED codes: ${pdUnmapped.length} / ${pdSupplierCount.size}`);
console.log(`[audit] products UNMAPPED codes: ${prodUnmapped.length} / ${prodSupplierCount.size}`);
if (!orErr) console.log(`[audit] order_requests UNMAPPED codes: ${orUnmapped.length} / ${orSupplierCount.size}`);
