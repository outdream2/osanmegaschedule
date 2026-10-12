// scripts/vendor-merge-2026-10-06.mjs
// 사용자 승인 (2026-10-06) · VENDOR ERP CANONICALIZATION Stage A' (merge CLI)
//
// 목적:
//   · Supabase vendors (Stage A 완료 후) ↔ ERP BuyCustomer_List 108 rows 매칭
//   · --dry-run (기본): READ-ONLY · 매칭 결과만 리포트
//   · --apply: UPDATE/INSERT 수행 · DELETE 금지
//
// 매칭 우선순위 (apps/sync-agent/src/main/vendorSyncService.ts 와 동일):
//   P1 · ct_code exact                                 → UPDATE changed only
//   P2 · corp_biz_no normalized unique match           → UPDATE + ct_code 연결
//   P3 · corp_name_view normalized unique match        → UPDATE + ct_code 연결
//   그 외 · NEW INSERT
//   복수 후보 · AMBIGUOUS (SKIP)
//   bizno 다른데 name 매칭 / 기존 ct_code 다름 · CODE_CONFLICT (SKIP)
//
// 금지:
//   · DELETE 금지
//   · WEB-only 20개 column overwrite 금지
//   · ERP null → DB 값 보존 (null overwrite 방지)
//
// 사용법:
//   node scripts/vendor-merge-2026-10-06.mjs --dry-run
//   node scripts/vendor-merge-2026-10-06.mjs --apply

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { createClient } from "@supabase/supabase-js";

if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class { constructor() { throw new Error("REST only"); } };
}

// ─── CLI args ────────────────────────────────────────────────────────────
const APPLY = process.argv.includes("--apply");
const DRY = process.argv.includes("--dry-run") || !APPLY;

if (APPLY && DRY && process.argv.includes("--dry-run")) {
  console.error("--dry-run 과 --apply 동시 사용 금지");
  process.exit(1);
}

// ─── env ─────────────────────────────────────────────────────────────────
function parseEnv(path) {
  if (!existsSync(path)) return {};
  const out = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[t.slice(0, eq).trim()] = v;
  }
  return out;
}
const env = parseEnv(new URL("../.env", import.meta.url).pathname.replace(/^\//, ""));
const SUPABASE_URL = process.env.SUPABASE_URL || env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_KEY ||
  env.SUPABASE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("SUPABASE_URL / SUPABASE_KEY 없음 · .env 확인");
  process.exit(1);
}

// ─── normalize helpers (vendorSyncService.ts 와 동일) ────────────────────
function normalizeBusinessNumber(bz) {
  if (bz == null) return null;
  const digits = String(bz).replace(/\D/g, "");
  if (digits.length === 0) return null;
  if (/^0+$/.test(digits)) return null;        // dummy "0000000000"
  if (digits.length < 10) return null;         // KR 10자리 미만 skip
  return digits;
}
function normalizeVendorName(name) {
  if (name == null) return null;
  let s = String(name).toLowerCase().trim();
  if (!s) return null;
  s = s.replace(/\(주\)/g, "").replace(/㈜/g, "").replace(/주식회사/g, "")
       .replace(/\(유\)/g, "").replace(/유한회사/g, "")
       .replace(/\(사\)/g, "").replace(/사단법인/g, "");
  s = s.replace(/\s+/g, "");
  s = s.replace(/[.,·\-_()\[\]{}'"!?@#$%^&*+=:;\\/]/g, "");
  return s.length > 0 ? s : null;
}
function strOrNull(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}
function intOrNull(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
function dateOrNull(v) {
  const s = strOrNull(v);
  if (!s) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

// ─── ERP sample ──────────────────────────────────────────────────────────
const samplePath = new URL("../tmp/output/vendor-response-full.json", import.meta.url).pathname.replace(/^\//, "");
if (!existsSync(samplePath)) { console.error("ERP sample 없음 · " + samplePath); process.exit(1); }
const parsed = JSON.parse(readFileSync(samplePath, "utf8"));
const erpTable = parsed.tables.find((t) => t.rowCount > 1);
const erpRows = erpTable.rows;
console.log(`[ERP] rows=${erpRows.length} · columns=${erpTable.columns.length}`);

// ─── Supabase vendors (SELECT 는 canonical + legacy fallback) ────────────
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  db: { schema: "public" },
});

// Stage A 적용 여부 probe (ct_code 1 row select)
const stageAProbe = await sb.from("vendors").select("ct_code").limit(1);
const stageAApplied = stageAProbe.error == null;
console.log(`[Stage A] canonical columns applied = ${stageAApplied ? "YES" : "NO"}`);
if (!stageAApplied && APPLY) {
  console.error("Stage A migration 미적용 · --apply 중단");
  console.error("→ Supabase SQL Editor 에서 supabase/migrations/2026-10-06_vendor_canonicalization_stage_a.sql 수동 실행 필요");
  process.exit(2);
}

const SELECT_CANONICAL = "id, ct_code, corp_name_view, corp_biz_no, phone, email, scate_name, remark, "
  + "president, join_date, buyer_type_name, buyer_status_name, payment_type_name, payment_gubun_name, payment_date, "
  + "company_name, business_number, category, note";
const SELECT_LEGACY = "id, phone, email, company_name, business_number, category, note";
const SELECT = stageAApplied ? SELECT_CANONICAL : SELECT_LEGACY;

const dbRows = [];
let from = 0;
while (true) {
  const { data, error } = await sb.from("vendors").select(SELECT).range(from, from + 999);
  if (error) throw new Error(`vendors fetch 실패 · ${error.message}`);
  if (!data || data.length === 0) break;
  dbRows.push(...data);
  if (data.length < 1000) break;
  from += 1000;
}
console.log(`[DB] vendors total=${dbRows.length}`);

// ─── 인덱스 ──────────────────────────────────────────────────────────────
const byCode = new Map();
const byBizno = new Map();
const byName = new Map();
for (const r of dbRows) {
  const ct = r.ct_code == null ? "" : String(r.ct_code).trim();
  if (ct) byCode.set(ct, r);
  const bz = normalizeBusinessNumber(r.corp_biz_no ?? r.business_number);
  if (bz) {
    const list = byBizno.get(bz) ?? []; list.push(r); byBizno.set(bz, list);
  }
  const nm = normalizeVendorName(r.corp_name_view ?? r.company_name);
  if (nm) {
    const list = byName.get(nm) ?? []; list.push(r); byName.set(nm, list);
  }
}

// ─── 매칭 ────────────────────────────────────────────────────────────────
const COMPARE_FIELDS = [
  "corp_name_view", "corp_biz_no", "phone", "email", "scate_name", "remark",
  "president", "join_date", "buyer_type_name", "buyer_status_name",
  "payment_type_name", "payment_gubun_name", "payment_date",
];

function buildCanonical(r) {
  const ct = r.CtCode == null ? "" : String(r.CtCode).trim();
  if (!ct) return null;
  return {
    ct_code: ct,
    corp_name_view: strOrNull(r.CorpNameView),
    corp_biz_no: normalizeBusinessNumber(r.CorpBizNo),
    phone: strOrNull(r.Phone),
    email: strOrNull(r.Email),
    scate_name: strOrNull(r.ScateName),
    remark: strOrNull(r.Remark),
    president: strOrNull(r.President),
    join_date: dateOrNull(r.JoinDate),
    buyer_type_name: strOrNull(r.BuyerTypeName),
    buyer_status_name: strOrNull(r.BuyerStatusName),
    payment_type_name: strOrNull(r.PaymentTypeName),
    payment_gubun_name: strOrNull(r.PaymentGubunName),
    payment_date: intOrNull(r.PaymentDate),
  };
}

function buildPatch(canonical, db) {
  const patch = {};
  for (const f of COMPARE_FIELDS) {
    const erpVal = canonical[f];
    if (erpVal == null || erpVal === "") continue;
    if (db == null) {
      patch[f] = erpVal;
    } else {
      const dbRaw = db[f];
      if (f === "payment_date") {
        const dbNum = dbRaw == null ? null : Number(dbRaw);
        if (dbNum !== erpVal) patch[f] = erpVal;
      } else {
        const dbStr = dbRaw == null ? null : String(dbRaw);
        if (dbStr !== erpVal) patch[f] = erpVal;
      }
    }
  }
  return patch;
}

const entries = [];
const inserts = [];
const updates = [];
const stats = { exactCode: 0, matchBizno: 0, matchName: 0, new: 0, ambiguous: 0, codeConflict: 0, unchanged: 0 };
const seenCt = new Set();

for (const erpRow of erpRows) {
  const canonical = buildCanonical(erpRow);
  if (!canonical) continue;
  const ct = canonical.ct_code;
  if (seenCt.has(ct)) continue;
  seenCt.add(ct);

  // P1 · ct_code exact
  const codeMatch = byCode.get(ct);
  if (codeMatch) {
    const patch = buildPatch(canonical, codeMatch);
    const changedFields = Object.keys(patch);
    stats.exactCode++;
    if (changedFields.length === 0) {
      stats.unchanged++;
      entries.push({ ct, erp_name: canonical.corp_name_view, kind: "EXACT_CODE", dbId: codeMatch.id, changed: [] });
    } else {
      updates.push({ id: codeMatch.id, identity: ct, patch, changedFields, connectCt: false });
      entries.push({ ct, erp_name: canonical.corp_name_view, kind: "EXACT_CODE", dbId: codeMatch.id, changed: changedFields });
    }
    continue;
  }

  const erpBz = canonical.corp_biz_no;
  const erpNm = normalizeVendorName(canonical.corp_name_view);

  // P2 · bizno
  if (erpBz) {
    const cands = byBizno.get(erpBz) ?? [];
    if (cands.length > 1) {
      stats.ambiguous++;
      entries.push({ ct, erp_name: canonical.corp_name_view, kind: "AMBIGUOUS", reason: `bizno ${erpBz} 매칭 ${cands.length}개` });
      continue;
    }
    if (cands.length === 1) {
      const m = cands[0];
      const dbCt = m.ct_code == null ? "" : String(m.ct_code).trim();
      if (dbCt && dbCt !== ct) {
        stats.codeConflict++;
        entries.push({ ct, erp_name: canonical.corp_name_view, kind: "CODE_CONFLICT", dbId: m.id, dbCt, reason: `bizno 매칭 · 기존 ct_code=${dbCt} ≠ ERP=${ct}` });
        continue;
      }
      const patch = buildPatch(canonical, m);
      const changedFields = Object.keys(patch);
      const connect = !dbCt;
      stats.matchBizno++;
      if (changedFields.length === 0 && !connect) {
        stats.unchanged++;
        entries.push({ ct, erp_name: canonical.corp_name_view, kind: "MATCH_BIZNO", dbId: m.id, changed: [] });
      } else {
        const applyPatch = { ...patch };
        if (connect) applyPatch.ct_code = ct;
        updates.push({ id: m.id, identity: ct, patch: applyPatch, changedFields, connectCt: connect });
        entries.push({ ct, erp_name: canonical.corp_name_view, kind: "MATCH_BIZNO", dbId: m.id, changed: changedFields, connectCt: connect });
      }
      continue;
    }
  }

  // P3 · normalized name
  if (erpNm) {
    const cands = byName.get(erpNm) ?? [];
    if (cands.length > 1) {
      stats.ambiguous++;
      entries.push({ ct, erp_name: canonical.corp_name_view, kind: "AMBIGUOUS", reason: `name "${erpNm}" 매칭 ${cands.length}개`, candidates: cands.map((c) => ({ id: c.id, name: c.corp_name_view ?? c.company_name })) });
      continue;
    }
    if (cands.length === 1) {
      const m = cands[0];
      const dbBz = normalizeBusinessNumber(m.corp_biz_no ?? m.business_number);
      if (erpBz && dbBz && erpBz !== dbBz) {
        stats.codeConflict++;
        entries.push({ ct, erp_name: canonical.corp_name_view, kind: "CODE_CONFLICT", dbId: m.id, reason: `name 매칭 · bizno 다름 ERP=${erpBz} ≠ DB=${dbBz}` });
        continue;
      }
      const dbCt = m.ct_code == null ? "" : String(m.ct_code).trim();
      if (dbCt && dbCt !== ct) {
        stats.codeConflict++;
        entries.push({ ct, erp_name: canonical.corp_name_view, kind: "CODE_CONFLICT", dbId: m.id, dbCt, reason: `name 매칭 · 기존 ct_code=${dbCt} ≠ ERP=${ct}` });
        continue;
      }
      const patch = buildPatch(canonical, m);
      const changedFields = Object.keys(patch);
      const connect = !dbCt;
      stats.matchName++;
      if (changedFields.length === 0 && !connect) {
        stats.unchanged++;
        entries.push({ ct, erp_name: canonical.corp_name_view, kind: "MATCH_NAME", dbId: m.id, changed: [] });
      } else {
        const applyPatch = { ...patch };
        if (connect) applyPatch.ct_code = ct;
        updates.push({ id: m.id, identity: ct, patch: applyPatch, changedFields, connectCt: connect });
        entries.push({ ct, erp_name: canonical.corp_name_view, kind: "MATCH_NAME", dbId: m.id, changed: changedFields, connectCt: connect });
      }
      continue;
    }
  }

  // NEW
  inserts.push({ identity: ct, payload: canonical });
  entries.push({ ct, erp_name: canonical.corp_name_view, kind: "NEW" });
  stats.new++;
}

// ─── dummy biz_no 분해 (리포트용) ────────────────────────────────────────
let dummyBiznoCount = 0;
for (const r of erpRows) {
  const bz = normalizeBusinessNumber(r.CorpBizNo);
  if (!bz) dummyBiznoCount++;
}

// ─── DB 내부 중복 ────────────────────────────────────────────────────────
const dbDupes = [];
for (const [bz, rows] of byBizno) {
  if (rows.length > 1) dbDupes.push({ key: bz, kind: "BIZNO", ids: rows.map((r) => r.id) });
}
for (const [nm, rows] of byName) {
  if (rows.length > 1) {
    const bzSet = new Set(rows.map((r) => normalizeBusinessNumber(r.corp_biz_no ?? r.business_number)).filter(Boolean));
    if (bzSet.size === 1 && [...bzSet][0]) continue;
    dbDupes.push({ key: nm, kind: "NAME", ids: rows.map((r) => r.id) });
  }
}

// ─── 리포트 ──────────────────────────────────────────────────────────────
const totalExplained = stats.exactCode + stats.matchBizno + stats.matchName + stats.new + stats.ambiguous + stats.codeConflict;
console.log("\n╔══════════ VENDOR MERGE REPORT ══════════╗");
console.log(`Mode              = ${APPLY ? "APPLY" : "DRY-RUN"}`);
console.log(`ERP total         = ${erpRows.length}`);
console.log(`DB vendors total  = ${dbRows.length}`);
console.log("─────────────────────────────────────────");
console.log(`EXACT_CODE        = ${stats.exactCode}`);
console.log(`MATCH_BIZNO       = ${stats.matchBizno}`);
console.log(`MATCH_NAME        = ${stats.matchName}`);
console.log(`NEW               = ${stats.new}`);
console.log(`AMBIGUOUS         = ${stats.ambiguous} (SKIP)`);
console.log(`CODE_CONFLICT     = ${stats.codeConflict} (SKIP)`);
console.log(`unchanged (noop)  = ${stats.unchanged}`);
console.log(`dummy biz_no      = ${dummyBiznoCount}`);
console.log(`total explained   = ${totalExplained} / ${erpRows.length}  ${totalExplained === erpRows.length ? "OK" : "MISMATCH"}`);
console.log(`DB internal dupes = ${dbDupes.length} groups`);
console.log("╚═════════════════════════════════════════╝\n");

if (dbDupes.length > 0) {
  console.log("── DB 내부 중복 그룹 ──");
  for (const d of dbDupes) console.log(`  [${d.kind}] key=${d.key} · ids=${JSON.stringify(d.ids)}`);
  console.log("");
}

const skipSamples = entries.filter((e) => e.kind === "AMBIGUOUS" || e.kind === "CODE_CONFLICT");
if (skipSamples.length > 0) {
  console.log(`── SKIP 상세 (${skipSamples.length}건) ──`);
  for (const s of skipSamples) console.log(`  [${s.kind}] ct=${s.ct} name=${s.erp_name} · ${s.reason ?? ""}`);
  console.log("");
}

// 리포트 파일
const outDir = new URL("../output/", import.meta.url).pathname.replace(/^\//, "");
try { mkdirSync(outDir, { recursive: true }); } catch {}
const reportPath = outDir + `vendor-merge-${APPLY ? "apply" : "dry-run"}-2026-10-06.json`;
writeFileSync(reportPath, JSON.stringify({
  mode: APPLY ? "APPLY" : "DRY_RUN",
  stageAApplied,
  erpTotal: erpRows.length,
  dbTotal: dbRows.length,
  stats, totalExplained, dummyBiznoCount,
  dbDupes,
  insertsCount: inserts.length,
  updatesCount: updates.length,
  entries,
}, null, 2));
console.log(`[write] ${reportPath}`);

// ─── Guard · dry-run 종료 or 전제 조건 체크 ──────────────────────────────
if (!APPLY) {
  console.log("\n[DRY-RUN] WRITE 수행 안 함 · 종료");
  process.exit(0);
}
if (totalExplained !== erpRows.length) {
  console.error(`[APPLY] 중단 · ERP ${erpRows.length} 중 ${totalExplained} 만 분류됨`);
  process.exit(3);
}
if (!stageAApplied) {
  console.error("[APPLY] 중단 · Stage A migration 미적용");
  process.exit(2);
}

// ─── APPLY · INSERT + UPDATE ────────────────────────────────────────────
console.log("\n╔══════════ APPLYING WRITES ══════════╗");

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

let inserted = 0, updated = 0, updatedCells = 0, failed = 0;
const errors = [];

// INSERT (batch 500)
for (const batch of chunk(inserts, 500)) {
  const payloads = batch.map(({ payload: p }) => ({
    ct_code: p.ct_code,
    corp_name_view: p.corp_name_view,
    corp_biz_no: p.corp_biz_no,
    phone: p.phone,
    email: p.email,
    scate_name: p.scate_name,
    remark: p.remark,
    president: p.president,
    join_date: p.join_date,
    buyer_type_name: p.buyer_type_name,
    buyer_status_name: p.buyer_status_name,
    payment_type_name: p.payment_type_name,
    payment_gubun_name: p.payment_gubun_name,
    payment_date: p.payment_date,
    // legacy mirror (Stage B 전까지 두 field 동기화)
    company_name: p.corp_name_view ?? p.ct_code,
    business_number: p.corp_biz_no,
    category: p.scate_name,
    note: p.remark,
  }));
  const { data, error } = await sb.from("vendors").insert(payloads).select("id");
  if (error) {
    failed += batch.length;
    if (errors.length < 20) errors.push({ identity: batch[0].identity, message: `INSERT · ${error.message}` });
  } else {
    inserted += (data?.length ?? 0);
  }
}

// UPDATE (PAR=10)
const PAR = 10;
for (let i = 0; i < updates.length; i += PAR) {
  const slice = updates.slice(i, i + PAR);
  const results = await Promise.all(slice.map(async (u) => {
    const applyPatch = { ...u.patch };
    if ("corp_name_view" in applyPatch) applyPatch.company_name = applyPatch.corp_name_view;
    if ("corp_biz_no" in applyPatch)    applyPatch.business_number = applyPatch.corp_biz_no;
    if ("scate_name" in applyPatch)     applyPatch.category        = applyPatch.scate_name;
    if ("remark" in applyPatch)         applyPatch.note            = applyPatch.remark;
    const { error } = await sb.from("vendors").update(applyPatch).eq("id", u.id);
    return { u, error: error?.message };
  }));
  for (const r of results) {
    if (r.error) {
      failed++;
      if (errors.length < 20) errors.push({ identity: r.u.identity, message: r.error });
    } else {
      updated++;
      updatedCells += r.u.changedFields.length + (r.u.connectCt ? 1 : 0);
    }
  }
}

console.log(`inserted      = ${inserted} / ${inserts.length}`);
console.log(`updated       = ${updated} / ${updates.length}`);
console.log(`updated cells = ${updatedCells}`);
console.log(`skipped       = ${stats.ambiguous + stats.codeConflict}`);
console.log(`failed        = ${failed}`);
if (errors.length > 0) {
  console.log("── errors ──");
  for (const e of errors) console.log(`  [${e.identity}] ${e.message}`);
}
console.log("╚═════════════════════════════════════════╝");

// final report with apply results
writeFileSync(reportPath, JSON.stringify({
  mode: "APPLY",
  stageAApplied: true,
  erpTotal: erpRows.length,
  dbTotal: dbRows.length,
  stats, totalExplained, dummyBiznoCount,
  dbDupes,
  insertsCount: inserts.length,
  updatesCount: updates.length,
  applyResult: { inserted, updated, updatedCells, failed, errors },
  entries,
}, null, 2));

if (failed > 0) process.exit(4);
