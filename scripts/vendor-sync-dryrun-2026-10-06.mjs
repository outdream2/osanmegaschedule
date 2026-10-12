// scripts/vendor-sync-dryrun-2026-10-06.mjs
// 사용자 승인 2차 (merge policy · 15섹션 스펙) · ERP vendor sync 사전 검증
//
// 목적:
//   · 실제 Supabase vendors 를 조회하고 저장된 ERP sample 로 매칭 결과만 리포트
//   · WRITE 수행 X · 완전 read-only dry-run
//   · 분류: EXACT_CODE / MATCH_BIZNO / MATCH_NORMALIZED_NAME / NEW / AMBIGUOUS / CODE_CONFLICT
//   · DB 내 중복 그룹 (bizno 또는 normalized name 2+ vendor) 도 리포트
//
// 데이터 소스:
//   · ERP: tmp/output/vendor-response-full.json (사용자 Fiddler 캡쳐 디코드 결과)
//   · Supabase: .env 의 SUPABASE_URL + SUPABASE_KEY

import { readFileSync, existsSync } from "fs";
import { createClient } from "@supabase/supabase-js";

// WebSocket stub (supabase-js realtime 생성 가드)
if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class { constructor() { throw new Error("REST only"); } };
}

// ── env 로드 ──────────────────────────────────────────────────────────────
function parseEnv(path) {
  if (!existsSync(path)) return {};
  const raw = readFileSync(path, "utf8");
  const out = {};
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}
const env = parseEnv(new URL("../.env", import.meta.url).pathname.replace(/^\//, ""));
const SUPABASE_URL = process.env.SUPABASE_URL || env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || env.SUPABASE_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("SUPABASE_URL / SUPABASE_KEY 없음 · .env 확인");
  process.exit(1);
}

// ── normalize helpers (shared/erp/erpVendorMapper.ts 와 동일 로직) ──────
function normalizeBusinessNumber(bz) {
  if (bz == null) return null;
  const digits = String(bz).replace(/\D/g, "");
  return digits.length > 0 ? digits : null;
}
function normalizeVendorName(name) {
  if (name == null) return null;
  let s = String(name).toLowerCase().trim();
  if (!s) return null;
  s = s
    .replace(/\(주\)/g, "")
    .replace(/㈜/g, "")
    .replace(/주식회사/g, "")
    .replace(/\(유\)/g, "")
    .replace(/유한회사/g, "")
    .replace(/\(사\)/g, "")
    .replace(/사단법인/g, "");
  s = s.replace(/\s+/g, "");
  s = s.replace(/[.,·\-_()\[\]{}'"!?@#$%^&*+=:;\\/]/g, "");
  return s.length > 0 ? s : null;
}

// ── ERP sample 로드 ─────────────────────────────────────────────────────
const sampleFile = new URL("../tmp/output/vendor-response-full.json", import.meta.url).pathname.replace(/^\//, "");
if (!existsSync(sampleFile)) {
  console.error("ERP sample 없음 · " + sampleFile);
  process.exit(1);
}
const sample = JSON.parse(readFileSync(sampleFile, "utf8"));
const erpTable = sample.tables.find((t) => t.rowCount > 1);
const erpRows = erpTable.rows;
console.log(`[ERP sample] rows=${erpRows.length} · columns=${erpTable.columns.length}`);

// ── Supabase vendors 전체 로드 ───────────────────────────────────────────
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false, autoRefreshToken: false }, db: { schema: "public" } });

const dbVendors = [];
let from = 0;
while (true) {
  const { data, error } = await sb.from("vendors")
    .select("id, company_name, business_number, phone, email, category, note")
    .range(from, from + 999);
  if (error) throw error;
  if (!data || data.length === 0) break;
  dbVendors.push(...data);
  if (data.length < 1000) break;
  from += 1000;
}
console.log(`[DB vendors] total=${dbVendors.length}`);

// ── Index 구성 (vendors 에 supplier_code 컬럼 없음 → bizno + name 만) ───
const byBizno = new Map();
const byName = new Map();
for (const v of dbVendors) {
  const bz = normalizeBusinessNumber(v.business_number);
  if (bz) {
    const list = byBizno.get(bz) ?? []; list.push(v); byBizno.set(bz, list);
  }
  const nm = normalizeVendorName(v.company_name);
  if (nm) {
    const list = byName.get(nm) ?? []; list.push(v); byName.set(nm, list);
  }
}

// ── 매칭 로직 (supplier_code 컬럼 없음 · bizno → name 2단계) ────────────
const stats = { matchBizno: 0, matchName: 0, new: 0, ambiguous: 0, biznoConflict: 0, invalidIdentity: 0 };
const samples = { matchBizno: [], matchName: [], new: [], ambiguous: [], biznoConflict: [] };

for (const erp of erpRows) {
  const code = erp.CtCode == null ? "" : String(erp.CtCode).trim();
  if (!code) { stats.invalidIdentity++; continue; }
  const corpName = erp.CorpNameView;
  const erpBz = normalizeBusinessNumber(erp.CorpBizNo);
  const erpNm = normalizeVendorName(corpName);

  // P1 · bizno exact (normalized)
  if (erpBz) {
    const cands = byBizno.get(erpBz) ?? [];
    if (cands.length > 1) {
      stats.ambiguous++;
      if (samples.ambiguous.length < 10) samples.ambiguous.push({
        ctcode: code, name: corpName, reason: `bizno ${erpBz} 매칭 ${cands.length}개`,
        candidates: cands.map((c) => ({ id: c.id, name: c.company_name, bizno: c.business_number })),
      });
      continue;
    }
    if (cands.length === 1) {
      const m = cands[0];
      stats.matchBizno++;
      if (samples.matchBizno.length < 10) samples.matchBizno.push({
        ctcode: code, erpName: corpName, bizno: erpBz,
        db: { id: m.id, name: m.company_name, bizno: m.business_number, phone: m.phone, email: m.email, category: m.category },
      });
      continue;
    }
  }
  // P2 · normalized name exact
  if (erpNm) {
    const cands = byName.get(erpNm) ?? [];
    if (cands.length > 1) {
      stats.ambiguous++;
      if (samples.ambiguous.length < 10) samples.ambiguous.push({
        ctcode: code, name: corpName, reason: `normalized name "${erpNm}" 매칭 ${cands.length}개`,
        candidates: cands.map((c) => ({ id: c.id, name: c.company_name, bizno: c.business_number })),
      });
      continue;
    }
    if (cands.length === 1) {
      const m = cands[0];
      const dbBz = normalizeBusinessNumber(m.business_number);
      if (erpBz && dbBz && erpBz !== dbBz) {
        stats.biznoConflict++;
        if (samples.biznoConflict.length < 10) samples.biznoConflict.push({
          ctcode: code, erpName: corpName, erpBz, reason: `name 일치 · bizno 다름 (ERP=${erpBz} ≠ DB=${dbBz})`,
          db: { id: m.id, name: m.company_name, bizno: m.business_number },
        });
        continue;
      }
      stats.matchName++;
      if (samples.matchName.length < 10) samples.matchName.push({
        ctcode: code, erpName: corpName, normalizedName: erpNm, erpBz: erpBz,
        db: { id: m.id, name: m.company_name, bizno: m.business_number, phone: m.phone, email: m.email },
      });
      continue;
    }
  }
  // NEW
  stats.new++;
  if (samples.new.length < 10) samples.new.push({ ctcode: code, name: corpName, bizno: erpBz });
}

// ── DB 내부 중복 리포트 ──────────────────────────────────────────────────
const dbInternalDupes = [];
for (const [bz, rows] of byBizno) {
  if (rows.length > 1) {
    dbInternalDupes.push({
      key: bz, keyKind: "BIZNO",
      vendors: rows.map((r) => ({ id: r.id, code: r.supplier_code, name: r.company_name })),
    });
  }
}
for (const [nm, rows] of byName) {
  if (rows.length > 1) {
    const bzSet = new Set(rows.map((r) => normalizeBusinessNumber(r.business_number)).filter(Boolean));
    if (bzSet.size === 1 && [...bzSet][0]) continue; // bizno 로 이미 보고됨
    dbInternalDupes.push({
      key: nm, keyKind: "NAME",
      vendors: rows.map((r) => ({ id: r.id, code: r.supplier_code, name: r.company_name, bizno: r.business_number })),
    });
  }
}

// ── 리포트 ───────────────────────────────────────────────────────────────
console.log("\n╔══════ VENDOR SYNC DRY-RUN REPORT ══════╗");
console.log(`ERP total              = ${erpRows.length}`);
console.log(`DB vendors total       = ${dbVendors.length}`);
console.log("─────────────────────────────────────────");
console.log(`EXACT_CODE             = ${stats.exactCode}`);
console.log(`MATCH_BIZNO            = ${stats.matchBizno}`);
console.log(`MATCH_NORMALIZED_NAME  = ${stats.matchName}`);
console.log(`NEW                    = ${stats.new}`);
console.log(`AMBIGUOUS              = ${stats.ambiguous}`);
console.log(`CODE_CONFLICT          = ${stats.codeConflict}`);
console.log(`invalid ERP identity   = ${stats.invalidIdentity}`);
console.log(`DB internal dupes      = ${dbInternalDupes.length} groups`);
console.log("╚═════════════════════════════════════════╝\n");

for (const [k, list] of Object.entries(samples)) {
  if (list.length === 0) continue;
  console.log(`── ${k} 샘플 (${list.length}건) ──`);
  for (const s of list) console.log(JSON.stringify(s));
  console.log("");
}

if (dbInternalDupes.length > 0) {
  console.log(`── DB internal 중복 그룹 ${dbInternalDupes.length}개 ──`);
  for (const d of dbInternalDupes.slice(0, 10)) {
    console.log(`[${d.keyKind}] ${d.key} · vendors ${d.vendors.length}개`);
    for (const v of d.vendors) console.log(`  · id=${v.id} code=${v.code} name=${v.name}`);
  }
}
