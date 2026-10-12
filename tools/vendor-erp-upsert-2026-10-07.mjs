// tools/vendor-erp-upsert-2026-10-07.mjs
// 2026-10-07 · 사용자 지시 · ERP → Supabase vendors upsert
//   · ct_code 매칭 성공 → UPDATE (ERP OWNED 6개 field · WEB-only 필드 보존)
//   · ct_code 매칭 실패 (ERP 신규) → INSERT
//   · Supabase 에만 있는 vendor (ct_code=null · 수기 등록) · touch 안 함 (명시 범위 밖)
//
// Mode:
//   DRY=1 node tools/vendor-erp-upsert-2026-10-07.mjs  (default · 변경 없음)
//   WRITE=1 node tools/vendor-erp-upsert-2026-10-07.mjs (실제 UPDATE/INSERT)

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

const WRITE = process.env.WRITE === "1";
const MODE = WRITE ? "WRITE" : "DRY_RUN";
console.log(`[sync] mode=${MODE}`);

// ERP OWNED 6 fields (erpVendorMapper 와 동일 range)
const ERP_FIELDS = ["company_name", "business_number", "phone", "email", "category", "note"];

function str(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}
// 2026-10-07 · bizno normalize · erpVendorMapper.normalizeBusinessNumber 와 동일
//   · 하이픈 제거 · dummy "0000000000" 또는 10자리 미만 → null (WEB 보존)
function normBizno(v) {
  if (v == null) return null;
  const d = String(v).replace(/\D/g, "");
  if (!d) return null;
  if (/^0+$/.test(d)) return null;
  if (d.length < 10) return null;
  return d;
}
// 2026-10-07 · phone normalize · 공백/하이픈 등은 ERP 와 DB 간 포맷 차이로
//   UPDATE churn 발생 가능 · 하지만 사용자 지시 "같으면 덮어써" 는 ERP 값 신뢰 →
//   phone 은 ERP 포맷 그대로 (별도 정규화 안 함).
// ERP → Supabase payload mapping
function erpToPayload(r) {
  return {
    company_name: str(r.CorpNameView),
    business_number: normBizno(r.CorpBizNo),
    phone: str(r.Phone),
    email: str(r.Email),
    category: str(r.ScateName),
    note: str(r.Remark),
  };
}
// UPDATE patch: ERP 값이 null/empty 면 omit (WEB 보존)
function buildPatch(payload) {
  const p = {};
  for (const f of ERP_FIELDS) if (payload[f] != null && payload[f] !== "") p[f] = payload[f];
  return p;
}
function diffFields(dbRow, erp) {
  const changes = [];
  for (const f of ERP_FIELDS) {
    const e = erp[f]; if (e == null || e === "") continue;
    const d = dbRow[f] == null ? null : String(dbRow[f]);
    if (d !== e) changes.push({ field: f, db: d, erp: e });
  }
  return changes;
}

// ── load ERP sample ─────────────────────────────────────────────────
const erp = JSON.parse(readFileSync(resolve(projectRoot, "tmp/output/vendor-response-full.json"), "utf8"));
const erpTable = erp.tables.find(t => t.rowCount > 1);
const erpRows = (erpTable.rows ?? erpTable.data ?? []).filter(r => r.CtCode != null && String(r.CtCode).trim() !== "");
console.log(`[sync] ERP vendors: ${erpRows.length}`);

// ── load Supabase vendors ───────────────────────────────────────────
async function fetchAll() {
  const out = [];
  const PAGE = 1000; let from = 0;
  while (true) {
    const { data, error } = await sb.from("vendors")
      .select("id, company_name, ct_code, business_number, phone, email, category, note")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    out.push(...data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}
const vendors = await fetchAll();
console.log(`[sync] Supabase vendors: ${vendors.length}`);

const byCt = new Map();
for (const v of vendors) {
  const ct = v.ct_code == null ? null : String(v.ct_code).trim();
  if (ct) byCt.set(ct, v);
}

// ── classify ───────────────────────────────────────────────────────
const toUpdate = []; // {id, ct, patch, changes}
const toInsert = []; // {ct, payload}
const unchanged = []; // ct

for (const r of erpRows) {
  const ct = String(r.CtCode).trim();
  const payload = erpToPayload(r);
  const existing = byCt.get(ct);
  if (!existing) {
    toInsert.push({ ct, payload });
    continue;
  }
  const changes = diffFields(existing, payload);
  if (changes.length === 0) {
    unchanged.push(ct);
    continue;
  }
  toUpdate.push({ id: existing.id, ct, patch: buildPatch(payload), changes });
}

console.log(`[sync] UPDATE candidates: ${toUpdate.length}`);
console.log(`[sync] INSERT candidates: ${toInsert.length}`);
console.log(`[sync] UNCHANGED: ${unchanged.length}`);

// ── sample preview ─────────────────────────────────────────────────
const previewUpdates = toUpdate.slice(0, 10);
const previewInserts = toInsert.slice(0, 10);

// ── write report ───────────────────────────────────────────────────
const outDir = resolve(projectRoot, "output");
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

let md = `# ERP → Supabase vendors upsert · 2026-10-07\n\n`;
md += `**Mode**: ${MODE}\n\n`;
md += `## Summary\n\n`;
md += `| 지표 | 값 |\n|---|---|\n`;
md += `| ERP vendors | ${erpRows.length} |\n`;
md += `| Supabase vendors | ${vendors.length} |\n`;
md += `| ct_code 매칭 성공 → UPDATE | ${toUpdate.length} |\n`;
md += `| ct_code 매칭 없음 → INSERT (ERP 신규) | ${toInsert.length} |\n`;
md += `| 매칭됐지만 변경 없음 | ${unchanged.length} |\n`;
md += `| 수기 등록 (ERP 매칭 불가) · touch 안 함 | ${vendors.length - toUpdate.length - unchanged.length} |\n`;

md += `\n## UPDATE sample (max 10)\n\n`;
if (previewUpdates.length === 0) md += `_없음_\n`;
else {
  for (const u of previewUpdates) {
    md += `\n### id=${u.id} · ct_code=${u.ct}\n`;
    md += `| field | DB (before) | ERP (after) |\n|---|---|---|\n`;
    for (const c of u.changes) md += `| ${c.field} | ${c.db ?? "null"} | ${c.erp} |\n`;
  }
}

md += `\n## INSERT sample (max 10)\n\n`;
if (previewInserts.length === 0) md += `_없음_\n`;
else {
  md += `| ct_code | company_name | business_number | phone | email | category |\n|---|---|---|---|---|---|\n`;
  for (const i of previewInserts) {
    const p = i.payload;
    md += `| ${i.ct} | ${p.company_name ?? "-"} | ${p.business_number ?? "-"} | ${p.phone ?? "-"} | ${p.email ?? "-"} | ${p.category ?? "-"} |\n`;
  }
}

const reportPath = resolve(outDir, `vendor-erp-upsert-${WRITE ? "write" : "dryrun"}-2026-10-07.md`);
writeFileSync(reportPath, md, "utf8");
console.log(`[sync] report: ${reportPath}`);

// ── WRITE execute ─────────────────────────────────────────────────
if (!WRITE) {
  console.log("[sync] DRY RUN · no changes applied");
  console.log("[sync] run again with WRITE=1 to apply");
  process.exit(0);
}

let updateOk = 0, updateFail = 0, insertOk = 0, insertFail = 0;
const errors = [];

console.log(`[sync] applying ${toUpdate.length} UPDATES...`);
for (const u of toUpdate) {
  const { error } = await sb.from("vendors").update(u.patch).eq("id", u.id);
  if (error) { updateFail++; errors.push({ op: "UPDATE", id: u.id, ct: u.ct, msg: error.message }); }
  else updateOk++;
}

console.log(`[sync] applying ${toInsert.length} INSERTS...`);
for (const i of toInsert) {
  const insertRow = { ct_code: i.ct, ...i.payload };
  const { error } = await sb.from("vendors").insert(insertRow);
  if (error) { insertFail++; errors.push({ op: "INSERT", ct: i.ct, msg: error.message }); }
  else insertOk++;
}

console.log(`[sync] UPDATE: ${updateOk} ok · ${updateFail} fail`);
console.log(`[sync] INSERT: ${insertOk} ok · ${insertFail} fail`);
if (errors.length) {
  console.log(`[sync] errors (first 10):`);
  for (const e of errors.slice(0, 10)) console.log(" ", JSON.stringify(e));
}

// Read-back
const after = await fetchAll();
const afterCt = new Set(after.map(v => (v.ct_code ?? "").toString().trim()).filter(Boolean));
const beforeCt = new Set(vendors.map(v => (v.ct_code ?? "").toString().trim()).filter(Boolean));
const addedCt = [...afterCt].filter(x => !beforeCt.has(x));
console.log(`[sync] read-back · total vendors: ${after.length} (was ${vendors.length}) · newly added ct_codes: ${addedCt.length}`);

// Append WRITE result to report
let final = `# ERP → Supabase vendors upsert · WRITE result · 2026-10-07\n\n`;
final += `## WRITE result\n\n`;
final += `| op | ok | fail |\n|---|---|---|\n`;
final += `| UPDATE | ${updateOk} | ${updateFail} |\n`;
final += `| INSERT | ${insertOk} | ${insertFail} |\n\n`;
final += `## Read-back\n\n`;
final += `- vendors before: ${vendors.length}\n`;
final += `- vendors after : ${after.length}\n`;
final += `- newly added ct_codes: ${addedCt.length} ${addedCt.length > 0 ? "(" + addedCt.join(", ") + ")" : ""}\n\n`;
if (errors.length) {
  final += `## Errors\n\n`;
  for (const e of errors) final += `- ${e.op} ${e.ct ?? e.id}: ${e.msg}\n`;
}
writeFileSync(reportPath, md + "\n\n" + final, "utf8");
console.log(`[sync] report updated: ${reportPath}`);
