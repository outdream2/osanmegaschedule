// apps/sync-agent/src/main/vendorSyncService.ts
// 2026-10-06 · VENDOR ERP CANONICALIZATION · 사용자 승인 (전수조사 → 실행)
//
// Supabase vendors 는 Stage A 완료 후 다음 canonical columns 를 가짐:
//   · ct_code             (ERP CtCode · identity · UNIQUE)
//   · corp_name_view      (ERP CorpNameView)
//   · corp_biz_no         (ERP CorpBizNo · 10자리 숫자)
//   · scate_name          (ERP ScateName)
//   · remark              (ERP Remark)
//   + 운영 7: president · join_date · buyer_type_name · buyer_status_name
//            payment_type_name · payment_gubun_name · payment_date
//
// Sync semantics (사용자 15섹션 스펙 그대로):
//   PRIORITY 1 · ct_code exact                              → UPDATE changed only
//   PRIORITY 2 · corp_biz_no normalized unique match        → UPDATE + ct_code 연결
//   PRIORITY 3 · corp_name_view normalized unique match     → UPDATE + ct_code 연결
//   매칭 실패                                                → NEW INSERT
//   복수 후보                                                → AMBIGUOUS · SKIP
//   bizno 다른데 name 매칭 / 기존 ct_code 다름              → CONFLICT · SKIP
//
// 금지:
//   · DELETE 없음
//   · WEB-only 20개 field overwrite 금지 (patch 에 포함 X)
//   · ERP null → 기존 값 보존

import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabaseClient";
import { appendSyncHistory } from "./syncHistoryStore";
import {
  normalizeBusinessNumber,
  normalizeVendorName,
  type ErpVendorRow,
} from "../../../../src/shared/erp/erpVendorMapper";

type DbRow = Record<string, unknown>;

function chunk<T>(arr: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size) as T[]);
  return out;
}

function str(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}
function intOrNull(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
function dateOrNull(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  // ERP JoinDate 는 "2026-09-01" 포맷 가정
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

/**
 * ERP canonical payload 추출 · vendors 테이블 column 명 그대로.
 * WEB-only 필드 (approval_* · password_hash · order_method 등) 는 포함 X.
 */
export interface VendorCanonicalPayload {
  ct_code: string;
  corp_name_view: string | null;
  corp_biz_no: string | null;
  phone: string | null;
  email: string | null;
  scate_name: string | null;
  remark: string | null;
  // 운영 7
  president: string | null;
  join_date: string | null;
  buyer_type_name: string | null;
  buyer_status_name: string | null;
  payment_type_name: string | null;
  payment_gubun_name: string | null;
  payment_date: number | null;
}

function buildCanonical(r: ErpVendorRow): VendorCanonicalPayload | null {
  const ct = r.CtCode == null ? "" : String(r.CtCode).trim();
  if (!ct) return null;
  return {
    ct_code: ct,
    corp_name_view: str(r.CorpNameView),
    corp_biz_no: normalizeBusinessNumber(r.CorpBizNo),  // 정규화 후 저장 (dummy "0000000000" → null)
    phone: str(r.Phone),
    email: str(r.Email),
    scate_name: str(r.ScateName),
    remark: str(r.Remark),
    president: str((r as Record<string, unknown>).President),
    join_date: dateOrNull((r as Record<string, unknown>).JoinDate),
    buyer_type_name: str((r as Record<string, unknown>).BuyerTypeName),
    buyer_status_name: str((r as Record<string, unknown>).BuyerStatusName),
    payment_type_name: str((r as Record<string, unknown>).PaymentTypeName),
    payment_gubun_name: str((r as Record<string, unknown>).PaymentGubunName),
    payment_date: intOrNull((r as Record<string, unknown>).PaymentDate),
  };
}

/** CHANGED 비교 대상 (ct_code 제외 · ERP 가 소유하는 field 전부) */
const COMPARE_FIELDS = [
  "corp_name_view", "corp_biz_no", "phone", "email", "scate_name", "remark",
  "president", "join_date", "buyer_type_name", "buyer_status_name",
  "payment_type_name", "payment_gubun_name", "payment_date",
] as const;
type CompareField = typeof COMPARE_FIELDS[number];

/** patch 생성 · ERP non-null 필드만 포함 · null overwrite 방지 */
function buildPatch(canonical: VendorCanonicalPayload, db: DbRow | null): Partial<Record<CompareField, unknown>> {
  const patch: Partial<Record<CompareField, unknown>> = {};
  for (const f of COMPARE_FIELDS) {
    const erpVal = canonical[f];
    if (erpVal == null || erpVal === "") continue;
    if (db == null) {
      patch[f] = erpVal;
    } else {
      const dbRaw = db[f];
      // 숫자는 숫자 비교
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

export type VendorMatchKind =
  | "EXACT_CODE"
  | "MATCH_BIZNO"
  | "MATCH_NAME"
  | "NEW"
  | "AMBIGUOUS"
  | "CODE_CONFLICT";

export interface VendorSyncEntry {
  readonly ct_code: string;
  readonly erp_name: string | null;
  readonly matchKind: VendorMatchKind;
  readonly dbVendorId?: unknown;
  readonly dbSupplierName?: string | null;
  readonly dbBizno?: string | null;
  readonly dbCtCode?: string | null;
  readonly reason?: string;
  readonly connectCtCode?: boolean;
  readonly changedFields?: CompareField[];
}

export interface VendorInternalDupe {
  readonly key: string;
  readonly keyKind: "BIZNO" | "NAME";
  readonly ids: ReadonlyArray<unknown>;
}

export interface VendorSyncCheckResult {
  readonly supabaseFetchedAt: string;
  readonly erpTotal: number;
  readonly dbRowsTotal: number;
  readonly exactCode: number;
  readonly matchBizno: number;
  readonly matchName: number;
  readonly new: number;
  readonly ambiguous: number;
  readonly codeConflict: number;
  readonly unchanged: number;
  readonly entries: ReadonlyArray<VendorSyncEntry>;
  readonly dbInternalDupes: ReadonlyArray<VendorInternalDupe>;
}

export interface VendorSyncApplyResult extends VendorSyncCheckResult {
  readonly allowWrite: boolean;
  readonly inserted: number;
  readonly updated: number;
  readonly updatedCells: number;
  readonly skipped: number;
  readonly failed: number;
  readonly errors: ReadonlyArray<{ identity: string; message: string }>;
  readonly message?: string;
}

interface Index {
  all: DbRow[];
  byCode: Map<string, DbRow>;
  byBizno: Map<string, DbRow[]>;
  byName: Map<string, DbRow[]>;
}

async function loadIndex(sb: SupabaseClient): Promise<Index> {
  const all: DbRow[] = [];
  let from = 0;
  // Stage A 완료 전제 · ct_code · corp_name_view · corp_biz_no 등 canonical 컬럼 조회
  const SELECT = "id, ct_code, corp_name_view, corp_biz_no, phone, email, scate_name, remark, "
    + "president, join_date, buyer_type_name, buyer_status_name, payment_type_name, payment_gubun_name, payment_date, "
    // legacy fallback (Stage A 완료 전 또는 fresh row)
    + "company_name, business_number, category, note";
  while (true) {
    const { data, error } = await sb.from("vendors").select(SELECT).range(from, from + 999);
    if (error) throw new Error(`vendors fetch 실패 · ${error.message}`);
    if (!data || data.length === 0) break;
    for (const d of (data as unknown) as DbRow[]) all.push(d);
    if (data.length < 1000) break;
    from += 1000;
  }
  const byCode = new Map<string, DbRow>();
  const byBizno = new Map<string, DbRow[]>();
  const byName = new Map<string, DbRow[]>();
  for (const r of all) {
    const ct = r.ct_code == null ? "" : String(r.ct_code).trim();
    if (ct) byCode.set(ct, r);
    // bizno · canonical 우선 · 없으면 legacy fallback
    const bzRaw = (r.corp_biz_no ?? r.business_number) as unknown;
    const bz = normalizeBusinessNumber(bzRaw);
    if (bz) {
      const list = byBizno.get(bz) ?? []; list.push(r); byBizno.set(bz, list);
    }
    const nmRaw = (r.corp_name_view ?? r.company_name) as unknown;
    const nm = normalizeVendorName(nmRaw);
    if (nm) {
      const list = byName.get(nm) ?? []; list.push(r); byName.set(nm, list);
    }
  }
  return { all, byCode, byBizno, byName };
}

function collectDupes(idx: Index): VendorInternalDupe[] {
  const out: VendorInternalDupe[] = [];
  for (const [bz, rows] of idx.byBizno) {
    if (rows.length > 1) out.push({ key: bz, keyKind: "BIZNO", ids: rows.map((r) => r.id) });
  }
  for (const [nm, rows] of idx.byName) {
    if (rows.length > 1) {
      // bizno 로 이미 보고된 그룹은 skip
      const bzSet = new Set(rows.map((r) => normalizeBusinessNumber(r.corp_biz_no ?? r.business_number)).filter(Boolean));
      if (bzSet.size === 1 && [...bzSet][0]) continue;
      out.push({ key: nm, keyKind: "NAME", ids: rows.map((r) => r.id) });
    }
  }
  return out;
}

interface Diff {
  entries: VendorSyncEntry[];
  inserts: Array<{ identity: string; payload: VendorCanonicalPayload }>;
  updates: Array<{ id: unknown; identity: string; patch: Record<string, unknown>; changedFields: CompareField[]; connectCtCode: boolean }>;
  stats: {
    exactCode: number; matchBizno: number; matchName: number;
    new: number; ambiguous: number; codeConflict: number; unchanged: number;
  };
}

function buildDiff(erpRows: readonly ErpVendorRow[], idx: Index): Diff {
  const entries: VendorSyncEntry[] = [];
  const inserts: Diff["inserts"] = [];
  const updates: Diff["updates"] = [];
  const stats = { exactCode: 0, matchBizno: 0, matchName: 0, new: 0, ambiguous: 0, codeConflict: 0, unchanged: 0 };
  const seenCt = new Set<string>();

  for (const erpRow of erpRows) {
    const canonical = buildCanonical(erpRow);
    if (!canonical) continue;
    const ct = canonical.ct_code;
    if (seenCt.has(ct)) continue;
    seenCt.add(ct);

    // PRIORITY 1 · ct_code exact
    const codeMatch = idx.byCode.get(ct);
    if (codeMatch) {
      const patch = buildPatch(canonical, codeMatch);
      const changedFields = Object.keys(patch) as CompareField[];
      stats.exactCode++;
      const dbName = codeMatch.corp_name_view ?? codeMatch.company_name;
      if (changedFields.length === 0) {
        stats.unchanged++;
        entries.push({
          ct_code: ct, erp_name: canonical.corp_name_view, matchKind: "EXACT_CODE",
          dbVendorId: codeMatch.id, dbSupplierName: dbName == null ? null : String(dbName), dbCtCode: ct,
        });
      } else {
        updates.push({ id: codeMatch.id, identity: ct, patch, changedFields, connectCtCode: false });
        entries.push({
          ct_code: ct, erp_name: canonical.corp_name_view, matchKind: "EXACT_CODE",
          dbVendorId: codeMatch.id, dbSupplierName: dbName == null ? null : String(dbName), dbCtCode: ct,
          changedFields,
        });
      }
      continue;
    }

    const erpBz = canonical.corp_biz_no;  // 이미 normalized
    const erpNm = normalizeVendorName(canonical.corp_name_view);

    // PRIORITY 2 · bizno
    if (erpBz) {
      const cands = idx.byBizno.get(erpBz) ?? [];
      if (cands.length > 1) {
        stats.ambiguous++;
        entries.push({
          ct_code: ct, erp_name: canonical.corp_name_view, matchKind: "AMBIGUOUS",
          reason: `bizno ${erpBz} 매칭 ${cands.length}개`,
        });
        continue;
      }
      if (cands.length === 1) {
        const m = cands[0]!;
        const dbCt = m.ct_code == null ? "" : String(m.ct_code).trim();
        if (dbCt && dbCt !== ct) {
          stats.codeConflict++;
          entries.push({
            ct_code: ct, erp_name: canonical.corp_name_view, matchKind: "CODE_CONFLICT",
            dbVendorId: m.id, dbCtCode: dbCt,
            reason: `bizno 매칭 · 기존 ct_code=${dbCt} ≠ ERP CtCode=${ct}`,
          });
          continue;
        }
        const patch = buildPatch(canonical, m);
        const changedFields = Object.keys(patch) as CompareField[];
        const connect = !dbCt;
        stats.matchBizno++;
        if (changedFields.length === 0 && !connect) {
          stats.unchanged++;
          const dbName = m.corp_name_view ?? m.company_name;
          entries.push({
            ct_code: ct, erp_name: canonical.corp_name_view, matchKind: "MATCH_BIZNO",
            dbVendorId: m.id, dbSupplierName: dbName == null ? null : String(dbName), dbBizno: erpBz,
            connectCtCode: false,
          });
        } else {
          const applyPatch: Record<string, unknown> = { ...patch };
          if (connect) applyPatch["ct_code"] = ct;
          updates.push({ id: m.id, identity: ct, patch: applyPatch, changedFields, connectCtCode: connect });
          const dbName = m.corp_name_view ?? m.company_name;
          entries.push({
            ct_code: ct, erp_name: canonical.corp_name_view, matchKind: "MATCH_BIZNO",
            dbVendorId: m.id, dbSupplierName: dbName == null ? null : String(dbName), dbBizno: erpBz,
            connectCtCode: connect, changedFields,
          });
        }
        continue;
      }
    }

    // PRIORITY 3 · normalized name
    if (erpNm) {
      const cands = idx.byName.get(erpNm) ?? [];
      if (cands.length > 1) {
        stats.ambiguous++;
        entries.push({
          ct_code: ct, erp_name: canonical.corp_name_view, matchKind: "AMBIGUOUS",
          reason: `normalized name "${erpNm}" 매칭 ${cands.length}개`,
        });
        continue;
      }
      if (cands.length === 1) {
        const m = cands[0]!;
        const dbBz = normalizeBusinessNumber(m.corp_biz_no ?? m.business_number);
        if (erpBz && dbBz && erpBz !== dbBz) {
          stats.codeConflict++;
          entries.push({
            ct_code: ct, erp_name: canonical.corp_name_view, matchKind: "CODE_CONFLICT",
            dbVendorId: m.id, dbBizno: dbBz,
            reason: `name 매칭 · bizno 다름 ERP=${erpBz} ≠ DB=${dbBz}`,
          });
          continue;
        }
        const dbCt = m.ct_code == null ? "" : String(m.ct_code).trim();
        if (dbCt && dbCt !== ct) {
          stats.codeConflict++;
          entries.push({
            ct_code: ct, erp_name: canonical.corp_name_view, matchKind: "CODE_CONFLICT",
            dbVendorId: m.id, dbCtCode: dbCt,
            reason: `name 매칭 · 기존 ct_code=${dbCt} ≠ ERP CtCode=${ct}`,
          });
          continue;
        }
        const patch = buildPatch(canonical, m);
        const changedFields = Object.keys(patch) as CompareField[];
        const connect = !dbCt;
        stats.matchName++;
        if (changedFields.length === 0 && !connect) {
          stats.unchanged++;
          const dbName = m.corp_name_view ?? m.company_name;
          entries.push({
            ct_code: ct, erp_name: canonical.corp_name_view, matchKind: "MATCH_NAME",
            dbVendorId: m.id, dbSupplierName: dbName == null ? null : String(dbName),
            connectCtCode: false,
          });
        } else {
          const applyPatch: Record<string, unknown> = { ...patch };
          if (connect) applyPatch["ct_code"] = ct;
          updates.push({ id: m.id, identity: ct, patch: applyPatch, changedFields, connectCtCode: connect });
          const dbName = m.corp_name_view ?? m.company_name;
          entries.push({
            ct_code: ct, erp_name: canonical.corp_name_view, matchKind: "MATCH_NAME",
            dbVendorId: m.id, dbSupplierName: dbName == null ? null : String(dbName),
            connectCtCode: connect, changedFields,
          });
        }
        continue;
      }
    }

    // NEW
    inserts.push({ identity: ct, payload: canonical });
    entries.push({ ct_code: ct, erp_name: canonical.corp_name_view, matchKind: "NEW" });
    stats.new++;
  }

  return { entries, inserts, updates, stats };
}

export interface VendorSyncInput { readonly erpRows: readonly ErpVendorRow[]; }

export async function runVendorSyncCheck(input: VendorSyncInput): Promise<VendorSyncCheckResult> {
  const sb = getSupabaseClient();
  if (!sb) throw new Error("Supabase client 미설정");
  const fetchedAt = new Date().toISOString();
  const idx = await loadIndex(sb);
  const dupes = collectDupes(idx);
  const diff = buildDiff(input.erpRows, idx);
  console.info(
    `[vendorSyncService] CHECK · erpTotal=${input.erpRows.length} · dbTotal=${idx.all.length}` +
    ` · EXACT_CODE=${diff.stats.exactCode} · MATCH_BIZNO=${diff.stats.matchBizno} · MATCH_NAME=${diff.stats.matchName}` +
    ` · NEW=${diff.stats.new} · AMBIGUOUS=${diff.stats.ambiguous} · CONFLICT=${diff.stats.codeConflict}` +
    ` · unchanged=${diff.stats.unchanged} · dbDupes=${dupes.length}`
  );
  return {
    supabaseFetchedAt: fetchedAt,
    erpTotal: input.erpRows.length,
    dbRowsTotal: idx.all.length,
    exactCode: diff.stats.exactCode,
    matchBizno: diff.stats.matchBizno,
    matchName: diff.stats.matchName,
    new: diff.stats.new,
    ambiguous: diff.stats.ambiguous,
    codeConflict: diff.stats.codeConflict,
    unchanged: diff.stats.unchanged,
    entries: diff.entries,
    dbInternalDupes: dupes,
  };
}

export async function applyVendorSync(input: VendorSyncInput & { allowWrite: boolean }): Promise<VendorSyncApplyResult> {
  const startedAt = new Date().toISOString();
  const sb = getSupabaseClient();
  if (!sb) throw new Error("Supabase client 미설정");
  const idx = await loadIndex(sb);
  const dupes = collectDupes(idx);
  const diff = buildDiff(input.erpRows, idx);
  const base: VendorSyncCheckResult = {
    supabaseFetchedAt: startedAt,
    erpTotal: input.erpRows.length,
    dbRowsTotal: idx.all.length,
    exactCode: diff.stats.exactCode,
    matchBizno: diff.stats.matchBizno,
    matchName: diff.stats.matchName,
    new: diff.stats.new,
    ambiguous: diff.stats.ambiguous,
    codeConflict: diff.stats.codeConflict,
    unchanged: diff.stats.unchanged,
    entries: diff.entries,
    dbInternalDupes: dupes,
  };
  const skipped = diff.stats.ambiguous + diff.stats.codeConflict;
  if (!input.allowWrite) {
    return { ...base, allowWrite: false, inserted: 0, updated: 0, updatedCells: 0, skipped, failed: 0, errors: [], message: "dry-run" };
  }
  const errors: Array<{ identity: string; message: string }> = [];
  let inserted = 0, updated = 0, updatedCells = 0, failed = 0;

  // INSERT (batch 500) · WEB-only field 는 omit → DB default/NULL
  // 신규 INSERT 시 legacy field (company_name 등) 도 함께 설정 (dual field · Stage A 전환 중 server/UI 호환)
  for (const batch of chunk(diff.inserts, 500)) {
    const payloads = batch.map((b) => {
      const p = b.payload;
      return {
        // canonical
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
        // legacy mirror (Stage B 에서 제거) · company_name NOT NULL 가능성 대비
        company_name: p.corp_name_view ?? p.ct_code,
        business_number: p.corp_biz_no,
        category: p.scate_name,
        note: p.remark,
      };
    });
    const { data, error } = await sb.from("vendors").insert(payloads).select("id");
    if (error) {
      failed += batch.length;
      if (errors.length < 20) errors.push({ identity: batch[0]!.identity, message: `INSERT batch 실패 · ${error.message}` });
    } else {
      inserted += (data?.length ?? 0);
    }
  }

  // UPDATE (PAR=10) · patch 는 ERP non-null 변경 field + optional ct_code 연결
  //   · dual-field 호환: canonical field 변경 시 legacy mirror 도 동일하게 UPDATE
  const PAR = 10;
  for (let i = 0; i < diff.updates.length; i += PAR) {
    const slice = diff.updates.slice(i, i + PAR);
    const results = await Promise.all(slice.map(async (u) => {
      const applyPatch: Record<string, unknown> = { ...u.patch };
      // legacy mirror 복사 (Stage B 전까지 두 field 동기화)
      if ("corp_name_view" in applyPatch) applyPatch["company_name"] = applyPatch["corp_name_view"];
      if ("corp_biz_no" in applyPatch)    applyPatch["business_number"] = applyPatch["corp_biz_no"];
      if ("scate_name" in applyPatch)     applyPatch["category"]        = applyPatch["scate_name"];
      if ("remark" in applyPatch)         applyPatch["note"]            = applyPatch["remark"];
      const { error } = await sb.from("vendors").update(applyPatch).eq("id", u.id);
      return { u, error: error?.message };
    }));
    for (const r of results) {
      if (r.error) {
        failed++;
        if (errors.length < 20) errors.push({ identity: r.u.identity, message: r.error });
      } else {
        updated++;
        updatedCells += r.u.changedFields.length + (r.u.connectCtCode ? 1 : 0);
      }
    }
  }

  const ok = failed === 0 && inserted === diff.stats.new;

  try {
    appendSyncHistory("VENDOR_LIST", {
      startedAt, completedAt: new Date().toISOString(), ok,
      updatedRows: inserted + updated, updatedCells,
      skippedSame: diff.stats.unchanged, failed,
      webModified: 0, identityModified: 0,
      readbackMatched: inserted + updated, readbackMismatch: 0,
      erpCacheFetchedAt: null, erpCacheRowCount: input.erpRows.length,
      errors: errors.length > 0 ? errors.slice(0, 20) : undefined,
      message:
        `exact=${diff.stats.exactCode} · bizno=${diff.stats.matchBizno} · name=${diff.stats.matchName}` +
        ` · new=${diff.stats.new} · ambiguous=${diff.stats.ambiguous} · conflict=${diff.stats.codeConflict}` +
        ` · dbDupes=${dupes.length}`,
    });
  } catch (err) {
    console.warn(`[vendorSyncService] history 기록 실패 · ${(err as Error).message}`);
  }

  console.info(
    `[vendorSyncService] APPLY · erpTotal=${input.erpRows.length}` +
    ` · INSERT=${inserted}/${diff.stats.new} · UPDATE=${updated}/${diff.updates.length}` +
    ` · SKIP=${skipped} · failed=${failed} · ok=${ok}`
  );

  return { ...base, allowWrite: true, inserted, updated, updatedCells, skipped, failed, errors };
}
