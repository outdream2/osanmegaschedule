// tools/vendor-supabase-only-2026-10-07.mjs
// 2026-10-07 · 사용자 지시 · Supabase vendors 중 ERP 에 없는 것만 추출 (READ ONLY)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class { constructor() { throw new Error("REST only"); } };
}
const __filename = fileURLToPath(import.meta.url);
const projectRoot = resolve(dirname(__filename), "..");

function parseEnv(p) {
  if (!existsSync(p)) return {};
  const out = {};
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const t = line.trim(); if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("="); if (eq < 0) continue;
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[t.slice(0, eq).trim()] = v;
  }
  return out;
}
const env = parseEnv(resolve(projectRoot, ".env"));
const SUPABASE_URL = process.env.SUPABASE_URL || env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_KEY;
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

function normalizeBizno(bz) {
  if (bz == null) return null;
  const d = String(bz).replace(/\D/g, "");
  if (!d || /^0+$/.test(d) || d.length < 10) return null;
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

// ERP sample 로드
const erpPath = resolve(projectRoot, "tmp/output/vendor-response-full.json");
const erp = JSON.parse(readFileSync(erpPath, "utf8"));
const erpTable = erp.tables.find(t => t.rowCount > 1);
const erpRows = erpTable.rows ?? erpTable.data ?? [];
console.log(`[audit] ERP vendors: ${erpRows.length}`);

const erpCtCodes = new Set();
const erpBiznos = new Set();
const erpNormNames = new Set();
for (const r of erpRows) {
  const ct = r.CtCode == null ? null : String(r.CtCode).trim();
  if (ct) erpCtCodes.add(ct);
  const bz = normalizeBizno(r.CorpBizNo);
  if (bz) erpBiznos.add(bz);
  const nm = normalizeName(r.CorpNameView);
  if (nm) erpNormNames.add(nm);
}

// Supabase vendors 전체 fetch
async function fetchAll(table, cols) {
  const out = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await sb.from(table).select(cols).range(from, from + PAGE - 1);
    if (error) { console.error(error.message); return null; }
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}
const trySelects = [
  "id, company_name, ct_code, business_number, phone, contact_name, category, note, created_at",
  "id, company_name, business_number, phone, contact_name, category, note, created_at",
];
let vendors;
for (const cols of trySelects) {
  vendors = await fetchAll("vendors", cols);
  if (vendors) break;
}
console.log(`[audit] Supabase vendors: ${vendors.length}`);

// 분류
const orphans = []; // ERP 에 전혀 없는 것 (ct · bizno · name 모두 unmatched)
const ctMiss = []; // ct_code 가 ERP 에 없음 (identity miss)
const linkedByBizno = [];
const linkedByName = [];

for (const v of vendors) {
  const ct = v.ct_code == null ? null : String(v.ct_code).trim();
  const bz = normalizeBizno(v.business_number);
  const nm = normalizeName(v.company_name);

  const ctMatch = ct && erpCtCodes.has(ct);
  const bzMatch = bz && erpBiznos.has(bz);
  const nmMatch = nm && erpNormNames.has(nm);

  if (ctMatch) continue; // ct_code 매칭 → ERP 에 있음
  // 아래부터 ct miss
  ctMiss.push({ v, bzMatch, nmMatch });
  if (!bzMatch && !nmMatch) {
    orphans.push({ v });
  } else if (bzMatch) {
    linkedByBizno.push({ v });
  } else if (nmMatch) {
    linkedByName.push({ v });
  }
}

// 리포트 작성
const outDir = resolve(projectRoot, "output");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
const outPath = resolve(outDir, "vendor-supabase-only-2026-10-07.md");

function fmt(v) {
  return `${v.company_name ?? "-"} (id=${v.id} · ct=${v.ct_code ?? "null"} · bz=${v.business_number ?? "null"})`;
}

let md = `# Supabase-only Vendors · 2026-10-07\n\n`;
md += `**조건**: Supabase vendors 중 ERP vendor master (CtCode) 에 매칭되지 않는 것.\n\n`;
md += `## Summary\n\n`;
md += `| 지표 | 값 |\n|---|---|\n`;
md += `| Supabase vendors total | ${vendors.length} |\n`;
md += `| ERP vendors total | ${erpRows.length} |\n`;
md += `| ERP CtCode 매칭 성공 | ${vendors.length - ctMiss.length} |\n`;
md += `| ct_code miss (identity 매칭 실패) | **${ctMiss.length}** |\n`;
md += `| └ 그 중 bizno 로 ERP 매칭 발견 | ${linkedByBizno.length} |\n`;
md += `| └ 그 중 normalized name 으로 ERP 매칭 발견 | ${linkedByName.length} |\n`;
md += `| └ 완전 ORPHAN (ct/bizno/name 모두 ERP 에 없음) | **${orphans.length}** |\n`;

md += `\n## A. 완전 ORPHAN · ERP 어떤 매칭도 안됨 (${orphans.length})\n\n`;
md += `Supabase 전용 · ERP vendor master 에서 삭제됐거나 수기 등록된 vendor.\n\n`;
if (orphans.length === 0) md += `_없음_\n`;
else {
  md += `| id | company_name | ct_code | business_number | category | note |\n|---|---|---|---|---|---|\n`;
  for (const { v } of orphans) {
    md += `| ${v.id} | ${v.company_name ?? "-"} | ${v.ct_code ?? "-"} | ${v.business_number ?? "-"} | ${v.category ?? "-"} | ${v.note ?? "-"} |\n`;
  }
}

md += `\n## B. ct_code 미설정/다름 · bizno 로 ERP 매칭 발견 (${linkedByBizno.length})\n\n`;
md += `ct_code 가 비어있거나 ERP 와 다르지만, 사업자번호로는 ERP 안에 있음 · ct_code 재매핑 후보.\n\n`;
if (linkedByBizno.length === 0) md += `_없음_\n`;
else {
  md += `| id | company_name | ct_code (DB) | business_number |\n|---|---|---|---|\n`;
  for (const { v } of linkedByBizno) {
    md += `| ${v.id} | ${v.company_name ?? "-"} | ${v.ct_code ?? "null"} | ${v.business_number} |\n`;
  }
}

md += `\n## C. ct_code 미설정/다름 · bizno 없음 · name 으로 ERP 매칭 발견 (${linkedByName.length})\n\n`;
md += `ct_code 와 사업자번호 모두 없거나 ERP 와 다름 · normalized name 만 일치 · 수동 확인 권장.\n\n`;
if (linkedByName.length === 0) md += `_없음_\n`;
else {
  md += `| id | company_name | ct_code (DB) | business_number |\n|---|---|---|---|\n`;
  for (const { v } of linkedByName) {
    md += `| ${v.id} | ${v.company_name ?? "-"} | ${v.ct_code ?? "null"} | ${v.business_number ?? "null"} |\n`;
  }
}

md += `\n---\n\n_Generated by tools/vendor-supabase-only-2026-10-07.mjs · ${new Date().toISOString()}_\n`;

writeFileSync(outPath, md, "utf8");
console.log(`[audit] report written: ${outPath}`);
console.log(`[audit] ORPHAN (완전 ERP 외): ${orphans.length}`);
console.log(`[audit] bizno-only match: ${linkedByBizno.length}`);
console.log(`[audit] name-only match: ${linkedByName.length}`);
