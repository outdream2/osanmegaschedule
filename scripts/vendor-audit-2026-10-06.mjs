// scripts/vendor-audit-2026-10-06.mjs
// 사용자 지시 (2026-10-06) · VENDOR ERP CANONICALIZATION 전수조사
//
// 범위:
//   · ERP BuyCustomer_List 74 column · 각 column 분석 (sample / non-null / distinct / 의미)
//   · Supabase vendors 156 ↔ ERP 108 매칭 (bizno exact, name exact, normalized name)
//   · DB 내부 중복 (bizno + normalized name)
//   · 모두 READ ONLY · WRITE 없음

import { readFileSync, writeFileSync, existsSync } from "fs";
import { createClient } from "@supabase/supabase-js";

if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class { constructor() { throw new Error("REST only"); } };
}

// ── env ──────────────────────────────────────────────────────────────
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
const env = parseEnv(new URL("../.env", import.meta.url).pathname.replace(/^\//, ""));
const SUPABASE_URL = process.env.SUPABASE_URL || env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || env.SUPABASE_KEY;

// ── normalize helpers ───────────────────────────────────────────────
function normalizeBizno(bz) {
  if (bz == null) return null;
  const d = String(bz).replace(/\D/g, "");
  if (!d) return null;
  if (/^0+$/.test(d)) return null;        // dummy "0000000000"
  if (d.length < 10) return null;         // KR biz number is 10 digits
  return d;
}
function normalizeName(name) {
  if (name == null) return null;
  let s = String(name).toLowerCase().trim();
  if (!s) return null;
  s = s.replace(/\(주\)/g, "").replace(/㈜/g, "").replace(/주식회사/g, "")
       .replace(/\(유\)/g, "").replace(/유한회사/g, "")
       .replace(/\(사\)/g, "").replace(/사단법인/g, "");
  s = s.replace(/\s+/g, "");
  s = s.replace(/[.,·\-_()\[\]{}'"!?@#$%^&*+=:;\\/]/g, "");
  return s || null;
}

// ── load ERP sample ─────────────────────────────────────────────────
const samplePath = new URL("../tmp/output/vendor-response-full.json", import.meta.url).pathname.replace(/^\//, "");
if (!existsSync(samplePath)) { console.error("ERP sample 없음 · " + samplePath); process.exit(1); }
const parsed = JSON.parse(readFileSync(samplePath, "utf8"));
const erpTable = parsed.tables.find((t) => t.rowCount > 1);
const erpRows = erpTable.rows;
const erpColumns = erpTable.columns;
console.log(`[ERP] rows=${erpRows.length} · columns=${erpColumns.length}`);

// ── load Supabase vendors ───────────────────────────────────────────
const sb = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false }, db: { schema: "public" },
});
const dbVendors = [];
let from = 0;
while (true) {
  const { data, error } = await sb.from("vendors").select("*").range(from, from + 999);
  if (error) throw error;
  if (!data || data.length === 0) break;
  dbVendors.push(...data);
  if (data.length < 1000) break;
  from += 1000;
}
console.log(`[DB] vendors=${dbVendors.length}`);

// ────────────────────────────────────────────────────────────────────
// SECTION A · ERP 74 COLUMN AUDIT
// ────────────────────────────────────────────────────────────────────
const colAudit = erpColumns.map((col) => {
  const name = col.name;
  const values = erpRows.map((r) => r[name]);
  const nonNull = values.filter((v) => v != null && String(v).trim() !== "").length;
  const distinctSet = new Set();
  for (const v of values) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s === "") continue;
    distinctSet.add(s);
  }
  const samples = [...distinctSet].slice(0, 3);
  return {
    name,
    type: col.type,
    nonNull,
    nonNullPct: Math.round(nonNull / erpRows.length * 100),
    distinct: distinctSet.size,
    samples,
  };
});

// 분류 결정 테이블 (사용자 지시 기반)
const classifyMap = {
  // CANONICAL (ERP 가 주인)
  CtCode:          { kind: "CANONICAL", target: "ct_code",         why: "ERP 거래처 canonical identity · unique" },
  CorpNameView:    { kind: "RENAME",    target: "corp_name_view",  from: "company_name", why: "WEB company_name 과 완전 동일 의미" },
  CorpBizNo:       { kind: "RENAME",    target: "corp_biz_no",     from: "business_number", why: "사업자번호 · 10자리 normalize" },
  Phone:           { kind: "RENAME",    target: "phone",           from: "phone", why: "대표 전화 · 이름 그대로 유지" },
  Email:           { kind: "RENAME",    target: "email",           from: "email", why: "ERP email + WEB email 완전 일치" },
  ScateName:       { kind: "RENAME",    target: "scate_name",      from: "category", why: "공급사 소분류 (약품/의료기 등)" },
  Remark:          { kind: "RENAME",    target: "remark",          from: "note", why: "비고" },

  // ADD (vendors 에 없지만 유용)
  Mobile:          { kind: "ADD",       target: "mobile",          why: "대표 휴대폰 · WEB manager_phone 과 의미 다름" },
  Fax:             { kind: "ADD",       target: "fax",             why: "팩스" },
  ZipCode:         { kind: "ADD",       target: "zip_code",        why: "우편번호" },
  Address1:        { kind: "ADD",       target: "address1",        why: "주소 · WEB region 과 의미 다름" },
  Address2:        { kind: "ADD",       target: "address2",        why: "상세주소" },
  President:       { kind: "ADD",       target: "president",       why: "대표자 · WEB contact_name(담당자) 과 의미 다름" },
  CorpBranch:      { kind: "ADD",       target: "corp_branch",     why: "본/지점 구분" },
  CCorpName:       { kind: "ADD",       target: "ccorp_name",      why: "법인명 전체 (CorpNameView 축약 보완)" },
  CorpNo:          { kind: "ADD",       target: "corp_no",         why: "법인번호" },
  TaxTypeName:     { kind: "ADD",       target: "tax_type_name",   why: "ERP 과세유형 · WEB vat_included 와 의미 다름 (금지)" },
  BuyerTypeName:   { kind: "ADD",       target: "buyer_type_name", why: "매입처 유형" },
  LcateName:       { kind: "ADD",       target: "lcate_name",      why: "대분류 (약국/뷰티 등)" },
  McateName:       { kind: "ADD",       target: "mcate_name",      why: "중분류" },
  DcateName:       { kind: "ADD",       target: "dcate_name",      why: "세분류" },
  JoinDate:        { kind: "ADD",       target: "join_date",       why: "거래 시작일" },
  BuyerStatusName: { kind: "ADD",       target: "buyer_status_name", why: "ERP 거래상태 · WEB approval_status 와 의미 다름" },
  StorageGubunName:{ kind: "ADD",       target: "storage_gubun_name", why: "본사/매장 구분" },
  PaymentTypeName: { kind: "ADD",       target: "payment_type_name", why: "결제유형 (현금/카드 등)" },
  PaymentGubunName:{ kind: "ADD",       target: "payment_gubun_name", why: "결제구분 (당월결제 등)" },
  Deadline:        { kind: "ADD",       target: "payment_deadline", why: "결제 마감" },
  PaymentDate:     { kind: "ADD",       target: "payment_date",    why: "결제일" },
  BankName:        { kind: "ADD",       target: "bank_name",       why: "거래은행" },
  BankNumber:      { kind: "ADD",       target: "bank_number",     why: "계좌번호 · 민감정보" },
  BankUserName:    { kind: "ADD",       target: "bank_user_name",  why: "예금주" },
  UseCredit:       { kind: "ADD",       target: "use_credit",      why: "여신한도" },

  // DO_NOT_MAP (의미 혼동 위험)
  IsBuyerType:     { kind: "DO_NOT_MAP", why: "ERP 내부 코드 · IGNORE 가능" },
  IsUserGubun:     { kind: "DO_NOT_MAP", why: "ERP 내부 코드" },
  UserGubunName:   { kind: "DO_NOT_MAP", why: "ERP 내부 분류명" },
  IsStatus:        { kind: "DO_NOT_MAP", why: "ERP 내부 flag · BuyerStatusName 에 녹아있음" },
  IsAlcohol:       { kind: "DO_NOT_MAP", why: "주류 여부 · 운영 미사용 가능성 (조사 필요)" },

  // IGNORE (ERP 내부/검색/제어/빈값)
  CorpCode:        { kind: "IGNORE",    why: "ERP tenant code · 전 row 동일 상수" },
  pCtCode:         { kind: "IGNORE",    why: "parent CtCode · 전부 null 추정" },
  Svc:             { kind: "IGNORE",    why: "ERP 내부 서비스코드" },
  Item:            { kind: "IGNORE",    why: "ERP 내부 품목코드" },
  IsEmail:         { kind: "IGNORE",    why: "ERP 내부 flag" },
  Lcate:           { kind: "IGNORE",    why: "code · *Name 에 녹아있음" },
  Mcate:           { kind: "IGNORE",    why: "code · *Name 에 녹아있음" },
  Scate:           { kind: "IGNORE",    why: "code · *Name 에 녹아있음" },
  Dcate:           { kind: "IGNORE",    why: "code · *Name 에 녹아있음" },
  StCode:          { kind: "IGNORE",    why: "매장코드 · vendors 와 무관" },
  StorageName:     { kind: "IGNORE",    why: "매장명 · vendors 와 무관" },
  StorageGubun:    { kind: "IGNORE",    why: "flag · *Name 에 녹아있음" },
  pStorageGubun:   { kind: "IGNORE",    why: "parent flag" },
  CorpUserID:      { kind: "IGNORE",    why: "ERP 내부 user" },
  CorpUserIName:   { kind: "IGNORE",    why: "ERP 내부 user name" },
  IsGuarantee:     { kind: "DO_NOT_MAP", why: "담보 사용 여부 flag · 사업 운영상 필요 시 ADD 재검토" },
  GuaranteeType:   { kind: "DO_NOT_MAP", why: "담보 유형" },
  GuaranteePrice:  { kind: "DO_NOT_MAP", why: "담보 금액 · 운영상 필요 시 ADD" },
  GuaranteeStartDate: { kind: "DO_NOT_MAP", why: "담보 시작일" },
  GuaranteeEndDate:   { kind: "DO_NOT_MAP", why: "담보 종료일" },
  EtcTxtField1:    { kind: "IGNORE",    why: "ERP 확장 필드 · 데이터 보면 결정" },
  EtcTxtField2:    { kind: "IGNORE",    why: "ERP 확장 필드" },
  EtcTxtField3:    { kind: "IGNORE",    why: "ERP 확장 필드" },
  EtcTxtField4:    { kind: "IGNORE",    why: "ERP 확장 필드" },
  EtcTxtField5:    { kind: "IGNORE",    why: "ERP 확장 필드" },
  EtcIntField1:    { kind: "IGNORE",    why: "ERP 확장 필드" },
  EtcIntField2:    { kind: "IGNORE",    why: "ERP 확장 필드" },
  EtcIntField3:    { kind: "IGNORE",    why: "ERP 확장 필드" },
  SearchWord:      { kind: "IGNORE",    why: "ERP 내부 search 보조 · derived from other fields" },
  UserID:          { kind: "IGNORE",    why: "ERP 등록자 · ADD 재검토 가능 (erp_user_id)" },
  UserName:        { kind: "IGNORE",    why: "ERP 등록자명 · ADD 재검토 가능" },
  RegDate:         { kind: "IGNORE",    why: "ERP 등록일 · ADD 재검토 가능 (erp_reg_date)" },
  EditUserID:      { kind: "IGNORE",    why: "ERP 수정자" },
  EditUserName:    { kind: "IGNORE",    why: "ERP 수정자명" },
  EditDate:        { kind: "IGNORE",    why: "ERP 수정일" },
  JoinStorageName: { kind: "IGNORE",    why: "매장 join · vendors 와 무관" },
  ROWNUM:          { kind: "IGNORE",    why: "pagination 순번 · 저장 無의미" },
};

// 분류 결과를 콜라우디트에 병합
for (const a of colAudit) {
  const c = classifyMap[a.name];
  if (c) {
    a.classification = c.kind;
    a.target = c.target ?? "-";
    a.renameFrom = c.from ?? "-";
    a.reason = c.why;
  } else {
    a.classification = "UNCLASSIFIED";
    a.target = "-";
    a.reason = "분류 미정 (추가 검토)";
  }
}

// ────────────────────────────────────────────────────────────────────
// SECTION B · ERP CtCode / BizNo / Name 전수 체크
// ────────────────────────────────────────────────────────────────────
const erpCtCodes = erpRows.map((r) => r.CtCode).filter((v) => v != null);
const erpCtDistinct = new Set(erpCtCodes.map(String));
const erpCtDupes = erpCtCodes.length - erpCtDistinct.size;
const erpBiznoNormalized = erpRows.map((r) => normalizeBizno(r.CorpBizNo)).filter(Boolean);
const erpBiznoDistinct = new Set(erpBiznoNormalized);
const erpNameNormalized = erpRows.map((r) => normalizeName(r.CorpNameView)).filter(Boolean);
const erpNameDistinct = new Set(erpNameNormalized);

// 동일 bizno 안 CtCode 복수?
const erpBiznoToCt = new Map();
for (const r of erpRows) {
  const bz = normalizeBizno(r.CorpBizNo); if (!bz) continue;
  const list = erpBiznoToCt.get(bz) ?? []; list.push({ ct: String(r.CtCode), name: r.CorpNameView });
  erpBiznoToCt.set(bz, list);
}
const erpBiznoMultiCt = [...erpBiznoToCt.entries()].filter(([_, l]) => new Set(l.map((x) => x.ct)).size > 1);

// 동일 name 안 CtCode 복수?
const erpNameToCt = new Map();
for (const r of erpRows) {
  const nm = normalizeName(r.CorpNameView); if (!nm) continue;
  const list = erpNameToCt.get(nm) ?? []; list.push({ ct: String(r.CtCode), name: r.CorpNameView });
  erpNameToCt.set(nm, list);
}
const erpNameMultiCt = [...erpNameToCt.entries()].filter(([_, l]) => new Set(l.map((x) => x.ct)).size > 1);

// ────────────────────────────────────────────────────────────────────
// SECTION C · Supabase 156 vendors 통계
// ────────────────────────────────────────────────────────────────────
const dbByBizno = new Map();
const dbByName = new Map();
for (const v of dbVendors) {
  const bz = normalizeBizno(v.business_number);
  if (bz) {
    const list = dbByBizno.get(bz) ?? []; list.push(v); dbByBizno.set(bz, list);
  }
  const nm = normalizeName(v.company_name);
  if (nm) {
    const list = dbByName.get(nm) ?? []; list.push(v); dbByName.set(nm, list);
  }
}
const dbBiznoDupeGroups = [...dbByBizno.entries()].filter(([_, l]) => l.length > 1);
const dbNameDupeGroups = [...dbByName.entries()].filter(([_, l]) => l.length > 1);

// ────────────────────────────────────────────────────────────────────
// SECTION D · ERP ↔ Supabase 매칭 전수
// ────────────────────────────────────────────────────────────────────
const classification = {
  EXACT_BIZNO: [],
  EXACT_NAME: [],
  NORMALIZED_NAME: [],
  NEW_FROM_ERP: [],
  AMBIGUOUS: [],
  CONFLICT: [],
};

for (const r of erpRows) {
  const ct = r.CtCode == null ? "" : String(r.CtCode).trim();
  const erpName = r.CorpNameView == null ? "" : String(r.CorpNameView).trim();
  const bz = normalizeBizno(r.CorpBizNo);
  const nmNorm = normalizeName(erpName);
  const nmExact = erpName; // raw name exact
  // bizno
  if (bz) {
    const cands = dbByBizno.get(bz) ?? [];
    if (cands.length > 1) {
      classification.AMBIGUOUS.push({ ct, erpName, bz, reason: `bizno 매칭 ${cands.length}개`, candidates: cands.map((c) => ({ id: c.id, name: c.company_name, bz: c.business_number })) });
      continue;
    }
    if (cands.length === 1) {
      classification.EXACT_BIZNO.push({ ct, erpName, bz, db: { id: cands[0].id, name: cands[0].company_name, bz: cands[0].business_number } });
      continue;
    }
  }
  // exact name
  const nameCandsExact = dbVendors.filter((v) => v.company_name === nmExact);
  if (nameCandsExact.length > 1) {
    classification.AMBIGUOUS.push({ ct, erpName, reason: `exact name 매칭 ${nameCandsExact.length}개`, candidates: nameCandsExact.map((c) => ({ id: c.id, name: c.company_name, bz: c.business_number })) });
    continue;
  }
  if (nameCandsExact.length === 1) {
    const m = nameCandsExact[0];
    const dbBz = normalizeBizno(m.business_number);
    if (bz && dbBz && bz !== dbBz) {
      classification.CONFLICT.push({ ct, erpName, erpBz: bz, dbBz, reason: "exact name 매칭 · bizno 다름", db: { id: m.id, name: m.company_name, bz: m.business_number } });
      continue;
    }
    classification.EXACT_NAME.push({ ct, erpName, db: { id: m.id, name: m.company_name, bz: m.business_number } });
    continue;
  }
  // normalized name
  if (nmNorm) {
    const nmCands = dbByName.get(nmNorm) ?? [];
    if (nmCands.length > 1) {
      classification.AMBIGUOUS.push({ ct, erpName, nmNorm, reason: `normalized name 매칭 ${nmCands.length}개`, candidates: nmCands.map((c) => ({ id: c.id, name: c.company_name, bz: c.business_number })) });
      continue;
    }
    if (nmCands.length === 1) {
      const m = nmCands[0];
      const dbBz = normalizeBizno(m.business_number);
      if (bz && dbBz && bz !== dbBz) {
        classification.CONFLICT.push({ ct, erpName, nmNorm, erpBz: bz, dbBz, reason: "normalized name 매칭 · bizno 다름", db: { id: m.id, name: m.company_name, bz: m.business_number } });
        continue;
      }
      classification.NORMALIZED_NAME.push({ ct, erpName, nmNorm, db: { id: m.id, name: m.company_name, bz: m.business_number } });
      continue;
    }
  }
  // NEW
  classification.NEW_FROM_ERP.push({ ct, erpName, bz: bz ?? null });
}

// ERP 에 없는 WEB-only vendor (matching back direction)
const erpByBizno = new Set();
const erpByName = new Set();
for (const r of erpRows) {
  const bz = normalizeBizno(r.CorpBizNo); if (bz) erpByBizno.add(bz);
  const nm = normalizeName(r.CorpNameView); if (nm) erpByName.add(nm);
}
const webOnlyVendors = dbVendors.filter((v) => {
  const bz = normalizeBizno(v.business_number);
  const nm = normalizeName(v.company_name);
  if (bz && erpByBizno.has(bz)) return false;
  if (nm && erpByName.has(nm)) return false;
  return true;
});

// ────────────────────────────────────────────────────────────────────
// 리포트 작성
// ────────────────────────────────────────────────────────────────────
const outDir = new URL("../output/", import.meta.url).pathname.replace(/^\//, "");
try { readFileSync(outDir); } catch { try { (await import("fs")).mkdirSync(outDir, { recursive: true }); } catch {} }

const outPath = outDir + "vendor-audit-2026-10-06.json";
writeFileSync(outPath, JSON.stringify({
  erpTotalRows: erpRows.length,
  dbTotalVendors: dbVendors.length,
  erpColumnCount: erpColumns.length,
  colAudit,
  erpIdentityStats: {
    ctCodeTotal: erpCtCodes.length,
    ctCodeDistinct: erpCtDistinct.size,
    ctCodeDupes: erpCtDupes,
    biznoValidCount: erpBiznoNormalized.length,
    biznoDistinct: erpBiznoDistinct.size,
    biznoMultiCtCount: erpBiznoMultiCt.length,
    biznoMultiCt: erpBiznoMultiCt.slice(0, 10).map(([k, l]) => ({ bz: k, ctList: l })),
    nameValidCount: erpNameNormalized.length,
    nameDistinct: erpNameDistinct.size,
    nameMultiCtCount: erpNameMultiCt.length,
    nameMultiCt: erpNameMultiCt.slice(0, 10).map(([k, l]) => ({ nm: k, ctList: l })),
  },
  dbInternalDupes: {
    biznoDupeGroups: dbBiznoDupeGroups.length,
    nameDupeGroups: dbNameDupeGroups.length,
    biznoSamples: dbBiznoDupeGroups.map(([k, l]) => ({ bz: k, vendors: l.map((v) => ({ id: v.id, name: v.company_name, bz: v.business_number })) })),
    nameSamples: dbNameDupeGroups.map(([k, l]) => ({ nm: k, vendors: l.map((v) => ({ id: v.id, name: v.company_name, bz: v.business_number })) })),
  },
  matchDryRun: {
    exactBizno: classification.EXACT_BIZNO.length,
    exactName: classification.EXACT_NAME.length,
    normalizedName: classification.NORMALIZED_NAME.length,
    newFromErp: classification.NEW_FROM_ERP.length,
    webOnlyExisting: webOnlyVendors.length,
    ambiguous: classification.AMBIGUOUS.length,
    conflict: classification.CONFLICT.length,
    classification,
    webOnlyVendorsSample: webOnlyVendors.slice(0, 30).map((v) => ({ id: v.id, name: v.company_name, bz: v.business_number, phone: v.phone, email: v.email })),
  },
}, null, 2));

// ────────────────────────────────────────────────────────────────────
// 콘솔 요약 출력
// ────────────────────────────────────────────────────────────────────
const countBy = {};
for (const a of colAudit) countBy[a.classification] = (countBy[a.classification] ?? 0) + 1;

console.log("\n╔══════════ ERP 74 COLUMN AUDIT ══════════╗");
console.log(`total ERP columns = ${erpColumns.length}`);
for (const [k, v] of Object.entries(countBy)) console.log(`  ${k} = ${v}`);
console.log("\n[RENAME] (현재 WEB → ERP 기준 snake_case)");
for (const a of colAudit.filter((x) => x.classification === "RENAME")) {
  console.log(`  ${a.renameFrom} → ${a.target}  (ERP ${a.name} · ${a.nonNullPct}% · ${a.reason})`);
}
console.log("\n[ADD] (ERP 에만 존재 · vendors 신규 컬럼 후보)");
for (const a of colAudit.filter((x) => x.classification === "ADD")) {
  console.log(`  ${a.name} → ${a.target}  (${a.nonNullPct}% · distinct=${a.distinct} · ${a.reason})`);
}
console.log("\n[CANONICAL]");
for (const a of colAudit.filter((x) => x.classification === "CANONICAL")) {
  console.log(`  ${a.name} → ${a.target}  (${a.nonNullPct}% · distinct=${a.distinct} · ${a.reason})`);
}
console.log("\n[DO_NOT_MAP]");
for (const a of colAudit.filter((x) => x.classification === "DO_NOT_MAP")) {
  console.log(`  ${a.name}  (${a.nonNullPct}% · ${a.reason})`);
}

console.log("\n╔══════════ ERP IDENTITY STATS ══════════╗");
console.log(`CtCode  total/distinct/dupes = ${erpCtCodes.length}/${erpCtDistinct.size}/${erpCtDupes}`);
console.log(`CorpBizNo valid/distinct = ${erpBiznoNormalized.length}/${erpBiznoDistinct.size}`);
console.log(`same bizno 안 CtCode 복수 = ${erpBiznoMultiCt.length} group`);
console.log(`CorpNameView valid/distinct(normalized) = ${erpNameNormalized.length}/${erpNameDistinct.size}`);
console.log(`same name 안 CtCode 복수 = ${erpNameMultiCt.length} group`);

console.log("\n╔══════════ DB INTERNAL DUPES ══════════╗");
console.log(`bizno 중복 그룹 = ${dbBiznoDupeGroups.length}`);
console.log(`normalized name 중복 그룹 = ${dbNameDupeGroups.length}`);

console.log("\n╔══════════ ERP ↔ DB MATCH DRY RUN ══════════╗");
console.log(`ERP rows = ${erpRows.length}  ·  DB vendors = ${dbVendors.length}`);
console.log(`  EXACT_BIZNO       = ${classification.EXACT_BIZNO.length}`);
console.log(`  EXACT_NAME        = ${classification.EXACT_NAME.length}`);
console.log(`  NORMALIZED_NAME   = ${classification.NORMALIZED_NAME.length}`);
console.log(`  NEW_FROM_ERP      = ${classification.NEW_FROM_ERP.length}`);
console.log(`  WEB_ONLY_EXISTING = ${webOnlyVendors.length}`);
console.log(`  AMBIGUOUS         = ${classification.AMBIGUOUS.length}`);
console.log(`  CONFLICT          = ${classification.CONFLICT.length}`);

console.log(`\n[write] ${outPath} (${(JSON.stringify({}).length)} bytes placeholder · 실제 상세는 JSON 파일)`);
console.log("\n[SAFETY] schema write=0 · DB write=0 · DELETE=0 · commit=0");
